"use client";
import { useMemo, useRef, useState } from "react";
import { fmt, full } from "@/lib/format";

/**
 * Chart tái sử dụng (light theme, không lib ngoài).
 * SVG chỉ vẽ line/area/grid/dot/crosshair (stretch để lấp đầy khung); MỌI CHỮ
 * (nhãn trục, tooltip) là HTML overlay tuyệt đối → luôn sắc nét, không bị méo khi
 * SVG giãn ngang (khắc phục lỗi "phóng to & mờ" của preserveAspectRatio=none).
 *
 * Toolkit: hover tooltip theo điểm-X (liệt kê mọi series) + crosshair dọc + dot,
 * toggle line/bar, legend bật/tắt series. Text dùng token ink; màu chỉ ở mark.
 */
export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

// Toạ độ SVG chuẩn hoá 0..100 (cả hai trục) — SVG stretch, nên số này chỉ là tỉ lệ.
const VW = 100;
const VH = 100;
const PADX = { l: 0, r: 0 }; // padding ngang tính bằng %, chừa cho nhãn ở HTML
const PADY = { t: 6, b: 8 }; // % chừa trên/dưới trong SVG

export function LineChart({
  labels,
  series,
  height = 300,
  allowBar = true,
  defaultMode = "line",
  ariaLabel = "Biểu đồ",
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  allowBar?: boolean;
  defaultMode?: "line" | "bar";
  ariaLabel?: string;
}) {
  const [mode, setMode] = useState<"line" | "bar">(defaultMode);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverX, setHoverX] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const shown = series.filter((s) => !hidden.has(s.key));
  const n = labels.length;

  const yMax = useMemo(() => {
    let mx = 0;
    for (const s of shown) for (const v of s.values) if (v > mx) mx = v;
    return mx || 1;
  }, [shown]);

  // vị trí theo % (0..100) trong vùng vẽ — dùng chung cho SVG và overlay HTML.
  const xPct = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v: number) => PADY.t + (1 - v / yMax) * (100 - PADY.t - PADY.b);

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xPct(i) - px);
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

  const barGroupW = n > 0 ? 100 / n : 100;
  const barW = shown.length > 0 ? Math.max(1.5, (barGroupW * 0.6) / shown.length) : 1.5;

  const tipLeftPct = hoverX != null ? xPct(hoverX) : 0;
  const tipOnRight = tipLeftPct > 58;

  // nhãn X: thưa nếu nhiều
  const xLabelIdx = labels.map((_, i) => i).filter((i) => {
    const step = Math.ceil(n / 8);
    return n <= 8 || i % step === 0 || i === n - 1;
  });

  return (
    <div className="w-full">
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

      {/* legend */}
      {series.length > 1 && (
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
      )}

      {/* Khu vẽ: nhãn Y (HTML, trái) + plot (SVG stretch + overlay HTML) */}
      <div className="flex">
        {/* Y labels — HTML, sắc nét */}
        <div className="relative flex-shrink-0 w-[44px]" style={{ height }}>
          {gridSteps.map((t, i) => (
            <div
              key={i}
              className="absolute right-2 text-[10px] font-semibold text-faint tnum -translate-y-1/2"
              style={{ top: `${(yPct(yMax * t) / 100) * height}px` }}
            >
              {fmt(yMax * t)}
            </div>
          ))}
        </div>

        {/* Plot */}
        <div
          ref={wrapRef}
          className="relative flex-1 min-w-0"
          style={{ height }}
          onPointerMove={onMove}
          onPointerLeave={() => setHoverX(null)}
        >
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            role="img"
            aria-label={ariaLabel}
          >
            {/* gridlines */}
            {gridSteps.map((t, i) => (
              <line
                key={i}
                x1={0}
                y1={yPct(yMax * t)}
                x2={100}
                y2={yPct(yMax * t)}
                stroke="#EFEAE0"
                strokeWidth={0.4}
                strokeDasharray={i === 0 ? "0" : "1 1.4"}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {mode === "line"
              ? shown.map((s) => {
                  const pts = s.values.map((v, i) => `${xPct(i).toFixed(2)},${yPct(v).toFixed(2)}`).join(" ");
                  const area = `${xPct(0).toFixed(2)},${yPct(0)} ${pts} ${xPct(n - 1).toFixed(2)},${yPct(0)}`;
                  return (
                    <g key={s.key}>
                      {shown.length === 1 && <polygon points={area} fill={s.color} opacity={0.1} />}
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
                      const bx = xPct(i) - (shown.length * barW) / 2 + si * barW;
                      const by = yPct(s.values[i]);
                      const bh = Math.max(0, yPct(0) - by);
                      return (
                        <rect
                          key={s.key}
                          x={bx}
                          y={by}
                          width={barW * 0.86}
                          height={bh}
                          fill={s.color}
                          opacity={hoverX === null || hoverX === i ? 1 : 0.45}
                        />
                      );
                    })}
                  </g>
                ))}

            {/* crosshair (line mode) */}
            {hoverX != null && mode === "line" && (
              <line
                x1={xPct(hoverX)}
                y1={PADY.t}
                x2={xPct(hoverX)}
                y2={yPct(0)}
                stroke="#B9C2BC"
                strokeWidth={1}
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* dots — HTML tròn đều (không méo theo SVG stretch) */}
          {hoverX != null &&
            mode === "line" &&
            shown.map((s) => (
              <span
                key={s.key}
                className="absolute w-[9px] h-[9px] rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${xPct(hoverX)}%`,
                  top: `${(yPct(s.values[hoverX]) / 100) * height}px`,
                  background: s.color,
                }}
              />
            ))}

          {/* X labels — HTML */}
          {xLabelIdx.map((i) => (
            <div
              key={i}
              className="absolute bottom-0 text-[10px] font-semibold text-faint -translate-x-1/2"
              style={{ left: `${xPct(i)}%` }}
            >
              {i === 0 ? "now" : labels[i]}
            </div>
          ))}

          {/* tooltip */}
          {hoverX != null && shown.length > 0 && (
            <div
              className="absolute top-2 z-20 pointer-events-none rounded-[12px] border border-card-border bg-white p-3"
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
    </div>
  );
}
