"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { CoachReview } from "@/components/CoachReview";
import { TrendChart } from "@/components/TrendChart";
import { buildAnalytics, buildCoachPayload, type Comparison } from "@/lib/analytics";
import { formatClock, formatUsd, scoreTone } from "@/lib/format";
import { MAX_LEVEL } from "@/lib/progression";
import { TIER_LABEL } from "@/lib/words";
import { historySource, readSettings } from "@/lib/storage";
import type { RunCost } from "@/lib/types";

const TONE_TEXT: Record<string, string> = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  orange: "text-orange-300",
  rose: "text-rose-300",
};

/** A first-versus-recent row, coloured by whether the move was the good way. */
function ComparisonRow({ row }: { row: Comparison }) {
  const moved = Math.abs(row.delta) > 0.05;
  const improved = row.better === "up" ? row.delta > 0 : row.delta < 0;
  const tone = !moved ? "text-ink-400" : improved ? "text-emerald-300" : "text-rose-300";
  const sign = row.delta > 0 ? "+" : "";

  return (
    <tr className="border-t border-ink-800">
      <td className="py-2 pr-3 text-ink-300">{row.label}</td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-500">
        {row.first}
        {row.unit}
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink-100">
        {row.last}
        {row.unit}
      </td>
      <td className={`py-2 text-right font-mono tabular-nums ${tone}`}>
        {moved ? `${sign}${row.delta}${row.unit}` : "—"}
      </td>
    </tr>
  );
}

