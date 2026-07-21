"use client";
import { useMemo, useRef, useState } from "react";
import { fmt, full } from "@/lib/format";

/**
 * Chart tái sử dụng (SVG thuần, không lib ngoài, light theme).
 * Toolkit: hover tooltip theo điểm-X (liệt kê mọi series) + crosshair dọc + dot,
 * toggle line/bar, legend bật/tắt series. Text dùng token ink; màu chỉ ở mark.
 *
 * Dữ liệu: labels (trục X) + series[{ key, label, color, values[] }] cùng độ dài labels.
 */
export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

const PAD = { l: 8, r: 14, t: 14, b: 26 };
const VW = 720; // viewBox width
const VH = 260; // viewBox height

export function LineChart({
  labels,
  series,
  height = 300,
  allowBar = true,
  defaultMode = "line",
  yFormat = fmt,
  ariaLabel = "Biểu đồ",
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  allowBar?: boolean;
  defaultMode?: "line" | "bar";
  yFormat?: (v: number) => string;
  ariaLabel?: string;
}) {
  const [mode, setMode] = useState<"line" | "bar">(defaultMode);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverX, setHoverX] = useState<number | null>(null); // index tháng đang hover
  const svgRef = useRef<SVGSVGElement | null>(null);

  const shown = series.filter((s) => !hidden.has(s.key));
  const n = labels.length;

  // trục Y bao trùm mọi series đang hiển thị (bar: cộng dồn không cần — đây là grouped/overlay line)
  const { yMin, yMax } = useMemo(() => {
    let mx = 0;
    for (const s of shown) for (const v of s.values) if (v > mx) mx = v;
    return { yMin: 0, yMax: mx || 1 };
  }, [shown]);

  const plotW = VW - PAD.l - PAD.r - 40; // chừa 40 cho nhãn Y
  const x0 = PAD.l + 40;
  const X = (i: number) => (n <= 1 ? x0 + plotW / 2 : x0 + (i / (n - 1)) * plotW);
  const Y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (VH - PAD.t - PAD.b);

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VW; // toạ độ trong viewBox
    // snap tới index gần nhất
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(X(i) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHoverX(best);
  }

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // bar layout: nhóm cột theo tháng, mỗi series 1 thanh
  const groupW = n > 0 ? plotW / n : plotW;
  const barGap = 2;
  const barW = shown.length > 0 ? Math.max(3, (groupW * 0.62) / shown.length - barGap) : 3;

  // vị trí tooltip (px trong viewBox → % để đặt div overlay)
  const tipLeftPct = hoverX != null ? (X(hoverX) / VW) * 100 : 0;
  const tipOnRight = tipLeftPct > 60;

  return (
    <div className="relative w-full">
      {/* toggle line/bar */}
      {allowBar && (
        <div className="flex justify-end mb-2">
          <div className="flex items-center gap-1 rounded-full p-1 bg-fill-soft border border-card-border">
            <button
              onClick={() => setMode("line")}
              aria-label="Biểu đồ đường"
              aria-pressed={mode === "line"}
              className={`w-[30px] h-[26px] rounded-full flex items-center justify-center text-[14px] cursor-pointer ${mode === "line" ? "bg-primary text-white" : "text-muted"}`}
            >
              <i className="ph-duotone ph-chart-line" aria-hidden />
            </button>
            <button
              onClick={() => setMode("bar")}
              aria-label="Biểu đồ cột"
              aria-pressed={mode === "bar"}
              className={`w-[30px] h-[26px] rounded-full flex items-center justify-center text-[14px] cursor-pointer ${mode === "bar" ? "bg-primary text-white" : "text-muted"}`}
            >
              <i className="ph-duotone ph-chart-bar" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* legend — bật/tắt series */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {series.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className="flex items-center gap-[7px] cursor-pointer bg-transparent border-0 p-0 text-[12px]"
              style={{ opacity: off ? 0.4 : 1 }}
              aria-pressed={!off}
            >
              {mode === "bar" ? (
                <span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: s.color }} />
              ) : (
                <span className="w-[14px] h-[3px] rounded-full" style={{ background: s.color }} />
              )}
              <span className={`font-semibold ${off ? "line-through text-muted" : "text-ink-soft"}`}>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={() => setHoverX(null)}
        >
          {/* gridlines + Y labels */}
          {gridVals.map((v, i) => (
            <g key={i}>
              <line
                x1={x0}
                y1={Y(v)}
                x2={VW - PAD.r}
                y2={Y(v)}
                stroke="#EFEAE0"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "0" : "3 4"}
              />
              <text x={x0 - 6} y={Y(v) + 3} fontSize={10} fill="#9AA49E" fontWeight={600} textAnchor="end">
                {yFormat(v)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {labels.map((lb, i) => {
            const step = Math.ceil(n / 8);
            if (n > 8 && i % step !== 0 && i !== n - 1) return null;
            return (
              <text key={i} x={X(i)} y={VH - 8} fontSize={10} fill="#9AA49E" fontWeight={600} textAnchor="middle">
                {i === 0 ? "now" : lb}
              </text>
            );
          })}

          {/* marks */}
          {mode === "line"
            ? shown.map((s) => {
                const pts = s.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
                const area = `${X(0).toFixed(1)},${Y(yMin)} ${pts} ${X(n - 1).toFixed(1)},${Y(yMin)}`;
                return (
                  <g key={s.key}>
                    {shown.length === 1 && <polygon points={area} fill={s.color} opacity={0.08} />}
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })
            : labels.map((_, i) => (
                <g key={i}>
                  {shown.map((s, si) => {
                    const bx = X(i) - (shown.length * (barW + barGap)) / 2 + si * (barW + barGap);
                    const by = Y(s.values[i]);
                    const bh = Math.max(0, Y(yMin) - by);
                    return (
                      <rect
                        key={s.key}
                        x={bx}
                        y={by}
                        width={barW}
                        height={bh}
                        rx={2}
                        fill={s.color}
                        opacity={hoverX === null || hoverX === i ? 1 : 0.5}
                      />
                    );
                  })}
                </g>
              ))}

          {/* crosshair + dots (chỉ line mode; bar highlight bằng opacity) */}
          {hoverX != null && mode === "line" && (
            <>
              <line x1={X(hoverX)} y1={PAD.t} x2={X(hoverX)} y2={Y(yMin)} stroke="#B9C2BC" strokeWidth={1} strokeDasharray="4 4" />
              {shown.map((s) => (
                <circle
                  key={s.key}
                  cx={X(hoverX)}
                  cy={Y(s.values[hoverX])}
                  r={4}
                  fill={s.color}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              ))}
            </>
          )}
        </svg>

        {/* tooltip */}
        {hoverX != null && shown.length > 0 && (
          <div
            className="absolute top-2 z-20 pointer-events-none rounded-[12px] border border-card-border bg-white p-3 shadow-lg"
            style={{
              left: tipOnRight ? undefined : `calc(${tipLeftPct}% + 12px)`,
              right: tipOnRight ? `calc(${100 - tipLeftPct}% + 12px)` : undefined,
              minWidth: 168,
              boxShadow: "0 12px 32px rgba(14,44,38,0.16)",
            }}
          >
            <div className="text-[12px] font-bold text-muted mb-2">{labels[hoverX]}</div>
            <div className="flex flex-col gap-[6px]">
              {shown.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-[12px]">
                  <span className="w-[12px] h-[3px] rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-ink-soft">{s.label}</span>
                  <span className="ml-auto font-extrabold text-ink tnum" title={full(s.values[hoverX])}>
                    {fmt(s.values[hoverX])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
