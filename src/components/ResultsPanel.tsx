"use client";

import { ScoreRing } from "@/components/Rings";
import { MetricTiles } from "@/components/MetricTiles";
import { TranscriptView } from "@/components/TranscriptView";
import { VoiceCard } from "@/components/VoiceCard";
import { formatClock, formatUsd, scoreTone } from "@/lib/format";
import { FRAME_MODE_LABEL } from "@/lib/frame";
import { verdictFor } from "@/lib/scoring";
import { LEVELS, type Progress } from "@/lib/progression";
import type { Attempt } from "@/lib/types";

/** What this single rep cost, itemised by provider. */
function CostLine({ cost }: { cost: Attempt["cost"] }) {
  const parts: string[] = [];
  if (cost.transcription) parts.push(`Scribe ${formatUsd(cost.transcription.usd)}`);
  if (cost.evaluation) parts.push(`model ${formatUsd(cost.evaluation.usd)}`);
  if (parts.length === 0) return null;

  const total = (cost.transcription?.usd ?? 0) + (cost.evaluation?.usd ?? 0);
  const tokens = cost.evaluation?.promptTokens
    ? ` · ${cost.evaluation.promptTokens}+${cost.evaluation.completionTokens ?? 0} tokens`
    : "";

  return (
    <p
      className="mt-5 font-mono text-[11px] text-ink-500"
      title={[cost.transcription?.basis, cost.evaluation?.basis].filter(Boolean).join(" · ")}
    >
      This rep cost {formatUsd(total)} — {parts.join(" · ")}
      {tokens}
    </p>
  );
}

export function ResultsPanel({
  attempt,
  audioUrl,
  evaluationError,
  progress,
  onRetry,
  onAgain,
  againLabel = "New word, go again",
}: {
  attempt: Attempt;
  audioUrl: string | null;
  evaluationError: string | null;
  progress: Progress;
  onRetry?: () => void;
  onAgain: () => void;
  againLabel?: string;
}) {
  const { scorecard, metrics, evaluation, transcript } = attempt;
  const tone = scoreTone(scorecard.total);

  const moved = progress.movement;
  const levelBlurb = LEVELS[progress.level - 1]?.blurb;

  return (
    <div className="animate-rise space-y-5">
      {moved === "promoted" && (
        <section className="animate-rise rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium text-emerald-200">
            Level up — you are on level {progress.level}, {progress.name.toLowerCase()}.
          </p>
          <p className="mt-1 text-xs text-emerald-300/80">
            {levelBlurb}. The words get harder from here.
          </p>
        </section>
      )}

      {moved === "demoted" && (
        <section className="animate-rise rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-200">
            Back to level {progress.level}, {progress.name.toLowerCase()}.
          </p>
          <p className="mt-1 text-xs text-amber-300/80">
            Not a punishment. Easier words, cleaner reps, then climb again.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-ink-800 bg-ink-900/70 p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <ScoreRing score={scorecard.total} grade={scorecard.grade} tone={tone} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs uppercase tracking-[0.2em] text-ink-400">the word was</span>
              <span className="text-2xl font-medium text-flame-300">{attempt.word}</span>
              <span className="text-xs text-ink-400">
                {formatClock(metrics.durationSecs)} of {formatClock(attempt.targetSecs)}
              </span>
              {attempt.frame && attempt.frame !== "none" && (
                <span
                  className="text-xs text-ink-500"
                  title="Picture → Moment → Point was on screen for this rep"
                >
                  · {FRAME_MODE_LABEL[attempt.frame]}
                </span>
              )}
            </div>

            {attempt.wordDefinition && (
              <p className="mt-1 text-sm text-ink-400">{attempt.wordDefinition}</p>
            )}

            <p className="mt-3 text-lg leading-snug text-ink-100">
              {evaluation?.verdict || verdictFor(scorecard.total)}
            </p>

            {evaluation?.summary && (
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{evaluation.summary}</p>
            )}

            <div className="mt-5 space-y-2">
              {scorecard.breakdown.map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs uppercase tracking-[0.12em] text-ink-400">
                    {row.label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-flame-400/80 transition-[width] duration-700 ease-out"
                      style={{ width: `${(row.score / row.max) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-ink-300">
                    {row.score}/{row.max}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1">
              {scorecard.breakdown.map((row) => (
                <p key={row.label} className="text-[11px] text-ink-400">
                  <span className="text-ink-300">{row.label}:</span> {row.detail}
                </p>
              ))}
            </div>

            {scorecard.notes.map((note) => (
              <p
                key={note}
                className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                {note}
              </p>
            ))}
          </div>
        </div>

        <CostLine cost={attempt.cost} />

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-800 pt-5">
          <button
            onClick={onAgain}
            className="rounded-xl bg-flame-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-flame-400"
          >
            {againLabel}
          </button>
          {audioUrl && (
            <audio
              controls
              src={audioUrl}
              className="h-9 min-w-0 flex-1 sm:max-w-xs"
              aria-label="Play back your take"
            />
          )}
        </div>
      </section>

      {evaluationError && onRetry && (
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-sm text-rose-200">
            Coach feedback failed: {evaluationError}
          </p>
          <button
            onClick={onRetry}
            className="mt-3 rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-500/15"
          >
            Retry grading
          </button>
        </section>
      )}

      <MetricTiles metrics={metrics} />

      <VoiceCard prosody={attempt.prosody} />

      {evaluation && evaluation.strengths.length > 0 && (
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
          <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
            What worked
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {evaluation.strengths.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evaluation?.betterOpening && (
        <section className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
          <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">
            A stronger way in
          </h3>
          <p className="mt-3 text-lg leading-relaxed text-ink-100">
            “{evaluation.betterOpening}”
          </p>
        </section>
      )}

      <TranscriptView transcript={transcript} metrics={metrics} />
    </div>
  );
}
