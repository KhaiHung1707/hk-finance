import { AppShell } from "@/components/ui/AppShell";
import { LedgerAccountClient } from "@/components/ledger/LedgerAccountClient";
import {
  getLedgerRows,
  getMonthlySummary,
  getIncomeSources,
  getExpenseCategories,
  getAccountsRef,
  getAccountBalances,
  getNetWorth,
  getBaselineMonthKey,
  getMonthKeys,
  getMonthCloseStatus,
  getProfile,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const [baseline, allMonths] = await Promise.all([getBaselineMonthKey(), getMonthKeys()]);
  const monthKey = sp.month && allMonths.includes(sp.month) ? sp.month : baseline;
  const initialTab = sp.tab === "accounts" ? "accounts" : "ledger";

  const [rows, summary, sources, categories, accountsRef, accountBalances, nw, closeStatus, profile] =
    await Promise.all([
      getLedgerRows(monthKey),
      getMonthlySummary(monthKey),
      getIncomeSources(),
      getExpenseCategories(),
      getAccountsRef(),
      getAccountBalances(),
      getNetWorth(),
      getMonthCloseStatus(monthKey),
      getProfile(),
    ]);

  const accTotal = accountBalances.reduce((s, a) => s + a.balance, 0);

  return (
    <AppShell
      activePath="/ledger"
      eyebrow="Sổ giao dịch · tài khoản — nhập nhanh mọi loại"
      title="Ledger / Account"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      <LedgerAccountClient
        initialTab={initialTab}
        monthKey={monthKey}
        months={allMonths}
        closed={closeStatus.closed}
        rows={rows}
        summary={summary}
        sources={sources}
        categories={categories}
        accounts={accountsRef}
        accountBalances={accountBalances}
        accTotal={accTotal}
        gold={nw.gold}
        stock={nw.stock}
        deposits={nw.deposits}
        netWorth={nw.total}
      />
    </AppShell>
  );
}
