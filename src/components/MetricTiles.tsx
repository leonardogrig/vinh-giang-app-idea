"use client";

import type { Metrics } from "@/lib/types";

type Tone = "good" | "ok" | "bad";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-emerald-300",
  ok: "text-amber-300",
  bad: "text-rose-300",
};

const band = (good: boolean, ok: boolean): Tone => (good ? "good" : ok ? "ok" : "bad");

function tiles(metrics: Metrics) {
  const hesitations = metrics.pauses.filter((pause) => pause.severity !== "beat").length;

  return [
    {
      label: "Fillers",
      value: String(metrics.fillers.length),
      hint: `${metrics.fillersPerMinute}/min`,
      tone: band(metrics.fillersPerMinute < 2, metrics.fillersPerMinute < 5),
    },
    {
      label: "Pace",
      value: `${metrics.wpm}`,
      hint: `wpm · ${metrics.articulationWpm} speaking`,
      tone: band(metrics.wpm >= 120 && metrics.wpm <= 175, metrics.wpm >= 100 && metrics.wpm <= 195),
    },
    {
      label: "Silence",
      value: `${Math.round(metrics.silenceRatio * 100)}%`,
      hint: `${hesitations} hesitation${hesitations === 1 ? "" : "s"}`,
      tone: band(metrics.silenceRatio < 0.2, metrics.silenceRatio < 0.32),
    },
    {
      label: "Longest pause",
      value: `${metrics.longestPauseSecs.toFixed(1)}s`,
      hint: "worst freeze",
      tone: band(metrics.longestPauseSecs < 1.2, metrics.longestPauseSecs < 2.5),
    },
    {
      label: "Clean run",
      value: `${metrics.longestFluentRunSecs.toFixed(0)}s`,
      hint: "no stalls",
      tone: band(metrics.longestFluentRunSecs >= 15, metrics.longestFluentRunSecs >= 8),
    },
    {
      label: "Off the mark",
      value: `${metrics.timeToFirstWordSecs.toFixed(1)}s`,
      hint: "to first word",
      tone: band(metrics.timeToFirstWordSecs < 1.5, metrics.timeToFirstWordSecs < 3),
    },
    {
      label: "Crutches",
      value: String(metrics.crutches.length),
      hint: metrics.crutches.length
        ? [...new Set(metrics.crutches.map((c) => c.text.toLowerCase()))].slice(0, 2).join(", ")
        : "none",
      tone: band(metrics.crutches.length <= 2, metrics.crutches.length <= 6),
    },
    {
      label: "Words",
      value: String(metrics.wordCount),
      hint: `${Math.round(metrics.vocabularyDiversity * 100)}% unique`,
      tone: "good" as Tone,
    },
  ];
}

export function MetricTiles({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles(metrics).map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-3"
        >
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{tile.label}</div>
          <div className={`mt-1 font-mono text-2xl tabular-nums ${TONE_CLASS[tile.tone]}`}>
            {tile.value}
          </div>
          <div className="truncate text-[11px] text-ink-400" title={tile.hint}>
            {tile.hint}
          </div>
        </div>
      ))}
    </div>
  );
}
