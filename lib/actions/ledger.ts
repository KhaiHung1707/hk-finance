"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { positive, guard } from "@/lib/validate";

/**
 * Server actions — chỉ gọi RPC (không tự UPDATE balance). RPC là nơi duy nhất
 * ghi transactions; view tự phản ánh. Sau mỗi mutation revalidate Ledger + Dashboard.
 */

function revalidate() {
  revalidatePath("/ledger");
  revalidatePath("/");
}

export async function recordIncome(input: {
  sourceId: string;
  amount: number;
  monthKey: string;
  status: "pending" | "received";
  accountId: string | null;
  note?: string;
  occurredOn?: string;
}) {
  return guard(async () => {
    const amount = positive(input.amount, "amount");
    const sb = await createClient();
    const { error } = await sb.rpc("record_income", {
      p_source_id: input.sourceId,
      p_amount: amount,
      p_month_key: input.monthKey,
      p_status: input.status,
      p_account_id: input.status === "received" ? input.accountId : null,
      p_note: input.note ?? null,
      p_occurred_on: input.occurredOn || null,
    });
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true };
  });
}

export async function recordExpense(input: {
  categoryId: string;
  amount: number;
  monthKey: string;
  accountId: string;
  note?: string;
  occurredOn?: string;
}) {
  return guard(async () => {
    const amount = positive(input.amount, "amount");
    const sb = await createClient();
    const { error } = await sb.rpc("record_expense", {
      p_category_id: input.categoryId,
      p_amount: amount,
      p_month_key: input.monthKey,
      p_account_id: input.accountId,
      p_note: input.note ?? null,
      p_occurred_on: input.occurredOn || null,
    });
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true };
  });
}

export async function recordTransfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  monthKey: string;
  note?: string;
  occurredOn?: string;
}) {
  return guard(async () => {
    const amount = positive(input.amount, "amount");
    if (input.fromAccountId === input.toAccountId) {
      return { ok: false, error: "Tài khoản nguồn và đích phải khác nhau" };
    }
    const sb = await createClient();
    const { error } = await sb.rpc("record_transfer", {
      p_from_account: input.fromAccountId,
      p_to_account: input.toAccountId,
      p_amount: amount,
      p_month_key: input.monthKey,
      p_note: input.note ?? null,
      p_occurred_on: input.occurredOn || null,
    });
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true };
  });
}

export async function markReceived(txId: string, accountId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("mark_received", {
    p_tx_id: txId,
    p_account_id: accountId,
  });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function cancelTransaction(txId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_transaction", { p_tx_id: txId });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateTransaction(input: {
  id: string;
  amount: number;
  note: string;
  monthKey: string;
}) {
  const sb = await createClient();
  const amount = Math.round(input.amount || 0);
  if (amount < 0) return { ok: false, error: "Số tiền không âm" };
  const { error } = await sb.rpc("update_transaction", {
    p_tx_id: input.id,
    p_amount: amount,
    p_note: input.note || null,
    p_month_key: input.monthKey,
  });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteTransaction(txId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("delete_transaction", { p_tx_id: txId });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function closeMonth(monthKey: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("close_month", { p_month_key: monthKey });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Lùi 1 bước trạng thái module (rollback đúng, giữ số dư). */
export async function rollbackStatus(refTable: string, refId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("rollback_status", { p_ref_table: refTable, p_ref_id: refId });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Mở lại tháng đã chốt (rollback nếu lỡ bấm nhầm). */
export async function reopenMonth(monthKey: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("reopen_month", { p_month_key: monthKey });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
