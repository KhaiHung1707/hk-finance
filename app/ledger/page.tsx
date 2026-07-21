import { AppShell } from "@/components/ui/AppShell";
import { LedgerClient } from "@/components/ledger/LedgerClient";
import {
  getLedgerRows,
  getMonthlySummary,
  getIncomeSources,
  getExpenseCategories,
  getAccountsRef,
  getBaselineMonthKey,
  getProfile,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const monthKey = await getBaselineMonthKey();
  const [rows, summary, sources, categories, accounts, profile] = await Promise.all([
    getLedgerRows(monthKey),
    getMonthlySummary(monthKey),
    getIncomeSources(),
    getExpenseCategories(),
    getAccountsRef(),
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
        rows={rows}
        summary={summary}
        sources={sources}
        categories={categories}
        accounts={accounts}
      />
    </AppShell>
  );
}
