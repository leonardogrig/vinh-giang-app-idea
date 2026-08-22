"use client";

import type { Metrics, Transcript } from "@/lib/types";

const LEGEND = [
  { label: "filler", className: "bg-rose-500/20 text-rose-200 ring-rose-500/40" },
  { label: "crutch", className: "bg-amber-500/15 text-amber-200 ring-amber-500/35" },
  { label: "restart", className: "bg-violet-500/15 text-violet-200 ring-violet-500/35" },
  { label: "pause", className: "bg-ink-700 text-ink-300 ring-ink-600" },
];

/**
 * The verbatim take with every stall marked in place — this is the part that
 * makes people wince, and it is the most useful part of the drill.
 */
export function TranscriptView({
  transcript,
  metrics,
}: {
  transcript: Transcript;
  metrics: Metrics;
}) {
  const fillers = new Set(metrics.fillers.map((item) => item.index));
  const crutches = new Set(metrics.crutches.map((item) => item.index));
  const stutters = new Set(metrics.stutters.map((item) => item.index));
  const pauses = new Map(
    metrics.pauses.filter((pause) => pause.severity !== "beat").map((pause) => [pause.index, pause]),
  );

  const tokens = transcript.words ?? [];
  const hasTokens = tokens.some((token) => token.type === "word");

  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">
          Verbatim transcript
        </h3>
        <div className="flex flex-wrap gap-2">
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${item.className}`}
            >
              {item.label}
            </span>
          ))}
        </div>
      </header>

      <div className="thin-scroll max-h-96 overflow-y-auto pr-2 text-[17px] leading-8 text-ink-100">
        {!hasTokens ? (
          <p className="text-ink-400">
            {transcript.text || "No speech was captured in this take."}
          </p>
        ) : (
          <p>
            {tokens.map((token, index) => {
              if (token.type === "spacing") return <span key={index}> </span>;

              if (token.type === "audio_event") {
                return (
                  <span
                    key={index}
                    className="mx-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 align-middle text-xs text-sky-300 ring-1 ring-sky-500/30"
                  >
                    {token.text.replace(/[()]/g, "")}
                  </span>
                );
              }

              const pause = pauses.get(index);
              const isFiller = fillers.has(index);
              const isCrutch = !isFiller && crutches.has(index);
              const isStutter = stutters.has(index);

              const className = isFiller
                ? "rounded bg-rose-500/20 px-1 text-rose-200 ring-1 ring-rose-500/40"
                : isStutter
                  ? "rounded bg-violet-500/15 px-1 text-violet-200 ring-1 ring-violet-500/35"
                  : isCrutch
                    ? "rounded bg-amber-500/15 px-1 text-amber-200 ring-1 ring-amber-500/35"
                    : "";

              return (
                <span key={index}>
                  {pause && (
                    <span
                      className={`mx-1 inline-block rounded-full px-2 py-0.5 align-middle font-mono text-[11px] ring-1 ${
                        pause.severity === "dead-air"
                          ? "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                          : "bg-ink-800 text-ink-400 ring-ink-700"
                      }`}
                      title={`${pause.severity} — ${pause.duration}s of silence`}
                    >
                      {pause.duration.toFixed(1)}s
                    </span>
                  )}
                  <span className={className}>{token.text}</span>
                </span>
              );
            })}
          </p>
        )}
      </div>
    </section>
  );
}
