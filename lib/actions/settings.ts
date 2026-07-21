"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function rev() {
  revalidatePath("/settings");
  revalidatePath("/assets");
  revalidatePath("/upwork");
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function setFxRate(ccy: "USD" | "CAD", rate: number) {
  const sb = await createClient();
  const { error } = await sb.rpc("set_fx_rate", { p_ccy: ccy, p_rate: rate });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setUpworkFee(pct: number) {
  const sb = await createClient();
  const { error } = await sb.rpc("set_setting", { p_key: "upwork_fee_pct", p_value: pct });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setGoldPrice(price: number) {
  const sb = await createClient();
  const { error } = await sb.rpc("update_price", { p_asset_key: "gold_ring", p_price: price });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setAllocationTargets(targets: { cash: number; gold: number; stock: number }) {
  const sb = await createClient();
  const { error } = await sb.rpc("set_setting", {
    p_key: "allocation_targets",
    p_value: targets,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
