"use client";

import { formatClock, formatRelativeTime, formatUsd, scoreTone } from "@/lib/format";
import type { StoredAttempt } from "@/lib/types";

const TONE_TEXT: Record<string, string> = {
  emerald: "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10",
  amber: "text-amber-300 ring-amber-500/30 bg-amber-500/10",
  orange: "text-orange-300 ring-orange-500/30 bg-orange-500/10",
  rose: "text-rose-300 ring-rose-500/30 bg-rose-500/10",
};

/** Score trend, oldest on the left. */
function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const width = 100;
  const height = 28;
  const step = width / (scores.length - 1);
  const points = scores
    .map((score, index) => `${(index * step).toFixed(1)},${(height - (score / 100) * height).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-flame-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function HistoryPanel({
  history,
  activeId,
  onClear,
  onDelete,
  onOpen,
}: {
  history: StoredAttempt[];
  activeId: string | null;
  onClear: () => void;
  onDelete: (id: string) => void;
  onOpen: (attempt: StoredAttempt) => void;
}) {

  if (history.length === 0) {
    return (
      <aside className="rounded-2xl border border-dashed border-ink-800 p-5">
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">Your reps</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Nothing yet. It is all in the reps — the first one is supposed to be rough.
        </p>
      </aside>
    );
  }

  const scores = history.map((attempt) => attempt.scorecard.total);
  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  const best = Math.max(...scores);
  const chronological = [...scores].reverse();
  const spent = history.reduce(
    (sum, attempt) =>
      sum + (attempt.cost?.transcription?.usd ?? 0) + (attempt.cost?.evaluation?.usd ?? 0),
    0,
  );

  return (
    <aside className="rounded-2xl border border-ink-800 bg-ink-900/50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">Your reps</h2>
        <button
          onClick={onClear}
          className="text-[11px] text-ink-400 underline-offset-2 transition hover:text-rose-300 hover:underline"
        >
          clear
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          { label: "reps", value: String(history.length) },
          { label: "avg", value: String(average) },
          { label: "best", value: String(best) },
          { label: "spent", value: spent > 0 ? formatUsd(spent) : "—" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-ink-850 py-2">
            <div className="font-mono text-base tabular-nums text-ink-100">{stat.value}</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Sparkline scores={chronological} />
      </div>

      <ul className="thin-scroll mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
        {history.map((attempt) => {
          const tone = TONE_TEXT[scoreTone(attempt.scorecard.total)];
          const isActive = activeId === attempt.id;
          const runCost =
            (attempt.cost?.transcription?.usd ?? 0) + (attempt.cost?.evaluation?.usd ?? 0);

          return (
            <li key={attempt.id}>
              <div
                className={`group flex items-center gap-1 rounded-lg pr-1 transition ${
                  isActive ? "bg-ink-850 ring-1 ring-flame-500/40" : "hover:bg-ink-850"
                }`}
              >
                <button
                  onClick={() => onOpen(attempt)}
                  title={`Open the full result for "${attempt.word}"`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left"
                >
                  <span className={`rounded-md px-2 py-0.5 font-mono text-xs ring-1 ${tone}`}>
                    {attempt.scorecard.total}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="block truncate text-sm text-ink-100">{attempt.word}</span>
                    <span className="block truncate font-mono text-[10px] text-ink-500">
                      L{attempt.level} · t{attempt.wordTier} ·{" "}
                      {formatClock(attempt.metrics.durationSecs)}
                      {runCost > 0 ? ` · ${formatUsd(runCost)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-400">
                    {formatRelativeTime(attempt.createdAt)}
                  </span>
                </button>
                <button
                  onClick={() => onDelete(attempt.id)}
                  aria-label={`Delete the rep on ${attempt.word}`}
                  title="Delete this rep"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-600 opacity-60 transition group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-300 focus-visible:opacity-100 sm:opacity-0"
                >
                  <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden>
                    <path
                      d="M3 3l8 8M11 3l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
