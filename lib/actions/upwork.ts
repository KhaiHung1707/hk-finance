"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nonNegative, nonEmpty, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/upwork");
  revalidatePath("/ledger");
  revalidatePath("/");
}

export async function createContract(input: {
  client: string;
  job: string;
  contractType: "fixed" | "hourly";
  amountUsd: number | null;
  feePct: number | null;
}) {
  return guard(async () => {
    const client = nonEmpty(input.client, "client");
    const amountUsd =
      input.amountUsd == null ? null : nonNegative(input.amountUsd, "amount_usd");
    // fee_pct dạng thập phân [0,1]; RPC cũng guard lại.
    let feePct: number | null = null;
    if (input.feePct != null) {
      const f = Number(input.feePct);
      if (!Number.isFinite(f) || f < 0 || f > 1) {
        return { ok: false, error: "fee_pct phải trong khoảng 0–1" };
      }
      feePct = f;
    }
    const sb = await createClient();
    const { error } = await sb.rpc("create_contract", {
      p_client: client,
      p_job: input.job || null,
      p_contract_type: input.contractType,
      p_amount_usd: amountUsd,
      p_fee_pct: feePct,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function activateContract(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("activate_contract", { p_id: id });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function billContract(id: string, monthKey: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("bill_contract", { p_id: id, p_month_key: monthKey });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function receiveContract(id: string, accountId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("receive_contract", { p_id: id, p_account_id: accountId });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function cancelContract(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_contract", { p_id: id });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
