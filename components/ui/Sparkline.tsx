"use client";
/**
 * Sparkline tí hon (không trục, không tooltip) — cho KPI strip.
 * SVG stretch preserveAspectRatio=none; chỉ vẽ line + optional baseline.
 * Mọi số từ props. Màu ở prop `color`; vùng dưới line tô nhạt cùng màu.
 */
export function Sparkline({
  values,
  color = "#17554A",
  height = 40,
  baseline,
  className,
}: {
  values: number[];
  color?: string;
  height?: number;
  baseline?: number; // vẽ đường ngang tham chiếu (VD ngưỡng savings-rate)
  className?: string;
}) {
  const n = values.length;
  if (n === 0) return <div style={{ height }} className={className} />;

  const min = Math.min(...values, ...(baseline != null ? [baseline] : []));
  const max = Math.max(...values, ...(baseline != null ? [baseline] : [])) || min + 1;
  const span = max - min || 1;
  const X = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const Y = (v: number) => 4 + (1 - (v - min) / span) * 92;

  const line = values.map((v, i) => `${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(" ");
  const area = `${X(0).toFixed(2)},100 ${line} ${X(n - 1).toFixed(2)},100`;

  return (
    <div style={{ height }} className={`w-full ${className ?? ""}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full" aria-hidden>
        {baseline != null && (
          <line x1={0} y1={Y(baseline)} x2={100} y2={Y(baseline)} stroke="#C9C0AC" strokeWidth={0.6} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        )}
        {n > 1 && <polygon points={area} fill={color} opacity={0.1} />}
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {n > 0 && <circle cx={X(n - 1)} cy={Y(values[n - 1])} r={2.4} fill={color} />}
      </svg>
    </div>
  );
}
