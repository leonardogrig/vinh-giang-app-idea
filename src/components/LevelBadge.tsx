"use client";

import { MAX_LEVEL, PROMOTE_AT, type Progress } from "@/lib/progression";

/** Where the speaker sits on the ladder, and how close the next rung is. */
export function LevelBadge({ progress }: { progress: Progress }) {
  const atCap = progress.level >= MAX_LEVEL;

  return (
    <div className="w-full rounded-2xl border border-ink-800 bg-ink-900/50 px-4 py-3 sm:w-auto sm:min-w-[210px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.18em] text-ink-400">
          Level <span className="text-flame-300">{progress.level}</span> of {MAX_LEVEL}
        </span>
        <span className="text-sm text-ink-100">{progress.name}</span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-flame-400/80 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.round(progress.progressToNext * 100)}%` }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        {progress.average === null
          ? `${progress.repsToDecision} reps to your first ladder call`
          : atCap
            ? `Top rung. Holding an average of ${progress.average}.`
            : progress.repsToDecision > 0
              ? `Averaging ${progress.average} · ${progress.repsToDecision} more rep${progress.repsToDecision === 1 ? "" : "s"} to move`
              : `Averaging ${progress.average} · ${PROMOTE_AT} moves you up`}
      </p>
    </div>
  );
}
