import { createClient } from "@/lib/supabase/server";

export type UpworkContract = {
  id: string;
  client: string;
  job: string | null;
  contract_type: "fixed" | "hourly";
  amount_usd: number | null;
  fee_pct: number;
  net_usd: number | null;
  status: "draft" | "active" | "billed" | "received" | "cancelled";
  fx_rate: number | null;
  amount_vnd: number | null;
};

export async function getUpworkContracts(): Promise<UpworkContract[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_upwork_summary").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    client: r.client,
    job: r.job,
    contract_type: r.contract_type,
    amount_usd: r.amount_usd === null ? null : Number(r.amount_usd),
    fee_pct: Number(r.fee_pct),
    net_usd: r.net_usd === null ? null : Number(r.net_usd),
    status: r.status,
    fx_rate: r.fx_rate === null ? null : Number(r.fx_rate),
    amount_vnd: r.amount_vnd === null ? null : Number(r.amount_vnd),
  }));
}

/** Tỷ giá USD mới nhất + fee mặc định (Settings) để preview net trong form. */
export async function getUpworkDefaults(): Promise<{ fxUsd: number; feePct: number }> {
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
