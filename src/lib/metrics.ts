import type { Disfluency, Metrics, Pause, Transcript } from "./types";

/**
 * Hard fillers. These are never anything but a stall, so they are penalised
 * at full weight.
 */
const FILLERS = new Set([
  "um", "umm", "ummm", "uh", "uhh", "uhhh", "uhm", "er", "err", "erm", "ah", "ahh",
  "eh", "mm", "mmm", "hmm", "hm", "mhm", "ehm", "ugh",
]);

/**
 * Softer verbal crutches. Some uses are legitimate ("it feels like a bridge"),
 * so these are counted separately and penalised at a lower weight.
 */
const CRUTCH_PHRASES = [
  "you know", "i mean", "sort of", "kind of", "you see", "or something",
  "or whatever", "and stuff", "if that makes sense", "at the end of the day",
  "to be honest", "so yeah",
];

const CRUTCH_WORDS = new Set([
  "like", "basically", "actually", "literally", "obviously", "honestly", "right",
]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "then", "if", "of", "to", "in", "on",
  "at", "for", "with", "is", "was", "are", "were", "be", "been", "am", "it", "its",
  "this", "that", "these", "those", "i", "you", "he", "she", "we", "they", "me",
  "him", "her", "us", "them", "my", "your", "his", "their", "our", "as", "by",
  "from", "not", "no", "do", "does", "did", "have", "has", "had", "can", "could",
  "will", "would", "should", "just", "about", "there", "what", "when", "which",
  "who", "how", "all", "very", "really", "one", "up", "out", "get", "got", "go",
  "going", "know", "think", "say", "said", "like", "because", "into", "over",
]);

/**
 * Below this, a take has too little speech to say anything about delivery —
 * silence is not fluency.
 */
export const MIN_SCORABLE_WORDS = 10;

/** Gap thresholds in seconds. */
const BEAT = 0.35;
const HESITATION = 0.8;
const DEAD_AIR = 1.8;

/** Normalise a token for comparison. Digits are kept so numerals still count. */
const clean = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9'’-]/g, "").replace(/[’']$/, "");

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Turn a Scribe transcript into the delivery numbers we grade on. Everything
 * here is deterministic — the LLM never gets to invent a filler count.
 */
