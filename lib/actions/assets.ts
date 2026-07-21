"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { positive, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/assets");
  revalidatePath("/ledger");
  revalidatePath("/");
}

export async function buyGoldLot(input: {
  quantity: number;
  unitCost: number;
  accountId: string | null;
  monthKey: string;
}) {
  return guard(async () => {
    const quantity = positive(input.quantity, "quantity");
    const unitCost = positive(input.unitCost, "unit_cost");
    const sb = await createClient();
    const { error } = await sb.rpc("buy_gold_lot", {
      p_quantity: quantity,
      p_unit_cost: unitCost,
      p_account_id: input.accountId,
      p_month_key: input.monthKey,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function sellGoldLot(lotId: string, soldPrice: number, accountId: string, monthKey: string) {
  return guard(async () => {
    const price = positive(soldPrice, "sold_price");
    const sb = await createClient();
    const { error } = await sb.rpc("sell_gold_lot", {
      p_lot_id: lotId,
      p_sold_price: price,
      p_account_id: accountId,
      p_month_key: monthKey,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function updatePrice(assetKey: string, price: number) {
  return guard(async () => {
    const p = positive(price, "price");
    const sb = await createClient();
    const { error } = await sb.rpc("update_price", { p_asset_key: assetKey, p_price: p });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}
