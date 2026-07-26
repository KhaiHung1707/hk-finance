import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { ContractDetailClient } from "@/components/projects/ContractDetailClient";
import { getContract, getFxRates } from "@/lib/queries/projects";
import { getUpworkDefaults } from "@/lib/queries/upwork";
import { getAccountsRef, getIncomeSources, getBaselineMonthKey, getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contract, fx, defaults, accounts, sources, monthKey, profile] = await Promise.all([
    getContract(id),
    getFxRates(),
    getUpworkDefaults(),
    getAccountsRef(),
    getIncomeSources(),
    getBaselineMonthKey(),
    getProfile(),
  ]);
  if (!contract) notFound();

  return (
    <AppShell
      activePath="/projects"
      eyebrow={`${contract.client} · hợp đồng`}
      title={contract.name || contract.client}
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <ContractDetailClient
        contract={contract}
        monthKey={monthKey}
        accounts={accounts}
        sources={sources}
        fx={fx}
        fxUsd={defaults.fxUsd}
        feePctDefault={defaults.feePct}
      />
    </AppShell>
  );
}
