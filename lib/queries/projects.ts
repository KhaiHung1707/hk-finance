import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Đợt chi trả (gộp milestone cũ + đợt Upwork/retainer). */
export type Payment = {
  id: string;
  kind: "milestone" | "one_shot" | "weekly" | "monthly";
  name: string | null;
  amount: number | null;
  hours: number | null;
  period_start: string | null;
  period_end: string | null;
  period_month: string | null;
  status: "draft" | "billed" | "received" | "cancelled";
  amount_vnd: number | null;
  gross_vnd: number | null;
  fx_rate: number | null;
  due_on: string | null;
  billed_on: string | null;
  received_on: string | null;
  sort: number;
};

export type PaymentModel = "fixed_milestones" | "one_shot" | "hourly_weekly" | "monthly_retainer";

/** Hợp đồng (gộp project + upwork_contract). Đọc từ v_contract_finance + payments. */
export type ContractFinance = {
  id: string;
  client: string;
  name: string | null;
  payment_model: PaymentModel;
  currency: "VND" | "CAD" | "USD";
  fee_pct: number | null;
  hourly_rate: number | null;
  contract_value: number | null;
  retainer_amount: number | null;
  status: "active" | "done" | "maintenance" | "paused" | "cancelled";
  location: string | null;
  contract_value_vnd: number;
  collected_vnd: number;
  outstanding_vnd: number;
  payment_count: number;
  payment_paid: number;
  draft_count: number; // đợt chưa bill — cho nút "Bill tất cả" + KPI
  next_due: string | null; // hạn dự kiến gần nhất còn mở
  source: string | null;
  payments: Payment[];
};

function mapPayment(p: Record<string, unknown>): Payment {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: p.id as string,
    kind: p.kind as Payment["kind"],
    name: (p.name as string) ?? null,
    amount: num(p.amount),
    hours: num(p.hours),
    period_start: (p.period_start as string) ?? null,
    period_end: (p.period_end as string) ?? null,
    period_month: (p.period_month as string) ?? null,
    status: p.status as Payment["status"],
    amount_vnd: num(p.amount_vnd),
    gross_vnd: num(p.gross_vnd),
    fx_rate: num(p.fx_rate),
    due_on: (p.due_on as string) ?? null,
    billed_on: (p.billed_on as string) ?? null,
    received_on: (p.received_on as string) ?? null,
    sort: (p.sort as number) ?? 0,
  };
}

/**
 * Lấy contracts + payments. Bọc React.cache → gọi nhiều lần trong 1 request
 * (getProjects + getUpworkContracts) chỉ 2 round-trip thay vì 4.
 */
export const getContracts = cache(async function getContracts(): Promise<ContractFinance[]> {
  const sb = await createClient();
  const [{ data: fin, error: e1 }, { data: pays, error: e2 }] = await Promise.all([
    sb.from("v_contract_finance").select("*"),
    sb.from("payments").select("*").order("sort"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byContract = new Map<string, Payment[]>();
  for (const p of pays ?? []) {
    const arr = byContract.get(p.contract_id) ?? [];
    arr.push(mapPayment(p));
    byContract.set(p.contract_id, arr);
  }

  const num = (v: unknown) => (v == null ? null : Number(v));
  return (fin ?? []).map((c) => ({
    id: c.id,
    client: c.client,
    name: c.name ?? null,
    payment_model: c.payment_model,
    currency: c.currency,
    fee_pct: num(c.fee_pct),
    hourly_rate: num(c.hourly_rate),
    contract_value: num(c.contract_value),
    retainer_amount: num(c.retainer_amount),
    status: c.status,
    location: c.location ?? null,
    contract_value_vnd: Number(c.contract_value_vnd),
    collected_vnd: Number(c.collected_vnd),
    outstanding_vnd: Number(c.outstanding_vnd),
    payment_count: Number(c.payment_count),
    payment_paid: Number(c.payment_paid),
    draft_count: Number(c.draft_count ?? 0),
    next_due: c.next_due ?? null,
    source: c.source ?? null,
    payments: byContract.get(c.id) ?? [],
  }));
});

/** Contracts model fixed_milestones (tab Projects). */
export async function getProjects(): Promise<ContractFinance[]> {
  return (await getContracts()).filter((c) => c.payment_model === "fixed_milestones");
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
