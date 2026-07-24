import { AppShell } from "@/components/ui/AppShell";
import { ProjectUpworkClient } from "@/components/projects/ProjectUpworkClient";
import { getProjects, getFxRates } from "@/lib/queries/projects";
import { getUpworkContracts, getUpworkDefaults } from "@/lib/queries/upwork";
import { getAccountsRef, getIncomeSources, getBaselineMonthKey, getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const monthKey = await getBaselineMonthKey();
  const [projects, fx, contracts, defaults, accounts, sources, profile] = await Promise.all([
    getProjects(),
    getFxRates(),
    getUpworkContracts(),
    getUpworkDefaults(),
    getAccountsRef(),
    getIncomeSources(),
    getProfile(),
  ]);

  return (
    <AppShell
      activePath="/projects"
      eyebrow="Dự án & Upwork — billed CAD/USD/VND, quy về VND"
      title="Projects / Upwork"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <ProjectUpworkClient
        initialTab={sp.tab === "upwork" ? "upwork" : "projects"}
        monthKey={monthKey}
        projects={projects}
        contracts={contracts}
        accounts={accounts}
        sources={sources}
        fx={fx}
        fxUsd={defaults.fxUsd}
        feePctDefault={defaults.feePct}
      />
    </AppShell>
  );
}
