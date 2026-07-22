import { createClient } from "@/lib/supabase/server";

export type DepositPosition = {
  id: string;
  name: string;
  principal: number;
  annual_rate: number;
  term_months: number;
  start_on: string;
  maturity_on: string | null;
  status: "active" | "settled" | "withdrawn_early";
  days_left: number | null;
  matured: boolean;
  interest_full: number;
  interest_accrued: number;
};

export type StockPosition = {
  ticker: string;
  name: string | null;
  qty: number;
  avg_cost: number;
  last_price: number;
};

export async function getDeposits(): Promise<DepositPosition[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_deposit_positions").select("*").order("start_on");
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    principal: Number(d.principal),
    annual_rate: Number(d.annual_rate),
    term_months: Number(d.term_months),
    start_on: d.start_on,
    maturity_on: d.maturity_on,
    status: d.status,
    days_left: d.days_left === null ? null : Number(d.days_left),
    matured: !!d.matured,
    interest_full: Number(d.interest_full),
    interest_accrued: Number(d.interest_accrued),
  }));
}

export async function getStockPositions(): Promise<StockPosition[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_stock_positions").select("*").order("ticker");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    ticker: s.ticker,
    name: s.name,
    qty: Number(s.qty),
    avg_cost: Number(s.avg_cost),
    last_price: Number(s.last_price),
  }));
}

export type StockHistoryRow = {
  id: string; // stock_trades.id (dividend: dividends.id) — cho edit
  ticker: string;
  kind: "buy" | "sell" | "dividend";
  qty: number | null;
  unit_price: number | null;
  amount: number; // buy/sell: qty×price; dividend: amount
  on: string; // ngày (trade) hoặc month_key (dividend)
};

/** Lịch sử giao dịch mọi ticker (buy/sell + dividend), theo thời gian — cho expand row. */
export async function getStockHistory(): Promise<Record<string, StockHistoryRow[]>> {
  const sb = await createClient();
  const [{ data: trades }, { data: divs }] = await Promise.all([
    sb.from("stock_trades").select("id, ticker, side, qty, unit_price, traded_on").order("traded_on"),
    sb.from("dividends").select("id, ticker, amount, month_key").order("month_key"),
  ]);
  const out: Record<string, StockHistoryRow[]> = {};
  for (const t of trades ?? []) {
    (out[t.ticker] ??= []).push({
      id: t.id,
      ticker: t.ticker,
      kind: t.side as "buy" | "sell",
      qty: Number(t.qty),
      unit_price: Number(t.unit_price),
      amount: Number(t.qty) * Number(t.unit_price),
      on: t.traded_on,
    });
  }
  for (const d of divs ?? []) {
    (out[d.ticker] ??= []).push({
      id: d.id,
      ticker: d.ticker,
      kind: "dividend",
      qty: null,
      unit_price: null,
      amount: Number(d.amount),
      on: d.month_key,
    });
  }
  return out;
}
