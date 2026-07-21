"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nonNegative, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/accounts");
  revalidatePath("/ledger");
  revalidatePath("/");
}

/**
 * Hiệu chỉnh số dư 1 tài khoản cho khớp thực tế. Không ghi đè số dư (số dư là
 * view); RPC tạo giao dịch điều chỉnh bằng phần lệch. actual = số dư thực tế.
 */
export async function adjustAccountBalance(input: {
  accountId: string;
  actual: number;
  monthKey: string;
  note?: string;
}) {
  return guard(async () => {
    const actual = nonNegative(input.actual, "Số dư thực tế");
    const sb = await createClient();
    const { error } = await sb.rpc("adjust_account_balance", {
      p_account_id: input.accountId,
      p_actual: Math.round(actual),
      p_month_key: input.monthKey,
      p_note: input.note?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}
