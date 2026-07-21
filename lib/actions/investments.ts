"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { positive, positiveInt, ratePercent, nonEmpty, guard } from "@/lib/validate";

function rev() {
  revalidatePath("/investments");
  revalidatePath("/assets");
  revalidatePath("/ledger");
  revalidatePath("/");
}

export async function openDeposit(input: {
  name: string;
  principal: number;
  rate: number;
  termMonths: number;
  start: string;
  accountId: string | null;
  monthKey: string;
}) {
  return guard(async () => {
    const name = nonEmpty(input.name, "Tên sổ");
    const principal = positive(input.principal, "principal");
    const termMonths = positiveInt(input.termMonths, "term_months");
    // input.rate là dạng thập phân (0.06 = 6%/năm) — client đã /100.
    const rate = Number(input.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      return { ok: false, error: "Lãi suất phải trong khoảng 0–100%/năm" };
    }
    const sb = await createClient();
    const { error } = await sb.rpc("open_deposit", {
      p_name: name,
      p_principal: principal,
      p_rate: rate,
      p_term_months: termMonths,
      p_start: input.start,
      p_account_id: input.accountId,
      p_month_key: input.monthKey,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function settleDeposit(id: string, accountId: string, monthKey: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("settle_deposit", {
    p_id: id,
    p_account_id: accountId,
    p_month_key: monthKey,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function buyStock(input: {
  ticker: string;
  qty: number;
  price: number;
  accountId: string;
  monthKey: string;
}) {
  return guard(async () => {
    const ticker = nonEmpty(input.ticker, "ticker").toUpperCase();
    const qty = positive(input.qty, "qty");
    const price = positive(input.price, "price");
    const sb = await createClient();
    const { error } = await sb.rpc("buy_stock", {
      p_ticker: ticker,
      p_qty: qty,
      p_price: price,
      p_account_id: input.accountId,
      p_month_key: input.monthKey,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function sellStock(input: {
  ticker: string;
  qty: number;
  price: number;
  accountId: string;
  monthKey: string;
}) {
  return guard(async () => {
    const ticker = nonEmpty(input.ticker, "ticker").toUpperCase();
    const qty = positive(input.qty, "qty");
    const price = positive(input.price, "price");
    const sb = await createClient();
    const { error } = await sb.rpc("sell_stock", {
      p_ticker: ticker,
      p_qty: qty,
      p_price: price,
      p_account_id: input.accountId,
      p_month_key: input.monthKey,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}

export async function recordDividend(input: {
  ticker: string;
  amount: number;
  accountId: string;
  monthKey: string;
}) {
  return guard(async () => {
    const ticker = nonEmpty(input.ticker, "ticker").toUpperCase();
    const amount = positive(input.amount, "amount");
    const sb = await createClient();
    const { error } = await sb.rpc("record_dividend", {
      p_ticker: ticker,
      p_amount: amount,
      p_account_id: input.accountId,
      p_month_key: input.monthKey,
    });
    if (error) return { ok: false, error: error.message };
    rev();
    return { ok: true };
  });
}
