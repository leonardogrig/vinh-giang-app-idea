"use client";

import { DURATION_OPTIONS } from "@/lib/config";
import { formatClock } from "@/lib/format";
import type { Settings } from "@/lib/storage";

export function SettingsBar({
  settings,
  autoStart,
  onChange,
  onAutoStartChange,
  disabled,
}: {
  settings: Settings;
  autoStart: boolean;
  onChange: (next: Settings) => void;
  onAutoStartChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-ink-800 bg-ink-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-400">Talk for</span>
        <div className="flex rounded-lg bg-ink-850 p-1">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option}
              disabled={disabled}
              onClick={() => onChange({ ...settings, targetSecs: option })}
              className={`rounded-md px-3 py-1 font-mono text-xs tabular-nums transition disabled:opacity-40 ${
                settings.targetSecs === option
                  ? "bg-flame-500 text-ink-950"
                  : "text-ink-300 hover:text-ink-100"
              }`}
            >
              {formatClock(option)}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-400">
        <input
          type="checkbox"
          checked={autoStart}
          disabled={disabled}
          onChange={(event) => onAutoStartChange(event.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--color-flame-500)]"
        />
        3-2-1 auto start
      </label>

      <label className="flex min-w-0 items-center gap-2 sm:w-72">
        <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-ink-400">Model</span>
        <input
          value={settings.model}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onChange({ ...settings, model: event.target.value })}
          placeholder="provider/model"
          title="Any OpenRouter model slug, e.g. deepseek/deepseek-v4-flash-0731"
          className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 font-mono text-xs text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-flame-500/60 disabled:opacity-40"
        />
      </label>
    </div>
  );
}
