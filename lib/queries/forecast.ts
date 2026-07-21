import { createClient } from "@/lib/supabase/server";
import { getNetWorth, getReceivables, getBaselineMonthKey } from "@/lib/queries";

/** Toàn bộ tham số forecast — lấy từ settings.forecast (đã seed). KHÔNG hardcode. */
export type ForecastParams = {
  planIncomeMonthly: Record<string, number>; // per source
  planExpenseMonthly: number;
  scenarios: Record<string, { income_pct: number; annual_return: number }>;
  groupReturnsAnnual: { cash: number; deposit: number; gold: number; stock: number };
  horizonOptions: number[];
  receivablesLandFirstMonth: boolean;
  houseGoal: { down_payment: number; target_year: number };
  // cờ "ước lượng" cho từng field editable — dùng để render chip + biết field nào là giả định.
  assumptions: {
    planIncome: Record<string, boolean>;
    planExpense: boolean;
    groupReturns: boolean;
  };
};

export type ForecastStart = {
  cash: number;
  gold: number;
  stock: number;
  deposits: number;
  total: number;
  receivablesFirstMonth: number; // tổng pending sẽ về tháng 1
  baselineMonthKey: string;
};

export type ForecastSnapshot = { month_key: string; total: number };

export async function getForecastParams(): Promise<ForecastParams> {
  const sb = await createClient();
  const [{ data: fRow }, { data: hRow }] = await Promise.all([
    sb.from("settings").select("value").eq("key", "forecast").maybeSingle(),
    sb.from("settings").select("value").eq("key", "house_goal").maybeSingle(),
  ]);
  const f = (fRow?.value as any) ?? {};
  const h = (hRow?.value as any) ?? {};

  // plan_income_monthly: mỗi source có dạng { value, assumption } → lấy value + cờ.
  const planIncome: Record<string, number> = {};
  const planIncomeAssumption: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(f.plan_income_monthly ?? {})) {
    planIncome[k] = Number((v as any)?.value ?? v ?? 0);
    planIncomeAssumption[k] = Boolean((v as any)?.assumption);
  }
  const planExpense = Number(f.plan_expense_monthly?.value ?? f.plan_expense_monthly ?? 0);
  const planExpenseAssumption = Boolean(f.plan_expense_monthly?.assumption);

  const scenarios: ForecastParams["scenarios"] = {};
  for (const [k, v] of Object.entries(f.scenarios ?? {})) {
    scenarios[k] = {
      income_pct: Number((v as any).income_pct ?? 1),
      annual_return: Number((v as any).annual_return ?? 0.08),
    };
  }

  const gr = f.group_returns_annual ?? {};
  return {
    planIncomeMonthly: planIncome,
    planExpenseMonthly: planExpense,
    scenarios,
    groupReturnsAnnual: {
      cash: Number(gr.cash ?? 0),
      deposit: Number(gr.deposit ?? 0.05),
      gold: Number(gr.gold ?? 0.08),
      stock: Number(gr.stock ?? 0.1),
    },
    horizonOptions: Array.isArray(f.horizon_months_options) ? f.horizon_months_options : [1, 6, 12],
    receivablesLandFirstMonth: f.receivables_land_in_first_month !== false,
    houseGoal: {
      down_payment: Number(h.down_payment ?? 0),
      target_year: Number(h.target_year ?? 0),
    },
    assumptions: {
      planIncome: planIncomeAssumption,
      planExpense: planExpenseAssumption,
      groupReturns: Boolean(gr.assumption),
    },
  };
}

export async function getForecastStart(): Promise<ForecastStart> {
  const [nw, receivables, baselineMonthKey] = await Promise.all([
    getNetWorth(),
    getReceivables(),
    getBaselineMonthKey(),
  ]);
  const recv = receivables.reduce((s, r) => s + r.amount, 0);
  return {
    cash: nw.cash,
    gold: nw.gold,
    stock: nw.stock,
    deposits: nw.deposits,
    total: nw.total,
    receivablesFirstMonth: recv,
    baselineMonthKey,
  };
}

/** net_worth_snapshots (month_key + total) — overlay actual vs forecast. Có thể rỗng. */
export async function getForecastSnapshots(): Promise<ForecastSnapshot[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("net_worth_snapshots")
    .select("month_key, total")
    .order("month_key");
  return (data ?? []).map((r) => ({ month_key: r.month_key, total: Number(r.total) }));
}
