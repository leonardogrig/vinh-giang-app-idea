import { deriveProgress } from "./progression";
import type { StoredAttempt } from "./types";

export type RepPoint = {
  index: number;
  id: string;
  at: number;
  word: string;
  tier: number;
  level: number;
  score: number;
  durationSecs: number;
  targetSecs: number;
  fillersPerMinute: number;
  wpm: number;
  silencePct: number;
  longestPauseSecs: number;
  cleanRunSecs: number;
  wordCount: number;
  costUsd: number;
  /** Null on reps recorded before the voice reading existed, or where it failed. */
  varietyScore: number | null;
  pitchSdSt: number | null;
  frame: string | null;
};

export type Comparison = {
  label: string;
  first: number;
  last: number;
  delta: number;
  /** Which direction counts as getting better. */
  better: "up" | "down";
  unit: string;
};

export type Analytics = {
  reps: RepPoint[];
  totals: {
    reps: number;
    speakingSecs: number;
    words: number;
    avgScore: number;
    bestScore: number;
    worstScore: number;
    costUsd: number;
    level: number;
    levelName: string;
    /** Mean vocal variety over the reps that have a reading, or null. */
    avgVariety: number | null;
  };
  /** First few reps against the most recent few. Null until there are enough. */
  comparisons: Comparison[] | null;
  comparisonWindow: number;
  byTier: { tier: number; reps: number; avgScore: number }[];
  fillerCounts: { text: string; count: number }[];
  crutchCounts: { text: string; count: number }[];
  best: RepPoint | null;
  cleanest: RepPoint | null;
};

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** The numeric values of one metric, skipping reps that do not carry it. */
const numbers = (list: RepPoint[], key: keyof RepPoint) =>
  list.map((rep) => rep[key]).filter((value): value is number => typeof value === "number");

function tally(entries: { text: string }[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.text.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([text, count]) => ({ text, count }));
}

/** Everything the analytics page and the coach review are built from. */
export function buildAnalytics(history: StoredAttempt[]): Analytics {
  const ordered = [...history].sort((a, b) => a.createdAt - b.createdAt);

  const reps: RepPoint[] = ordered.map((attempt, index) => ({
    index: index + 1,
    id: attempt.id,
    at: attempt.createdAt,
    word: attempt.word,
    tier: attempt.wordTier ?? 1,
    level: attempt.level ?? 1,
    score: attempt.scorecard.total,
    durationSecs: attempt.metrics.durationSecs,
    targetSecs: attempt.targetSecs,
    fillersPerMinute: attempt.metrics.fillersPerMinute,
    wpm: attempt.metrics.wpm,
    silencePct: Math.round(attempt.metrics.silenceRatio * 100),
    longestPauseSecs: attempt.metrics.longestPauseSecs,
    cleanRunSecs: attempt.metrics.longestFluentRunSecs,
    wordCount: attempt.metrics.wordCount,
    costUsd:
      (attempt.cost?.transcription?.usd ?? 0) + (attempt.cost?.evaluation?.usd ?? 0),
    varietyScore: attempt.prosody?.varietyScore ?? null,
    pitchSdSt: attempt.prosody?.pitchSdSt ?? null,
    frame: attempt.frame ?? null,
  }));

  const progress = deriveProgress(history);
  const scores = reps.map((rep) => rep.score);
  const varietyScores = numbers(reps, "varietyScore");

  // Compare the opening reps against the most recent ones. Five a side once
  // there are twelve reps, three a side before that. A metric that only some
  // reps carry (the voice reading is newer than the app) needs at least two
  // readings a side or its row is left out.
  const window = reps.length >= 12 ? 5 : 3;
  const comparisons =
    reps.length >= window * 2
      ? ([
          { label: "Score", key: "score" as const, better: "up" as const, unit: "" },
          {
            label: "Fillers per minute",
            key: "fillersPerMinute" as const,
            better: "down" as const,
            unit: "/min",
          },
          { label: "Silence", key: "silencePct" as const, better: "down" as const, unit: "%" },
          {
            label: "Longest pause",
            key: "longestPauseSecs" as const,
            better: "down" as const,
            unit: "s",
          },
          {
            label: "Longest clean run",
            key: "cleanRunSecs" as const,
            better: "up" as const,
            unit: "s",
          },
          { label: "Pace", key: "wpm" as const, better: "up" as const, unit: " wpm" },
          {
            label: "Vocal variety",
            key: "varietyScore" as const,
            better: "up" as const,
            unit: "",
          },
        ].flatMap(({ label, key, better, unit }) => {
          const opening = numbers(reps.slice(0, window), key);
          const recent = numbers(reps.slice(-window), key);
          if (opening.length < 2 || recent.length < 2) return [];
          const first = round(mean(opening));
          const last = round(mean(recent));
          return [{ label, first, last, delta: round(last - first), better, unit }];
        }) as Comparison[])
      : null;

  const tiers = new Map<number, number[]>();
  for (const rep of reps) {
    if (!tiers.has(rep.tier)) tiers.set(rep.tier, []);
    tiers.get(rep.tier)!.push(rep.score);
  }

  return {
    reps,
    totals: {
      reps: reps.length,
      speakingSecs: Math.round(reps.reduce((sum, rep) => sum + rep.durationSecs, 0)),
      words: reps.reduce((sum, rep) => sum + rep.wordCount, 0),
      avgScore: Math.round(mean(scores)),
      bestScore: scores.length ? Math.max(...scores) : 0,
      worstScore: scores.length ? Math.min(...scores) : 0,
      costUsd: reps.reduce((sum, rep) => sum + rep.costUsd, 0),
      level: progress.level,
      levelName: progress.name,
      avgVariety: varietyScores.length ? Math.round(mean(varietyScores)) : null,
    },
    comparisons,
    comparisonWindow: window,
    byTier: [...tiers.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, values]) => ({
        tier,
        reps: values.length,
        avgScore: Math.round(mean(values)),
      })),
    fillerCounts: tally(ordered.flatMap((attempt) => attempt.metrics.fillers)),
    crutchCounts: tally(ordered.flatMap((attempt) => attempt.metrics.crutches)),
    best: reps.length ? reps.reduce((a, b) => (b.score > a.score ? b : a)) : null,
    cleanest: reps.length
      ? reps.reduce((a, b) => (b.fillersPerMinute < a.fillersPerMinute ? b : a))
      : null,
  };
}

