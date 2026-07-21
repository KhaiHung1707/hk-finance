"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nonNegative, nonEmpty, guard } from "@/lib/validate";

const ACCOUNT_TYPES = ["bank", "broker", "cash", "ewallet", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

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

/** Thêm tài khoản mới (qua RPC — giữ đúng ràng buộc type/tên duy nhất). */
export async function createAccount(input: {
  name: string;
  type: AccountType;
  openingBalance: number;
  note?: string;
}) {
  return guard(async () => {
    const name = nonEmpty(input.name, "Tên tài khoản");
    if (!ACCOUNT_TYPES.includes(input.type)) {
      return { ok: false, error: "Loại tài khoản không hợp lệ" };
    }
    const opening = nonNegative(input.openingBalance, "Số dư đầu kỳ");
    const sb = await createClient();
    const { error } = await sb.rpc("create_account", {
      p_name: name,
      p_type: input.type,
      p_opening_balance: Math.round(opening),
      p_note: input.note?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

/** Xoá tài khoản — RPC chặn nếu còn giao dịch/sổ tham chiếu (giữ toàn vẹn ERD). */
export async function deleteAccount(accountId: string) {
  return guard(async () => {
    const sb = await createClient();
    const { error } = await sb.rpc("delete_account", { p_id: accountId });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}
