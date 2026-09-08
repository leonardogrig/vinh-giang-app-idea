/**
 * The frame: a three-beat shape to pour an improvised take into.
 *
 * Nobody is given time to think before the mic opens — that would train a
 * different skill. What they get instead, at the lower levels, is a structure
 * to fall back on while they talk. It fades as they climb: full guidance at
 * level 1, labels only at level 3, nothing from level 4. Support with an exit,
 * not a crutch.
 */

export type FrameBeat = {
  key: "picture" | "moment" | "point";
  label: string;
  hint: string;
  /** Share of the target duration this beat is meant to occupy. */
  from: number;
  to: number;
};

export const FRAME_BEATS: FrameBeat[] = [
  {
    key: "picture",
    label: "Picture",
    hint: "The first specific thing it makes you see. One image, not a definition.",
    from: 0,
    to: 0.2,
  },
  {
    key: "moment",
    label: "Moment",
    hint: "One time it showed up in your life. Who was there, what happened.",
    from: 0.2,
    to: 0.7,
  },
  {
    key: "point",
    label: "Point",
    hint: "What that moment taught you, or what you believe about it now.",
    from: 0.7,
    to: 1,
  },
];

/**
 * How much of the frame is on screen.
 * - guided: labels, hints, and the current beat lit up as the clock runs
 * - cues:   labels and hints, no clock
 * - labels: the three words only
 * - none:   nothing
 */
export type FrameMode = "guided" | "cues" | "labels" | "none";

export const FRAME_MODE_LABEL: Record<FrameMode, string> = {
  guided: "guided frame",
  cues: "frame with hints",
  labels: "beat labels only",
  none: "no frame",
};

/** The user-facing switch. Auto follows the ladder. */
export type FrameSetting = "auto" | "always" | "never";
export const FRAME_SETTINGS: readonly FrameSetting[] = ["auto", "always", "never"];

export function frameModeFor(level: number, setting: FrameSetting): FrameMode {
  if (setting === "never") return "none";
  if (setting === "always") return "guided";
  if (level <= 1) return "guided";
  if (level === 2) return "cues";
  if (level === 3) return "labels";
  return "none";
}

/** Which beat the clock says you should be in. Past the target, the last one. */
export function beatIndexAt(elapsedSecs: number, targetSecs: number) {
  const ratio = targetSecs > 0 ? elapsedSecs / targetSecs : 0;
  const index = FRAME_BEATS.findIndex((beat) => ratio < beat.to);
  return index === -1 ? FRAME_BEATS.length - 1 : index;
}
