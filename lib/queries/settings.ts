import { createClient } from "@/lib/supabase/server";

export type SettingsBundle = {
  allocationTargets: { cash: number; gold: number; stock: number };
  upworkFeePct: number;
  depositDefaultRate: number;
  houseGoal: { down_payment: number; target_year: number };
  fx: { ccy: string; rate: number; as_of: string; is_assumption: boolean }[];
  goldPrice: { price: number; as_of: string | null };
};

export async function getHouseGoal(): Promise<{ down_payment: number; target_year: number }> {
  const sb = await createClient();
  const { data } = await sb.from("settings").select("value").eq("key", "house_goal").maybeSingle();
  const h = (data?.value as any) ?? {};
  return { down_payment: Number(h.down_payment ?? 0), target_year: Number(h.target_year ?? 0) };
}

/** Lãi suất không kỳ hạn dùng khi tất toán sớm (G2). Mặc định 0.002. */
export async function getDepositEarlyRate(): Promise<number> {
  const sb = await createClient();
  const { data } = await sb.from("settings").select("value").eq("key", "deposit_early_rate").maybeSingle();
  const v = Number(data?.value ?? 0.002);
  return Number.isFinite(v) && v > 0 ? v : 0.002;
}

export async function getSettingsBundle(): Promise<SettingsBundle> {
  const sb = await createClient();
  const [{ data: settings }, { data: fx }, { data: gold }] = await Promise.all([
    sb.from("settings").select("key, value"),
    sb.from("fx_rates").select("ccy, rate, as_of, is_assumption").order("as_of", { ascending: false }),
    sb.from("market_prices").select("price, as_of").eq("asset_key", "gold_ring").order("as_of", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const map = new Map((settings ?? []).map((s) => [s.key, s.value as any]));
  const alloc = map.get("allocation_targets") ?? { cash: 0.3, gold: 0.3, stock: 0.4 };
  const depRate = map.get("deposit_default_rate");
  const house = map.get("house_goal") ?? { down_payment: 0, target_year: 0 };

  // fx: giữ dòng mới nhất mỗi ccy
  const latestFx: Record<string, any> = {};
  for (const r of fx ?? []) {
    if (!(r.ccy in latestFx)) latestFx[r.ccy] = r;
  }

  return {
    allocationTargets: {
      cash: Number(alloc.cash ?? 0.3),
      gold: Number(alloc.gold ?? 0.3),
      stock: Number(alloc.stock ?? 0.4),
    },
    upworkFeePct: Number(map.get("upwork_fee_pct") ?? 0.1),
    depositDefaultRate: Number(depRate?.value ?? depRate ?? 0.05),
    houseGoal: {
      down_payment: Number(house.down_payment ?? 0),
      target_year: Number(house.target_year ?? 0),
    },
    fx: Object.values(latestFx).map((r) => ({
      ccy: r.ccy,
      rate: Number(r.rate),
      as_of: r.as_of,
      is_assumption: !!r.is_assumption,
    })),
    goldPrice: { price: gold ? Number(gold.price) : 0, as_of: gold?.as_of ?? null },
  };
}
