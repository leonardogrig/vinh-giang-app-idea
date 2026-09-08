import type { ScribeWord } from "./types";

/**
 * Vocal variety, measured on the device from the raw take.
 *
 * The transcript tells you what was said and when; it cannot tell you whether
 * it was said in a monotone. This module reads the audio itself: a pitch track
 * (YIN), a loudness track (frame RMS in dB) and, from the word timestamps, how
 * much the pace moved. Nothing here leaves the browser.
 *
 * Everything is deterministic and threshold-based. The thresholds were set
 * against synthetic speech with controlled pitch modulation and are easy to
 * retune in the CALIBRATION block below.
 */

/** Downsampled tracks for the contour chart. Pitch is semitones from the take's own median. */
export type VoiceContour = {
  pitch: (number | null)[];
  /** 0-1, relative to the loudest moment of the take. */
  energy: number[];
};

export type ProsodyThird = {
  /** Semitone SD of pitch inside this third. Null when there was too little voiced speech. */
  pitchSdSt: number | null;
  /** Mean loudness of speech in this third, relative to the whole take, in dB. */
  loudnessDb: number | null;
  wpm: number | null;
  /** Share of this third that was voiced speech. */
  voicedRatio: number;
};

export type Prosody = {
  medianPitchHz: number;
  /** Standard deviation of pitch over voiced speech, in semitones. The headline number. */
  pitchSdSt: number;
  /** 5th to 95th percentile of pitch, in semitones. */
  pitchRangeSt: number;
  loudnessSdDb: number;
  loudnessRangeDb: number;
  /** Coefficient of variation of local words-per-minute. Null when the take was too short. */
  paceCv: number | null;
  paceRangeWpm: [number, number] | null;
  /** Longest stretch, in seconds, where the pitch barely moved. */
  longestFlatStretchSecs: number;
  voicedSecs: number;
  thirds: ProsodyThird[];
  contour: VoiceContour;
  /** 0-100, computed locally from the numbers above. */
  varietyScore: number;
  label: "flat" | "steady" | "varied" | "expressive";
};

// ---------------------------------------------------------------------------
// CALIBRATION
// ---------------------------------------------------------------------------

/** Analysis rate. Pitch tops out well under 4 kHz, so 8 kHz keeps YIN cheap. */
const TARGET_RATE = 8000;
const F_MIN = 65;
const F_MAX = 450;
/** Three periods of the lowest pitch we look for. */
const WINDOW_SECS = 3 / F_MIN;
const HOP_SECS = 0.02;
/** YIN aperiodicity above this reads as unvoiced. */
const YIN_THRESHOLD = 0.2;
/** A frame has to sit this far above the noise floor to count as speech. */
const SPEECH_GATE_DB = 12;
/** Voiced runs shorter than this are almost always glitches. */
const MIN_VOICED_FRAMES = 3;
/** Below this much voiced speech there is nothing to measure. */
const MIN_VOICED_SECS = 3;

/** Flat-stretch detection: a rolling window whose pitch SD stays under FLAT_ST. */
const FLAT_WINDOW_SECS = 3;
const FLAT_HOP_SECS = 0.5;
const FLAT_ST = 1.0;
const FLAT_MIN_VOICED_SECS = 1;

/** Local pace is words in a rolling window. Phrase-sized, so a real change of gear registers. */
const PACE_WINDOW_SECS = 3;
const PACE_HOP_SECS = 0.5;
const PACE_MIN_WINDOWS = 4;

const CONTOUR_POINTS = 240;

/**
 * Score bands. Each raw number maps linearly onto 0-1 between the two ends.
 * Conversational speech sits around 2-3 semitones of pitch SD; a monotone
 * under 1; a good storyteller above 3.5.
 */
