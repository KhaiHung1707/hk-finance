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
