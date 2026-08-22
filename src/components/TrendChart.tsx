"use client";

/** A small dependency-free line chart for one metric across the reps. */
export function TrendChart({
  title,
  hint,
  points,
  better,
  band,
  decimals = 0,
  suffix = "",
}: {
  title: string;
  hint?: string;
  points: { label: string; value: number }[];
  /** Which direction is an improvement — sets the line colour against the trend. */
  better: "up" | "down";
  /** Optional healthy range, shaded behind the line. */
  band?: [number, number];
  decimals?: number;
  suffix?: string;
}) {
  const width = 300;
  const height = 96;
  const padY = 8;

  if (points.length === 0) return null;

  const values = points.map((point) => point.value);
  const lowest = Math.min(...values, band ? band[0] : Infinity);
  const highest = Math.max(...values, band ? band[1] : -Infinity);
  const span = highest - lowest || 1;

  const x = (index: number) =>
    points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
  const y = (value: number) =>
    height - padY - ((value - lowest) / span) * (height - padY * 2);

  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
  const area = `0,${height} ${line.join(" ")} ${width},${height}`;

  // Compare the first and last thirds so a single outlier does not set the tone.
  const chunk = Math.max(1, Math.round(points.length / 3));
  const avg = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const drift = avg(values.slice(-chunk)) - avg(values.slice(0, chunk));
  const improving = better === "up" ? drift > 0 : drift < 0;
  const flat = Math.abs(drift) < span * 0.06 || points.length < 4;

  const stroke = flat ? "#fbbf24" : improving ? "#34d399" : "#fb7185";
  const latest = values.at(-1) ?? 0;

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs uppercase tracking-[0.16em] text-ink-400">{title}</h3>
        <span className="font-mono text-lg tabular-nums" style={{ color: stroke }}>
          {latest.toFixed(decimals)}
          {suffix}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-24 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: ${points.map((p) => p.value.toFixed(decimals)).join(", ")}`}
      >
        {band && (
          <rect
            x="0"
            y={y(band[1])}
            width={width}
            height={Math.max(1, y(band[0]) - y(band[1]))}
            fill="rgba(52, 211, 153, 0.07)"
          />
        )}
        <polygon points={area} fill={stroke} opacity="0.08" />
        <polyline
          points={line.join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((point, index) => (
          <circle
            key={point.label + index}
            cx={x(index)}
            cy={y(point.value)}
            r={index === points.length - 1 ? 3 : 1.8}
            fill={stroke}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${point.label}: ${point.value.toFixed(decimals)}${suffix}`}</title>
          </circle>
        ))}
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-600">
        <span>rep 1</span>
        <span>{hint}</span>
        <span>rep {points.length}</span>
      </div>
    </div>
  );
}
