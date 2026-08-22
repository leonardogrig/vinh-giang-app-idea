"use client";

import { formatUsd } from "@/lib/format";
import type { RunCost } from "@/lib/types";

/**
 * The review comes back as prose, so this renders paragraphs, bullets and bold
 * runs — enough for what a coach writes, without pulling in a markdown parser.
 */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim().length > 0);

  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-medium text-ink-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return (
          <em key={index} className="text-ink-100">
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });

  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-300">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n");
        const isList = lines.every((line) => /^\s*[-*•]\s+/.test(line));

        if (isList) {
          return (
            <ul key={blockIndex} className="space-y-1.5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-flame-400" />
                  <span>{inline(line.replace(/^\s*[-*•]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return <p key={blockIndex}>{inline(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

export function CoachReview({
  analysis,
  model,
  cost,
  loading,
  error,
  disabled,
  disabledReason,
  onRun,
}: {
  analysis: string | null;
  model: string | null;
  cost: RunCost["evaluation"];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  disabledReason: string;
  onRun: () => void;
}) {
  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-flame-300">
            Coach review
          </h2>
          <p className="mt-1 text-xs text-ink-400">
            Sends your reps — numbers and recent transcripts — for a read on where you actually are.
          </p>
        </div>

        <button
          onClick={onRun}
          disabled={disabled || loading}
          title={disabled ? disabledReason : undefined}
          className="rounded-xl bg-flame-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-flame-400 disabled:cursor-not-allowed disabled:bg-ink-800 disabled:text-ink-500"
        >
          {loading ? "Reading your log…" : analysis ? "Run it again" : "Check with LLM"}
        </button>
      </div>

      {disabled && <p className="mt-3 text-xs text-ink-500">{disabledReason}</p>}

      {error && (
        <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && (
        <div className="mt-4 space-y-2" aria-hidden>
          {[92, 100, 74, 96, 61].map((width, index) => (
            <div
              key={index}
              className="h-3 animate-pulse rounded bg-ink-800"
              style={{ width: `${width}%`, animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
      )}

      {analysis && !loading && (
        <div className="mt-4 animate-rise">
          <RichText text={analysis} />
          <p className="mt-4 border-t border-ink-800 pt-3 font-mono text-[11px] text-ink-500">
            {model}
            {cost ? ` · ${formatUsd(cost.usd)}` : ""}
            {cost?.promptTokens
              ? ` · ${cost.promptTokens}+${cost.completionTokens ?? 0} tokens`
              : ""}
          </p>
        </div>
      )}
    </section>
  );
}
