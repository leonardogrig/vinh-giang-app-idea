"use client";

import { scoreTone } from "@/lib/format";
import type { Prosody } from "@/lib/prosody";

const TONE_HEX: Record<string, string> = {
  emerald: "#34d399",
  amber: "#fbbf24",
  orange: "#fb923c",
  rose: "#fb7185",
};

const TONE_TEXT: Record<string, string> = {
  emerald: "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10",
  amber: "text-amber-300 ring-amber-500/30 bg-amber-500/10",
  orange: "text-orange-300 ring-orange-500/30 bg-orange-500/10",
  rose: "text-rose-300 ring-rose-500/30 bg-rose-500/10",
};

type Tone = "good" | "ok" | "bad";
const STAT_TONE: Record<Tone, string> = {
  good: "text-emerald-300",
  ok: "text-amber-300",
  bad: "text-rose-300",
};
const band = (good: boolean, ok: boolean): Tone => (good ? "good" : ok ? "ok" : "bad");

/** Semitones either side of the median that the chart shows before clipping. */
const PITCH_SPAN_ST = 8;

/**
 * The melody of the take. Pitch as a line around the speaker's own median,
 * loudness as the faint shape behind it, the take split into thirds so a
 * voice that fades at the end is visible as a picture before it is a number.
 */
function Contour({ prosody, stroke }: { prosody: Prosody; stroke: string }) {
  const width = 600;
  const height = 120;
  const pad = 8;
  const mid = height / 2;
  const { pitch, energy } = prosody.contour;
  const count = Math.max(pitch.length, energy.length);
  if (count < 2) return null;

  const x = (index: number) => (index / (count - 1)) * width;
  const y = (st: number) =>
    mid - (Math.max(-PITCH_SPAN_ST, Math.min(PITCH_SPAN_ST, st)) / PITCH_SPAN_ST) * (mid - pad);

  // Break the line wherever the voice stopped, rather than bridging the gap.
  const segments: string[] = [];
  let current: string[] = [];
  pitch.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  const area = [
    `0,${height}`,
    ...energy.map((value, index) => `${x(index).toFixed(1)},${(height - value * (height - pad)).toFixed(1)}`),
    `${width},${height}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-28 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Pitch moved ${prosody.pitchSdSt} semitones around ${prosody.medianPitchHz} hertz`}
    >
      <polygon points={area} fill="var(--color-flame-400)" opacity="0.09" />
      {[1, 2].map((third) => (
        <line
          key={third}
          x1={(width * third) / 3}
          x2={(width * third) / 3}
          y1="0"
          y2={height}
          stroke="var(--color-ink-700)"
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1="0"
        x2={width}
        y1={mid}
        y2={mid}
        stroke="var(--color-ink-700)"
        strokeDasharray="1 3"
        vectorEffect="non-scaling-stroke"
      />
      {segments.map((points, index) => (
        <polyline
          key={index}
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function VoiceCard({ prosody }: { prosody: Prosody | null | undefined }) {
  // Reps recorded before the voice reading existed have nothing to show.
  if (prosody === undefined) return null;

  if (prosody === null) {
    return (
      <section className="rounded-2xl border border-dashed border-ink-800 px-5 py-4">
        <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">Voice</h3>
        <p className="mt-1 text-xs text-ink-500">
          No voice reading for this take — either too little voiced speech to measure, or this
          browser could not decode its own recording.
        </p>
      </section>
    );
  }

  const tone = scoreTone(prosody.varietyScore);
  const stroke = TONE_HEX[tone] ?? TONE_HEX.amber;
  const pacePct = prosody.paceCv === null ? null : Math.round(prosody.paceCv * 100);

  const stats = [
    {
      label: "Pitch movement",
      value: `${prosody.pitchSdSt.toFixed(1)} st`,
      hint: `range ${prosody.pitchRangeSt.toFixed(0)} st around ${prosody.medianPitchHz} Hz`,
      tone: band(prosody.pitchSdSt >= 2.5, prosody.pitchSdSt >= 1.5),
    },
    {
      label: "Loudness swing",
      value: `${prosody.loudnessSdDb.toFixed(1)} dB`,
      hint: `${prosody.loudnessRangeDb.toFixed(0)} dB quiet to loud`,
      tone: band(prosody.loudnessSdDb >= 5, prosody.loudnessSdDb >= 3),
    },
    {
      label: "Pace swing",
      value: pacePct === null ? "—" : `${pacePct}%`,
      hint:
        prosody.paceRangeWpm === null
          ? "take too short to read"
          : `${prosody.paceRangeWpm[0]}–${prosody.paceRangeWpm[1]} wpm`,
      tone: pacePct === null ? ("ok" as Tone) : band(pacePct >= 18, pacePct >= 10),
    },
    {
      label: "Flattest stretch",
      value: `${prosody.longestFlatStretchSecs.toFixed(0)}s`,
      hint: prosody.longestFlatStretchSecs === 0 ? "pitch kept moving" : "pitch barely moved",
      tone: band(prosody.longestFlatStretchSecs < 5, prosody.longestFlatStretchSecs < 10),
    },
  ];

  const thirdLabels = ["opening", "middle", "closing"];

  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-ink-400">Voice</h3>
          <p className="mt-1 text-xs text-ink-400">
            Pitch, loudness and pace, read from the raw audio on this device.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 font-mono text-xs ring-1 ${TONE_TEXT[tone]}`}>
          {prosody.varietyScore} · {prosody.label}
        </span>
      </header>

      <Contour prosody={prosody} stroke={stroke} />

      <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-ink-500">
        {prosody.thirds.map((third, index) => (
          <div key={thirdLabels[index]} className="flex flex-col gap-0.5 px-1">
            <span className="uppercase tracking-[0.14em] text-ink-600">{thirdLabels[index]}</span>
            <span className="tabular-nums">
              {third.pitchSdSt === null ? "—" : `${third.pitchSdSt.toFixed(1)} st`}
              {third.wpm !== null ? ` · ${third.wpm} wpm` : ""}
              {third.loudnessDb !== null
                ? ` · ${third.loudnessDb > 0 ? "+" : ""}${third.loudnessDb.toFixed(1)} dB`
                : ""}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-ink-800 bg-ink-950/40 px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{stat.label}</div>
            <div className={`mt-1 font-mono text-2xl tabular-nums ${STAT_TONE[stat.tone]}`}>
              {stat.value}
            </div>
            <div className="truncate text-[11px] text-ink-400" title={stat.hint}>
              {stat.hint}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
        Conversational speech moves about 2–3 semitones; under 1.5 reads as a monotone, over 3.5
        as expressive. The browser&apos;s microphone auto-gain smooths loudness a little, so the
        pitch number is the one to trust most.
      </p>
    </section>
  );
}
