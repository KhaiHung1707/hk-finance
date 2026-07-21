import { AppShell } from "@/components/ui/AppShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { UpworkClient } from "@/components/upwork/UpworkClient";
import { pct } from "@/lib/format";
import { getUpworkContracts, getUpworkDefaults } from "@/lib/queries/upwork";
import { getAccountsRef, getBaselineMonthKey, getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

const usd = (v: number) => "$" + new Intl.NumberFormat("en-US").format(Math.round(v));

export default async function UpworkPage() {
  const monthKey = await getBaselineMonthKey();
  const [contracts, defaults, accounts, profile] = await Promise.all([
    getUpworkContracts(),
    getUpworkDefaults(),
    getAccountsRef(),
    getProfile(),
  ]);

  // Pipeline USD = draft + active + billed (chưa nhận). Billed VND đang chờ.
  const pipelineUsd = contracts
    .filter((c) => ["draft", "active", "billed"].includes(c.status))
    .reduce((s, c) => s + (c.amount_usd ?? 0), 0);
  const netUsd = contracts
    .filter((c) => ["draft", "active", "billed"].includes(c.status))
    .reduce((s, c) => s + (c.net_usd ?? 0), 0);
  const feeUsd = pipelineUsd - netUsd;
  const pendingVnd = contracts
    .filter((c) => c.status === "billed")
    .reduce((s, c) => s + (c.amount_vnd ?? 0), 0);
  const receivedVnd = contracts
    .filter((c) => c.status === "received")
    .reduce((s, c) => s + (c.amount_vnd ?? 0), 0);

  return (
    <AppShell
      activePath="/upwork"
      eyebrow="Pipeline Draft → Active → Billed → Received"
      title="Upwork"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <MetricCard icon="ph-duotone ph-briefcase" value={usd(pipelineUsd)} label="Pipeline gross ($)" />
        <MetricCard
          icon="ph-duotone ph-scissors"
          iconBg="#F7E3DC"
          iconFg="#B4573B"
          value={usd(feeUsd)}
          label={`Upwork fee (${pct(defaults.feePct, 0)})`}
        />
        <MetricCard
          icon="ph-duotone ph-hand-coins"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          value={usd(netUsd)}
          label="Net after fee ($)"
        />
        <MetricCard
          icon="ph-duotone ph-hourglass-medium"
          iconBg="#FBF0DC"
          iconFg="#A5731F"
          value={<MoneyText value={pendingVnd} />}
          label="Billed pending (₫)"
        />
        <MetricCard
          icon="ph-duotone ph-currency-circle-dollar"
          value={<MoneyText value={receivedVnd} />}
          label="Received (₫)"
        />
      </div>

      <UpworkClient
        monthKey={monthKey}
        contracts={contracts}
        accounts={accounts}
        fxUsd={defaults.fxUsd}
        feePctDefault={defaults.feePct}
      />
    </AppShell>
  );
}
