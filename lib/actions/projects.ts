"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nonNegative, nonEmpty, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/projects");
  revalidatePath("/upwork");
  revalidatePath("/ledger");
  revalidatePath("/calendar");
  revalidatePath("/");
}

// ---------------- Contract CRUD (dùng chung Projects + Upwork) ----------------

export async function createContract(input: {
  client: string;
  name: string;
  paymentModel: "fixed_milestones" | "one_shot" | "hourly_weekly" | "monthly_retainer";
  source: string;
  currency: "VND" | "CAD" | "USD";
  feePct?: number | null;
  hourlyRate?: number | null;
  contractValue?: number | null;
  retainerAmount?: number | null;
  status?: string;
  location?: string;
}) {
  return guard(async () => {
    const client = nonEmpty(input.client, "client");
    const sb = await createClient();
    const { data, error } = await sb.rpc("create_contract", {
      p_client: client,
      p_name: input.name || null,
      p_payment_model: input.paymentModel,
      p_source: input.source,
      p_currency: input.currency,
      p_fee_pct: input.feePct ?? null,
      p_hourly_rate: input.hourlyRate ?? null,
      p_contract_value: input.contractValue == null ? null : nonNegative(input.contractValue, "contract_value"),
      p_retainer_amount: input.retainerAmount ?? null,
      p_status: input.status || "active",
      p_location: input.location || null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true, id: data as string };
  });
}

export async function updateContract(input: {
  id: string;
  client: string;
  name: string;
  paymentModel?: string;
  source?: string;
  currency?: "VND" | "CAD" | "USD";
  feePct?: number | null;
  hourlyRate?: number | null;
  contractValue?: number | null;
  retainerAmount?: number | null;
  status?: string;
  location?: string;
}) {
  return guard(async () => {
    const client = nonEmpty(input.client, "client");
    const sb = await createClient();
    const { error } = await sb.rpc("update_contract", {
      p_id: input.id,
      p_client: client,
      p_name: input.name || null,
      p_payment_model: input.paymentModel ?? null,
      p_source: input.source || null,
      p_currency: input.currency ?? null,
      p_fee_pct: input.feePct ?? null,
      p_hourly_rate: input.hourlyRate ?? null,
      p_contract_value: input.contractValue ?? null,
      p_retainer_amount: input.retainerAmount ?? null,
      p_status: input.status ?? null,
      p_location: input.location || null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function deleteContract(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("delete_contract", { p_id: id });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// ---------------- Payment CRUD + lifecycle ----------------

export async function createPayment(input: {
  contractId: string;
  kind: "milestone" | "one_shot" | "weekly" | "monthly";
  name: string;
  amount?: number | null;
  hours?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodMonth?: string | null;
  dueOn?: string | null;
  sort?: number;
}) {
  return guard(async () => {
    const sb = await createClient();
    const { error } = await sb.rpc("create_payment", {
      p_contract_id: input.contractId,
      p_kind: input.kind,
      p_name: input.name || null,
      p_amount: input.amount ?? null,
      p_hours: input.hours ?? null,
      p_period_start: input.periodStart ?? null,
      p_period_end: input.periodEnd ?? null,
      p_period_month: input.periodMonth ?? null,
      p_due_on: input.dueOn ?? null,
      p_sort: input.sort ?? 0,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function updatePayment(input: {
  id: string;
  name: string;
  amount?: number | null;
  hours?: number | null;
  dueOn?: string | null;
}) {
  return guard(async () => {
    const sb = await createClient();
    const { error } = await sb.rpc("update_payment", {
      p_id: input.id,
      p_name: input.name || null,
      p_amount: input.amount ?? null,
      p_hours: input.hours ?? null,
      p_due_on: input.dueOn ?? null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function deletePayment(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("delete_payment", { p_id: id });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function billPayment(id: string, monthKey: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("bill_payment", { p_id: id, p_month_key: monthKey });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function collectPayment(id: string, accountId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("collect_payment", { p_id: id, p_account_id: accountId });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function cancelPayment(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_payment", { p_id: id });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Ngày DỰ KIẾN bill/thu của đợt (S-1) — metadata cho Calendar, không đụng tiền. */
export async function setPaymentDueOn(id: string, dueOn: string | null) {
  return guard(async () => {
    const sb = await createClient();
    const { error } = await sb.from("payments").update({ due_on: dueOn || null }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

/** Sinh đợt retainer tháng cho dải [from..to] (idempotent). */
export async function generateRetainerPayments(contractId: string, fromMonth: string, toMonth: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("generate_retainer_payments", {
    p_contract_id: contractId,
    p_from_month: fromMonth,
    p_to_month: toMonth,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
