/**
 * Model defaults. Both can be overridden: OPENROUTER_MODEL in .env.local sets
 * the server default, and the model field in the app's settings overrides it
 * per request so you can swap models without a restart.
 */
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";

/**
 * Model slugs that were previously the default but are no longer used. Any
 * persisted setting (DB row, localStorage) still holding one of these is
 * migrated to the current default on read, so changing the default above
 * actually takes effect without a manual data edit.
 */
export const LEGACY_OPENROUTER_MODELS: ReadonlySet<string> = new Set([
  "deepseek/deepseek-v4-flash-0731",
]);

/** Normalize a stored/requested model slug, migrating legacy defaults away. */
export function coerceModel(model: string | null | undefined): string {
  const trimmed = model?.trim();
  if (!trimmed || LEGACY_OPENROUTER_MODELS.has(trimmed)) {
    return DEFAULT_OPENROUTER_MODEL;
  }
  return trimmed;
}

/** ElevenLabs batch transcription model. */
export const DEFAULT_SCRIBE_MODEL = "scribe_v2";

export const DURATION_OPTIONS = [30, 60, 120, 180] as const;
export type DurationOption = (typeof DURATION_OPTIONS)[number];
