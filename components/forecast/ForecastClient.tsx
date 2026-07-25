"use client";
import { useMemo, useState } from "react";
import { fmt, full } from "@/lib/format";
import { sourceColor, chartPalette, groupColor } from "@/lib/design/tokens";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { Modal } from "@/components/ui/Modal";
import { LineChart, type ChartSeries } from "@/components/ui/LineChart";
import { WaterfallChart, type WaterfallStep } from "@/components/ui/WaterfallChart";
import { NetWorthChart } from "@/components/forecast/NetWorthChart";
import { runForecast, computeGoalPlan, computeScenarioCone, computeSensitivity } from "@/lib/forecast";
import { setForecastPlanValue } from "@/lib/actions/settings";
import type { ForecastParams, ForecastStart, ForecastSnapshot, InvestGainGroup } from "@/lib/queries/forecast";

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


export function ForecastClient({
  params,
  start,
  snapshots,
  investGainGroups,
}: {
  params: ForecastParams;
  start: ForecastStart;
  snapshots: ForecastSnapshot[];
  investGainGroups: InvestGainGroup[];
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
  const [showCone, setShowCone] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);

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

  // có snapshot trong dải hiện tại → cho phép bật/tắt overlay "số thực tế".
  const snapInRange = snapshots.filter((s) => r.monthKeys.includes(s.month_key));

  // Cone dự phóng: min/max qua các scenario tại mỗi cột (nền mờ quanh đường headline).
  const cone = useMemo(
    () => (scenarioKeys.length >= 2 ? computeScenarioCone(effectiveParams, start, horizon).map((c) => c.series) : []),
    [effectiveParams, start, horizon, scenarioKeys.length]
  );

  // Đường "số thực tế" liền — căn snapshot theo monthKeys (null ở tháng chưa có mốc).
  const actualLine = useMemo(() => {
    if (snapInRange.length === 0) return null;
    const byKey = new Map(snapInRange.map((s) => [s.month_key, s.total]));
    const line = r.monthKeys.map((mk) => byKey.get(mk) ?? null);
    return line.some((v) => v != null) ? line : null;
  }, [snapInRange, r.monthKeys]);

  // Kế hoạch mục tiêu: khoảng cách, cần tiết kiệm/tháng, ETA từng scenario.
  const goalPlan = useMemo(
    () => (r.goalTarget > 0 ? computeGoalPlan(effectiveParams, start, r.goalTarget, params.houseGoal.target_year) : null),
    [effectiveParams, start, r.goalTarget, params.houseGoal.target_year]
  );

  // Bóc tách "Investment gain" theo nhóm (point-in-time).
  const investGainTotal = investGainGroups.reduce((s, g) => s + g.gain, 0);

  // Waterfall dòng tiền cho 1 tháng dự phóng (mặc định tháng cuối horizon).
  const [wfIdx, setWfIdx] = useState<number | null>(null);
  const wfMonth = r.months.length ? r.months[wfIdx ?? r.months.length - 1] : null;
  const wfSteps: WaterfallStep[] = wfMonth
    ? [
        { label: "Đầu kỳ", value: wfMonth.opening, kind: "total" },
        { label: "Tiết kiệm", value: wfMonth.savings, kind: "delta" },
        { label: "Lãi tài sản", value: wfMonth.return_, kind: "delta" },
        { label: "Cuối kỳ", value: wfMonth.closing, kind: "total" },
      ]
    : [];

  // Độ nhạy theo lợi suất quanh scenario hiện tại (±2%).
  const sensitivity = useMemo(
    () => computeSensitivity(effectiveParams, start, scenario, horizon),
    [effectiveParams, start, scenario, horizon]
  );
  const sensPerPct = useMemo(() => {
    // xấp xỉ "±1% lợi suất → ΔNW": lấy chênh giữa +1% và −1% chia 2.
    const up = sensitivity.find((s) => Math.abs(s.deltaReturn - 0.01) < 1e-9);
    const down = sensitivity.find((s) => Math.abs(s.deltaReturn + 0.01) < 1e-9);
    if (up && down) return (up.endTotal - down.endTotal) / 2;
    return null;
  }, [sensitivity]);

  // Asset-class growth → multi-line.
  const groupSeries: ChartSeries[] = r.groups
    .filter((g) => !(g.series[0] <= 0 && g.series[g.series.length - 1] <= 0))
    .map((g) => ({ key: g.key, label: g.label, color: groupColor[g.key], values: g.series }));

  // số field kế hoạch còn là "ước lượng" (chưa xác nhận) → badge trên nút mở form.
  const assumptionCount =
    Object.keys(params.planIncomeMonthly).filter(
      (src) => params.assumptions.planIncome[src] && planOverride[src] === undefined
    ).length + (params.assumptions.planExpense && expenseOverride === null ? 1 : 0);

  const scenarioLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  const pill = (active: boolean) =>
    `rounded-full px-[14px] py-[7px] text-[12px] font-bold cursor-pointer border-0 ${
      active ? "bg-white text-primary" : "bg-transparent text-white/85 hover:text-white"
    }`;

  return (
    <>
      {/* Selector ở header band — segmented pill có nhãn HORIZON / SCENARIO */}
      <HeaderPortal>
        <div className="flex items-center gap-[7px] rounded-full p-1 pl-3" style={{ background: "rgba(255,255,255,0.07)" }}>
          <span className="text-[10px] font-extrabold tracking-[0.6px] text-white/60">HORIZON</span>
          {params.horizonOptions.map((h) => (
            <button key={h} onClick={() => setHorizon(h)} className={pill(horizon === h)}>
              {h}M
            </button>
          ))}
        </div>
        <div className="flex items-center gap-[7px] rounded-full p-1 pl-3" style={{ background: "rgba(255,255,255,0.07)" }}>
          <span className="text-[10px] font-extrabold tracking-[0.6px] text-white/60">SCENARIO</span>
          {scenarioKeys.map((k) => (
            <button key={k} onClick={() => setScenario(k)} className={pill(scenario === k)}>
              {scenarioLabel(k)}
            </button>
          ))}
        </div>
      </HeaderPortal>

      {/* KPI row — card 1 là hero (accent-tinted gradient + accent border) */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
        {/* Hero */}
        <div
          className="rounded-[18px] p-5"
          style={{
            background: "linear-gradient(135deg, #EAF4EE 0%, #F5FAF7 100%)",
            border: "1.5px solid #17554A",
          }}
        >
          <div className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center text-[19px] bg-[#D6E9DE] text-primary">
            <i className="ph-duotone ph-trophy" aria-hidden />
          </div>
          <div className="text-[24px] font-extrabold tracking-[-0.6px] mt-[14px] tnum text-primary" title={full(r.endTotal)}>
            {fmt(r.endTotal)}
          </div>
          <div className="text-[12px] text-ink-soft mt-[3px] font-semibold">Net worth in {horizon}M</div>
          <div className="inline-flex items-center gap-[4px] mt-[10px] text-[12px] font-extrabold text-[#1F7A5C] bg-[#DFF2E7] rounded-full px-[10px] py-[3px]">
            <i className="ph-fill ph-caret-up" aria-hidden />
            +{fmt(r.totalGrowth)} · +{r.totalGrowthPct.toFixed(1)}% vs hôm nay
          </div>
        </div>

        <SummaryCard
          icon="ph-duotone ph-trend-up"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          label="Tăng trưởng kép/tháng"
          value={`${r.avgMonthlyPct >= 0 ? "+" : ""}${r.avgMonthlyPct.toFixed(2)}%`}
          hint={`CAGR/tháng qua ${horizon} tháng · tương đương +${r.totalGrowthPct.toFixed(1)}% cả kỳ`}
          valueColor="#1F7A5C"
        />
        {/* Đổi "Total income" (số trơ) → độ nhạy lợi suất: actionable insight */}
        <SummaryCard
          icon="ph-duotone ph-scales"
          label="±1% lợi suất"
          value={sensPerPct != null ? `${sensPerPct >= 0 ? "+" : "−"}${fmt(Math.abs(sensPerPct))}` : "—"}
          hint={`Mỗi 1%/năm lợi suất đổi net worth sau ${horizon}M chừng này. Thu kỳ này ${full(r.totalIncome)} · chi ${full(r.totalExpense)}`}
        />
        <SummaryCard
          icon="ph-duotone ph-chart-line-up"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          label={`Lãi tài sản · ${horizon}M`}
          value={`${r.investGain >= 0 ? "+" : "−"}${fmt(Math.abs(r.investGain))}`}
          hint={`Phần tăng nhờ lãi (ngoài tiết kiệm) · tiết kiệm ròng ${full(r.totalIncome - r.totalExpense)}`}
          valueColor="#1F7A5C"
        />
      </div>

      {/* Lãi/lỗ chưa hiện thực theo nhóm (point-in-time, hôm nay) */}
      {investGainGroups.some((g) => g.gain !== 0) && (
        <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
                <i className="ph-duotone ph-chart-pie-slice" aria-hidden />
              </div>
              <div className="text-[15px] font-bold">Lãi/lỗ chưa hiện thực theo nhóm</div>
              <span className="text-[11px] text-muted hidden sm:inline">· tại hôm nay</span>
            </div>
            <div className="text-[13px]">
              <span className="text-muted">Tổng </span>
              <span className="font-extrabold tnum" style={{ color: investGainTotal >= 0 ? "#1F7A5C" : "#B4573B" }} title={full(investGainTotal)}>
                {investGainTotal >= 0 ? "+" : "−"}{fmt(Math.abs(investGainTotal))}
              </span>
            </div>
          </div>
          <div className="grid gap-[12px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            {investGainGroups.map((g) => {
              const share = investGainTotal !== 0 ? Math.abs(g.gain / investGainTotal) * 100 : 0;
              const up = g.gain >= 0;
              return (
                <div key={g.key} className="border border-[#EFEAE0] rounded-[14px] p-4" title={`${g.label}: ${full(g.gain)}`}>
                  <div className="flex items-center gap-[9px]">
                    <div className="w-[11px] h-[11px] rounded-[3px]" style={{ background: groupColor[g.key] }} />
                    <div className="text-[13px] font-bold flex-1">{g.label}</div>
                  </div>
                  <div className="text-[20px] font-extrabold my-[8px] tnum" style={{ color: up ? "#1F7A5C" : "#B4573B" }} title={full(g.gain)}>
                    {up ? "+" : "−"}{fmt(Math.abs(g.gain))}
                  </div>
                  <div className="h-[7px] rounded-full bg-[#EFEAE0] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: groupColor[g.key] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Giả định kế hoạch — thanh nút nhỏ phía trên (mở modal) */}
      <button
        onClick={() => setShowAssumptions(true)}
        className="bg-card border border-card-border rounded-[12px] px-4 py-[10px] flex items-center gap-[10px] cursor-pointer hover:border-primary transition-colors text-left w-full"
      >
        <i className="ph-duotone ph-sliders-horizontal text-primary text-[16px]" aria-hidden />
        <span className="text-[13px] font-bold">Giả định kế hoạch</span>
        <span className="text-[12px] text-muted hidden sm:inline">— chỉnh thu/chi dự phóng</span>
        {assumptionCount > 0 && (
          <span className="text-[11px] font-bold text-[#A5731F] bg-[#FBF0DC] rounded-full px-[9px] py-[2px] whitespace-nowrap">
            {assumptionCount} ước lượng
          </span>
        )}
        <i className="ph-duotone ph-caret-right text-muted text-[15px] ml-auto" aria-hidden />
      </button>

      {/* Chart + Asset-class growth — 2 cột (stack < lg) */}
      <div className="grid gap-[14px] items-stretch grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Net-worth curve */}
      <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
              <i className="ph-duotone ph-chart-line" aria-hidden />
            </div>
            <div className="text-[15px] font-bold">Net-worth projection — {horizon}M</div>
            <span className="text-[11px] font-bold text-primary bg-[#EAF4EE] rounded-full px-[10px] py-[3px]">
              {scenarioLabel(scenario)}
            </span>
            <span
              className="text-[11px] font-bold rounded-full px-[10px] py-[3px] flex items-center gap-[4px]"
              style={
                start.anchoredToSnapshot
                  ? { color: "#1F7A5C", background: "#DFF2E7" }
                  : { color: "#A5731F", background: "#FBF0DC" }
              }
              title={
                start.anchoredToSnapshot
                  ? `Điểm xuất phát là net worth THỰC của tháng đã chốt ${start.baselineMonthKey}`
                  : "Chưa chốt tháng nào — xuất phát từ net worth hiện tại (live) + receivables về tháng 1"
              }
            >
              <i className={`ph-duotone ${start.anchoredToSnapshot ? "ph-anchor-simple" : "ph-broadcast"}`} aria-hidden />
              {start.anchoredToSnapshot ? `Neo ${start.baselineMonthKey} (thực)` : "Live"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted flex-wrap">
            {r.goalTarget > 0 && (
              <span className="flex items-center gap-[5px]">
                <span className="w-[14px] h-0 border-t-2 border-dashed" style={{ borderColor: "#A5731F" }} />
                Mục tiêu {fmt(r.goalTarget)}
              </span>
            )}
            {cone.length >= 2 && (
              <label className="flex items-center gap-[5px] cursor-pointer select-none">
                <input type="checkbox" checked={showCone} onChange={(e) => setShowCone(e.target.checked)} />
                Dải scenario
              </label>
            )}
            {snapInRange.length > 0 && (
              <label className="flex items-center gap-[5px] cursor-pointer select-none">
                <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />
                Số thực tế (snapshot)
              </label>
            )}
          </div>
        </div>
        <NetWorthChart
          nwSeries={r.nwSeries}
          monthKeys={r.monthKeys}
          horizon={horizon}
          goalTarget={r.goalTarget}
          goalReachedAt={r.goalReachedAt}
          receivablesFirstMonth={start.receivablesFirstMonth}
          receivablesLandFirstMonth={params.receivablesLandFirstMonth}
          snapshots={snapshots}
          showActual={showActual}
          coneSeries={showCone ? cone : []}
          actualLine={showActual ? actualLine : null}
        />
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

        {/* Goal insight — khoảng cách · cần tiết kiệm/tháng · ETA từng scenario */}
        {goalPlan && (
          <div className="mt-3 grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <GoalTile
              label={`Còn thiếu tới mục tiêu`}
              value={goalPlan.distance > 0 ? fmt(goalPlan.distance) : "Đã đủ"}
              hint={goalPlan.distance > 0 ? `Cần thêm ${full(goalPlan.distance)} so với hôm nay` : "Net worth hiện tại đã đạt mục tiêu"}
              tone={goalPlan.distance > 0 ? "warn" : "good"}
            />
            {goalPlan.monthsToDeadline > 0 && (
              <GoalTile
                label={`Cần tiết kiệm / tháng`}
                value={`${fmt(goalPlan.requiredMonthlySaving)}`}
                hint={`Để chạm ${full(goalPlan.target)} trong ${goalPlan.monthsToDeadline} tháng (tới hết ${params.houseGoal.target_year}) — chưa tính lãi`}
                tone="neutral"
              />
            )}
            <GoalTile
              label="Scenario đạt sớm nhất"
              value={goalPlan.onTrackScenario ? scenarioLabel(goalPlan.onTrackScenario) : "Không (trong 10 năm)"}
              hint={
                goalPlan.onTrackScenario
                  ? `Kịch bản '${scenarioLabel(goalPlan.onTrackScenario)}' chạm mục tiêu ~ ${goalPlan.etaByScenario[goalPlan.onTrackScenario]}`
                  : "Không kịch bản nào đạt trong 120 tháng — tăng tiết kiệm hoặc lợi suất"
              }
              tone={goalPlan.onTrackScenario ? "good" : "warn"}
            />
          </div>
        )}

        {/* ETA chi tiết từng scenario */}
        {goalPlan && scenarioKeys.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-[8px]">
            {scenarioKeys.map((k) => {
              const eta = goalPlan.etaByScenario[k];
              const active = k === scenario;
              return (
                <button
                  key={k}
                  onClick={() => setScenario(k)}
                  className="flex items-center gap-[6px] rounded-full px-[12px] py-[6px] text-[11px] font-bold border cursor-pointer transition-colors"
                  style={{
                    background: active ? "#EAF4EE" : "#FFFFFF",
                    borderColor: active ? "#17554A" : "#E7E1D3",
                    color: eta ? "#1F7A5C" : "#9AA49E",
                  }}
                  title={`Scenario ${scenarioLabel(k)}: ${eta ? `đạt ~ ${eta}` : "không đạt trong 120 tháng"}`}
                >
                  <i className={`ph-duotone ${eta ? "ph-flag-checkered" : "ph-flag"}`} aria-hidden />
                  {scenarioLabel(k)}: {eta ?? "—"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cột phải — Asset-class growth (multi-line, giống Revenue by source) */}
      <div className="bg-card border border-card-border rounded-[18px] p-[18px] flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
            <i className="ph-duotone ph-chart-donut" aria-hidden />
          </div>
          <div className="text-[15px] font-bold">Asset-class growth · {horizon}M</div>
        </div>
        {/* disclaimer: các đường độc lập, KHÔNG phải phân rã của headline */}
        <div className="text-[11px] text-muted mb-3 leading-[1.4]">
          Mỗi nhóm tăng theo lợi suất giả định riêng — <b>độc lập</b>, không phải phân rã của đường net worth.
        </div>
        {groupSeries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-faint">Chưa có tài sản.</div>
        ) : (
          <>
            <LineChart
              labels={r.monthKeys}
              series={groupSeries}
              height={230}
              ariaLabel="Tăng trưởng từng nhóm tài sản qua từng tháng"
            />
            {/* growthPct từng nhóm (đang có sẵn trong engine, trước đây không hiển thị) */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px]">
              {r.groups
                .filter((g) => g.series[g.series.length - 1] > 0)
                .map((g) => (
                  <span key={g.key} className="flex items-center gap-[5px] text-muted">
                    <span className="w-[9px] h-[9px] rounded-[2px]" style={{ background: groupColor[g.key] }} />
                    {g.label}{" "}
                    <b style={{ color: g.growthPct >= 0 ? "#1F7A5C" : "#B4573B" }}>
                      {g.growthPct >= 0 ? "+" : ""}
                      {g.growthPct.toFixed(1)}%
                    </b>
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
      </div>

      {/* Waterfall dòng tiền/tháng + Độ nhạy lợi suất — 2 cột */}
      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-2">
        {/* B2 — Waterfall: opening → +tiết kiệm → +lãi → closing của tháng chọn */}
        <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
                <i className="ph-duotone ph-flow-arrow" aria-hidden />
              </div>
              <div className="text-[15px] font-bold">Dòng tiền tháng dự phóng</div>
            </div>
            {r.months.length > 0 && (
              <select
                value={wfIdx ?? r.months.length - 1}
                onChange={(e) => setWfIdx(Number(e.target.value))}
                className="bg-fill-soft border border-card-border rounded-full px-[13px] py-[7px] text-[12px] font-bold text-ink-soft cursor-pointer"
                aria-label="Chọn tháng"
              >
                {r.months.map((m, i) => (
                  <option key={m.monthKey} value={i}>
                    {m.monthKey}
                  </option>
                ))}
              </select>
            )}
          </div>
          {wfSteps.length > 0 ? (
            <>
              <WaterfallChart steps={wfSteps} height={230} />
              <div className="text-[11px] text-muted mt-2">
                Mở đầu {fmt(wfMonth!.opening)} → tiết kiệm{" "}
                <b className="text-[#1F7A5C]">+{fmt(wfMonth!.savings)}</b> → lãi{" "}
                <b className="text-[#1F7A5C]">+{fmt(wfMonth!.return_)}</b> → đóng{" "}
                <b>{fmt(wfMonth!.closing)}</b>.
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-[13px] text-faint">Chưa có dữ liệu.</div>
          )}
        </div>

        {/* B3 — Độ nhạy lợi suất: dịch annual_return quanh scenario, xem NW cuối kỳ đổi bao nhiêu */}
        <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
              <i className="ph-duotone ph-scales" aria-hidden />
            </div>
            <div className="text-[15px] font-bold">Độ nhạy lợi suất · {horizon}M</div>
          </div>
          <div className="text-[11px] text-muted mb-3 leading-[1.4]">
            Giữ nguyên kế hoạch thu/chi, chỉ đổi lợi suất năm quanh <b>{scenarioLabel(scenario)}</b> → net worth cuối kỳ.
          </div>
          <div className="flex flex-col">
            {sensitivity.map((s) => {
              const isBase = Math.abs(s.deltaReturn) < 1e-9;
              const up = s.vsBase >= 0;
              return (
                <div
                  key={s.deltaReturn}
                  className="grid items-center gap-2 py-[9px] border-t border-divider text-[12.5px] tnum first:border-t-0"
                  style={{ gridTemplateColumns: "78px 1fr 110px", background: isBase ? "#F7F4EC" : undefined }}
                >
                  <div className="font-bold" style={{ color: isBase ? "#17554A" : "#4C5A54" }}>
                    {(s.annualReturn * 100).toFixed(0)}%/năm
                  </div>
                  <div className="font-extrabold" title={full(s.endTotal)}>
                    {fmt(s.endTotal)}
                  </div>
                  <div className="text-right">
                    {isBase ? (
                      <span className="text-[11px] font-bold text-muted">gốc</span>
                    ) : (
                      <span
                        className="text-[11px] font-extrabold rounded-full px-2 py-[3px]"
                        style={{ background: up ? "#DFF2E7" : "#F7E3DC", color: up ? "#1F7A5C" : "#B4573B" }}
                      >
                        {up ? "+" : "−"}
                        {fmt(Math.abs(s.vsBase))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Modal
        open={showAssumptions}
        onClose={() => setShowAssumptions(false)}
        title="Giả định kế hoạch"
        icon="ph-duotone ph-sliders-horizontal"
        width={420}
      >
        <div className="text-[12px] text-muted mb-3">
          Sửa → biểu đồ tính lại ngay; lưu vào Settings khi rời ô. Chip “ước lượng” mất khi xác nhận số.
        </div>
        <div className="flex flex-col gap-[10px] max-h-[60vh] overflow-y-auto pr-1">
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
      </Modal>

      {/* Revenue per source + stacked bars */}
      <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
              <i className="ph-duotone ph-coins" aria-hidden />
            </div>
            <div className="text-[15px] font-bold">Revenue by source · {horizon}M</div>
          </div>
          <div className="text-[13px]">
            <span className="text-muted">Total </span>
            <span className="font-extrabold text-ink tnum" title={full(r.totalIncome)}>
              {fmt(r.totalIncome)}
            </span>
          </div>
        </div>
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
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

        <div className="mt-4 text-[11px] text-muted leading-[1.5] border-t border-divider pt-3">
          Kế hoạch thu giả định <b>đều mỗi tháng</b> nên tỉ trọng giữ nguyên suốt kỳ — chỉnh ở “Giả định kế hoạch”.
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="bg-card border border-card-border rounded-[18px] overflow-hidden">
        <div className="px-[22px] pt-[18px] pb-1 text-[15px] font-bold">Monthly breakdown</div>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <div style={{ minWidth: 920 }}>
            <div
              className="grid gap-2 items-center px-[22px] py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px] sticky top-0 z-10"
              style={{ gridTemplateColumns: `64px repeat(${r.sources.length},1fr) 1.05fr 0.95fr 1.05fr 0.9fr 1.15fr 92px` }}
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
              <div className="text-right">Lãi</div>
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
                <div className="text-right text-[#1F7A5C]" title={full(m.return_)}>+{fmt(m.return_)}</div>
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

function GoalTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "neutral";
}) {
  const c =
    tone === "good"
      ? { bg: "#DFF2E7", fg: "#1F7A5C" }
      : tone === "warn"
      ? { bg: "#FBF0DC", fg: "#A5731F" }
      : { bg: "#EAF4EE", fg: "#17554A" };
  return (
    <div className="rounded-[14px] p-4" style={{ background: c.bg }} title={hint}>
      <div className="text-[11px] font-bold" style={{ color: c.fg }}>{label}</div>
      <div className="text-[19px] font-extrabold mt-[6px] tnum" style={{ color: c.fg }}>{value}</div>
      <div className="text-[11px] mt-[4px] leading-[1.4]" style={{ color: c.fg, opacity: 0.85 }}>{hint}</div>
    </div>
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
