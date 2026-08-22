import { MIN_SCORABLE_WORDS } from "./metrics";
import type { Evaluation, Metrics, Scorecard } from "./types";

/** Weights sum to 100 when an LLM evaluation is available. */
const WEIGHTS = {
  fluency: 25,
  pacing: 15,
  relevance: 20,
  structure: 20,
  insight: 20,
} as const;

const share = (score0to100: number, max: number) =>
  Math.round((Math.max(0, Math.min(100, score0to100)) / 100) * max);

export function gradeFor(total: number) {
  if (total >= 90) return "A";
  if (total >= 80) return "B";
  if (total >= 70) return "C";
  if (total >= 60) return "D";
  if (total >= 45) return "E";
  return "F";
}

export function verdictFor(total: number) {
  if (total >= 90) return "Sharp. That would land in a room.";
  if (total >= 80) return "Strong rep. A few edges to sand down.";
  if (total >= 70) return "Solid, but the seams are showing.";
  if (total >= 60) return "Getting there. The connection is still loose.";
  if (total >= 45) return "Rough — exactly where the reps start paying off.";
  return "A little bit crap. Which is the whole point. Go again.";
}

/**
 * Blend the measured delivery with the model's read on content. If the model
 * call failed we still produce a score, just from delivery alone, rescaled to
 * 100 and flagged in the notes.
 */
export function buildScorecard(
  metrics: Metrics,
  evaluation: Evaluation | null,
  targetSecs: number,
): Scorecard {
  const notes: string[] = [];

  const breakdown: Scorecard["breakdown"] = [
    {
      label: "Fluency",
      score: share(metrics.fluencyScore, WEIGHTS.fluency),
      max: WEIGHTS.fluency,
      detail:
        metrics.fillers.length === 0
          ? "No hard fillers. Clean."
          : `${metrics.fillers.length} filler${metrics.fillers.length === 1 ? "" : "s"}` +
            ` (${metrics.fillersPerMinute}/min)` +
            (metrics.stutters.length ? `, ${metrics.stutters.length} restart${metrics.stutters.length === 1 ? "" : "s"}` : ""),
    },
    {
      label: "Pacing",
      score: share(metrics.pacingScore, WEIGHTS.pacing),
      max: WEIGHTS.pacing,
      detail: `${metrics.wpm} wpm · ${Math.round(metrics.silenceRatio * 100)}% silence · longest pause ${metrics.longestPauseSecs}s`,
    },
  ];

  if (evaluation) {
    breakdown.push(
      {
        label: "Relevance",
        score: share(evaluation.relevanceScore, WEIGHTS.relevance),
        max: WEIGHTS.relevance,
        detail: "How tightly the talk stayed on the word.",
      },
      {
        label: "Structure",
        score: share(evaluation.structureScore, WEIGHTS.structure),
        max: WEIGHTS.structure,
        detail: "Opening, thread, and a landing worth hearing.",
      },
      {
        label: "Insight",
        score: share(evaluation.insightScore, WEIGHTS.insight),
        max: WEIGHTS.insight,
        detail: "Story, angle, and something the listener keeps.",
      },
    );
  } else {
    notes.push("Content scoring unavailable — this score is delivery only.");
  }

  const earned = breakdown.reduce((sum, row) => sum + row.score, 0);
  const available = breakdown.reduce((sum, row) => sum + row.max, 0);
  let total = Math.round((earned / available) * 100);

  // Nothing to grade. Silence is not a clean take.
  if (metrics.wordCount < MIN_SCORABLE_WORDS) {
    return {
      total: 0,
      grade: "F",
      breakdown: breakdown.map((row) => ({ ...row, score: 0 })),
      notes: [
        `Only ${metrics.wordCount} word${metrics.wordCount === 1 ? "" : "s"} came through — not enough to score. Check your mic, then go again.`,
      ],
    };
  }

  // Stopping well short of the target is part of the exercise failing.
  const coverage = targetSecs > 0 ? metrics.durationSecs / targetSecs : 1;
  if (coverage < 0.8) {
    const factor = Math.max(0.35, coverage / 0.8);
    const before = total;
    total = Math.round(total * factor);
    notes.push(
      `Stopped at ${metrics.durationSecs.toFixed(0)}s of a ${targetSecs}s target — score scaled from ${before}.`,
    );
  }

  return { total, grade: gradeFor(total), breakdown, notes };
}
