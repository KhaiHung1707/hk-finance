import { AppShell } from "@/components/ui/AppShell";
import { LedgerClient } from "@/components/ledger/LedgerClient";
import {
  getLedgerRows,
  getMonthlySummary,
  getIncomeSources,
  getExpenseCategories,
  getAccountsRef,
  getBaselineMonthKey,
  getMonthKeys,
  getMonthCloseStatus,
  getProfile,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const [baseline, allMonths] = await Promise.all([getBaselineMonthKey(), getMonthKeys()]);
  // tháng đang xem: URL param nếu hợp lệ, ngược lại baseline.
  const monthKey = sp.month && allMonths.includes(sp.month) ? sp.month : baseline;

  const [rows, summary, sources, categories, accounts, closeStatus, profile] = await Promise.all([
    getLedgerRows(monthKey),
    getMonthlySummary(monthKey),
    getIncomeSources(),
    getExpenseCategories(),
    getAccountsRef(),
    getMonthCloseStatus(monthKey),
    getProfile(),
  ]);

  return (
    <AppShell
      activePath="/ledger"
      eyebrow="Single ledger — every money movement"
      title="Ledger"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      <LedgerClient
        monthKey={monthKey}
        months={allMonths}
        closed={closeStatus.closed}
        rows={rows}
        summary={summary}
        sources={sources}
        categories={categories}
        accounts={accounts}
      />
    </AppShell>
  );
}
