import { createClient } from "@/lib/supabase/server";

export type GoldLot = {
  id: string;
  quantity: number;
  unit_cost: number;
  purchased_on: string | null;
  unit_price_now: number;
  market_value: number;
  unrealized: number;
};

export type GoldSummary = {
  qty_chi: number;
  avg_cost: number;
  market_value: number;
  unit_price_now: number;
  unrealized: number;
};

export async function getGoldLots(): Promise<GoldLot[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_gold_lots_detail").select("*");
  if (error) throw error;
  return (data ?? []).map((g) => ({
    id: g.id,
    quantity: Number(g.quantity),
    unit_cost: Number(g.unit_cost),
    purchased_on: g.purchased_on,
    unit_price_now: Number(g.unit_price_now),
    market_value: Number(g.market_value),
    unrealized: Number(g.unrealized),
  }));
}

export async function getGoldSummary(): Promise<GoldSummary> {
  const lots = await getGoldLots();
  const qty = lots.reduce((s, l) => s + l.quantity, 0);
  const cost = lots.reduce((s, l) => s + l.unit_cost * l.quantity, 0);
  const mv = lots.reduce((s, l) => s + l.market_value, 0);
  const unit = lots[0]?.unit_price_now ?? 0;
  return {
    qty_chi: qty,
    avg_cost: qty > 0 ? Math.round(cost / qty) : 0,
    market_value: mv,
    unit_price_now: unit,
    unrealized: mv - cost,
  };
}

/** Giá gold mới nhất (để hiển thị / prefill). */
export async function getGoldPrice(): Promise<{ price: number; as_of: string | null }> {
  const sb = await createClient();
  const { data } = await sb
    .from("market_prices")
    .select("price, as_of")
    .eq("asset_key", "gold_ring")
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { price: data ? Number(data.price) : 0, as_of: data?.as_of ?? null };
}
