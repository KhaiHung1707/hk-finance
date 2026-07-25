"use client";
import { useRef, useState } from "react";
import { fmt, full, pct } from "@/lib/format";
import type { ChartSeries } from "@/components/ui/LineChart";

/**
 * Stacked area chart (dùng chung cho Source-contribution & Allocation-drift).
 * SVG stretch (preserveAspectRatio=none) vẽ các lớp area chồng; MỌI CHỮ là HTML
 * overlay → sắc nét, không méo. Hover theo cột-X: crosshair + tooltip liệt kê từng
 * series (giá trị + % của tổng cột). Mọi số từ props, không hardcode.
 *
 * mode="value": trục Y = tổng cộng dồn tuyệt đối.
 * mode="share": mỗi cột chuẩn hoá về 100% (xem dịch chuyển tỉ trọng).
 */
export function StackedAreaChart({
  labels,
  series,
  height = 260,
  mode = "value",
  ariaLabel = "Biểu đồ vùng chồng",
}: {
  labels: string[];
  series: ChartSeries[]; // values[] mỗi series đã căn theo labels (zero-fill sẵn)
  height?: number;
  mode?: "value" | "share";
  ariaLabel?: string;
}) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const shown = series.filter((s) => !hidden.has(s.key));
  const n = labels.length;

  // tổng mỗi cột (trên các series đang hiện)
  const colTotal = labels.map((_, i) => shown.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const yMaxAbs = Math.max(1, ...colTotal);

  const PADY = { t: 6, b: 8 };
  const xPct = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  // giá trị cộng dồn tại cột i (0..cum) → % chiều cao
  const yPct = (cum: number, total: number) => {
    const denom = mode === "share" ? total || 1 : yMaxAbs;
    return PADY.t + (1 - cum / denom) * (100 - PADY.t - PADY.b);
  };

  // dựng polygon cho từng lớp: đi tới theo mép trên (cumTop), quay về theo mép dưới (cumBottom)
  const layers = shown.map((s, si) => {
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = 0; i < n; i++) {
      const below = shown.slice(0, si).reduce((a, ss) => a + (ss.values[i] ?? 0), 0);
      const cumTop = below + (s.values[i] ?? 0);
      top.push(`${xPct(i).toFixed(2)},${yPct(cumTop, colTotal[i]).toFixed(2)}`);
      bottom.push(`${xPct(i).toFixed(2)},${yPct(below, colTotal[i]).toFixed(2)}`);
    }
    return { key: s.key, color: s.color, points: [...top, ...bottom.reverse()].join(" ") };
  });

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const xLabelIdx = labels.map((_, i) => i).filter((i) => {
    const step = Math.ceil(n / 8);
    return n <= 8 || i % step === 0 || i === n - 1;
  });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xPct(i) - px);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHoverX(best);
  }
  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const tipLeftPct = hoverX != null ? xPct(hoverX) : 0;
  const tipOnRight = tipLeftPct > 58;

  return (
    <div className="w-full">
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
                <span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: s.color }} />
                <span className={`font-semibold ${off ? "line-through text-muted" : "text-ink-soft"}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex">
        {/* Y labels */}
        <div className="relative flex-shrink-0 w-[44px]" style={{ height }}>
          {gridSteps.map((t, i) => (
            <div key={i} className="absolute right-2 text-[10px] font-semibold text-faint tnum -translate-y-1/2" style={{ top: `${(yPct(yMaxAbs * t, yMaxAbs) / 100) * height}px` }}>
              {mode === "share" ? `${Math.round(t * 100)}%` : fmt(yMaxAbs * t)}
            </div>
          ))}
        </div>

        {/* Plot */}
        <div ref={wrapRef} className="relative flex-1 min-w-0" style={{ height }} onPointerMove={onMove} onPointerLeave={() => setHoverX(null)}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="img" aria-label={ariaLabel}>
            {gridSteps.map((t, i) => (
              <line key={i} x1={0} y1={yPct(yMaxAbs * t, yMaxAbs)} x2={100} y2={yPct(yMaxAbs * t, yMaxAbs)} stroke="#EFEAE0" strokeWidth={0.4} strokeDasharray={i === 0 ? "0" : "1 1.4"} vectorEffect="non-scaling-stroke" />
            ))}
            {layers.map((l) => (
              <polygon key={l.key} points={l.points} fill={l.color} opacity={0.85} />
            ))}
            {hoverX != null && (
              <line x1={xPct(hoverX)} y1={PADY.t} x2={xPct(hoverX)} y2={100 - PADY.b} stroke="#5B6763" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {/* X labels */}
          {xLabelIdx.map((i) => (
            <div key={i} className="absolute bottom-0 text-[10px] font-semibold text-faint -translate-x-1/2" style={{ left: `${xPct(i)}%` }}>
              {labels[i]}
            </div>
          ))}

          {/* tooltip */}
          {hoverX != null && shown.length > 0 && (
            <div
              className="absolute top-2 z-20 pointer-events-none rounded-[12px] border border-card-border bg-white p-3"
              style={{
                left: tipOnRight ? undefined : `calc(${tipLeftPct}% + 12px)`,
                right: tipOnRight ? `calc(${100 - tipLeftPct}% + 12px)` : undefined,
                minWidth: 170, maxWidth: "min(260px, 74%)",
                boxShadow: "0 12px 32px rgba(14,44,38,0.16)",
              }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-[12px] font-bold text-muted">{labels[hoverX]}</span>
                <span className="text-[11px] font-semibold text-faint tnum">{full(colTotal[hoverX])}</span>
              </div>
              <div className="flex flex-col gap-[6px]">
                {[...shown].reverse().map((s) => {
                  const v = s.values[hoverX] ?? 0;
                  const share = colTotal[hoverX] > 0 ? v / colTotal[hoverX] : 0;
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-[12px]">
                      <span className="w-[11px] h-[11px] rounded-[3px] flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-ink-soft">{s.label}</span>
                      <span className="ml-auto font-extrabold text-ink tnum" title={full(v)}>
                        {mode === "share" ? pct(share, 0) : fmt(v)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
