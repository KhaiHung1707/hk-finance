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

export async function updateGoldLot(input: {
  id: string;
  quantity: number;
  unitCost: number;
  purchasedOn?: string | null;
}) {
  const sb = await createClient();
  const { error } = await sb.rpc("update_gold_lot", {
    p_id: input.id,
    p_quantity: input.quantity,
    p_unit_cost: Math.round(input.unitCost),
    p_purchased_on: input.purchasedOn || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteGoldLot(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("delete_gold_lot", { p_id: id });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function updatePrice(assetKey: string, price: number) {
  return guard(async () => {
    const p = positive(price, "price");
    const sb = await createClient();
    const { error } = await sb.rpc("update_price", { p_asset_key: assetKey, p_price: p });
    if (error) return { ok: false, error: error.message };
    rev();
    revalidatePath("/investments");
    return { ok: true };
  });
}

/** Lấy giá close mới nhất 1 mã HOSE từ VNDirect dchart (đơn vị nghìn đồng → ×1000). */
async function fetchVndirectPrice(symbol: string): Promise<number | null> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 20 * 86400; // ~20 ngày để chắc có phiên gần nhất
  const url = `https://dchart-api.vndirect.com.vn/dchart/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { s?: string; c?: number[] };
    if (data.s !== "ok" || !data.c?.length) return null;
    const close = data.c[data.c.length - 1]; // nghìn đồng
    if (!Number.isFinite(close) || close <= 0) return null;
    return Math.round(close * 1000); // → VND/cp, khớp market_prices
  } catch {
    return null;
  }
}

/**
 * Cập nhật giá MỌI mã cổ phiếu từ VNDirect (vàng giữ nhập tay). Chạy server-side
 * (tránh CORS). Fail mềm từng mã — giữ giá cũ nếu API lỗi. Trả số mã cập nhật + mã lỗi.
 */
export async function refreshStockPrices(): Promise<{ ok: boolean; error?: string; updated?: string[]; failed?: string[] }> {
  const sb = await createClient();
  // mã cổ phiếu = ticker khác 'gold_ring'
  const { data: tks, error: e1 } = await sb.from("tickers").select("symbol").neq("symbol", "gold_ring");
  if (e1) return { ok: false, error: e1.message };
  const symbols = (tks ?? []).map((t) => t.symbol as string);
  if (symbols.length === 0) return { ok: true, updated: [], failed: [] };

  const updated: string[] = [];
  const failed: string[] = [];
  await Promise.all(
    symbols.map(async (sym) => {
      const price = await fetchVndirectPrice(sym);
      if (price == null) { failed.push(sym); return; }
      const { error } = await sb.rpc("update_price", { p_asset_key: sym, p_price: price });
      if (error) failed.push(sym);
      else updated.push(sym);
    })
  );
  rev();
  revalidatePath("/investments");
  return { ok: true, updated, failed };
}