/**
 * The payload sent to the coach. Recent reps carry their transcript so the
 * model can read the actual speech; older ones are numbers only, to keep the
 * request from ballooning across a long history.
 */
export function buildCoachPayload(history: StoredAttempt[]) {
  const analytics = buildAnalytics(history);
  const ordered = [...history].sort((a, b) => a.createdAt - b.createdAt).slice(-40);
  const transcriptFrom = Math.max(0, ordered.length - 10);

  return {
    summary: {
      total_reps: analytics.totals.reps,
      current_level: analytics.totals.level,
      level_name: analytics.totals.levelName,
      average_score: analytics.totals.avgScore,
      best_score: analytics.totals.bestScore,
      worst_score: analytics.totals.worstScore,
      total_speaking_seconds: analytics.totals.speakingSecs,
      average_vocal_variety: analytics.totals.avgVariety,
      average_score_by_word_tier: analytics.byTier,
      most_used_fillers: analytics.fillerCounts,
      most_used_crutches: analytics.crutchCounts,
      first_versus_recent: analytics.comparisons,
      comparison_window: analytics.comparisonWindow,
    },
    reps: ordered.map((attempt, index) => ({
      n: index + 1,
      when: new Date(attempt.createdAt).toISOString().slice(0, 16).replace("T", " "),
      word: attempt.word,
      word_tier: attempt.wordTier,
      speaker_level: attempt.level,
      target_seconds: attempt.targetSecs,
      spoke_seconds: attempt.metrics.durationSecs,
      score: attempt.scorecard.total,
      fillers_per_minute: attempt.metrics.fillersPerMinute,
      words_per_minute: attempt.metrics.wpm,
      silence_percent: Math.round(attempt.metrics.silenceRatio * 100),
      longest_pause_seconds: attempt.metrics.longestPauseSecs,
      longest_clean_run_seconds: attempt.metrics.longestFluentRunSecs,
      vocal_variety: attempt.prosody?.varietyScore ?? null,
      pitch_variation_semitones: attempt.prosody?.pitchSdSt ?? null,
      longest_flat_pitch_seconds: attempt.prosody?.longestFlatStretchSecs ?? null,
      frame_shown: attempt.frame ?? null,
      verdict: attempt.evaluation?.verdict ?? null,
      transcript:
        index >= transcriptFrom ? attempt.transcript.text.slice(0, 1400) : undefined,
    })),
  };
}
