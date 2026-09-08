/**
 * Model defaults. Both can be overridden: OPENROUTER_MODEL in .env.local sets
 * the server default, and the model field in the app's settings overrides it
 * per request so you can swap models without a restart.
 */
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";

/** ElevenLabs batch transcription model. */
export const DEFAULT_SCRIBE_MODEL = "scribe_v2";

export const DURATION_OPTIONS = [30, 60, 120, 180] as const;
export type DurationOption = (typeof DURATION_OPTIONS)[number];
