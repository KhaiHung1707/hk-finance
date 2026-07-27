import { AppShell } from "@/components/ui/AppShell";
import { ContractsClient } from "@/components/projects/ContractsClient";
import { getContracts, getFxRates } from "@/lib/queries/projects";
import { getUpworkDefaults } from "@/lib/queries/upwork";
import { getAccountsRef, getIncomeSources, getBaselineMonthKey, getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const monthKey = await getBaselineMonthKey();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [contracts, fx, defaults, accounts, sources, profile] = await Promise.all([
    getContracts(),
    getFxRates(),
    getUpworkDefaults(),
    getAccountsRef(),
    getIncomeSources(),
    getProfile(),
  ]);

  return (
    <AppShell
      activePath="/projects"
      eyebrow="Hợp đồng & dự án — Structure · Upwork · Outsource, quy về VND"
      title="Projects"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <ContractsClient
        monthKey={monthKey}
        contracts={contracts}
        accounts={accounts}
        sources={sources}
        fx={fx}
        fxUsd={defaults.fxUsd}
        feePctDefault={defaults.feePct}
        todayIso={todayIso}
      />
    </AppShell>
  );
}