const PITCH_BAND: [number, number] = [0.8, 3.5];
const LOUDNESS_BAND: [number, number] = [2.5, 8];
const PACE_BAND: [number, number] = [0.08, 0.3];
const WEIGHTS = { pitch: 0.55, loudness: 0.2, pace: 0.25 };
/** Seconds of flat pitch tolerated before it starts costing points. */
const FLAT_GRACE_SECS = 8;
const FLAT_PENALTY_PER_SEC = 2.5;
const FLAT_PENALTY_MAX = 20;

// ---------------------------------------------------------------------------
// Signal helpers
// ---------------------------------------------------------------------------

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const mean = (values: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return values.length ? sum / values.length : 0;
};

const stdDev = (values: ArrayLike<number>) => {
  if (values.length < 2) return 0;
  const avg = mean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += (values[i] - avg) ** 2;
  return Math.sqrt(sum / values.length);
};

const percentile = (sorted: ArrayLike<number>, p: number) => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
};

const sortedCopy = (values: number[]) => Float64Array.from(values).sort();

const median = (values: number[]) => percentile(sortedCopy(values), 0.5);

/** Band-average decimation. Crude as anti-aliasing goes, but pitch lives far below the fold. */
function decimate(samples: Float32Array, sampleRate: number) {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  if (factor === 1) return { samples, rate: sampleRate };
  const length = Math.floor(samples.length / factor);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    const base = i * factor;
    for (let j = 0; j < factor; j += 1) sum += samples[base + j];
    out[i] = sum / factor;
  }
  return { samples: out, rate: sampleRate / factor };
}

/**
 * YIN pitch estimate for one frame. Returns the period in samples (fractional,
 * after parabolic interpolation) and the aperiodicity at that lag, or null
 * when nothing periodic was found.
 */
function yin(
  buffer: Float32Array,
  start: number,
  window: number,
  tauMin: number,
  tauMax: number,
  scratch: Float32Array,
) {
  // Difference function d(τ) = Σ (x[j] - x[j+τ])² over the window.
  scratch[0] = 1;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let j = 0; j < window; j += 1) {
      const delta = buffer[start + j] - buffer[start + j + tau];
      sum += delta * delta;
    }
    scratch[tau] = sum;
  }

  // Cumulative mean normalised difference, in place.
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    running += scratch[tau];
    scratch[tau] = running > 0 ? (scratch[tau] * tau) / running : 1;
  }

  // First dip under the threshold, walked down to its local minimum.
  let tau = tauMin;
  while (tau <= tauMax) {
    if (scratch[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= tauMax && scratch[tau + 1] < scratch[tau]) tau += 1;
      break;
    }
    tau += 1;
  }
  if (tau > tauMax) return null;

  // Parabolic refinement around the minimum.
  let refined = tau;
  if (tau > 1 && tau < tauMax) {
    const left = scratch[tau - 1];
    const centre = scratch[tau];
    const right = scratch[tau + 1];
    const denominator = 2 * (2 * centre - left - right);
    if (denominator !== 0) refined = tau + (right - left) / denominator;
  }
  return { period: refined, aperiodicity: scratch[tau] };
}

function medianFilter(values: (number | null)[], radius: number) {
  const out = values.slice();
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === null) continue;
    const window: number[] = [];
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j += 1) {
      const value = values[j];
      if (value !== null) window.push(value);
    }
    out[i] = median(window);
  }
  return out;
}

