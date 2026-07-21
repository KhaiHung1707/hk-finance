import { AppShell } from "@/components/ui/AppShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { In3dClient } from "@/components/in3d/In3dClient";
import { fmt, full, pct } from "@/lib/format";
import { getFilamentStock, getPrintOrders, getIn3dSummary } from "@/lib/queries/in3d";
import { getAccountsRef, getBaselineMonthKey, getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function In3dPage() {
  const monthKey = await getBaselineMonthKey();
  const [filaments, orders, summary, accounts, profile] = await Promise.all([
    getFilamentStock(),
    getPrintOrders(),
    getIn3dSummary(monthKey),
    getAccountsRef(),
    getProfile(),
  ]);

  const totalStockKg = filaments.reduce((s, f) => s + f.remaining_kg, 0);
  const totalStockValue = filaments.reduce((s, f) => s + f.stock_value, 0);
  const lowStockCount = filaments.filter((f) => f.low_stock).length;

  return (
    <AppShell
      activePath="/in3d"
      eyebrow="Filament inventory · print orders · margins"
      title="In3D — Ecommerce"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <MetricCard icon="ph-duotone ph-package" value={`${totalStockKg.toFixed(2)} kg`} label="Filament in stock" />
        <MetricCard
          icon="ph-duotone ph-stack"
          value={<MoneyText value={totalStockValue} />}
          label="Stock value"
        />
        <MetricCard
          icon="ph-duotone ph-trend-up"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          value={<MoneyText value={summary?.revenue ?? 0} />}
          label={`Revenue — ${monthKey}`}
        />
        <MetricCard
          icon="ph-duotone ph-percent"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          value={pct(summary?.margin ?? 0)}
          label={`Gross margin — ${monthKey}`}
        />
        <MetricCard
          icon="ph-duotone ph-warning-circle"
          iconBg="#FBF0DC"
          iconFg="#A5731F"
          value={`${lowStockCount} spool`}
          label="Low stock (< 0.3 kg)"
        />
      </div>

      <In3dClient monthKey={monthKey} filaments={filaments} orders={orders} accounts={accounts} />
    </AppShell>
  );
}
