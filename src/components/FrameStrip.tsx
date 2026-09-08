"use client";

import { FRAME_BEATS, beatIndexAt, type FrameMode } from "@/lib/frame";

/**
 * The Picture → Moment → Point frame under the word. In guided mode the beat
 * the clock says you should be in lights up as you talk; in the lighter modes
 * it is a static reminder; at the top of the ladder it is not there at all.
 */
export function FrameStrip({
  mode,
  live,
  elapsed,
  target,
}: {
  mode: FrameMode;
  /** True while the mic is open. */
  live: boolean;
  elapsed: number;
  target: number;
}) {
  if (mode === "none") return null;

  if (mode === "labels") {
    return (
      <p className="mx-auto mt-5 flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.22em] text-ink-500">
        {FRAME_BEATS.map((beat, index) => (
          <span key={beat.key} className="flex items-center gap-3">
            {index > 0 && <span className="text-ink-700">→</span>}
            <span>{beat.label}</span>
          </span>
        ))}
      </p>
    );
  }

  const timed = mode === "guided" && live;
  const active = timed ? beatIndexAt(elapsed, target) : -1;

  return (
    <div className="mx-auto mt-6 max-w-2xl">
      <ol className="grid gap-2 sm:grid-cols-3">
        {FRAME_BEATS.map((beat, index) => {
          const state = !timed
            ? "idle"
            : index < active
              ? "done"
              : index === active
                ? "active"
                : "next";

          const shell =
            state === "active"
              ? "border-flame-500/60 bg-flame-500/10 shadow-[0_0_28px_-12px_rgba(245,158,11,0.7)]"
              : state === "done"
                ? "border-emerald-500/25 bg-emerald-500/[0.05]"
                : "border-ink-800 bg-ink-900/40";
          const number =
            state === "active"
              ? "border-flame-400/70 bg-flame-500/20 text-flame-200"
              : state === "done"
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                : "border-ink-700 text-ink-500";
          const label =
            state === "active"
              ? "text-flame-200"
              : state === "done"
                ? "text-emerald-200/80"
                : state === "next"
                  ? "text-ink-500"
                  : "text-ink-200";
          const hint =
            state === "active" ? "text-ink-200" : state === "next" ? "text-ink-600" : "text-ink-400";

          return (
            <li
              key={beat.key}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors duration-500 ${shell}`}
              aria-current={state === "active" ? "step" : undefined}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-medium transition-colors ${number}`}
                >
                  {state === "done" ? "✓" : index + 1}
                </span>
                <span className={`text-xs font-medium uppercase tracking-[0.18em] ${label}`}>
                  {beat.label}
                </span>
              </div>
              <p className={`mt-1.5 text-xs leading-relaxed ${hint}`}>{beat.hint}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-center text-[11px] text-ink-600">
        {timed
          ? "The lit beat is where the clock says you should be. A guide, not a rule."
          : "A shape to fall back on. It fades as you level up."}
      </p>
    </div>
  );
}
