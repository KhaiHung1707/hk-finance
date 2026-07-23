import { AppShell } from "@/components/ui/AppShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { InvestClient } from "@/components/investments/InvestClient";
import { getDeposits, getStockPositions, getStockHistory } from "@/lib/queries/investments";
import { getAccountsRef, getBaselineMonthKey, getProfile, getAllocation, getNetWorth } from "@/lib/queries";
import { getGoldLots, getGoldSummary, getGoldPrice } from "@/lib/queries/assets";
import { getDepositEarlyRate } from "@/lib/queries/settings";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const monthKey = await getBaselineMonthKey();
  const [deposits, positions, history, accounts, earlyRate, goldLots, goldSummary, goldPrice, allocation, netWorth, profile] =
    await Promise.all([
      getDeposits(),
      getStockPositions(),
      getStockHistory(),
      getAccountsRef(),
      getDepositEarlyRate(),
      getGoldLots(),
      getGoldSummary(),
      getGoldPrice(),
      getAllocation(),
      getNetWorth(),
      getProfile(),
    ]);
  const allocationTotal = netWorth.total;

  const activeDeposits = deposits.filter((d) => d.status === "active");
  const depTotal = activeDeposits.reduce((s, d) => s + d.principal, 0);
  const depInterestMaturity = activeDeposits.reduce((s, d) => s + d.interest_full, 0);
  const depAccrued = activeDeposits.reduce((s, d) => s + d.interest_accrued, 0);

  const hasStock = positions.length > 0;
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
        {/* G3: accrued (primary) + maturity (secondary) */}
        <MetricCard
          icon="ph-duotone ph-percent"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          value={activeDeposits.length ? <MoneyText value={depAccrued} /> : <>—</>}
          label="Lãi tích luỹ đến nay"
          sub={activeDeposits.length ? <>Đáo hạn: <MoneyText value={depInterestMaturity} /></> : "Chưa có sổ active"}
        />
        {/* G1: empty → "—", không phải 0đ */}
        <MetricCard
          icon="ph-duotone ph-chart-line-up"
          value={hasStock ? <MoneyText value={stockValue} /> : <>—</>}
          label="Stock value"
        />
        <MetricCard
          icon={plUp ? "ph-duotone ph-trend-up" : "ph-duotone ph-trend-down"}
          iconBg={hasStock ? (plUp ? "#DFF2E7" : "#F7E3DC") : "#EAF4EE"}
          iconFg={hasStock ? (plUp ? "#1F7A5C" : "#B4573B") : "#17554A"}
          value={
            hasStock ? (
              <span style={{ color: plUp ? "#1F7A5C" : "#B4573B" }}>
                {plUp ? "+" : "−"}
                <MoneyText value={Math.abs(stockPl)} />
              </span>
            ) : (
              <>—</>
            )
          }
          label="Unrealized P&L"
        />
      </div>

      <InvestClient
        monthKey={monthKey}
        deposits={deposits}
        positions={positions}
        history={history}
        accounts={accounts}
        earlyRate={earlyRate}
        goldLots={goldLots}
        goldSummary={goldSummary}
        goldSuggestedPrice={goldPrice.price}
        allocation={allocation}
        allocationTotal={allocationTotal}
      />
    </AppShell>
  );
}
