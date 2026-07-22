"use client";
import { useMemo, useState } from "react";
import { fmt, full } from "@/lib/format";
import { sourceColor, chartPalette, groupColor } from "@/lib/design/tokens";
import { LineChart, type ChartSeries } from "@/components/ui/LineChart";
import { runForecast } from "@/lib/forecast";
import type { ForecastParams, ForecastStart } from "@/lib/queries/forecast";

function srcColor(name: string, idx: number): string {
  return sourceColor[name] ?? chartPalette[idx % chartPalette.length];
}

/**
 * Island Forecast nhúng trong Dashboard: Horizon+Scenario toggle (trong trang,
 * KHÔNG dùng HeaderPortal để tránh đè nút Close month), KPI hero+3 card,
 * Revenue by source (multi-line), Asset-class growth (multi-line). Tái dùng engine
 * + LineChart; mọi số từ props (params/start).
 */
export function DashboardForecast({
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

  const revenueSeries: ChartSeries[] = r.sources.map((s, i) => ({
    key: s.source,
    label: s.source,
    color: srcColor(s.source, i),
    values: r.months.map((m) => m.bySource[s.source] ?? 0),
  }));
  const revenueLabels = r.months.map((m) => m.monthKey);

  const groupSeries: ChartSeries[] = r.groups
    .filter((g) => !(g.series[0] <= 0 && g.series[g.series.length - 1] <= 0))
    .map((g) => ({ key: g.key, label: g.label, color: groupColor[g.key], values: g.series }));

  const scenarioLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  const pill = (active: boolean) =>
    `rounded-full px-[13px] py-[6px] text-[12px] font-bold cursor-pointer border-0 ${
      active ? "bg-primary text-white" : "bg-transparent text-muted hover:text-ink"
    }`;

  return (
    <div className="bg-card border border-card-border rounded-[18px] p-[22px] flex flex-col gap-[18px]">
      {/* Header + controls (trong trang) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
            <i className="ph-duotone ph-chart-line-up" aria-hidden />
          </div>
          <div className="text-[15px] font-bold">Forecast — {scenarioLabel(scenario)} · {horizon}M</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-[6px] rounded-full p-1 pl-2 bg-fill-soft border border-card-border">
            <span className="text-[10px] font-extrabold tracking-[0.5px] text-faint">HORIZON</span>
            {params.horizonOptions.map((h) => (
              <button key={h} onClick={() => setHorizon(h)} className={pill(horizon === h)}>
                {h}M
              </button>
            ))}
          </div>
          <div className="flex items-center gap-[6px] rounded-full p-1 pl-2 bg-fill-soft border border-card-border">
            <span className="text-[10px] font-extrabold tracking-[0.5px] text-faint">SCENARIO</span>
            {scenarioKeys.map((k) => (
              <button key={k} onClick={() => setScenario(k)} className={pill(scenario === k)}>
                {scenarioLabel(k)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row — hero + 3 card */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div
          className="rounded-[16px] p-4"
          style={{ background: "linear-gradient(135deg, #EAF4EE 0%, #F5FAF7 100%)", border: "1.5px solid #17554A" }}
        >
          <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[17px] bg-[#D6E9DE] text-primary">
            <i className="ph-duotone ph-trophy" aria-hidden />
          </div>
          <div className="text-[22px] font-extrabold tracking-[-0.6px] mt-[12px] tnum text-primary" title={full(r.endTotal)}>
            {fmt(r.endTotal)}
          </div>
          <div className="text-[12px] text-ink-soft mt-[2px] font-semibold">Net worth in {horizon}M</div>
          <div className="inline-flex items-center gap-[4px] mt-[8px] text-[11px] font-extrabold text-[#1F7A5C] bg-[#DFF2E7] rounded-full px-[9px] py-[2px]">
            <i className="ph-fill ph-caret-up" aria-hidden />
            +{fmt(r.totalGrowth)} vs hôm nay
          </div>
        </div>
        <Kpi
          icon="ph-duotone ph-trend-up"
          label="Avg monthly growth"
          value={`${r.avgMonthlyPct >= 0 ? "+" : ""}${r.avgMonthlyPct.toFixed(2)}%`}
          hint={`Tăng trưởng kép/tháng qua ${horizon} tháng`}
          positive
        />
        <Kpi
          icon="ph-duotone ph-coins"
          label={`Total income · ${horizon}M`}
          value={fmt(r.totalIncome)}
          hint={`Thu ${full(r.totalIncome)} · chi ${full(r.totalExpense)}`}
        />
        <Kpi
          icon="ph-duotone ph-chart-line-up"
          label={`Investment gain · ${horizon}M`}
          value={`${r.investGain >= 0 ? "+" : "−"}${fmt(Math.abs(r.investGain))}`}
          hint="Phần tăng nhờ lãi tài sản"
          positive
        />
      </div>

      {/* Revenue by source + Asset-class growth — 2 cột */}
      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-2">
        <div className="border border-card-border rounded-[14px] p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="text-[14px] font-bold">Revenue by source · {horizon}M</div>
            <div className="text-[12px]">
              <span className="text-muted">Total </span>
              <span className="font-extrabold text-ink tnum" title={full(r.totalIncome)}>
                {fmt(r.totalIncome)}
              </span>
            </div>
          </div>
          <LineChart labels={revenueLabels} series={revenueSeries} height={230} ariaLabel="Doanh thu theo nguồn" />
        </div>

        <div className="border border-card-border rounded-[14px] p-4">
          <div className="text-[14px] font-bold mb-2">Asset-class growth · {horizon}M</div>
          {groupSeries.length === 0 ? (
            <div className="h-[230px] flex items-center justify-center text-[13px] text-faint">Chưa có tài sản.</div>
          ) : (
            <LineChart labels={r.monthKeys} series={groupSeries} height={230} ariaLabel="Tăng trưởng từng nhóm tài sản" />
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  positive,
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-card border border-card-border rounded-[16px] p-4" title={hint}>
      <div
        className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[17px]"
        style={{ background: positive ? "#DFF2E7" : "#EAF4EE", color: positive ? "#1F7A5C" : "#17554A" }}
      >
        <i className={icon} aria-hidden />
      </div>
      <div className="text-[22px] font-extrabold tracking-[-0.6px] mt-[12px] tnum" style={{ color: positive ? "#1F7A5C" : undefined }}>
        {value}
      </div>
      <div className="text-[12px] text-muted mt-[2px] font-medium">{label}</div>
    </div>
  );
}
