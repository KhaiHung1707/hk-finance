"use client";
import { useMemo, useState } from "react";
import { fmt, full, pct } from "@/lib/format";
import { sourceColor, chartPalette, groupColor } from "@/lib/design/tokens";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { runForecast } from "@/lib/forecast";
import type { ForecastParams, ForecastStart } from "@/lib/queries/forecast";

function srcColor(name: string, idx: number): string {
  return sourceColor[name] ?? chartPalette[idx % chartPalette.length];
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
}: {
  params: ForecastParams;
  start: ForecastStart;
}) {
  const scenarioKeys = Object.keys(params.scenarios);
  const [scenario, setScenario] = useState(scenarioKeys.includes("base") ? "base" : scenarioKeys[0]);
  const [horizon, setHorizon] = useState(
    params.horizonOptions.includes(12) ? 12 : params.horizonOptions[params.horizonOptions.length - 1]
  );

  const r = useMemo(() => runForecast(params, start, scenario, horizon), [params, start, scenario, horizon]);

  // chart geometry (viewBox 620×200)
  const W = 620;
  const H = 200;
  const min = r.startTotal;
  const max = r.endTotal || r.startTotal + 1;
  const X = (i: number) => 46 + (i / horizon) * (W - 54);
  const Y = (v: number) => H - 10 - ((v - min) / (max - min || 1)) * (H - 26);
  const line = r.nwSeries.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `46,${H - 10} ${line} ${W},${H - 10}`;
  const tickIdx = [...new Set([0, Math.round(horizon / 3), Math.round((2 * horizon) / 3), horizon])];

  const maxIncome = Math.max(...r.months.map((m) => m.income), 1);

  const scenarioLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  const pill = (active: boolean) =>
    `rounded-full px-[14px] py-[7px] text-[12px] font-bold cursor-pointer border-0 ${
      active ? "bg-white text-primary" : "bg-transparent text-[#BCD8CC] hover:text-white"
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
          icon="ph-duotone ph-chart-line-up"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          label="Investment gain"
          value={`+${fmt(r.investGain)}`}
          hint={`Lãi tài sản ${full(r.investGain)} qua ${horizon} tháng`}
          valueColor="#1F7A5C"
        />
      </div>

      {/* Net-worth curve */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="text-[15px] font-bold mb-3">Net-worth projection — {scenarioLabel(scenario)}</div>
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
          <polyline points={line} fill="none" stroke="#17554A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {tickIdx.map((i) => (
            <circle key={i} cx={X(i)} cy={Y(r.nwSeries[i])} r={3.5} fill="#17554A" stroke="#FFFFFF" strokeWidth={2} />
          ))}
          {tickIdx.map((i) => (
            <text key={`x${i}`} x={X(i)} y={H - 1} fontSize={9} fill="#9AA49E" fontWeight={600} textAnchor="middle">
              {i === 0 ? "now" : r.monthKeys[i]}
            </text>
          ))}
        </svg>
      </div>

      {/* Per-asset-group growth */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {r.groups.map((g) => {
          const up = g.series[g.series.length - 1] >= g.series[0];
          return (
            <div key={g.key} className="bg-card border border-card-border rounded-[14px] p-4">
              <div className="flex items-center gap-2">
                <div className="w-[11px] h-[11px] rounded-[3px]" style={{ background: groupColor[g.key] }} />
                <div className="text-[13px] font-bold flex-1">{g.label}</div>
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
              </div>
              <div className="text-[20px] font-extrabold my-2 tnum" title={full(g.series[g.series.length - 1])}>
                {fmt(g.series[g.series.length - 1])}
              </div>
              <Spark series={g.series} color={groupColor[g.key]} />
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
        <div className="overflow-x-auto">
          <div style={{ minWidth: 920 }}>
            <div
              className="grid gap-2 items-center px-[22px] py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
              style={{ gridTemplateColumns: `64px repeat(${r.sources.length},1fr) 1.05fr 0.95fr 1.05fr 1.15fr 92px` }}
            >
              <div>Month</div>
              {r.sources.map((s) => (
                <div key={s.source} className="text-right">
                  {s.source.slice(0, 6)}
                </div>
              ))}
              <div className="text-right">Income</div>
              <div className="text-right">Expenses</div>
              <div className="text-right">Net</div>
              <div className="text-right">Net worth</div>
              <div className="text-right">MoM</div>
            </div>
            {r.months.map((m) => (
              <div
                key={m.monthKey}
                className="grid gap-2 items-center px-[22px] py-[11px] border-t border-divider text-[12.5px] tnum hover:bg-[#FAF8F2]"
                style={{ gridTemplateColumns: `64px repeat(${r.sources.length},1fr) 1.05fr 0.95fr 1.05fr 1.15fr 92px` }}
                title={`${m.monthKey}: thu ${full(m.income)} · chi ${full(m.expense)} · tiết kiệm ${full(m.net)} · net worth ${full(m.netWorth)}`}
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
