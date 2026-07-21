"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { positive, nonNegative, nonEmpty, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/projects");
  revalidatePath("/ledger");
  revalidatePath("/");
}

export async function createProject(input: {
  client: string;
  name: string;
  currency: "VND" | "CAD" | "USD";
  contractValue: number | null;
  source: string;
  status: string;
  location: string;
}) {
  return guard(async () => {
    const client = nonEmpty(input.client, "client");
    const name = nonEmpty(input.name, "name");
    const contractValue =
      input.contractValue == null ? null : nonNegative(input.contractValue, "contract_value");
    const sb = await createClient();
    const { data, error } = await sb.rpc("create_project", {
      p_client: client,
      p_name: name,
      p_currency: input.currency,
      p_contract_value: contractValue,
      p_source: input.source,
      p_status: input.status,
      p_location: input.location || null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true, id: data as string };
  });
}

export async function updateProject(input: {
  id: string;
  client: string;
  name: string;
  currency: "VND" | "CAD" | "USD";
  contractValue: number | null;
  status: string;
  location: string;
}) {
  return guard(async () => {
    const client = nonEmpty(input.client, "client");
    const name = nonEmpty(input.name, "name");
    const contractValue =
      input.contractValue == null ? null : nonNegative(input.contractValue, "contract_value");
    const sb = await createClient();
    const { error } = await sb.rpc("update_project", {
      p_id: input.id,
      p_client: client,
      p_name: name,
      p_currency: input.currency,
      p_contract_value: contractValue,
      p_status: input.status,
      p_location: input.location || null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function createMilestone(input: {
  projectId: string;
  name: string;
  amount: number;
  sort: number;
}) {
  return guard(async () => {
    const name = nonEmpty(input.name, "name");
    const amount = positive(input.amount, "amount");
    const sb = await createClient();
    const { error } = await sb.rpc("create_milestone", {
      p_project_id: input.projectId,
      p_name: name,
      p_amount: amount,
      p_sort: input.sort,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function billMilestone(id: string, monthKey: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("bill_milestone", { p_id: id, p_month_key: monthKey });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function collectMilestone(id: string, accountId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("collect_milestone", { p_id: id, p_account_id: accountId });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function cancelMilestone(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_milestone", { p_id: id });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
