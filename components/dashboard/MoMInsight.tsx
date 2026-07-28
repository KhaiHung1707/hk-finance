import Link from "next/link";
import { fmt, full } from "@/lib/format";
import { groupColor } from "@/lib/design/tokens";
import { WaterfallChart, type WaterfallStep } from "@/components/ui/WaterfallChart";
import type { NetworthDeltaRow } from "@/lib/queries";

const GROUP_LABEL: Record<string, string> = { cash: "Cash", gold: "Gold", stock: "Stocks", deposits: "Deposits" };

/**
 * Card "Vì sao net worth tăng/giảm" — chỉ hiện khi có ≥2 tháng đã chốt (delta.opening != null).
 * Phân rã ΔTotal theo 2 trục (đẳng thức đóng từ v_networth_deltas):
 *   ΔTotal = (income_received − expense) + invest_and_reval  [dòng tiền]
 *          = d_cash + d_gold + d_stock + d_deposits          [nhóm tài sản]
 * TRUNG THỰC: invest_and_reval là RESIDUAL (gồm định giá lại vàng/CP) → nhãn
 * "Đầu tư & định giá lại", KHÔNG gọi "lãi đầu tư".
 */
export function MoMInsight({ delta }: { delta: NetworthDeltaRow }) {
  const opening = delta.opening ?? 0;
  const total = delta.total;
  const deltaTotal = total - opening;
  const momPct = opening > 0 ? (deltaTotal / opening) * 100 : 0;
  const netSaving = delta.income_received - delta.expense;
  const invReval = delta.invest_and_reval ?? 0;
  const up = deltaTotal >= 0;

  // nhóm tác động mạnh nhất
  const groups = [
    { key: "cash", v: delta.d_cash ?? 0 },
    { key: "gold", v: delta.d_gold ?? 0 },
    { key: "stock", v: delta.d_stock ?? 0 },
    { key: "deposits", v: delta.d_deposits ?? 0 },
  ].sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const topGroup = groups[0];

  // câu insight "vì sao"
  const insight = buildInsight({ deltaTotal, momPct, netSaving, invReval, topGroup });

  const wfSteps: WaterfallStep[] = [
    { label: "Đầu kỳ", value: opening, kind: "total" },
    { label: "Thu", value: delta.income_received, kind: "delta" },
    { label: "Chi", value: -delta.expense, kind: "delta" },
    { label: "Đầu tư & định giá", value: invReval, kind: "delta" },
    { label: "Cuối kỳ", value: total, kind: "total" },
  ];

  return (
    <div className="bg-card border border-card-border rounded-[18px] p-[22px] flex flex-col">
      <div className="flex justify-between items-start mb-1">
        <div className="text-[15px] font-bold">Vì sao net worth {up ? "tăng" : "giảm"}</div>
        <Link href="/history" className="text-[12px] font-semibold text-primary flex items-center gap-1">
          Chi tiết<i className="ph-duotone ph-arrow-right text-[12px]" aria-hidden />
        </Link>
      </div>

      {/* Chip %MoM + delta */}
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="inline-flex items-center gap-[5px] text-[15px] font-extrabold rounded-full px-[12px] py-[4px]"
          style={{ background: up ? "#DFF2E7" : "#F7E3DC", color: up ? "#1F7A5C" : "#B4573B" }}
        >
          <i className={`ph-fill ${up ? "ph-caret-up" : "ph-caret-down"}`} aria-hidden />
          {up ? "+" : ""}{momPct.toFixed(1)}%
        </span>
        <span className="text-[13px] font-bold tnum" style={{ color: up ? "#1F7A5C" : "#B4573B" }} title={full(deltaTotal)}>
          {up ? "+" : "−"}{fmt(Math.abs(deltaTotal))}
        </span>
        <span className="text-[12px] text-muted">so {delta.month_key}</span>
      </div>

      {/* Câu insight */}
      <div className="text-[13px] text-ink-soft leading-[1.5] mb-3">{insight}</div>

      {/* Waterfall dòng tiền */}
      <WaterfallChart steps={wfSteps} height={150} />

      {/* Chip Δ theo nhóm */}
      <div className="flex flex-wrap gap-2 mt-3">
        {groups.filter((g) => g.v !== 0).map((g) => (
          <span key={g.key} className="inline-flex items-center gap-[5px] text-[11px] font-semibold rounded-full px-[9px] py-[3px] bg-fill-soft" title={full(g.v)}>
            <span className="w-[9px] h-[9px] rounded-[2px]" style={{ background: groupColor[g.key] }} />
            {GROUP_LABEL[g.key]} <b style={{ color: g.v >= 0 ? "#1F7A5C" : "#B4573B" }}>{g.v >= 0 ? "+" : "−"}{fmt(Math.abs(g.v))}</b>
          </span>
        ))}
      </div>
      <div className="text-[11px] text-muted mt-2">
        “Đầu tư &amp; định giá” = phần dư (lãi/lỗ + định giá lại vàng/CP + lệch thời điểm), không phải lãi thuần.
      </div>
    </div>
  );
}

function buildInsight({
  deltaTotal, momPct, netSaving, invReval, topGroup,
}: {
  deltaTotal: number; momPct: number; netSaving: number; invReval: number;
  topGroup: { key: string; v: number };
}): string {
  if (Math.abs(momPct) < 0.5) return "Net worth gần như đi ngang so tháng chốt trước.";

  const larger = Math.abs(netSaving) >= Math.abs(invReval) ? "saving" : "invreval";
  const dominance = Math.abs(deltaTotal) > 0 ? Math.max(Math.abs(netSaving), Math.abs(invReval)) / Math.abs(deltaTotal) : 1;
  const groupTxt = topGroup.v !== 0 ? ` Tập trung ở ${GROUP_LABEL[topGroup.key]} (${topGroup.v >= 0 ? "+" : "−"}${fmt(Math.abs(topGroup.v))}).` : "";

  // 2 nguyên nhân gần nhau → nêu cả hai
  if (dominance < 0.6) {
    return `Do cả tiết kiệm ròng (${netSaving >= 0 ? "+" : "−"}${fmt(Math.abs(netSaving))}) và đầu tư & định giá lại (${invReval >= 0 ? "+" : "−"}${fmt(Math.abs(invReval))}).${groupTxt}`;
  }
  if (larger === "saving") {
    return netSaving >= 0
      ? `Chủ yếu nhờ tiết kiệm ròng +${fmt(netSaving)} (thu nhiều hơn chi).${groupTxt}`
      : `Chủ yếu do chi vượt thu ${fmt(Math.abs(netSaving))} trong kỳ.${groupTxt}`;
  }
  return `Chủ yếu do đầu tư & định giá lại ${invReval >= 0 ? "tăng +" : "giảm −"}${fmt(Math.abs(invReval))} (biến động giá tài sản).${groupTxt}`;
}
