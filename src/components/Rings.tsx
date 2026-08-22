"use client";

import { formatClock } from "@/lib/format";

const CIRCUMFERENCE = 2 * Math.PI * 46;

/**
 * Countdown ring. Past the target it flips into a grace period: the ring
 * refills in red over the remaining seconds so the pressure is visible rather
 * than the recording just cutting you off mid-sentence.
 */
export function TimerRing({
  elapsed,
  target,
  grace = 0,
}: {
  elapsed: number;
  target: number;
  grace?: number;
}) {
  const remaining = Math.max(0, target - elapsed);
  const overtime = elapsed >= target && grace > 0;
  const graceLeft = Math.max(0, target + grace - elapsed);
  const urgent = !overtime && remaining <= 10;

  const progress = overtime
    ? Math.min(1, 1 - graceLeft / grace)
    : Math.min(1, target > 0 ? elapsed / target : 0);

  const stroke = overtime ? "#f43f5e" : urgent ? "#fb7185" : "var(--color-flame-400)";

  return (
    <div className="relative grid h-44 w-44 place-items-center">
      <span
        className={`absolute inset-3 rounded-full animate-pulse-ring ${
          overtime ? "bg-rose-500/30" : urgent ? "bg-rose-500/20" : "bg-flame-500/15"
        }`}
        style={overtime ? { animationDuration: "0.7s" } : undefined}
      />
      <svg viewBox="0 0 100 100" className="h-44 w-44 -rotate-90">
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-ink-800)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={stroke}
          strokeWidth={overtime ? 8 : 6}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-100 ease-linear"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className={`font-mono text-4xl tabular-nums ${
            overtime ? "animate-urgent text-rose-300" : ""
          }`}
        >
          {formatClock(overtime ? graceLeft : remaining)}
        </span>
        <span
          className={`mt-1 text-xs uppercase tracking-[0.2em] ${
            overtime ? "text-rose-300" : "text-ink-400"
          }`}
        >
          {overtime ? "land it" : "left"}
        </span>
      </div>
    </div>
  );
}

const TONE_STROKE: Record<string, string> = {
  emerald: "#34d399",
  amber: "#fbbf24",
  orange: "#fb923c",
  rose: "#fb7185",
};

/** Final score ring. */
export function ScoreRing({
  score,
  grade,
  tone,
}: {
  score: number;
  grade: string;
  tone: string;
}) {
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const stroke = TONE_STROKE[tone] ?? TONE_STROKE.amber;

  return (
    <div className="relative grid h-40 w-40 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-ink-800)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-5xl font-medium tabular-nums" style={{ color: stroke }}>
          {score}
        </span>
        <span className="text-xs uppercase tracking-[0.2em] text-ink-400">grade {grade}</span>
      </div>
    </div>
  );
}
