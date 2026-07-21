"use client";
import { useMemo, useState } from "react";
import { fmt, full } from "@/lib/format";
import { sourceColor, chartPalette, groupColor } from "@/lib/design/tokens";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { runForecast } from "@/lib/forecast";
import { setForecastPlanValue } from "@/lib/actions/settings";
import type { ForecastParams, ForecastStart, ForecastSnapshot } from "@/lib/queries/forecast";

function srcColor(name: string, idx: number): string {
  return sourceColor[name] ?? chartPalette[idx % chartPalette.length];
}

/** Viết tắt chủ đích cho header cột hẹp (kèm tooltip = tên đầy đủ). */
const SOURCE_ABBR: Record<string, string> = {
  Structure: "Struct.",
  Upwork: "Upwork",
  Ecommerce: "E-com",
  Outsource: "Outs.",
  "Đầu tư": "Đầu tư",
  Khác: "Khác",
};
function srcAbbr(name: string): string {
  return SOURCE_ABBR[name] ?? (name.length > 7 ? name.slice(0, 6) + "." : name);
}

/** SVG mini-line cho từng nhóm tài sản. */
function Spark({ series, color }: { series: number[]; color: string }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series
    .map((v, i) => `${((i / (series.length - 1)) * 78 + 1).toFixed(1)},${(32 - ((v - min) / span) * 30).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 80 34" className="w-full h-[34px]">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function ForecastClient({
  params,
  start,
  snapshots,
}: {
  params: ForecastParams;
  start: ForecastStart;
  snapshots: ForecastSnapshot[];
}) {
  const scenarioKeys = Object.keys(params.scenarios);
  const [scenario, setScenario] = useState(scenarioKeys.includes("base") ? "base" : scenarioKeys[0]);
  const [horizon, setHorizon] = useState(
    params.horizonOptions.includes(12) ? 12 : params.horizonOptions[params.horizonOptions.length - 1]
  );

  // Optimistic overrides cho plan income/expense (chỉnh tại chỗ, recalc local ngay).
  const [planOverride, setPlanOverride] = useState<Record<string, number>>({});
  const [expenseOverride, setExpenseOverride] = useState<number | null>(null);
  const [showActual, setShowActual] = useState(true);

  // params hiệu lực = params gốc + override (chưa cần đợi network).
  const effectiveParams: ForecastParams = useMemo(() => {
    const planIncome = { ...params.planIncomeMonthly };
    for (const [k, v] of Object.entries(planOverride)) planIncome[k] = v;
    return {
      ...params,
      planIncomeMonthly: planIncome,
      planExpenseMonthly: expenseOverride ?? params.planExpenseMonthly,
    };
  }, [params, planOverride, expenseOverride]);

  const r = useMemo(
    () => runForecast(effectiveParams, start, scenario, horizon),
    [effectiveParams, start, scenario, horizon]
  );

  // ---- chart geometry (viewBox 620×200) ----
  const W = 620;
  const H = 200;
  // trục Y bao trùm cả đường headline, mục tiêu nhà, và snapshot (nếu vẽ).
  const snapInRange = snapshots.filter((s) => r.monthKeys.includes(s.month_key));
  const yVals = [
    ...r.nwSeries,
    ...(r.goalTarget > 0 ? [r.goalTarget] : []),
    ...(showActual ? snapInRange.map((s) => s.total) : []),
  ];
  const min = Math.min(...yVals);
  const max = Math.max(...yVals) || min + 1;
  const X = (i: number) => 46 + (i / horizon) * (W - 54);
  const Y = (v: number) => H - 10 - ((v - min) / (max - min || 1)) * (H - 26);
  const line = r.nwSeries.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `46,${H - 10} ${line} ${W},${H - 10}`;
  const tickIdx = [...new Set([0, Math.round(horizon / 3), Math.round((2 * horizon) / 3), horizon])];
  const maxIncome = Math.max(...r.months.map((m) => m.income), 1);

  // receivables landing tháng 1 (index 1 trong series)
  const showReceivables = params.receivablesLandFirstMonth && start.receivablesFirstMonth > 0 && horizon >= 1;

  // snapshot points + deviation (|actual − base| / base > 10%)
  const snapPoints = showActual
    ? snapInRange.map((s) => {
        const idx = r.monthKeys.indexOf(s.month_key);
        const base = r.nwSeries[idx];
        const deviation = base > 0 ? Math.abs(s.total - base) / base : 0;
        return { idx, total: s.total, deviates: deviation > 0.1, monthKey: s.month_key };
      })
    : [];

  // goal reached marker index
  const goalIdx = r.goalReachedAt ? r.monthKeys.indexOf(r.goalReachedAt) : -1;

  const scenarioLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  const pill = (active: boolean) =>
    `rounded-full px-[14px] py-[7px] text-[12px] font-bold cursor-pointer border-0 ${
      active ? "bg-white text-primary" : "bg-transparent text-white/85 hover:text-white"
    }`;

  return (
    <>
      {/* Selector ở header band */}
      <HeaderPortal>
        <div className="flex items-center gap-[6px] rounded-full p-1" style={{ background: "rgba(255,255,255,0.07)" }}>
          {scenarioKeys.map((k) => (
            <button key={k} onClick={() => setScenario(k)} className={pill(scenario === k)}>
              {scenarioLabel(k)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-[6px] rounded-full p-1" style={{ background: "rgba(255,255,255,0.07)" }}>
          {params.horizonOptions.map((h) => (
            <button key={h} onClick={() => setHorizon(h)} className={pill(horizon === h)}>
              {h}mo
            </button>
          ))}
        </div>
      </HeaderPortal>

      {/* Summary stat cards */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <SummaryCard
          icon="ph-duotone ph-trophy"
          label={`Net worth in ${horizon}mo`}
          value={fmt(r.endTotal)}
          hint={`${full(r.endTotal)} · +${r.totalGrowthPct.toFixed(1)}% so với ${full(r.startTotal)}`}
        />
        <SummaryCard
          icon="ph-duotone ph-trend-up"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          label="Total growth"
          value={`+${fmt(r.totalGrowth)}`}
          hint={`Tăng trưởng kép ${r.avgMonthlyPct.toFixed(2)}%/tháng`}
          valueColor="#1F7A5C"
        />
        <SummaryCard
          icon="ph-duotone ph-coins"
          label="Total income"
          value={fmt(r.totalIncome)}
          hint={`Thu ${full(r.totalIncome)} · chi ${full(r.totalExpense)} · net ${full(r.totalIncome - r.totalExpense)}`}
        />
        <SummaryCard
          icon="ph-duotone ph-house-line"
          iconBg={r.goalReachedAt ? "#DFF2E7" : "#FBF0DC"}
          iconFg={r.goalReachedAt ? "#1F7A5C" : "#A5731F"}
          label="Mục tiêu nhà"
          value={r.goalTarget > 0 ? fmt(r.goalTarget) : "—"}
          hint={
            r.goalTarget <= 0
              ? "Chưa đặt mục tiêu (Settings → house_goal)"
              : r.goalReachedAt
                ? `Đạt mục tiêu ~ ${r.goalReachedAt}`
                : `Chưa đạt trong ${horizon} tháng tới`
          }
          valueColor={r.goalReachedAt ? "#1F7A5C" : undefined}
        />
      </div>

      {/* Net-worth curve */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-[15px] font-bold">Net-worth projection — {scenarioLabel(scenario)}</div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            {r.goalTarget > 0 && (
              <span className="flex items-center gap-[5px]">
                <span className="w-[14px] h-0 border-t-2 border-dashed" style={{ borderColor: "#A5731F" }} />
                Mục tiêu {fmt(r.goalTarget)}
              </span>
            )}
            {snapInRange.length > 0 && (
              <label className="flex items-center gap-[5px] cursor-pointer select-none">
                <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />
                Số thực tế (snapshot)
              </label>
            )}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }}>
          {[0, 1 / 3, 2 / 3, 1].map((t, i) => {
            const v = min + (max - min) * t;
            return (
              <g key={i}>
                <line x1={46} y1={Y(v)} x2={W} y2={Y(v)} stroke="#EFEAE0" strokeWidth={1} strokeDasharray={i === 0 ? "0" : "3 4"} />
                <text x={2} y={Y(v) + 3} fontSize={9} fill="#9AA49E" fontWeight={600}>
                  {fmt(v)}
                </text>
              </g>
            );
          })}
          <polygon points={area} fill="#EAF4EE" />

          {/* Đường mục tiêu nhà */}
          {r.goalTarget > 0 && r.goalTarget >= min && r.goalTarget <= max && (
            <>
              <line x1={46} y1={Y(r.goalTarget)} x2={W} y2={Y(r.goalTarget)} stroke="#A5731F" strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={W - 2} y={Y(r.goalTarget) - 4} fontSize={9} fill="#A5731F" fontWeight={700} textAnchor="end">
                Mục tiêu
              </text>
            </>
          )}

          <polyline points={line} fill="none" stroke="#17554A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

          {/* Receivables marker tháng 1 */}
          {showReceivables && (
            <g>
              <circle cx={X(1)} cy={Y(r.nwSeries[1])} r={4.5} fill="#E8C97A" stroke="#FFFFFF" strokeWidth={2} />
              <text x={X(1)} y={Y(r.nwSeries[1]) - 8} fontSize={8.5} fill="#A5731F" fontWeight={700} textAnchor="middle">
                +{fmt(start.receivablesFirstMonth)} thu về
              </text>
            </g>
          )}

          {/* Snapshot overlay (actual) */}
          {snapPoints.map((p) => (
            <g key={`snap${p.idx}`}>
              <circle
                cx={X(p.idx)}
                cy={Y(p.total)}
                r={p.deviates ? 5 : 3.5}
                fill={p.deviates ? "#B4573B" : "#8FBCA7"}
                stroke="#FFFFFF"
                strokeWidth={2}
              >
                <title>
                  {`${p.monthKey} · thực tế ${full(p.total)}${p.deviates ? " (lệch >10% so với dự phóng)" : ""}`}
                </title>
              </circle>
            </g>
          ))}

          {/* Goal reached marker */}
          {goalIdx >= 0 && goalIdx <= horizon && (
            <circle cx={X(goalIdx)} cy={Y(r.nwSeries[goalIdx])} r={4} fill="#1F7A5C" stroke="#FFFFFF" strokeWidth={2}>
              <title>{`Đạt mục tiêu tại ${r.goalReachedAt}`}</title>
            </circle>
          )}

          {tickIdx.map((i) => (
            <circle key={i} cx={X(i)} cy={Y(r.nwSeries[i])} r={3} fill="#17554A" stroke="#FFFFFF" strokeWidth={2} />
          ))}
          {tickIdx.map((i) => (
            <text key={`x${i}`} x={X(i)} y={H - 1} fontSize={9} fill="#9AA49E" fontWeight={600} textAnchor="middle">
              {i === 0 ? "now" : r.monthKeys[i]}
            </text>
          ))}
        </svg>
        {r.goalTarget > 0 && (
          <div
            className="mt-3 rounded-[12px] px-4 py-3 flex items-center gap-3 flex-wrap"
            style={{
              background: r.goalReachedAt ? "#DFF2E7" : "#FBF0DC",
              border: `1px solid ${r.goalReachedAt ? "#B6E0C8" : "#EBD9AE"}`,
            }}
          >
            <div
              className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[18px] flex-shrink-0"
              style={{
                background: r.goalReachedAt ? "#C7E9D5" : "#F5E4BE",
                color: r.goalReachedAt ? "#1F7A5C" : "#A5731F",
              }}
            >
              <i className="ph-duotone ph-house-line" aria-hidden />
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="text-[13px] font-extrabold" style={{ color: r.goalReachedAt ? "#1F7A5C" : "#A5731F" }}>
                {r.goalReachedAt
                  ? `Đạt mục tiêu mua nhà ~ ${r.goalReachedAt}`
                  : `Chưa đạt mục tiêu trong ${horizon} tháng tới`}
              </div>
              <div className="text-[12px] mt-[2px]" style={{ color: r.goalReachedAt ? "#2C6B54" : "#8A6019" }}>
                Mục tiêu {full(r.goalTarget)} · {scenarioLabel(scenario)} scenario ·{" "}
                {r.goalReachedAt ? `còn ${fmt(r.goalTarget)} đã đạt` : `hiện dự phóng ${fmt(r.endTotal)}`}
              </div>
            </div>
            {!r.goalReachedAt && scenarioKeys.includes("aggressive") && scenario !== "aggressive" && (
              <button
                onClick={() => setScenario("aggressive")}
                className="bg-[#A5731F] text-white border-0 rounded-full px-[14px] py-[8px] text-[12px] font-bold cursor-pointer hover:bg-[#8A6019] whitespace-nowrap"
              >
                Thử scenario Aggressive
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chỉnh giả định tại chỗ */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="text-[15px] font-bold mb-1">Giả định kế hoạch (chỉnh tại chỗ)</div>
        <div className="text-[12px] text-muted mb-4">
          Sửa → biểu đồ tính lại ngay; lưu vào Settings khi rời ô. Chip “ước lượng” mất khi bạn xác nhận số.
        </div>
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {Object.keys(params.planIncomeMonthly).map((src) => (
            <AssumptionInput
              key={src}
              label={src}
              value={effectiveParams.planIncomeMonthly[src]}
              isAssumption={params.assumptions.planIncome[src] && planOverride[src] === undefined}
              onLocalChange={(v) => setPlanOverride((o) => ({ ...o, [src]: v }))}
              onCommit={(v) => setForecastPlanValue(src, v)}
            />
          ))}
          <AssumptionInput
            label="Chi/tháng"
            value={effectiveParams.planExpenseMonthly}
            isAssumption={params.assumptions.planExpense && expenseOverride === null}
            onLocalChange={(v) => setExpenseOverride(v)}
            onCommit={(v) => setForecastPlanValue("__expense__", v)}
          />
        </div>
      </div>

      {/* Per-asset-group growth */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {r.groups.map((g) => {
          const empty = g.series[0] <= 0 && g.series[g.series.length - 1] <= 0;
          const up = g.series[g.series.length - 1] >= g.series[0];
          return (
            <div key={g.key} className="bg-card border border-card-border rounded-[14px] p-4">
              <div className="flex items-center gap-2">
                <div className="w-[11px] h-[11px] rounded-[3px]" style={{ background: groupColor[g.key] }} />
                <div className="text-[13px] font-bold flex-1">{g.label}</div>
                {!empty && (
                  <span
                    className="text-[11px] font-extrabold rounded-full px-2 py-[3px]"
                    style={{
                      background: up ? "#DFF2E7" : "#F7E3DC",
                      color: up ? "#1F7A5C" : "#B4573B",
                    }}
                  >
                    {up ? "▲ " : "▼ "}
                    {g.series[0] > 0 ? Math.abs(g.growthPct).toFixed(1) + "%" : "new"}
                  </span>
                )}
              </div>
              {empty ? (
                <div className="text-[20px] font-extrabold my-2 text-faint">—</div>
              ) : (
                <>
                  <div className="text-[20px] font-extrabold my-2 tnum" title={full(g.series[g.series.length - 1])}>
                    {fmt(g.series[g.series.length - 1])}
                  </div>
                  <Spark series={g.series} color={groupColor[g.key]} />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Revenue per source + stacked bars */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="text-[15px] font-bold mb-4">Revenue by source over {horizon} months</div>
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {r.sources.map((s, i) => (
            <div
              key={s.source}
              className="border border-[#EFEAE0] rounded-[14px] p-4 hover:border-[#C9C0AC] hover:bg-[#FAF8F2]"
              title={`${s.source}: tổng ${full(s.total)} · TB ${full(s.avg)}/tháng · ${s.sharePct.toFixed(1)}% tổng thu`}
            >
              <div className="flex items-center gap-[9px]">
                <div className="w-[11px] h-[11px] rounded-[3px]" style={{ background: srcColor(s.source, i) }} />
                <div className="text-[13px] font-bold flex-1">{s.source}</div>
              </div>
              <div className="text-[22px] font-extrabold my-[10px] tnum" title={full(s.total)}>
                {fmt(s.total)}
              </div>
              <div className="text-[11px] text-muted">
                {fmt(s.avg)}/mo avg · {s.sharePct.toFixed(0)}% of income
              </div>
              <div className="h-[7px] rounded-full bg-[#EFEAE0] overflow-hidden mt-[10px]">
                <div className="h-full rounded-full" style={{ width: `${s.sharePct}%`, background: srcColor(s.source, i) }} />
              </div>
            </div>
          ))}
        </div>

        {/* Stacked monthly bars */}
        <div className="mt-6">
          <div className="flex items-end gap-[2.2%] h-[150px]">
            {r.months.map((m) => (
              <div key={m.monthKey} className="flex-1 flex flex-col justify-end items-center gap-[5px] h-full">
                <div className="w-full max-w-[34px] flex flex-col justify-end h-full rounded-[5px] overflow-hidden">
                  {r.sources.map((s, i) => {
                    const v = m.bySource[s.source] ?? 0;
                    return (
                      <div
                        key={s.source}
                        style={{ background: srcColor(s.source, i), height: `${(v / maxIncome) * 150}px` }}
                        title={`${m.monthKey} · ${s.source}: ${full(v)}`}
                      />
                    );
                  })}
                </div>
                <div className="text-[9.5px] text-faint font-semibold">{m.monthKey.split("/")[0]}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-5 flex-wrap mt-[14px]">
            {r.sources.map((s, i) => (
              <div key={s.source} className="flex items-center gap-[7px] text-[12px] text-ink-soft">
                <div className="w-[9px] h-[9px] rounded-[2px]" style={{ background: srcColor(s.source, i) }} />
                {s.source}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="bg-card border border-card-border rounded-[18px] overflow-hidden">
        <div className="px-[22px] pt-[18px] pb-1 text-[15px] font-bold">Monthly breakdown</div>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <div style={{ minWidth: 920 }}>
            <div
              className="grid gap-2 items-center px-[22px] py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px] sticky top-0 z-10"
              style={{ gridTemplateColumns: `64px repeat(${r.sources.length},1fr) 1.05fr 0.95fr 1.05fr 1.15fr 92px` }}
            >
              <div>Month</div>
              {r.sources.map((s) => (
                <div key={s.source} className="text-right" title={s.source}>
                  {srcAbbr(s.source)}
                </div>
              ))}
              <div className="text-right">Income</div>
              <div className="text-right">Expenses</div>
              <div className="text-right">Net</div>
              <div className="text-right">Net worth</div>
              <div className="text-right">MoM</div>
            </div>
            {r.months.map((m, ri) => (
              <div
                key={m.monthKey}
                className="grid gap-2 items-center px-[22px] py-[11px] border-t border-divider text-[12.5px] tnum hover:bg-[#F1EFE6]"
                style={{
                  gridTemplateColumns: `64px repeat(${r.sources.length},1fr) 1.05fr 0.95fr 1.05fr 1.15fr 92px`,
                  background: ri % 2 === 1 ? "#FAF8F2" : undefined,
                }}
                title={`${m.monthKey}: mở ${full(m.opening)} · tiết kiệm ${full(m.savings)} · lãi ${full(m.return_)} · đóng ${full(m.closing)}`}
              >
                <div className="font-bold text-ink-soft">{m.monthKey}</div>
                {r.sources.map((s) => (
                  <div key={s.source} className="text-right">
                    {fmt(m.bySource[s.source] ?? 0)}
                  </div>
                ))}
                <div className="text-right font-bold">{fmt(m.income)}</div>
                <div className="text-right text-[#B4573B]">−{fmt(m.expense)}</div>
                <div className="text-right font-bold text-[#1F7A5C]">+{fmt(m.net)}</div>
                <div className="text-right font-extrabold">{fmt(m.netWorth)}</div>
                <div className="text-right">
                  <span
                    className="inline-flex items-center gap-[3px] text-[11px] font-extrabold rounded-full px-2 py-[3px]"
                    style={{
                      background: m.momPct >= 0 ? "#DFF2E7" : "#F7E3DC",
                      color: m.momPct >= 0 ? "#1F7A5C" : "#B4573B",
                    }}
                  >
                    {m.momPct >= 0 ? "▲" : "▼"}
                    {Math.abs(m.momPct).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function AssumptionInput({
  label,
  value,
  isAssumption,
  onLocalChange,
  onCommit,
}: {
  label: string;
  value: number;
  isAssumption: boolean;
  onLocalChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  const grouped = new Intl.NumberFormat("en-US").format(Math.round(Number(text) || 0));
  // Khi focus: cho gõ số thô. Khi blur: hiện số có dấu phân cách để dễ đọc số lớn.
  const display = focused ? text : grouped;

  // Viền theo trạng thái: vàng nhạt = ước lượng, xanh = đã xác nhận, primary khi focus.
  const borderColor = focused ? "#17554A" : isAssumption ? "#E4C878" : "#9CC6B4";

  return (
    <label
      className="rounded-[14px] p-4 flex flex-col gap-[7px]"
      style={{ border: `1px solid ${isAssumption ? "#F0E2BC" : "#DDECE4"}`, background: isAssumption ? "#FEFBF3" : "#FFFFFF" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold flex-1">{label}</span>
        {isAssumption ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-[#A5731F] bg-[#FBF0DC] rounded-full px-2 py-[2px]">
            <i className="ph-duotone ph-warning-circle" aria-hidden />
            ước lượng
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold text-[#1F7A5C] bg-[#DFF2E7] rounded-full px-2 py-[2px]">
            <i className="ph-duotone ph-check-circle" aria-hidden />
            đã xác nhận
          </span>
        )}
      </div>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          // chỉ giữ chữ số (bỏ dấu phẩy người dùng hoặc format dán vào)
          const raw = e.target.value.replace(/[^\d]/g, "");
          setText(raw);
          onLocalChange(Math.round(Number(raw) || 0));
        }}
        onBlur={async () => {
          setFocused(false);
          const v = Math.round(Number(text) || 0);
          if (v === Math.round(value) && !isAssumption) return;
          setSaving(true);
          await onCommit(v);
          setSaving(false);
        }}
        className="rounded-[10px] px-3 py-[9px] text-[14px] font-bold tnum outline-none bg-white w-full transition-colors"
        style={{ border: `1.5px solid ${borderColor}` }}
      />
      <span className="text-[11px] text-muted">{saving ? "Đang lưu…" : full(value) + "/tháng"}</span>
    </label>
  );
}

function SummaryCard({
  icon,
  iconBg = "#EAF4EE",
  iconFg = "#17554A",
  label,
  value,
  hint,
  valueColor,
}: {
  icon: string;
  iconBg?: string;
  iconFg?: string;
  label: string;
  value: string;
  hint: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-[18px] p-5" title={hint}>
      <div
        className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center text-[19px]"
        style={{ background: iconBg, color: iconFg }}
      >
        <i className={icon} aria-hidden />
      </div>
      <div className="text-[24px] font-extrabold tracking-[-0.6px] mt-[14px] tnum" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-[12px] text-muted mt-[3px] font-medium">{label}</div>
    </div>
  );
}
