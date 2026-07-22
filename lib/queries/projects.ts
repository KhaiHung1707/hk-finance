import { createClient } from "@/lib/supabase/server";

export type Milestone = {
  id: string;
  name: string;
  amount: number;
  status: "draft" | "billed" | "received" | "cancelled";
  amount_vnd: number | null;
  fx_rate: number | null;
  billed_on: string | null;
  received_on: string | null;
  sort: number;
};

export type ProjectFinance = {
  id: string;
  client: string;
  name: string;
  currency: "VND" | "CAD" | "USD";
  contract_value: number | null;
  status: "active" | "done" | "maintenance" | "paused";
  location: string | null;
  contract_value_vnd: number;
  collected_vnd: number;
  outstanding_vnd: number;
  milestone_count: number;
  milestone_paid: number;
  milestones: Milestone[];
};

export async function getProjects(): Promise<ProjectFinance[]> {
  const sb = await createClient();
  const [{ data: fin, error: e1 }, { data: ms, error: e2 }] = await Promise.all([
    sb.from("v_project_finance").select("*"),
    sb.from("milestones").select("*").order("sort"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byProject = new Map<string, Milestone[]>();
  for (const m of ms ?? []) {
    const arr = byProject.get(m.project_id) ?? [];
    arr.push({
      id: m.id,
      name: m.name,
      amount: Number(m.amount),
      status: m.status,
      amount_vnd: m.amount_vnd === null ? null : Number(m.amount_vnd),
      fx_rate: m.fx_rate === null ? null : Number(m.fx_rate),
      billed_on: m.billed_on ?? null,
      received_on: m.received_on ?? null,
      sort: m.sort ?? 0,
    });
    byProject.set(m.project_id, arr);
  }

  return (fin ?? []).map((p) => ({
    id: p.id,
    client: p.client,
    name: p.name,
    currency: p.currency,
    contract_value: p.contract_value === null ? null : Number(p.contract_value),
    status: p.status,
    location: p.location,
    contract_value_vnd: Number(p.contract_value_vnd),
    collected_vnd: Number(p.collected_vnd),
    outstanding_vnd: Number(p.outstanding_vnd),
    milestone_count: Number(p.milestone_count),
    milestone_paid: Number(p.milestone_paid),
    milestones: byProject.get(p.id) ?? [],
  }));
}

/** fx theo ccy để hiển thị quy đổi VND trong UI. */
export async function getFxRates(): Promise<Record<string, number>> {
  const sb = await createClient();
  const { data } = await sb.from("fx_rates").select("ccy, rate, as_of").order("as_of", { ascending: false });
  const out: Record<string, number> = { VND: 1 };
  for (const r of data ?? []) {
    if (!(r.ccy in out)) out[r.ccy] = Number(r.rate);
  }
  return out;
}
