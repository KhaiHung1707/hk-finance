"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { positive, nonEmpty, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/in3d");
  revalidatePath("/ledger");
  revalidatePath("/");
}

export async function buyFilament(input: {
  material: string;
  color: string;
  kg: number;
  costPerKg: number;
  accountId: string;
  monthKey: string;
}) {
  return guard(async () => {
    const material = nonEmpty(input.material, "material");
    const kg = positive(input.kg, "kg");
    const costPerKg = positive(input.costPerKg, "cost_per_kg");
    const sb = await createClient();
    const { error } = await sb.rpc("buy_filament", {
      p_material: material,
      p_color: input.color || null,
      p_kg: kg,
      p_cost_per_kg: costPerKg,
      p_account_id: input.accountId,
      p_month_key: input.monthKey,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function createPrintOrder(input: {
  name: string;
  filamentId: string;
  kg: number;
  price: number;
  monthKey: string;
  channel: string;
}) {
  return guard(async () => {
    const name = nonEmpty(input.name, "Tên đơn");
    const kg = positive(input.kg, "kg");
    const price = positive(input.price, "price");
    const sb = await createClient();
    const { error } = await sb.rpc("create_print_order", {
      p_name: name,
      p_filament_id: input.filamentId,
      p_kg: kg,
      p_price: price,
      p_month_key: input.monthKey,
      p_channel: input.channel || null,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function cancelPrintOrder(orderId: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_print_order", { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
