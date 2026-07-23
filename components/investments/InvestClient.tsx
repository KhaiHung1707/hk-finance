"use client";
import { useState } from "react";
import { InvestmentsClient } from "@/components/investments/InvestmentsClient";
import { AllocationView } from "@/components/investments/AllocationView";
import type { DepositPosition, StockPosition, StockHistoryRow } from "@/lib/queries/investments";
import type { GoldLot, GoldSummary } from "@/lib/queries/assets";
import type { AllocationRow, Ref } from "@/lib/queries";

/**
 * Trang Invest gộp: 2 tab ngoài — "Danh mục" (Deposits/Stocks/Gold) và "Phân bổ"
 * (allocation vs target + rebalance, đẩy từ Assets sang).
 */
export function InvestClient({
  monthKey,
  deposits,
  positions,
  history,
  accounts,
  earlyRate,
  goldLots,
  goldSummary,
  goldSuggestedPrice,
  allocation,
  allocationTotal,
}: {
  monthKey: string;
  deposits: DepositPosition[];
  positions: StockPosition[];
  history: Record<string, StockHistoryRow[]>;
  accounts: Ref[];
  earlyRate: number;
  goldLots: GoldLot[];
  goldSummary: GoldSummary;
  goldSuggestedPrice: number;
  allocation: AllocationRow[];
  allocationTotal: number;
}) {
  const [view, setView] = useState<"portfolio" | "allocation">("portfolio");

  const tabBtn = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-5 py-[10px] text-[13px] font-bold cursor-pointer border-0 ${
      active ? "bg-primary text-white" : "bg-white text-ink-soft"
    }`;

  return (
    <>
      <div className="flex gap-[6px]" role="tablist">
        <button role="tab" aria-selected={view === "portfolio"} onClick={() => setView("portfolio")} className={tabBtn(view === "portfolio")}>
          <i className="ph-duotone ph-chart-line-up" aria-hidden />
          Danh mục
        </button>
        <button role="tab" aria-selected={view === "allocation"} onClick={() => setView("allocation")} className={tabBtn(view === "allocation")}>
          <i className="ph-duotone ph-chart-donut" aria-hidden />
          Phân bổ
        </button>
      </div>

      {view === "portfolio" ? (
        <InvestmentsClient
          monthKey={monthKey}
          deposits={deposits}
          positions={positions}
          history={history}
          accounts={accounts}
          earlyRate={earlyRate}
          goldLots={goldLots}
          goldSummary={goldSummary}
          goldSuggestedPrice={goldSuggestedPrice}
        />
      ) : (
        <AllocationView allocation={allocation} total={allocationTotal} />
      )}
    </>
  );
}
