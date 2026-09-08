import { DEFAULT_OPENROUTER_MODEL } from "./config";
import type { FrameSetting } from "./frame";

/** User preferences that persist across sessions. Shared by client and server. */
export type Settings = { targetSecs: number; model: string; frame: FrameSetting };

export const DEFAULT_SETTINGS: Settings = {
  targetSecs: 60,
  model: DEFAULT_OPENROUTER_MODEL,
  frame: "auto",
};
