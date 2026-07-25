"use client";
import { useState } from "react";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { UpworkClient } from "@/components/upwork/UpworkClient";
import type { ContractFinance } from "@/lib/queries/projects";
import type { Ref } from "@/lib/queries";

/** Trang gộp Projects + Upwork: 2 tab. Mỗi tab render client tương ứng (kèm nút riêng). */
export function ProjectUpworkClient({
  initialTab = "projects",
  monthKey,
  projects,
  contracts,
  accounts,
  sources,
  fx,
  fxUsd,
  feePctDefault,
}: {
  initialTab?: "projects" | "upwork";
  monthKey: string;
  projects: ContractFinance[];
  contracts: ContractFinance[];
  accounts: Ref[];
  sources: Ref[];
  fx: Record<string, number>;
  fxUsd: number;
  feePctDefault: number;
}) {
  const [tab, setTab] = useState<"projects" | "upwork">(initialTab);

  const tabBtn = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-5 py-[10px] text-[13px] font-bold cursor-pointer border-0 ${
      active ? "bg-primary text-white" : "bg-white text-ink-soft"
    }`;

  return (
    <>
      <div className="flex gap-[6px]" role="tablist">
        <button role="tab" aria-selected={tab === "projects"} onClick={() => setTab("projects")} className={tabBtn(tab === "projects")}>
          <i className="ph-duotone ph-briefcase" aria-hidden />
          Projects
        </button>
        <button role="tab" aria-selected={tab === "upwork"} onClick={() => setTab("upwork")} className={tabBtn(tab === "upwork")}>
          <i className="ph-duotone ph-globe" aria-hidden />
          Upwork
        </button>
      </div>

      {tab === "projects" ? (
        <ProjectsClient monthKey={monthKey} projects={projects} accounts={accounts} sources={sources} fx={fx} />
      ) : (
        <UpworkClient monthKey={monthKey} contracts={contracts} accounts={accounts} fxUsd={fxUsd} feePctDefault={feePctDefault} />
      )}
    </>
  );
}
