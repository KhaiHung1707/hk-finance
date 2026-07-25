"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { fmt, full, pct } from "@/lib/format";
import { groupColor, sourceColor, chartPalette } from "@/lib/design/tokens";
import { Sparkline } from "@/components/ui/Sparkline";
import { StackedAreaChart } from "@/components/ui/StackedAreaChart";
import { WaterfallChart, type WaterfallStep } from "@/components/ui/WaterfallChart";
import { LineChart, type ChartSeries } from "@/components/ui/LineChart";
import type {
  NetworthHistoryRow,
  NetworthDeltaRow,
  MonthlyTrendRow,
  ClosedMonth,
  ForecastErrorRow,
} from "@/lib/queries";

const GROUP_LABEL: Record<string, string> = { cash: "Cash", gold: "Gold", stock: "Stocks", deposits: "Deposits" };

function srcColor(name: string, i: number) {
  return sourceColor[name] ?? chartPalette[i % chartPalette.length];
}

export function HistoryAnalyticsClient({
  history,
  deltas,
  monthlyTrend,
  sourceTrend,
  closedMonths,
  forecastError,
  allocationTargets,
  savingsThreshold = 0.2,
  driftThreshold = 0.05,
}: {
  history: NetworthHistoryRow[];
  deltas: NetworthDeltaRow[];
  monthlyTrend: MonthlyTrendRow[];
  sourceTrend: { month_key: string; source: string; source_sort: number; recognized: number }[];
  closedMonths: ClosedMonth[];
  forecastError: ForecastErrorRow[];
  allocationTargets: { cash: number; gold: number; stock: number };
  savingsThreshold?: number;
  driftThreshold?: number;
}) {
  const hasSnapshots = history.length > 0;

  // ---- Chuỗi savings-rate: ưu tiên snapshot; fallback mọi tháng (tạm tính) ----
  const savingsSeries = hasSnapshots
    ? history.map((h) => ({ key: h.month_key, rate: h.savings_rate }))
    : monthlyTrend.map((m) => ({ key: m.month_key, rate: m.savings_rate }));

  // streak: số tháng liên tiếp GẦN NHẤT có savings_rate >= ngưỡng
  const streak = useMemo(() => {
    let s = 0;
    for (let i = savingsSeries.length - 1; i >= 0; i--) {
      if (savingsSeries[i].rate >= savingsThreshold) s++;
      else break;
    }
    return s;
  }, [savingsSeries, savingsThreshold]);

  // ---- KPI realized (cần >= 2 snapshot) ----
  const kpi = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0];
    const last = history[history.length - 1];
    const nMonths = history.length - 1;
    const mom = first.total > 0 ? ((last.total - history[history.length - 2].total) / history[history.length - 2].total) * 100 : 0;
    const cagr = first.total > 0 ? (Math.pow(last.total / first.total, 12 / nMonths) - 1) * 100 : 0;
    const totalGrowth = last.total - first.total;
    return { mom, cagr, totalGrowth, first: first.total, last: last.total, nMonths };
  }, [history]);

  // ---- Tháng này vs trung bình 3 tháng trước ----
  const trend = monthlyTrend;
  const vs3 = useMemo(() => {
    if (trend.length === 0) return null;
    const cur = trend[trend.length - 1];
    const prev3 = trend.slice(Math.max(0, trend.length - 4), trend.length - 1);
    if (prev3.length === 0) return null;
    const avg = (sel: (r: MonthlyTrendRow) => number) => prev3.reduce((a, r) => a + sel(r), 0) / prev3.length;
    return {
      cur,
      count: prev3.length,
      recognized: { cur: cur.recognized, avg: avg((r) => r.recognized) },
      expense: { cur: cur.expense, avg: avg((r) => r.expense) },
      net: { cur: cur.net, avg: avg((r) => r.net) },
      savings: { cur: cur.savings_rate, avg: avg((r) => r.savings_rate) },
    };
  }, [trend]);

  // ---- Allocation drift theo thời gian (share, cần snapshot) ----
  const allocLabels = history.map((h) => h.month_key);
  const allocSeries: ChartSeries[] = [
    { key: "cash", label: "Cash", color: groupColor.cash, values: history.map((h) => h.cash) },
    { key: "gold", label: "Gold", color: groupColor.gold, values: history.map((h) => h.gold) },
    { key: "stock", label: "Stocks", color: groupColor.stock, values: history.map((h) => h.stock) },
    { key: "deposits", label: "Deposits", color: groupColor.deposits, values: history.map((h) => h.deposits) },
  ];

  // ---- Source contribution over months (zero-fill theo thứ tự tháng của trend) ----
  const monthOrder = (hasSnapshots ? history.map((h) => h.month_key) : trend.map((m) => m.month_key));
  const sources = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of sourceTrend) if (!seen.has(r.source)) seen.set(r.source, r.source_sort);
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  }, [sourceTrend]);
  const sourceSeries: ChartSeries[] = sources.map((name, i) => ({
    key: name,
    label: name,
    color: srcColor(name, i),
    values: monthOrder.map((mk) => {
      const hit = sourceTrend.find((r) => r.month_key === mk && r.source === name);
      return hit ? hit.recognized : 0;
    }),
  }));

  // ---- Waterfall: chọn 1 tháng (mặc định mới nhất có opening) ----
  const waterfallCandidates = deltas.filter((d) => d.opening != null);
  const [wfMonth, setWfMonth] = useState<string>(
    waterfallCandidates.length ? waterfallCandidates[waterfallCandidates.length - 1].month_key : ""
  );
  const wf = deltas.find((d) => d.month_key === wfMonth) ?? null;
  const wfSteps: WaterfallStep[] = wf && wf.opening != null
    ? [
        { label: "Đầu kỳ", value: wf.opening, kind: "total" },
        { label: "Thu", value: wf.income_received, kind: "delta" },
        { label: "Chi", value: -wf.expense, kind: "delta" },
        { label: "Đầu tư & định giá", value: wf.invest_and_reval ?? 0, kind: "delta" },
        { label: "Cuối kỳ", value: wf.total, kind: "total" },
      ]
    : [];

  // ---- A1: Line net worth THỰC theo thời gian + overlay forecast (backtest) ----
  const nwLabels = history.map((h) => h.month_key);
  const forecastByMonth = new Map(forecastError.map((f) => [f.month_key, f.forecast_total]));
  const nwLineSeries: ChartSeries[] = hasSnapshots
    ? [
        { key: "actual", label: "Thực tế", color: groupColor.stock, values: history.map((h) => h.total) },
        ...(forecastError.some((f) => f.forecast_total != null)
          ? [
              {
                key: "forecast",
                label: "Dự phóng (lúc chốt)",
                color: "#A5731F",
                values: history.map((h) => forecastByMonth.get(h.month_key) ?? 0),
              },
            ]
          : []),
      ]
    : [];

  // ---- A2: "Nhóm nào kéo net worth" cho tháng chọn (dùng d_cash/d_gold/…) ----
  const [contribMonth, setContribMonth] = useState<string>(
    waterfallCandidates.length ? waterfallCandidates[waterfallCandidates.length - 1].month_key : ""
  );
  const contribD = deltas.find((d) => d.month_key === contribMonth) ?? null;
  const contribBars = contribD
    ? ([
        { key: "cash", label: "Cash", value: contribD.d_cash ?? 0 },
        { key: "gold", label: "Gold", value: contribD.d_gold ?? 0 },
        { key: "stock", label: "Stocks", value: contribD.d_stock ?? 0 },
        { key: "deposits", label: "Deposits", value: contribD.d_deposits ?? 0 },
      ] as const)
        .map((b) => ({ ...b }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    : [];
  const contribMax = Math.max(1, ...contribBars.map((b) => Math.abs(b.value)));

  // ---- A5: Sai số dự phóng (backtest) ----
  const errRows = forecastError.filter((f) => f.forecast_total != null);
  const lastErr = errRows.length ? errRows[errRows.length - 1] : null;
  const meanAbsErrPct =
    errRows.length > 0
      ? errRows.reduce((a, f) => a + Math.abs(f.error_pct ?? 0), 0) / errRows.length
      : null;

  // ---- A4: source contribution mode (value/share) ----
  const [srcMode, setSrcMode] = useState<"value" | "share">("value");

  // ---- A4: allocation drift so target (chỉ tháng mới nhất) ----
  const latestAlloc = hasSnapshots ? history[history.length - 1] : null;
  const allocDrift = latestAlloc
    ? (["cash", "gold", "stock"] as const).map((g) => {
        const share = latestAlloc.total > 0 ? latestAlloc[g] / latestAlloc.total : 0;
        return { g, share, target: allocationTargets[g], drift: share - allocationTargets[g] };
      })
    : [];
  const driftAlert = allocDrift.filter((d) => Math.abs(d.drift) > driftThreshold);

  return (
    <div className="flex flex-col gap-[18px]">
      {!hasSnapshots && (
        <div className="bg-[#FBF0DC] border border-[#EBD9AE] text-[#8A6019] rounded-[14px] px-4 py-[11px] text-[12.5px] flex items-center gap-[10px]">
          <i className="ph-duotone ph-info text-[16px] text-[#A5731F]" aria-hidden />
          <span>
            Chưa có tháng nào <b>chốt sổ</b> — số liệu xu hướng dưới đây là <b>tạm tính</b> từ giao dịch hiện tại.
            Vào Dashboard bấm <b>Chốt tháng</b> để cố định mốc net worth theo thời gian.
          </span>
        </div>
      )}

      {/* ---- KPI strip ---- */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Kpi
          icon="ph-duotone ph-chart-line-up"
          label={kpi ? `CAGR · ${kpi.nMonths} tháng` : "CAGR"}
          value={kpi ? `${kpi.cagr >= 0 ? "+" : ""}${kpi.cagr.toFixed(1)}%` : "—"}
          hint={kpi ? `Tăng trưởng kép năm hoá qua ${kpi.nMonths} tháng đã chốt` : "Cần ≥ 2 tháng đã chốt"}
          positive={!!kpi && kpi.cagr >= 0}
        />
        <Kpi
          icon="ph-duotone ph-trend-up"
          label="MoM gần nhất"
          value={kpi ? `${kpi.mom >= 0 ? "+" : ""}${kpi.mom.toFixed(1)}%` : "—"}
          hint={kpi ? "So với tháng chốt liền trước" : "Cần ≥ 2 tháng đã chốt"}
          positive={!!kpi && kpi.mom >= 0}
        />
        <Kpi
          icon="ph-duotone ph-coins"
          label={kpi ? "Tăng ròng lũy kế" : "Tăng ròng"}
          value={kpi ? `${kpi.totalGrowth >= 0 ? "+" : "−"}${fmt(Math.abs(kpi.totalGrowth))}` : "—"}
          hint={kpi ? `Từ ${fmt(kpi.first)} → ${fmt(kpi.last)}` : "Cần ≥ 2 tháng đã chốt"}
          positive={!!kpi && kpi.totalGrowth >= 0}
        />
        {/* Savings streak + sparkline */}
        <div className="bg-card border border-card-border rounded-[16px] p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[17px] bg-[#DFF2E7] text-[#1F7A5C]">
              <i className="ph-duotone ph-flame" aria-hidden />
            </div>
            <span className="text-[11px] font-bold text-muted">≥{pct(savingsThreshold, 0)}</span>
          </div>
          <div className="text-[22px] font-extrabold tracking-[-0.6px] mt-[12px] tnum text-[#1F7A5C]">
            {streak} <span className="text-[13px] font-bold text-ink-soft">tháng</span>
          </div>
          <div className="text-[12px] text-muted mt-[2px] font-medium mb-2">Chuỗi tiết kiệm tốt</div>
          <Sparkline values={savingsSeries.map((s) => s.rate)} baseline={savingsThreshold} color="#1F7A5C" height={34} />
        </div>
      </div>

      {/* ---- A1: Line Net Worth thực tế + overlay dự phóng ---- */}
      {hasSnapshots && nwLineSeries.length > 0 && (
        <Panel
          icon="ph-duotone ph-chart-line"
          title="Net worth thực tế theo thời gian"
          right={
            lastErr && (
              <span
                className="text-[11px] font-extrabold rounded-full px-[10px] py-[3px]"
                style={{
                  background: (lastErr.error_abs ?? 0) >= 0 ? "#DFF2E7" : "#F7E3DC",
                  color: (lastErr.error_abs ?? 0) >= 0 ? "#1F7A5C" : "#B4573B",
                }}
                title={`Thực tế ${(lastErr.error_abs ?? 0) >= 0 ? "vượt" : "hụt"} dự phóng ${full(Math.abs(lastErr.error_abs ?? 0))}`}
              >
                {lastErr.month_key}: {(lastErr.error_abs ?? 0) >= 0 ? "▲ vượt" : "▼ hụt"} {Math.abs(lastErr.error_pct ?? 0).toFixed(1)}% dự phóng
              </span>
            )
          }
        >
          <LineChart labels={nwLabels} series={nwLineSeries} height={260} allowBar={false} ariaLabel="Net worth thực tế và dự phóng qua từng tháng" />
          {errRows.length > 0 && (
            <div className="text-[11px] text-muted mt-2">
              Đường <b style={{ color: "#A5731F" }}>vàng</b> = net worth dự phóng đóng băng lúc chốt mỗi tháng · sai số trung bình {meanAbsErrPct?.toFixed(1)}%.
            </div>
          )}
        </Panel>
      )}

      {/* ---- Tháng này vs TB3 ---- */}
      {vs3 && (
        <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-[15px] font-bold">
              {vs3.cur.month_key} vs trung bình {vs3.count} tháng trước
            </div>
            <div className="text-[12px] text-muted">so sánh dòng tiền tháng</div>
          </div>
          <div className="grid gap-[12px] mt-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <CompareTile label="Thu (recognized)" cur={vs3.recognized.cur} avg={vs3.recognized.avg} higherIsGood />
            <CompareTile label="Chi" cur={vs3.expense.cur} avg={vs3.expense.avg} higherIsGood={false} />
            <CompareTile label="Net tháng" cur={vs3.net.cur} avg={vs3.net.avg} higherIsGood />
            <CompareTile label="Savings rate" cur={vs3.savings.cur} avg={vs3.savings.avg} higherIsGood isPct />
          </div>
        </div>
      )}

      {/* ---- Allocation drift + Source contribution ---- */}
      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-2">
        <Panel icon="ph-duotone ph-chart-donut" title="Dịch chuyển tỉ trọng tài sản">
          {hasSnapshots ? (
            <>
              <StackedAreaChart labels={allocLabels} series={allocSeries} mode="share" height={240} ariaLabel="Tỉ trọng tài sản theo tháng" />
              {/* A4: hiện tỉ trọng mới nhất vs target + cảnh báo lệch */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted">
                {allocDrift.map(({ g, share, target, drift }) => (
                  <span key={g} className="flex items-center gap-[5px]" title={`Hiện ${pct(share, 0)} · target ${pct(target, 0)}`}>
                    <span className="w-[9px] h-[9px] rounded-[2px]" style={{ background: groupColor[g] }} />
                    {GROUP_LABEL[g]} {pct(share, 0)}/{pct(target, 0)}
                    {Math.abs(drift) > driftThreshold && (
                      <b style={{ color: drift > 0 ? "#B4573B" : "#A5731F" }}>({drift > 0 ? "+" : ""}{pct(drift, 0)})</b>
                    )}
                  </span>
                ))}
              </div>
              {driftAlert.length > 0 && (
                <div className="mt-2 text-[11px] text-[#8A6019] bg-[#FBF0DC] border border-[#EBD9AE] rounded-[10px] px-3 py-2 flex items-center gap-[7px]">
                  <i className="ph-duotone ph-warning text-[#A5731F]" aria-hidden />
                  Lệch target &gt; {pct(driftThreshold, 0)}: {driftAlert.map((d) => GROUP_LABEL[d.g]).join(", ")} — cân nhắc tái cân bằng.
                </div>
              )}
            </>
          ) : (
            <Empty>Cần ≥ 1 tháng chốt sổ để vẽ dịch chuyển tỉ trọng.</Empty>
          )}
        </Panel>

        <Panel
          icon="ph-duotone ph-stack"
          title="Đóng góp theo nguồn thu"
          right={
            sourceSeries.length > 0 && (
              <div className="flex gap-1 bg-fill-soft rounded-full p-[3px]">
                {(["value", "share"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSrcMode(m)}
                    className={`rounded-full px-[11px] py-[4px] text-[11px] font-bold cursor-pointer border-0 ${srcMode === m ? "bg-white text-primary shadow-sm" : "bg-transparent text-muted"}`}
                  >
                    {m === "value" ? "Giá trị" : "Tỉ trọng"}
                  </button>
                ))}
              </div>
            )
          }
        >
          {sourceSeries.length > 0 && monthOrder.length > 0 ? (
            <StackedAreaChart labels={monthOrder} series={sourceSeries} mode={srcMode} height={240} ariaLabel="Thu nhập theo nguồn qua từng tháng" />
          ) : (
            <Empty>Chưa có dữ liệu thu nhập theo nguồn.</Empty>
          )}
        </Panel>
      </div>

      {/* ---- Waterfall + A2 nhóm nào kéo net worth ---- */}
      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-2">
        <Panel
          icon="ph-duotone ph-flow-arrow"
          title="Phân rã dòng tiền tháng"
          right={
            waterfallCandidates.length > 0 && (
              <select
                value={wfMonth}
                onChange={(e) => setWfMonth(e.target.value)}
                className="bg-fill-soft border border-card-border rounded-full px-[13px] py-[7px] text-[12px] font-bold text-ink-soft cursor-pointer"
                aria-label="Chọn tháng waterfall"
              >
                {waterfallCandidates.map((d) => (
                  <option key={d.month_key} value={d.month_key}>{d.month_key}</option>
                ))}
              </select>
            )
          }
        >
          {wfSteps.length > 0 ? (
            <>
              <WaterfallChart steps={wfSteps} height={240} />
              <div className="text-[11px] text-muted mt-2 flex items-center gap-[6px]">
                <span className="w-[9px] h-[9px] rounded-[2px]" style={{ background: "#8b5cf6" }} />
                “Đầu tư &amp; định giá” = phần dư (lãi đầu tư + biến động giá vàng/cổ phiếu + lệch thời điểm), không phải lãi đầu tư thuần.
              </div>
            </>
          ) : (
            <Empty>Cần ≥ 2 tháng chốt sổ liên tiếp để phân rã dòng tiền.</Empty>
          )}
        </Panel>

        {/* A2: nhóm nào kéo net worth tháng này (dùng d_cash/d_gold/…) */}
        <Panel
          icon="ph-duotone ph-arrows-down-up"
          title="Nhóm nào kéo net worth"
          right={
            waterfallCandidates.length > 0 && (
              <select
                value={contribMonth}
                onChange={(e) => setContribMonth(e.target.value)}
                className="bg-fill-soft border border-card-border rounded-full px-[13px] py-[7px] text-[12px] font-bold text-ink-soft cursor-pointer"
                aria-label="Chọn tháng đóng góp nhóm"
              >
                {waterfallCandidates.map((d) => (
                  <option key={d.month_key} value={d.month_key}>{d.month_key}</option>
                ))}
              </select>
            )
          }
        >
          {contribBars.length > 0 ? (
            <div className="flex flex-col gap-3 py-2">
              {contribBars.map((b) => {
                const up = b.value >= 0;
                const w = (Math.abs(b.value) / contribMax) * 100;
                return (
                  <div key={b.key} className="flex items-center gap-3">
                    <div className="w-[64px] flex items-center gap-[6px] text-[12px] font-bold flex-shrink-0">
                      <span className="w-[9px] h-[9px] rounded-[2px]" style={{ background: groupColor[b.key] }} />
                      {b.label}
                    </div>
                    {/* thanh 2 phía từ giữa: trái = giảm, phải = tăng */}
                    <div className="flex-1 flex items-center">
                      <div className="w-1/2 flex justify-end">
                        {!up && <div className="h-[16px] rounded-l-[4px]" style={{ width: `${w}%`, background: "#B4573B" }} />}
                      </div>
                      <div className="w-[1px] h-[20px] bg-card-border" />
                      <div className="w-1/2 flex justify-start">
                        {up && <div className="h-[16px] rounded-r-[4px]" style={{ width: `${w}%`, background: "#1F7A5C" }} />}
                      </div>
                    </div>
                    <div className="w-[92px] text-right text-[12px] font-extrabold tnum flex-shrink-0" style={{ color: up ? "#1F7A5C" : "#B4573B" }} title={full(b.value)}>
                      {up ? "+" : "−"}{fmt(Math.abs(b.value))}
                    </div>
                  </div>
                );
              })}
              <div className="text-[11px] text-muted mt-1">
                Thay đổi từng nhóm so tháng trước (đã sắp theo mức tác động).
              </div>
            </div>
          ) : (
            <Empty>Cần ≥ 2 tháng chốt sổ liên tiếp để tính đóng góp từng nhóm.</Empty>
          )}
        </Panel>
      </div>

      {/* ---- A5: Bảng sai số dự phóng (backtest) ---- */}
      {errRows.length > 0 && (
        <Panel
          icon="ph-duotone ph-target"
          title="Sai số dự phóng — kế hoạch vs thực tế"
          right={
            meanAbsErrPct != null && (
              <span className="text-[11px] font-bold text-muted">
                Sai số TB {meanAbsErrPct.toFixed(1)}%
              </span>
            )
          }
        >
          <div className="overflow-x-auto">
            <div style={{ minWidth: 520 }}>
              <div className="grid gap-2 px-1 py-2 text-[11px] font-bold text-muted uppercase tracking-[0.4px]" style={{ gridTemplateColumns: "90px 1fr 1fr 120px 90px" }}>
                <div>Tháng</div>
                <div className="text-right">Dự phóng</div>
                <div className="text-right">Thực tế</div>
                <div className="text-right">Lệch</div>
                <div className="text-right">%</div>
              </div>
              {errRows.map((f) => {
                const up = (f.error_abs ?? 0) >= 0;
                return (
                  <div key={f.month_key} className="grid gap-2 items-center px-1 py-[10px] border-t border-divider text-[12.5px] tnum" style={{ gridTemplateColumns: "90px 1fr 1fr 120px 90px" }}>
                    <div className="font-bold text-ink-soft">{f.month_key}</div>
                    <div className="text-right text-muted" title={full(f.forecast_total ?? 0)}>{fmt(f.forecast_total ?? 0)}</div>
                    <div className="text-right font-bold" title={full(f.actual_total)}>{fmt(f.actual_total)}</div>
                    <div className="text-right font-bold" style={{ color: up ? "#1F7A5C" : "#B4573B" }} title={full(f.error_abs ?? 0)}>
                      {up ? "+" : "−"}{fmt(Math.abs(f.error_abs ?? 0))}
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-extrabold rounded-full px-2 py-[3px]" style={{ background: up ? "#DFF2E7" : "#F7E3DC", color: up ? "#1F7A5C" : "#B4573B" }}>
                        {up ? "+" : "−"}{Math.abs(f.error_pct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-[11px] text-muted mt-2">
            Dự phóng đóng băng lúc chốt mỗi tháng (từ snapshot tháng trước + kế hoạch lúc đó). <b className="text-[#1F7A5C]">Dương</b> = thực tế vượt kế hoạch.
          </div>
        </Panel>
      )}

      {/* ---- Bảng chi tiết các tháng đã chốt (giữ từ bản cũ) ---- */}
      <ClosedMonthsTable months={closedMonths} deltas={deltas} />
    </div>
  );
}

// ---------- Sub-components ----------

function Kpi({ icon, label, value, hint, positive }: { icon: string; label: string; value: string; hint: string; positive?: boolean }) {
  return (
    <div className="bg-card border border-card-border rounded-[16px] p-4" title={hint}>
      <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[17px]" style={{ background: positive ? "#DFF2E7" : "#EAF4EE", color: positive ? "#1F7A5C" : "#17554A" }}>
        <i className={icon} aria-hidden />
      </div>
      <div className="text-[22px] font-extrabold tracking-[-0.6px] mt-[12px] tnum" style={{ color: positive ? "#1F7A5C" : undefined }}>{value}</div>
      <div className="text-[12px] text-muted mt-[2px] font-medium">{label}</div>
    </div>
  );
}

function CompareTile({ label, cur, avg, higherIsGood, isPct }: { label: string; cur: number; avg: number; higherIsGood: boolean; isPct?: boolean }) {
  const diff = cur - avg;
  const relPct = avg !== 0 ? (diff / Math.abs(avg)) * 100 : 0;
  const good = higherIsGood ? diff >= 0 : diff <= 0;
  const bg = good ? "#DFF2E7" : "#F7E3DC";
  const fg = good ? "#1F7A5C" : "#B4573B";
  const showVal = (v: number) => (isPct ? pct(v, 0) : fmt(v));
  return (
    <div className="border border-[#EFEAE0] rounded-[14px] p-4">
      <div className="text-[11px] text-muted font-semibold">{label}</div>
      <div className="text-[20px] font-extrabold mt-[6px] tnum" title={isPct ? undefined : full(cur)}>{showVal(cur)}</div>
      <div className="flex items-center gap-2 mt-[8px]">
        <span className="text-[11px] font-extrabold rounded-full px-2 py-[2px]" style={{ background: bg, color: fg }}>
          {diff >= 0 ? "▲" : "▼"} {Math.abs(relPct).toFixed(0)}%
        </span>
        <span className="text-[11px] text-muted">TB {showVal(avg)}</span>
      </div>
    </div>
  );
}

function Panel({ icon, title, right, children }: { icon: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
            <i className={icon} aria-hidden />
          </div>
          <div className="text-[15px] font-bold">{title}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-[200px] flex items-center justify-center text-center text-[13px] text-faint px-4">{children}</div>;
}

const GRID = "96px 130px 110px 110px 110px 130px 110px 140px 96px 96px";

function ClosedMonthsTable({ months, deltas }: { months: ClosedMonth[]; deltas: NetworthDeltaRow[] }) {
  const residualByMonth = new Map(deltas.map((d) => [d.month_key, d.invest_and_reval]));
  const rows = months.map((m, i) => {
    const prev = months[i + 1];
    const momPct = prev && prev.total > 0 ? ((m.total - prev.total) / prev.total) * 100 : null;
    return { m, momPct, residual: residualByMonth.get(m.month_key) ?? null };
  });
  if (months.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-[18px] overflow-hidden">
      <div className="px-5 pt-[18px] pb-1 text-[15px] font-bold">Bảng các tháng đã chốt</div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 1140 }}>
          <div className="grid gap-2 items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]" style={{ gridTemplateColumns: GRID }}>
            <div>Tháng</div>
            <div className="text-right">Net worth</div>
            <div className="text-right">Cash</div>
            <div className="text-right">Gold</div>
            <div className="text-right">Stock</div>
            <div className="text-right">Deposits</div>
            <div className="text-right">Net tháng</div>
            <div className="text-right" title="Lãi đầu tư + định giá lại (phần dư)">Đầu tư &amp; ĐG</div>
            <div className="text-right">Tiết kiệm</div>
            <div className="text-right">MoM</div>
          </div>
          {rows.map(({ m, momPct, residual }) => {
            const up = (momPct ?? 0) >= 0;
            const rUp = (residual ?? 0) >= 0;
            return (
              <div key={m.month_key} className="grid gap-2 items-center px-5 py-[13px] border-t border-divider text-[13px] tnum hover:bg-[#FAF8F2]" style={{ gridTemplateColumns: GRID }} title={`Chốt as-of ${m.as_of_date ?? "?"}`}>
                <div className="font-bold text-ink-soft flex items-center gap-[6px]">
                  {m.month_key}
                  {m.is_reopened && <i className="ph-duotone ph-lock-key-open text-[#A5731F] text-[12px]" title="Đã mở lại" aria-hidden />}
                </div>
                <div className="text-right font-extrabold" title={full(m.total)}>{fmt(m.total)}</div>
                <div className="text-right" title={full(m.cash)}>{fmt(m.cash)}</div>
                <div className="text-right" title={full(m.gold)}>{fmt(m.gold)}</div>
                <div className="text-right" title={full(m.stock)}>{fmt(m.stock)}</div>
                <div className="text-right" title={full(m.deposits)}>{fmt(m.deposits)}</div>
                <div className="text-right font-bold" style={{ color: m.net >= 0 ? "#1F7A5C" : "#B4573B" }} title={full(m.net)}>
                  {m.net >= 0 ? "+" : "−"}{fmt(Math.abs(m.net))}
                </div>
                <div className="text-right" style={{ color: residual == null ? undefined : rUp ? "#1F7A5C" : "#B4573B" }} title={residual == null ? "—" : full(residual)}>
                  {residual == null ? <span className="text-faint">—</span> : `${rUp ? "+" : "−"}${fmt(Math.abs(residual))}`}
                </div>
                <div className="text-right text-muted">{pct(m.savings_rate, 0)}</div>
                <div className="text-right">
                  {momPct == null ? <span className="text-faint">—</span> : (
                    <span className="inline-flex items-center gap-[3px] text-[11px] font-extrabold rounded-full px-2 py-[3px]" style={{ background: up ? "#DFF2E7" : "#F7E3DC", color: up ? "#1F7A5C" : "#B4573B" }}>
                      {up ? "▲" : "▼"}{Math.abs(momPct).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
