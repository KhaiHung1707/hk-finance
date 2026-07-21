import { AppShell } from "@/components/ui/AppShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { getProjects, getFxRates } from "@/lib/queries/projects";
import { getAccountsRef, getBaselineMonthKey, getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const monthKey = await getBaselineMonthKey();
  const [projects, fx, accounts, profile] = await Promise.all([
    getProjects(),
    getFxRates(),
    getAccountsRef(),
    getProfile(),
  ]);

  const active = projects.filter((p) => p.status === "active").length;
  const contractTotal = projects.reduce((s, p) => s + p.contract_value_vnd, 0);
  const collected = projects.reduce((s, p) => s + p.collected_vnd, 0);
  const outstanding = projects.reduce((s, p) => s + p.outstanding_vnd, 0);

  return (
    <AppShell
      activePath="/projects"
      eyebrow="Structure & Outsource · billed in CAD/VND, normalized to VND"
      title="Projects"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <MetricCard icon="ph-duotone ph-briefcase" value={String(active)} label="Active projects" />
        <MetricCard
          icon="ph-duotone ph-file-text"
          value={<MoneyText value={contractTotal} />}
          label="Contract value"
        />
        <MetricCard
          icon="ph-duotone ph-check-circle"
          iconBg="#DFF2E7"
          iconFg="#1F7A5C"
          value={<MoneyText value={collected} />}
          label="Collected"
        />
        <MetricCard
          icon="ph-duotone ph-hourglass-medium"
          iconBg="#FBF0DC"
          iconFg="#A5731F"
          value={<MoneyText value={outstanding} />}
          label="Outstanding"
        />
      </div>

      <ProjectsClient monthKey={monthKey} projects={projects} accounts={accounts} fx={fx} />
    </AppShell>
  );
}
