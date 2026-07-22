"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nonNegative, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/settings");
  revalidatePath("/assets");
  revalidatePath("/upwork");
  revalidatePath("/projects");
  revalidatePath("/forecast");
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

export async function setHouseGoal(goal: { down_payment: number; target_year: number }) {
  const sb = await createClient();
  const down = Math.max(0, Math.round(goal.down_payment || 0));
  const year = Math.round(goal.target_year || 0);
  const { error } = await sb.rpc("set_setting", {
    p_key: "house_goal",
    p_value: { down_payment: down, target_year: year },
  });
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

/**
 * Cập nhật một field kế hoạch trong settings.forecast (Forecast §2 Writes):
 * - field = tên source (plan_income_monthly[source]) hoặc "__expense__" (plan_expense_monthly).
 * - Đọc-sửa-ghi jsonb: set value mới và CLEAR cờ assumption của đúng field đó.
 */
export async function setForecastPlanValue(field: string, value: number) {
  return guard(async () => {
    const v = Math.round(nonNegative(value, "Giá trị"));
    const sb = await createClient();
    const { data } = await sb.from("settings").select("value").eq("key", "forecast").maybeSingle();
    const forecast: any = data?.value ?? {};

    if (field === "__expense__") {
      forecast.plan_expense_monthly = { value: v, assumption: false };
    } else {
      forecast.plan_income_monthly = forecast.plan_income_monthly ?? {};
      forecast.plan_income_monthly[field] = { value: v, assumption: false };
    }

    const { error } = await sb.rpc("set_setting", { p_key: "forecast", p_value: forecast });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}
