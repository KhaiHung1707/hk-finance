"use client";
import { useRef, useState } from "react";
import { fmt, full } from "@/lib/format";
import type { ForecastSnapshot } from "@/lib/queries/forecast";

/**
 * Biểu đồ Net-worth projection — DÙNG CHUNG cho Forecast và Dashboard.
 * Chiều cao co giãn theo bề rộng qua ASPECT-RATIO (không cố định px/clamp).
 * SVG chỉ vẽ line/area/grid/marker (stretch theo khung); MỌI CHỮ (nhãn trục, "Mục
 * tiêu", "thu về", tooltip) là HTML overlay → luôn sắc nét, cỡ chữ cố định, không
 * méo khi màn to/nhỏ. Mọi số đến từ props, không hardcode.
 */
export function NetWorthChart({
  nwSeries,
  monthKeys,
  horizon,
  goalTarget = 0,
  goalReachedAt = null,
  receivablesFirstMonth = 0,
  receivablesLandFirstMonth = false,
  snapshots = [],
  showActual = true,
  // tỉ lệ khung (rộng:cao). Chart cao theo bề rộng thật → responsive, không méo.
  aspect = 2.6,
  minHeight = 170,
  maxHeight = 300,
}: {
  nwSeries: number[];
  monthKeys: string[];
  horizon: number;
  goalTarget?: number;
  goalReachedAt?: string | null;
  receivablesFirstMonth?: number;
  receivablesLandFirstMonth?: boolean;
  snapshots?: ForecastSnapshot[];
  showActual?: boolean;
  aspect?: number;
  minHeight?: number;
  maxHeight?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const W = 620;
  const H = 200;

  const snapInRange = snapshots.filter((s) => monthKeys.includes(s.month_key));
  const yVals = [
    ...nwSeries,
    ...(goalTarget > 0 ? [goalTarget] : []),
    ...(showActual ? snapInRange.map((s) => s.total) : []),
  ];
  const min = Math.min(...yVals);
  const max = Math.max(...yVals) || min + 1;
  const X = (i: number) => 46 + (horizon > 0 ? (i / horizon) * (W - 54) : 0);
  const Y = (v: number) => H - 10 - ((v - min) / (max - min || 1)) * (H - 26);
  // % dùng cho overlay HTML (khớp SVG stretch).
  const xP = (i: number) => (X(i) / W) * 100;
  const yP = (v: number) => (Y(v) / H) * 100;
  const line = nwSeries.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `46,${H - 10} ${line} ${W},${H - 10}`;
  const tickIdx = [...new Set([0, Math.round(horizon / 3), Math.round((2 * horizon) / 3), horizon])];
  const gridSteps = [0, 1 / 3, 2 / 3, 1];

  const showReceivables = receivablesLandFirstMonth && receivablesFirstMonth > 0 && horizon >= 1;
  const snapPoints = showActual
    ? snapInRange.map((s) => {
        const idx = monthKeys.indexOf(s.month_key);
        const base = nwSeries[idx];
        const deviation = base > 0 ? Math.abs(s.total - base) / base : 0;
        return { idx, total: s.total, deviates: deviation > 0.1, monthKey: s.month_key };
      })
    : [];
  const goalIdx = goalReachedAt ? monthKeys.indexOf(goalReachedAt) : -1;

  const hoverLeftPct = hover != null ? xP(hover) : 0;
  const tipOnRight = hoverLeftPct > 58;

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      style={{ aspectRatio: `${aspect}`, minHeight, maxHeight }}
      onPointerMove={(e) => {
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vx = ((e.clientX - rect.left) / rect.width) * W;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i <= horizon; i++) {
          const d = Math.abs(X(i) - vx);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        setHover(best);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <defs>
          <filter id="nwglow" x="-4%" y="-20%" width="108%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#17554A" floodOpacity="0.25" />
          </filter>
        </defs>
        {gridSteps.map((t, i) => {
          const v = min + (max - min) * t;
          return (
            <line key={i} x1={46} y1={Y(v)} x2={W} y2={Y(v)} stroke="#EFEAE0" strokeWidth={1} strokeDasharray={i === 0 ? "0" : "3 4"} vectorEffect="non-scaling-stroke" />
          );
        })}
        <polygon points={area} fill="#EAF4EE" />

        {/* Đường mục tiêu nhà */}
        {goalTarget > 0 && goalTarget >= min && goalTarget <= max && (
          <line x1={46} y1={Y(goalTarget)} x2={W} y2={Y(goalTarget)} stroke="#A5731F" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        )}

        <polyline points={line} fill="none" stroke="#17554A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" filter="url(#nwglow)" />

        {/* Receivables marker */}
        {showReceivables && <circle cx={X(1)} cy={Y(nwSeries[1])} r={4.5} fill="#E8C97A" stroke="#FFFFFF" strokeWidth={2} />}

        {/* Snapshot overlay */}
        {snapPoints.map((p) => (
          <circle key={`snap${p.idx}`} cx={X(p.idx)} cy={Y(p.total)} r={p.deviates ? 5 : 3.5} fill={p.deviates ? "#B4573B" : "#8FBCA7"} stroke="#FFFFFF" strokeWidth={2}>
            <title>{`${p.monthKey} · thực tế ${full(p.total)}${p.deviates ? " (lệch >10% so với dự phóng)" : ""}`}</title>
          </circle>
        ))}

        {/* Goal reached marker */}
        {goalIdx >= 0 && goalIdx <= horizon && (
          <circle cx={X(goalIdx)} cy={Y(nwSeries[goalIdx])} r={4} fill="#1F7A5C" stroke="#FFFFFF" strokeWidth={2}>
            <title>{`Đạt mục tiêu tại ${goalReachedAt}`}</title>
          </circle>
        )}

        {tickIdx.map((i) => (
          <circle key={i} cx={X(i)} cy={Y(nwSeries[i])} r={3} fill="#17554A" stroke="#FFFFFF" strokeWidth={2} />
        ))}

        {hover != null && (
          <line x1={X(hover)} y1={10} x2={X(hover)} y2={H - 10} stroke="#B9C2BC" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* ---- CHỮ HTML overlay (sắc nét, cỡ cố định, không méo) ---- */}
      {/* nhãn Y */}
      {gridSteps.map((t, i) => {
        const v = min + (max - min) * t;
        return (
          <div key={`y${i}`} className="absolute left-0 text-[10px] font-semibold text-faint tnum -translate-y-1/2 pointer-events-none" style={{ top: `${yP(v)}%` }}>
            {fmt(v)}
          </div>
        );
      })}
      {/* nhãn X */}
      {tickIdx.map((i) => (
        <div key={`x${i}`} className="absolute bottom-0 text-[10px] font-semibold text-faint -translate-x-1/2 pointer-events-none" style={{ left: `${xP(i)}%` }}>
          {i === 0 ? "now" : monthKeys[i]}
        </div>
      ))}
      {/* nhãn "Mục tiêu" */}
      {goalTarget > 0 && goalTarget >= min && goalTarget <= max && (
        <div className="absolute right-1 text-[10px] font-bold text-[#A5731F] -translate-y-[130%] pointer-events-none" style={{ top: `${yP(goalTarget)}%` }}>
          Mục tiêu
        </div>
      )}
      {/* nhãn receivables */}
      {showReceivables && (
        <div className="absolute text-[10px] font-bold text-[#A5731F] -translate-x-1/2 -translate-y-[170%] whitespace-nowrap pointer-events-none" style={{ left: `${xP(1)}%`, top: `${yP(nwSeries[1])}%` }}>
          +{fmt(receivablesFirstMonth)} thu về
        </div>
      )}

      {/* dot + tooltip HTML */}
      {hover != null && (
        <>
          <span
            className="absolute w-[10px] h-[10px] rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none bg-primary"
            style={{ left: `${hoverLeftPct}%`, top: `${yP(nwSeries[hover])}%` }}
          />
          <div
            className="absolute top-2 z-20 pointer-events-none rounded-[12px] border border-card-border bg-white p-3"
            style={{
              left: tipOnRight ? undefined : `calc(${hoverLeftPct}% + 12px)`,
              right: tipOnRight ? `calc(${100 - hoverLeftPct}% + 12px)` : undefined,
              minWidth: 150,
              maxWidth: "min(240px, 70%)",
              boxShadow: "0 12px 32px rgba(14,44,38,0.16)",
            }}
          >
            <div className="text-[12px] font-bold text-muted mb-1">{hover === 0 ? "now" : monthKeys[hover]}</div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="w-[12px] h-[3px] rounded-full bg-primary flex-shrink-0" />
              <span className="text-ink-soft">Net worth</span>
              <span className="ml-auto font-extrabold text-ink tnum" title={full(nwSeries[hover])}>
                {fmt(nwSeries[hover])}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