export function computeMetrics(transcript: Transcript): Metrics {
  const tokens = transcript.words ?? [];
  const spoken = tokens.filter(
    (token) => token.type === "word" && clean(token.text).length > 0,
  );

  const duration =
    transcript.audioDurationSecs ||
    spoken.at(-1)?.end ||
    0;

  const fillers: Disfluency[] = [];
  const crutches: Disfluency[] = [];
  const stutters: Disfluency[] = [];

  tokens.forEach((token, index) => {
    if (token.type !== "word") return;
    const word = clean(token.text);
    if (!word) return;

    if (FILLERS.has(word)) {
      fillers.push({ kind: "filler", text: token.text, index, start: token.start });
      return;
    }
    if (CRUTCH_WORDS.has(word)) {
      crutches.push({ kind: "crutch", text: token.text, index, start: token.start });
    }
  });

  // Multi-word crutch phrases, matched over the spoken sequence.
  const spokenIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.type === "word" && clean(token.text).length > 0);

  for (const phrase of CRUTCH_PHRASES) {
    const parts = phrase.split(" ");
    for (let i = 0; i + parts.length <= spokenIndexes.length; i += 1) {
      const window = spokenIndexes.slice(i, i + parts.length);
      const matches = window.every(
        ({ token }, offset) => clean(token.text) === parts[offset],
      );
      if (!matches) continue;
      crutches.push({
        kind: "crutch",
        text: phrase,
        index: window[0].index,
        start: window[0].token.start,
      });
    }
  }

  // Immediate repetitions: "I I", "the the", "it's it's".
  for (let i = 1; i < spokenIndexes.length; i += 1) {
    const previous = clean(spokenIndexes[i - 1].token.text);
    const current = clean(spokenIndexes[i].token.text);
    if (!current || current !== previous) continue;
    if (FILLERS.has(current)) continue;
    stutters.push({
      kind: "stutter",
      text: `${spokenIndexes[i - 1].token.text} ${spokenIndexes[i].token.text}`,
      index: spokenIndexes[i].index,
      start: spokenIndexes[i - 1].token.start,
    });
  }

  // Pauses between consecutive spoken words.
  const pauses: Pause[] = [];
  for (let i = 1; i < spokenIndexes.length; i += 1) {
    const previous = spokenIndexes[i - 1].token;
    const current = spokenIndexes[i].token;
    if (previous.end == null || current.start == null) continue;
    const gap = current.start - previous.end;
    if (gap < BEAT) continue;
    pauses.push({
      start: previous.end,
      end: current.start,
      duration: round(gap, 2),
      severity: gap >= DEAD_AIR ? "dead-air" : gap >= HESITATION ? "hesitation" : "beat",
      index: spokenIndexes[i].index,
    });
  }

  const firstWordStart = spokenIndexes[0]?.token.start ?? 0;
  const lastWordEnd = spokenIndexes.at(-1)?.token.end ?? duration;
  const trailingSilence = Math.max(0, duration - lastWordEnd);
  const innerSilence = pauses.reduce((sum, pause) => sum + pause.duration, 0);
  const totalSilence = innerSilence + firstWordStart + trailingSilence;
  const speakingTime = Math.max(1, duration - totalSilence);

  const wordCount = spoken.length;
  const minutes = Math.max(duration, 1) / 60;
  const wpm = wordCount / minutes;
  const articulationWpm = (wordCount / speakingTime) * 60;

  // Longest stretch with no filler and no hesitation-or-worse pause.
  let runStart = firstWordStart;
  let longestRun = 0;
  const breakPoints = [
    ...fillers.map((filler) => filler.start ?? 0),
    ...pauses
      .filter((pause) => pause.severity !== "beat")
      .map((pause) => pause.start),
  ].sort((a, b) => a - b);

  for (const point of breakPoints) {
    longestRun = Math.max(longestRun, point - runStart);
    runStart = point;
  }
  longestRun = Math.max(longestRun, lastWordEnd - runStart);

  const contentWords = spoken
    .map((token) => clean(token.text))
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !FILLERS.has(word));

  const counts = new Map<string, number>();
  for (const word of contentWords) counts.set(word, (counts.get(word) ?? 0) + 1);
  const topRepeatedWords = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  const unique = new Set(spoken.map((token) => clean(token.text)).filter(Boolean));
  const vocabularyDiversity = wordCount > 0 ? unique.size / wordCount : 0;

  const audioEvents = tokens
    .filter((token) => token.type === "audio_event")
    .map((token) => token.text.trim())
    .filter(Boolean);

  const fillersPerMinute = fillers.length / minutes;
  const crutchesPerMinute = crutches.length / minutes;
  const stuttersPerMinute = stutters.length / minutes;
  const longestPause = pauses.reduce((max, pause) => Math.max(max, pause.duration), 0);
  const silenceRatio = duration > 0 ? totalSilence / duration : 0;

  const tooLittleSpeech = wordCount < MIN_SCORABLE_WORDS;

  // Fluency: how much of the take was stalling.
  const fluencyScore = clamp(
    100 -
      Math.min(45, fillersPerMinute * 6) -
      Math.min(20, crutchesPerMinute * 2.5) -
      Math.min(20, stuttersPerMinute * 4),
  );

  // Pacing: rate, silence load, and how long the worst freeze lasted.
  const ratePenalty =
    wpm < 110 ? (110 - wpm) * 0.8 : wpm > 180 ? (wpm - 180) * 0.8 : 0;
  const pacingScore = clamp(
    100 -
      Math.min(35, ratePenalty) -
      Math.min(30, Math.max(0, silenceRatio - 0.18) * 150) -
      Math.min(20, Math.max(0, longestPause - 2) * 8) -
      Math.min(15, Math.max(0, firstWordStart - 1.5) * 6),
  );

  return {
    durationSecs: round(duration, 2),
    wordCount,
    wpm: Math.round(wpm),
    articulationWpm: Math.round(articulationWpm),
    fillers,
    crutches,
    stutters,
    fillersPerMinute: round(fillersPerMinute),
    pauses,
    totalSilenceSecs: round(totalSilence, 2),
    silenceRatio: round(silenceRatio, 3),
    longestPauseSecs: round(longestPause, 2),
    timeToFirstWordSecs: round(firstWordStart, 2),
    longestFluentRunSecs: round(longestRun, 1),
    vocabularyDiversity: round(vocabularyDiversity, 3),
    topRepeatedWords,
    audioEvents,
    fluencyScore: tooLittleSpeech ? 0 : Math.round(fluencyScore),
    pacingScore: tooLittleSpeech ? 0 : Math.round(pacingScore),
  };
}

/** Compact metric summary handed to the grading model. */
export function metricsForPrompt(metrics: Metrics) {
  return {
    duration_seconds: metrics.durationSecs,
    word_count: metrics.wordCount,
    words_per_minute: metrics.wpm,
    articulation_wpm: metrics.articulationWpm,
    filler_count: metrics.fillers.length,
    fillers_used: [...new Set(metrics.fillers.map((f) => f.text.toLowerCase()))],
    fillers_per_minute: metrics.fillersPerMinute,
    crutch_count: metrics.crutches.length,
    crutches_used: [...new Set(metrics.crutches.map((c) => c.text.toLowerCase()))],
    stutter_count: metrics.stutters.length,
    hesitation_pauses: metrics.pauses.filter((p) => p.severity !== "beat").length,
    longest_pause_seconds: metrics.longestPauseSecs,
    silence_ratio: metrics.silenceRatio,
    seconds_before_first_word: metrics.timeToFirstWordSecs,
    longest_fluent_run_seconds: metrics.longestFluentRunSecs,
    vocabulary_diversity: metrics.vocabularyDiversity,
    most_repeated_words: metrics.topRepeatedWords,
    audio_events: metrics.audioEvents,
  };
}
