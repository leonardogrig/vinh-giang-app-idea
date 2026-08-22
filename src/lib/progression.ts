import type { StoredAttempt } from "./types";

/**
 * The ladder. Each level draws from the matching word tier, so the words get
 * harder as you get better rather than staying uniformly random.
 */
export const LEVELS: { level: number; name: string; blurb: string }[] = [
  { level: 1, name: "Warm-up", blurb: "Things you can see and already feel something about" },
  { level: 2, name: "Everyday", blurb: "Familiar objects and plain feelings" },
  { level: 3, name: "Mixed", blurb: "Where the abstract starts creeping in" },
  { level: 4, name: "Abstract", blurb: "Ideas with no picture attached" },
  { level: 5, name: "Cold open", blurb: "Flat, unglamorous words with nothing to grab" },
];

export const MAX_LEVEL = LEVELS.length;

/** Reps averaged before the ladder moves. */
const WINDOW = 3;
/** Average needed over the window to move up. */
export const PROMOTE_AT = 72;
/** Average that sends you back down a rung. */
export const DEMOTE_AT = 40;

export type Progress = {
  level: number;
  name: string;
  blurb: string;
  /** Scores recorded since arriving at this level, oldest first. */
  windowScores: number[];
  /** Average of the current window, or null before any rep at this level. */
  average: number | null;
  /** Reps still needed before the ladder can move. */
  repsToDecision: number;
  /** Did the most recent rep move the ladder? */
  movement: "promoted" | "demoted" | null;
  /** 0-1, how close the current window is to the promotion bar. */
  progressToNext: number;
};

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Replay the whole history to work out where the speaker stands.
 *
 * Deriving rather than storing means the level always agrees with the reps you
 * can actually see — delete a rep and the ladder recalculates honestly.
 */
export function deriveProgress(history: StoredAttempt[]): Progress {
  // History is newest-first for display; the ladder needs it in order.
  const scores = [...history]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((attempt) => attempt.scorecard.total);

  let level = 1;
  let windowScores: number[] = [];
  let movement: Progress["movement"] = null;

  scores.forEach((score, index) => {
    const isLast = index === scores.length - 1;
    windowScores.push(score);
    if (windowScores.length < WINDOW) {
      if (isLast) movement = null;
      return;
    }

    const average = mean(windowScores.slice(-WINDOW));
    if (average >= PROMOTE_AT && level < MAX_LEVEL) {
      level += 1;
      windowScores = [];
      movement = isLast ? "promoted" : null;
    } else if (average < DEMOTE_AT && level > 1) {
      level -= 1;
      windowScores = [];
      movement = isLast ? "demoted" : null;
    } else if (isLast) {
      movement = null;
    }
  });

  const recent = windowScores.slice(-WINDOW);
  const average = recent.length > 0 ? Math.round(mean(recent)) : null;
  const definition = LEVELS[level - 1];

  return {
    level,
    name: definition.name,
    blurb: definition.blurb,
    windowScores: recent,
    average,
    repsToDecision: Math.max(0, WINDOW - recent.length),
    movement,
    progressToNext:
      average === null ? 0 : Math.max(0, Math.min(1, average / PROMOTE_AT)),
  };
}
