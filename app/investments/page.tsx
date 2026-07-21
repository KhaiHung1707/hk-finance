import { AppShell } from "@/components/ui/AppShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { InvestmentsClient } from "@/components/investments/InvestmentsClient";
import { getDeposits, getStockPositions } from "@/lib/queries/investments";
import { getAccountsRef, getBaselineMonthKey, getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const monthKey = await getBaselineMonthKey();
  const [deposits, positions, accounts, profile] = await Promise.all([
    getDeposits(),
    getStockPositions(),
    getAccountsRef(),
    getProfile(),
  ]);

  const activeDeposits = deposits.filter((d) => d.status === "active");
  const depTotal = activeDeposits.reduce((s, d) => s + d.principal, 0);
  const depInterest = activeDeposits.reduce((s, d) => s + d.interest_full, 0);
  const stockValue = positions.reduce((s, p) => s + p.qty * p.last_price, 0);
  const stockCost = positions.reduce((s, p) => s + p.qty * p.avg_cost, 0);
  const stockPl = stockValue - stockCost;
  const plUp = stockPl >= 0;

  return (
    <AppShell
      activePath="/investments"
      eyebrow="Term deposits · stocks · every event lands in the ledger"
      title="Investments"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <MetricCard
          icon="ph-duotone ph-piggy-bank"
          value={<MoneyText value={depTotal} />}
          label="Deposits principal"
        />
        <MetricCard
          icon="ph-duotone ph-percent"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          value={<MoneyText value={depInterest} />}
          label="Interest at maturity"
        />
        <MetricCard
          icon="ph-duotone ph-chart-line-up"
          value={<MoneyText value={stockValue} />}
          label="Stock value"
        />
        <MetricCard
          icon={plUp ? "ph-duotone ph-trend-up" : "ph-duotone ph-trend-down"}
          iconBg={plUp ? "#DFF2E7" : "#F7E3DC"}
          iconFg={plUp ? "#1F7A5C" : "#B4573B"}
          value={
            <span style={{ color: plUp ? "#1F7A5C" : "#B4573B" }}>
              {plUp ? "+" : "−"}
              <MoneyText value={Math.abs(stockPl)} />
            </span>
          }
          label="Unrealized P&L"
        />
      </div>

      <InvestmentsClient monthKey={monthKey} deposits={deposits} positions={positions} accounts={accounts} />
    </AppShell>
  );
}
