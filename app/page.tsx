import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { Badge } from "@/components/ui/Badge";
import { NetWorthChart } from "@/components/forecast/NetWorthChart";
import { DashboardForecast } from "@/components/dashboard/DashboardForecast";
import { ReceivablesCard } from "@/components/dashboard/ReceivablesCard";
import { CloseMonthButton } from "@/components/dashboard/CloseMonthButton";
import { accountIcon } from "@/lib/design/tokens";
import { fmt, full, pct } from "@/lib/format";
import {
  getAccountBalances,
  getMonthlySummary,
  getReceivables,
  getNetWorth,
  getAllocation,
  getBaselineMonthKey,
  getProfile,
  getAccountsRef,
} from "@/lib/queries";
import { getForecastParams, getForecastStart, getForecastSnapshots } from "@/lib/queries/forecast";
import { getHouseGoal } from "@/lib/queries/settings";
import { runForecast } from "@/lib/forecast";

export const dynamic = "force-dynamic";

const ALLOC_META: Record<string, { label: string; color: string }> = {
  cash: { label: "Cash", color: "#17554A" },
  gold: { label: "Gold", color: "#8FBCA7" },
  stock: { label: "Stocks", color: "#DCD5C3" },
};

export default async function DashboardPage() {
  const monthKey = await getBaselineMonthKey();
  const [balances, summary, receivables, netWorth, allocation, profile, accountsRef, fcParams, fcStart, snapshots, houseGoal] =
    await Promise.all([
      getAccountBalances(),
      getMonthlySummary(monthKey),
      getReceivables(monthKey),
      getNetWorth(),
      getAllocation(),
      getProfile(),
      getAccountsRef(),
      getForecastParams(),
      getForecastStart(),
      getForecastSnapshots(),
      getHouseGoal(),
    ]);

  // Mini-forecast: base scenario, 12 tháng — cùng engine với trang Forecast.
  const fc = runForecast(fcParams, fcStart, "base", 12);
  const housePct =
    houseGoal.down_payment > 0 ? Math.min(100, Math.round((fcStart.total / houseGoal.down_payment) * 100)) : 0;
  // Ước tháng chạm mục tiêu (nếu chưa đạt trong 12 tháng thì mở rộng bằng tăng trưởng tháng cuối).
  let goalMonth: string | null = null;
  if (houseGoal.down_payment > 0) {
    const hit = fc.months.find((m) => m.netWorth >= houseGoal.down_payment);
    goalMonth = hit ? hit.monthKey : fc.months.length ? `sau ${fc.monthKeys[fc.monthKeys.length - 1]}` : null;
  }
  const receivedT = summary?.received ?? 0;
  const pendingT = summary?.pending ?? 0;
  const expenseT = summary?.expense ?? 0;
  const totalAccounts = balances.reduce((s, a) => s + a.balance, 0);

  return (
    <AppShell
      activePath="/"
      eyebrow="Good morning,"
      title={profile.name || "Dashboard"}
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={96}
      pullUp={64}
    >
      <CloseMonthButton monthKey={monthKey} closed={false} />

      {/* Stat cards */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))" }}>
        <StatCard
          icon="ph-duotone ph-wallet"
          value={<MoneyText value={netWorth.total} hint={`${full(netWorth.total)} · tổng tài sản`} />}
          label="Net worth"
        />
        <StatCard
          icon="ph-duotone ph-arrow-circle-down"
          value={<MoneyText value={receivedT} hint={`${full(receivedT)} đã thu tháng này`} />}
          label="Received this month"
        />
        <StatCard
          icon="ph-duotone ph-hourglass-medium"
          iconBg="#FBF0DC"
          iconFg="#A5731F"
          delta={{ text: `${receivables.length} items`, bg: "#FBF0DC", fg: "#A5731F" }}
          value={<MoneyText value={pendingT} hint={`${full(pendingT)} · ${receivables.length} khoản chờ thu`} />}
          label="Pending"
        />
        <StatCard
          icon="ph-duotone ph-arrow-circle-up"
          iconBg="#F7E3DC"
          iconFg="#B4573B"
          value={<MoneyText value={expenseT} hint={`${full(expenseT)} chi tháng này`} />}
          label="Spent this month"
        />
        <Link
          href="/ledger"
          className="bg-card rounded-[18px] p-5 flex flex-col justify-between gap-3 cursor-pointer"
          style={{ border: "1px dashed #B9AF97" }}
        >
          <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-[20px]">
            <i className="ph-duotone ph-plus" aria-hidden />
          </div>
          <div>
            <div className="text-[14px] font-bold text-ink">Add entry</div>
            <div className="text-[11px] text-muted mt-[2px]">Income · Expense · Transfer</div>
          </div>
        </Link>
      </div>

      {/* Row 1: Receivables · Accounts · Allocation */}
      <div className="grid gap-[14px] items-stretch" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <ReceivablesCard items={receivables} total={pendingT} accounts={accountsRef} />

        {/* Account balances */}
        <div className="bg-card border border-card-border rounded-[18px] p-[22px] flex flex-col">
          <div className="flex justify-between items-baseline">
            <div className="text-[15px] font-bold">Account balances</div>
            <Link href="/assets" className="text-[12px] font-semibold text-primary flex items-center gap-1">
              Manage<i className="ph-duotone ph-arrow-right text-[12px]" aria-hidden />
            </Link>
          </div>
          <div className="flex items-baseline gap-2 mt-1 mb-[6px]">
            <span className="text-[23px] font-extrabold tracking-[-0.5px] tnum" title={full(totalAccounts)}>
              {fmt(totalAccounts)}
            </span>
            <span className="text-[12px] text-muted">across {balances.length} accounts</span>
          </div>
          <div className="flex flex-col">
            {balances.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-[10px] border-b border-divider last:border-0">
                <div className="w-[34px] h-[34px] rounded-[10px] bg-chip text-primary flex items-center justify-center text-[16px]">
                  <i className={accountIcon[a.type] ?? accountIcon.other} aria-hidden />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{a.name}</div>
                  <div className="text-[11px] text-muted capitalize">{a.type}</div>
                </div>
                <div
                  className="text-[13px] font-bold tnum"
                  style={{ color: a.balance === 0 ? "#9AA49E" : undefined }}
                  title={full(a.balance)}
                >
                  {new Intl.NumberFormat("en-US").format(a.balance)} ₫
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Allocation */}
        <div className="bg-card border border-card-border rounded-[18px] p-[22px] flex flex-col">
          <div className="flex justify-between items-baseline">
            <div className="text-[15px] font-bold">Asset allocation</div>
            <Link href="/assets" className="text-[12px] font-semibold text-primary flex items-center gap-1">
              Assets<i className="ph-duotone ph-arrow-right text-[12px]" aria-hidden />
            </Link>
          </div>
          <div className="flex items-baseline gap-2 mt-1 mb-[14px]">
            <span className="text-[23px] font-extrabold tracking-[-0.5px] tnum" title={full(netWorth.total)}>
              {fmt(netWorth.total)}
            </span>
            <span className="text-[12px] text-muted">total assets</span>
          </div>
          {/* Bar */}
          <div className="flex gap-[3px] h-3 mb-5">
            {allocation.map((a) => {
              const share = netWorth.total > 0 ? (a.value / netWorth.total) * 100 : 0;
              return (
                <div
                  key={a.grp}
                  style={{ flex: Math.max(share, 0.5), background: ALLOC_META[a.grp].color }}
                  className="rounded-[3px]"
                />
              );
            })}
          </div>
          <div className="flex flex-col">
            {allocation.map((a) => {
              const share = netWorth.total > 0 ? a.value / netWorth.total : 0;
              const off = share - a.target;
              const chipBg = Math.abs(off) > 0.05 ? "#FBF0DC" : "#DFF2E7";
              const chipFg = Math.abs(off) > 0.05 ? "#A5731F" : "#1F7A5C";
              return (
                <div key={a.grp} className="flex items-center gap-[10px] py-[11px] border-b border-divider last:border-0">
                  <div className="w-[10px] h-[10px] rounded-[3px]" style={{ background: ALLOC_META[a.grp].color }} />
                  <div className="flex-1 text-[13px] font-semibold">{ALLOC_META[a.grp].label}</div>
                  <Badge bg={chipBg} fg={chipFg}>
                    {pct(share, 0)} · target {pct(a.target, 0)}
                  </Badge>
                  <div
                    className="text-[13px] font-bold tnum w-[72px] text-right"
                    style={{ color: a.value === 0 ? "#9AA49E" : undefined }}
                    title={full(a.value)}
                  >
                    {fmt(a.value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: This month summary */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))" }}>
        <div className="bg-card border border-card-border rounded-[18px] p-[22px] flex flex-col gap-[18px]">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[15px] font-bold">This month — {monthKey}</div>
              <div className="flex items-baseline gap-[10px] mt-[2px]">
                <div className="text-[36px] font-extrabold tracking-[-1.2px] tnum" title={full(summary?.net ?? 0)}>
                  {pct(summary?.savings_rate ?? 0)}
                </div>
                <div className="text-[13px] text-muted">
                  savings rate · net{" "}
                  <b style={{ color: (summary?.net ?? 0) >= 0 ? "#1F7A5C" : "#B4573B" }}>
                    {(summary?.net ?? 0) >= 0 ? "+" : ""}
                    {fmt(summary?.net ?? 0)}
                  </b>
                </div>
              </div>
            </div>
            <Link href="/ledger" className="text-[12px] font-semibold text-primary flex items-center gap-1">
              Ledger<i className="ph-duotone ph-arrow-right text-[12px]" aria-hidden />
            </Link>
          </div>
          <div className="grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))" }}>
            <MonthTile label="Recognized" value={summary?.recognized ?? 0} />
            <MonthTile label="Received" value={receivedT} color="#1F7A5C" />
            <MonthTile label="Pending" value={pendingT} color="#A5731F" />
            <MonthTile label="Expenses" value={expenseT} color="#B4573B" />
          </div>
        </div>

        {/* Mini-forecast (base, 12mo) + house goal */}
        <div className="bg-card border border-card-border rounded-[18px] p-[22px] flex flex-col">
          <div className="flex justify-between items-start">
            <div className="text-[15px] font-bold">12-month forecast</div>
            <Link href="/forecast" className="text-[12px] font-semibold text-primary flex items-center gap-1">
              <Badge bg="#EAF4EE" fg="#17554A">Base</Badge>
            </Link>
          </div>
          <div className="flex items-baseline gap-2 mt-1 mb-3">
            <span className="text-[23px] font-extrabold tracking-[-0.5px] tnum" title={full(fc.endTotal)}>
              {fmt(fc.endTotal)}
            </span>
            <span className="text-[12px] text-muted">in 12 months · +{fc.totalGrowthPct.toFixed(1)}%</span>
          </div>
          <NetWorthChart
            nwSeries={fc.nwSeries}
            monthKeys={fc.monthKeys}
            horizon={12}
            goalTarget={fc.goalTarget}
            goalReachedAt={fc.goalReachedAt}
            receivablesFirstMonth={fcStart.receivablesFirstMonth}
            receivablesLandFirstMonth={fcParams.receivablesLandFirstMonth}
            snapshots={snapshots}
            aspect={2.4}
            minHeight={140}
            maxHeight={210}
          />
          {houseGoal.down_payment > 0 && (
            <div className="mt-auto border-t border-divider pt-4">
              <div className="flex justify-between text-[12px] text-ink-soft mb-[9px]">
                <span className="flex items-center gap-[6px] font-bold">
                  <i className="ph-duotone ph-house-line" style={{ color: "#17554A" }} aria-hidden />
                  House — {fmt(houseGoal.down_payment)} down payment
                </span>
                <span className="font-extrabold">{housePct}%</span>
              </div>
              <div className="h-[9px] rounded-full bg-[#EFEAE0] overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${housePct}%` }} />
              </div>
              {goalMonth && (
                <div className="text-[12px] text-muted mt-[9px]">
                  Dự kiến chạm mục tiêu ~ <b className="text-ink">{goalMonth}</b>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Forecast island — Horizon/Scenario · KPI · Revenue · Asset-class growth */}
      <DashboardForecast params={fcParams} start={fcStart} />
    </AppShell>
  );
}

function MonthTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-fill-soft rounded-[14px] p-[14px]">
      <div className="text-[11px] text-muted font-semibold">{label}</div>
      <div className="text-[19px] font-extrabold mt-[5px] tnum" style={{ color }} title={full(value)}>
        {fmt(value)}
      </div>
    </div>
  );
}