/** Drop voiced runs shorter than MIN_VOICED_FRAMES. */
function dropGlitches(values: (number | null)[]) {
  const out = values.slice();
  let runStart = -1;
  for (let i = 0; i <= values.length; i += 1) {
    const voiced = i < values.length && values[i] !== null;
    if (voiced && runStart === -1) runStart = i;
    if (!voiced && runStart !== -1) {
      if (i - runStart < MIN_VOICED_FRAMES) for (let j = runStart; j < i; j += 1) out[j] = null;
      runStart = -1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Frame analysis
// ---------------------------------------------------------------------------

type Frames = {
  hopSecs: number;
  /** Frame loudness in dB, every frame. */
  db: Float64Array;
  /** Pitch in Hz per frame, null where unvoiced. */
  f0: (number | null)[];
  noiseFloorDb: number;
  speechGateDb: number;
};

/**
 * Walk the take frame by frame. The heavy loop yields to the event loop every
 * so often so a long take does not freeze the page while it is analysed.
 */
async function extractFrames(
  input: Float32Array,
  inputRate: number,
  yieldEvery: number,
): Promise<Frames> {
  const { samples, rate } = decimate(input, inputRate);
  const window = Math.round(WINDOW_SECS * rate);
  const hop = Math.round(HOP_SECS * rate);
  const tauMin = Math.max(2, Math.floor(rate / F_MAX));
  const tauMax = Math.ceil(rate / F_MIN);
  const span = window + tauMax;
  const frameCount = Math.max(0, Math.floor((samples.length - span) / hop) + 1);

  const db = new Float64Array(frameCount);
  const f0: (number | null)[] = new Array(frameCount).fill(null);
  const scratch = new Float32Array(tauMax + 1);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hop;
    let energy = 0;
    for (let j = 0; j < window; j += 1) energy += samples[start + j] ** 2;
    db[frame] = 20 * Math.log10(Math.sqrt(energy / window) + 1e-9);

    const estimate = yin(samples, start, window, tauMin, tauMax, scratch);
    if (estimate) {
      const hz = rate / estimate.period;
      if (hz >= F_MIN && hz <= F_MAX) f0[frame] = hz;
    }

    if (yieldEvery > 0 && frame % yieldEvery === yieldEvery - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const sortedDb = Float64Array.from(db).sort();
  const noiseFloorDb = percentile(sortedDb, 0.1);
  // The gate sits above the noise floor, but never above the middle of the
  // take's dynamic range — a take with no silence in it is all speech.
  const dynamicRange = percentile(sortedDb, 0.9) - noiseFloorDb;
  const speechGateDb =
    dynamicRange < 3 ? -Infinity : noiseFloorDb + Math.min(SPEECH_GATE_DB, dynamicRange / 2);

  // Quiet frames cannot be voiced speech, whatever YIN found in them.
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (db[frame] < speechGateDb) f0[frame] = null;
  }

  return {
    hopSecs: hop / rate,
    db,
    f0: dropGlitches(medianFilter(f0, 2)),
    noiseFloorDb,
    speechGateDb,
  };
}

// ---------------------------------------------------------------------------
// Pace from word timestamps
// ---------------------------------------------------------------------------

function paceVariation(words: ScribeWord[] | undefined, durationSecs: number) {
  const starts = (words ?? [])
    .filter((word) => word.type === "word" && typeof word.start === "number")
    .map((word) => word.start as number)
    .sort((a, b) => a - b);

  const perThird: (number | null)[] = [0, 1, 2].map((third) => {
    if (durationSecs <= 0) return null;
    const from = (durationSecs * third) / 3;
    const to = (durationSecs * (third + 1)) / 3;
    const count = starts.filter((start) => start >= from && start < to).length;
    return Math.round((count / (to - from)) * 60);
  });

  if (starts.length < 2) return { cv: null, range: null, perThird };
  const first = starts[0];
  const last = starts[starts.length - 1];
  if (last - first < PACE_WINDOW_SECS * 1.5) return { cv: null, range: null, perThird };

  const local: number[] = [];
  for (let t = first; t + PACE_WINDOW_SECS <= last; t += PACE_HOP_SECS) {
    const count = starts.filter((start) => start >= t && start < t + PACE_WINDOW_SECS).length;
    local.push((count / PACE_WINDOW_SECS) * 60);
  }
  if (local.length < PACE_MIN_WINDOWS) return { cv: null, range: null, perThird };

  const avg = mean(local);
  const cv = avg > 0 ? stdDev(local) / avg : 0;
  const sorted = sortedCopy(local);
  return {
    cv: round(cv, 3),
    range: [Math.round(percentile(sorted, 0.1)), Math.round(percentile(sorted, 0.9))] as [
      number,
      number,
    ],
    perThird,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AnalyseOptions = {
  /** Word timings from the transcript, for pace variation. */
  words?: ScribeWord[];
  /** Frames between yields to the event loop. 0 runs straight through. */
  yieldEvery?: number;
};

/**
 * Measure vocal variety on decoded mono audio. Returns null when there is too
 * little voiced speech to say anything.
 */
export async function analyseProsody(
  samples: Float32Array,
  sampleRate: number,
  options: AnalyseOptions = {},
): Promise<Prosody | null> {
  const { words, yieldEvery = 400 } = options;
  const frames = await extractFrames(samples, sampleRate, yieldEvery);
  const { db, f0, hopSecs, speechGateDb } = frames;
  const frameCount = db.length;
  const durationSecs = samples.length / sampleRate;

  const voicedHz: number[] = [];
  for (const hz of f0) if (hz !== null) voicedHz.push(hz);
  const voicedSecs = voicedHz.length * hopSecs;
  if (voicedSecs < MIN_VOICED_SECS) return null;

  // Pitch, in semitones around the speaker's own median so registers compare.
  const medianHz = median(voicedHz);
  const semitone = (hz: number) => 12 * Math.log2(hz / medianHz);
  const st: (number | null)[] = f0.map((hz) => (hz === null ? null : semitone(hz)));
  const voicedSt = voicedHz.map(semitone);
  const sortedSt = sortedCopy(voicedSt);
  const pitchSdSt = stdDev(voicedSt);
  const pitchRangeSt = percentile(sortedSt, 0.95) - percentile(sortedSt, 0.05);

  // Loudness over speech frames (voiced or not), relative to their own mean.
  const speechDb: number[] = [];
  for (let i = 0; i < frameCount; i += 1) if (db[i] >= speechGateDb) speechDb.push(db[i]);
  const speechMeanDb = mean(speechDb);
  const sortedSpeechDb = sortedCopy(speechDb);
  const loudnessSdDb = stdDev(speechDb);
  const loudnessRangeDb = percentile(sortedSpeechDb, 0.95) - percentile(sortedSpeechDb, 0.05);
  const peakDb = percentile(sortedSpeechDb, 0.98);

  // Flat stretches: rolling windows where the pitch hardly moves.
  const flatWindow = Math.round(FLAT_WINDOW_SECS / hopSecs);
  const flatHop = Math.round(FLAT_HOP_SECS / hopSecs);
  const flatMinVoiced = Math.round(FLAT_MIN_VOICED_SECS / hopSecs);
  let longestFlatRun = 0;
  let flatRun = 0;
  for (let start = 0; start + flatWindow <= frameCount; start += flatHop) {
    const inWindow: number[] = [];
    for (let i = start; i < start + flatWindow; i += 1) {
      const value = st[i];
      if (value !== null) inWindow.push(value);
    }
    const flat = inWindow.length >= flatMinVoiced && stdDev(inWindow) < FLAT_ST;
    flatRun = flat ? flatRun + 1 : 0;
    longestFlatRun = Math.max(longestFlatRun, flatRun);
  }
  const longestFlatStretchSecs =
    longestFlatRun === 0 ? 0 : FLAT_WINDOW_SECS + (longestFlatRun - 1) * FLAT_HOP_SECS;

  const pace = paceVariation(words, durationSecs);

  // The take in thirds, so a fade in the last third is visible as a number.
  const thirds: ProsodyThird[] = [0, 1, 2].map((third) => {
    const from = Math.floor((frameCount * third) / 3);
    const to = Math.floor((frameCount * (third + 1)) / 3);
    const pitch: number[] = [];
    const loud: number[] = [];
    for (let i = from; i < to; i += 1) {
      const value = st[i];
      if (value !== null) pitch.push(value);
      if (db[i] >= speechGateDb) loud.push(db[i]);
    }
    return {
      pitchSdSt: pitch.length * hopSecs >= FLAT_MIN_VOICED_SECS ? round(stdDev(pitch), 2) : null,
      loudnessDb: loud.length > 0 ? round(mean(loud) - speechMeanDb, 1) : null,
      wpm: pace.perThird[third],
      voicedRatio: to > from ? round(pitch.length / (to - from), 2) : 0,
    };
  });

  // Contour for the chart.
  const points = Math.min(CONTOUR_POINTS, frameCount);
  const contour: VoiceContour = { pitch: [], energy: [] };
  const energySpan = Math.max(1, peakDb - frames.noiseFloorDb);
  for (let point = 0; point < points; point += 1) {
    const from = Math.floor((frameCount * point) / points);
    const to = Math.max(from + 1, Math.floor((frameCount * (point + 1)) / points));
    const pitch: number[] = [];
    let loudest = -Infinity;
    for (let i = from; i < to; i += 1) {
      const value = st[i];
      if (value !== null) pitch.push(value);
      if (db[i] > loudest) loudest = db[i];
    }
    contour.pitch.push(pitch.length / (to - from) >= 0.3 ? round(median(pitch), 2) : null);
    contour.energy.push(round(clamp01((loudest - frames.noiseFloorDb) / energySpan), 2));
  }

  // Score.
  const band = (value: number, [low, high]: [number, number]) =>
    clamp01((value - low) / (high - low));
  const pitchPart = band(pitchSdSt, PITCH_BAND);
  const loudnessPart = band(loudnessSdDb, LOUDNESS_BAND);
  // No pace reading (short take) — fall back on the pitch reading rather than a zero.
  const pacePart = pace.cv === null ? pitchPart : band(pace.cv, PACE_BAND);
  const flatPenalty = Math.min(
    FLAT_PENALTY_MAX,
    Math.max(0, longestFlatStretchSecs - FLAT_GRACE_SECS) * FLAT_PENALTY_PER_SEC,
  );
  const varietyScore = Math.round(
    Math.max(
      0,
      100 *
        (WEIGHTS.pitch * pitchPart +
          WEIGHTS.loudness * loudnessPart +
          WEIGHTS.pace * pacePart) -
        flatPenalty,
    ),
  );

  return {
    medianPitchHz: Math.round(medianHz),
    pitchSdSt: round(pitchSdSt, 2),
    pitchRangeSt: round(pitchRangeSt, 1),
    loudnessSdDb: round(loudnessSdDb, 1),
    loudnessRangeDb: round(loudnessRangeDb, 1),
    paceCv: pace.cv,
    paceRangeWpm: pace.range,
    longestFlatStretchSecs: round(longestFlatStretchSecs, 1),
    voicedSecs: round(voicedSecs, 1),
    thirds,
    contour,
    varietyScore,
    label: labelFor(varietyScore),
  };
}

export function labelFor(score: number): Prosody["label"] {
  if (score < 35) return "flat";
  if (score < 55) return "steady";
  if (score < 75) return "varied";
  return "expressive";
}

/** Compact vocal summary handed to the grading model. */
export function prosodyForPrompt(prosody: Prosody) {
  return {
    variety_score: prosody.varietyScore,
    variety_label: prosody.label,
    median_pitch_hz: prosody.medianPitchHz,
    pitch_variation_semitones: prosody.pitchSdSt,
    pitch_range_semitones: prosody.pitchRangeSt,
    loudness_variation_db: prosody.loudnessSdDb,
    pace_variation:
      prosody.paceCv === null
        ? "take too short to measure"
        : `${Math.round(prosody.paceCv * 100)}% (local pace ranged ${prosody.paceRangeWpm?.[0]}-${prosody.paceRangeWpm?.[1]} wpm)`,
    longest_flat_pitch_stretch_seconds: prosody.longestFlatStretchSecs,
    by_thirds: prosody.thirds.map((third, index) => ({
      third: ["opening", "middle", "closing"][index],
      pitch_variation_semitones: third.pitchSdSt,
      loudness_vs_average_db: third.loudnessDb,
      wpm: third.wpm,
    })),
  };
}
