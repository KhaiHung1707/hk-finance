import { getContracts, type ContractFinance } from "@/lib/queries/projects";

/** Contracts KHÔNG phải fixed_milestones (tab Upwork: one_shot / hourly_weekly / monthly_retainer). */
export async function getUpworkContracts(): Promise<ContractFinance[]> {
  return (await getContracts()).filter((c) => c.payment_model !== "fixed_milestones");
}

/** Tỷ giá USD mới nhất + fee mặc định (Settings) để preview net trong form. */
export async function getUpworkDefaults(): Promise<{ fxUsd: number; feePct: number }> {
  const { createClient } = await import("@/lib/supabase/server");
  const sb = await createClient();
  const [{ data: fx }, { data: fee }] = await Promise.all([
    sb.from("fx_rates").select("rate, as_of").eq("ccy", "USD").order("as_of", { ascending: false }).limit(1).maybeSingle(),
    sb.from("settings").select("value").eq("key", "upwork_fee_pct").maybeSingle(),
  ]);
  return {
    fxUsd: fx ? Number(fx.rate) : 0,
    feePct: fee ? Number(fee.value) : 0.1,
  };
}