export default function AnalyticsPage() {
  const history = useSyncExternalStore(
    historySource.subscribe,
    historySource.getSnapshot,
    historySource.getServerSnapshot,
  );

  const analytics = useMemo(() => buildAnalytics(history), [history]);

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [analysisCost, setAnalysisCost] = useState<RunCost["evaluation"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCoach = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: readSettings().model,
          payload: buildCoachPayload(history),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
        return;
      }
      setAnalysis(body.analysis as string);
      setAnalysisModel(body.model as string);
      setAnalysisCost((body.cost as RunCost["evaluation"]) ?? null);
    } catch (err) {
      setError(`Coach request failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [history]);

  const { reps, totals, comparisons, byTier, fillerCounts, crutchCounts, best, cleanest } =
    analytics;
  const label = (index: number) => `rep ${index + 1}`;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">
            Your reps<span className="text-flame-400">.</span>
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {totals.reps === 0
              ? "Nothing recorded yet."
              : `${totals.reps} rep${totals.reps === 1 ? "" : "s"} · ${formatClock(totals.speakingSecs)} of talking · ${totals.words.toLocaleString()} words spoken`}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl border border-ink-700 px-4 py-2 text-xs text-ink-300 transition hover:border-flame-500/50 hover:text-flame-200"
        >
          Back to the drill
        </Link>
      </header>

      {totals.reps === 0 ? (
        <section className="rounded-2xl border border-dashed border-ink-800 p-10 text-center">
          <p className="text-sm text-ink-400">
            Do a few reps and this fills up with how you are actually changing.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-xl bg-flame-500 px-6 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-flame-400"
          >
            Get a word
          </Link>
        </section>
      ) : (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "reps", value: String(totals.reps), tone: "" },
              {
                label: "average",
                value: String(totals.avgScore),
                tone: TONE_TEXT[scoreTone(totals.avgScore)],
              },
              {
                label: "best",
                value: String(totals.bestScore),
                tone: TONE_TEXT[scoreTone(totals.bestScore)],
              },
              { label: "level", value: `${totals.level}/${MAX_LEVEL}`, tone: "text-flame-300" },
              { label: "spent", value: totals.costUsd > 0 ? formatUsd(totals.costUsd) : "—", tone: "" },
            ].map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-3 text-center"
              >
                <div className={`font-mono text-2xl tabular-nums ${tile.tone || "text-ink-100"}`}>
                  {tile.value}
                </div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400">
                  {tile.label}
                </div>
              </div>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <TrendChart
              title="Score"
              hint="higher is better"
              better="up"
              points={reps.map((rep, index) => ({ label: `${label(index)} · ${rep.word}`, value: rep.score }))}
            />
            <TrendChart
              title="Fillers per minute"
              hint="lower is better"
              better="down"
              decimals={1}
              points={reps.map((rep, index) => ({
                label: `${label(index)} · ${rep.word}`,
                value: rep.fillersPerMinute,
              }))}
            />
            <TrendChart
              title="Pace"
              hint="120–175 is the band"
              better="up"
              suffix=" wpm"
              band={[120, 175]}
              points={reps.map((rep, index) => ({ label: `${label(index)} · ${rep.word}`, value: rep.wpm }))}
            />
            <TrendChart
              title="Silence"
              hint="lower is better"
              better="down"
              suffix="%"
              points={reps.map((rep, index) => ({
                label: `${label(index)} · ${rep.word}`,
                value: rep.silencePct,
              }))}
            />
            <TrendChart
              title="Longest clean run"
              hint="no stalls, higher is better"
              better="up"
              suffix="s"
              points={reps.map((rep, index) => ({
                label: `${label(index)} · ${rep.word}`,
                value: rep.cleanRunSecs,
              }))}
            />
            <TrendChart
              title="Word difficulty faced"
              hint="tier 1–5, higher is harder"
              better="up"
              points={reps.map((rep, index) => ({
                label: `${label(index)} · ${rep.word} (${TIER_LABEL[rep.tier]})`,
                value: rep.tier,
              }))}
            />
            <TrendChart
              title="Vocal variety"
              hint="read on your device, higher is better"
              better="up"
              points={reps.flatMap((rep, index) =>
                rep.varietyScore === null
                  ? []
                  : [{ label: `${label(index)} · ${rep.word}`, value: rep.varietyScore }],
              )}
            />
            <TrendChart
              title="Pitch movement"
              hint="2.5–4 semitones is the band"
              better="up"
              suffix=" st"
              decimals={1}
              band={[2.5, 4]}
              points={reps.flatMap((rep, index) =>
                rep.pitchSdSt === null
                  ? []
                  : [{ label: `${label(index)} · ${rep.word}`, value: rep.pitchSdSt }],
              )}
            />
          </section>

          {comparisons && (
            <section className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">
                First {analytics.comparisonWindow} reps vs last {analytics.comparisonWindow}
              </h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="pb-1 text-left font-normal">Metric</th>
                    <th className="pb-1 text-right font-normal">Then</th>
                    <th className="pb-1 text-right font-normal">Now</th>
                    <th className="pb-1 text-right font-normal">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((row) => (
                    <ComparisonRow key={row.label} row={row} />
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                Read this next to the difficulty chart. A flat score against rising word tiers is
                real improvement; a rising score on easy words is not.
              </p>
            </section>
          )}

          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">
                How you score by word difficulty
              </h2>
              <ul className="mt-3 space-y-2">
                {byTier.map((row) => (
                  <li key={row.tier} className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 text-xs text-ink-400">
                      tier {row.tier}
                      <span className="block text-[10px] text-ink-600">{TIER_LABEL[row.tier]}</span>
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className="h-full rounded-full bg-flame-400/80"
                        style={{ width: `${row.avgScore}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-ink-300">
                      {row.avgScore}
                      <span className="text-ink-600"> ×{row.reps}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">
                What you lean on
              </h2>
              {fillerCounts.length === 0 && crutchCounts.length === 0 ? (
                <p className="mt-3 text-sm text-ink-400">
                  No fillers or crutches recorded yet. That is rare — keep it.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {fillerCounts.map((item) => (
                    <span
                      key={`f-${item.text}`}
                      className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs text-rose-200 ring-1 ring-rose-500/30"
                    >
                      {item.text} <span className="font-mono text-rose-300/70">×{item.count}</span>
                    </span>
                  ))}
                  {crutchCounts.map((item) => (
                    <span
                      key={`c-${item.text}`}
                      className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 ring-1 ring-amber-500/25"
                    >
                      {item.text} <span className="font-mono text-amber-300/70">×{item.count}</span>
                    </span>
                  ))}
                </div>
              )}

              {best && cleanest && (
                <dl className="mt-5 space-y-1.5 border-t border-ink-800 pt-4 text-xs text-ink-400">
                  <div className="flex justify-between gap-3">
                    <dt>Best rep</dt>
                    <dd className="text-ink-200">
                      {best.word} · {best.score}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Cleanest rep</dt>
                    <dd className="text-ink-200">
                      {cleanest.word} · {cleanest.fillersPerMinute}/min
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </section>

          <CoachReview
            analysis={analysis}
            model={analysisModel}
            cost={analysisCost}
            loading={loading}
            error={error}
            disabled={totals.reps < 2}
            disabledReason="Do at least two reps first — there is nothing to compare yet."
            onRun={() => void runCoach()}
          />
        </div>
      )}
    </main>
  );
}
