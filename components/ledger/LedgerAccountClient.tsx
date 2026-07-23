"use client";
import { useState } from "react";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { LedgerClient } from "@/components/ledger/LedgerClient";
import { AccountsClient } from "@/components/accounts/AccountsClient";
import { QuickAddModal } from "@/components/ledger/QuickAddModal";
import type { LedgerRow, MonthlySummary, Ref, AccountBalance } from "@/lib/queries";

/**
 * Trang gộp Ledger + Tài khoản: 2 tab (Giao dịch | Tài khoản) + nút "Thêm" mở
 * quick-add thống nhất (Thu/Chi/Chuyển/Điều chỉnh). Không phải switch trang.
 */
export function LedgerAccountClient({
  initialTab = "ledger",
  monthKey,
  months,
  closed,
  rows,
  summary,
  sources,
  categories,
  accounts,
  accountBalances,
  accTotal,
  gold,
  stock,
  deposits,
  netWorth,
}: {
  initialTab?: "ledger" | "accounts";
  monthKey: string;
  months: string[];
  closed: boolean;
  rows: LedgerRow[];
  summary: MonthlySummary | null;
  sources: Ref[];
  categories: Ref[];
  accounts: Ref[];
  accountBalances: AccountBalance[];
  accTotal: number;
  gold: number;
  stock: number;
  deposits: number;
  netWorth: number;
}) {
  const [tab, setTab] = useState<"ledger" | "accounts">(initialTab);
  const [quickAdd, setQuickAdd] = useState(false);

  const balancesMap: Record<string, number> = {};
  for (const a of accountBalances) balancesMap[a.id] = a.balance;

  const tabBtn = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-5 py-[10px] text-[13px] font-bold cursor-pointer border-0 ${
      active ? "bg-primary text-white" : "bg-white text-ink-soft"
    }`;

  return (
    <>
      <HeaderPortal>
        <button
          onClick={() => setQuickAdd(true)}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          Thêm
        </button>
      </HeaderPortal>

      {/* Tab switch */}
      <div className="flex gap-[6px]" role="tablist">
        <button role="tab" aria-selected={tab === "ledger"} onClick={() => setTab("ledger")} className={tabBtn(tab === "ledger")}>
          <i className="ph-duotone ph-notebook" aria-hidden />
          Giao dịch
        </button>
        <button role="tab" aria-selected={tab === "accounts"} onClick={() => setTab("accounts")} className={tabBtn(tab === "accounts")}>
          <i className="ph-duotone ph-wallet" aria-hidden />
          Tài khoản
        </button>
      </div>

      {tab === "ledger" ? (
        <LedgerClient
          monthKey={monthKey}
          months={months}
          closed={closed}
          rows={rows}
          summary={summary}
          sources={sources}
          categories={categories}
          accounts={accounts}
          hideOwnAddButton
        />
      ) : (
        <AccountsClient
          accounts={accountBalances}
          monthKey={monthKey}
          total={accTotal}
          gold={gold}
          stock={stock}
          deposits={deposits}
          netWorth={netWorth}
        />
      )}

      <QuickAddModal
        open={quickAdd}
        initialKind={tab === "accounts" ? "adjust" : "income"}
        onClose={() => setQuickAdd(false)}
        monthKey={monthKey}
        sources={sources}
        categories={categories}
        accounts={accounts}
        balances={balancesMap}
      />
    </>
  );
}
