import { createClient } from "@/lib/supabase/server";
import { getNetWorth, getReceivables, getBaselineMonthKey, getNetworthHistory } from "@/lib/queries";
import { getGoldSummary } from "@/lib/queries/assets";
import { getStockPositions, getDeposits } from "@/lib/queries/investments";

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
  // Neo vào snapshot đã chốt: nếu có tháng đã chốt → điểm xuất phát = net worth THỰC của
  // tháng đó (đóng băng), dự phóng chạy từ tháng kế tiếp. false = fallback NW live.
  anchoredToSnapshot: boolean;
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
  const [nw, receivables, baselineMonthKey, history] = await Promise.all([
    getNetWorth(),
    getReceivables(),
    getBaselineMonthKey(),
    getNetworthHistory(), // snapshot đã chốt, cũ → mới
  ]);
  const recv = receivables.reduce((s, r) => s + r.amount, 0);

  // NEO VÀO SNAPSHOT: nếu đã chốt ≥ 1 tháng → điểm xuất phát = net worth THỰC của tháng
  // chốt gần nhất (số đóng băng), dự phóng chạy từ tháng kế tiếp. Receivables (pending)
  // vẫn về tháng kế vì snapshot as-of cuối tháng chưa gồm khoản chờ thu.
  const latest = history.length ? history[history.length - 1] : null;
  if (latest) {
    return {
      cash: latest.cash,
      gold: latest.gold,
      stock: latest.stock,
      deposits: latest.deposits,
      total: latest.total,
      receivablesFirstMonth: recv,
      baselineMonthKey: latest.month_key,
      anchoredToSnapshot: true,
    };
  }

  // Chưa chốt tháng nào → fallback NW live + baseline hiện tại (hành vi cũ).
  return {
    cash: nw.cash,
    gold: nw.gold,
    stock: nw.stock,
    deposits: nw.deposits,
    total: nw.total,
    receivablesFirstMonth: recv,
    baselineMonthKey,
    anchoredToSnapshot: false,
  };
}

export type InvestGainGroup = { key: "gold" | "stock" | "deposits"; label: string; gain: number };

/**
 * Lãi/lỗ chưa hiện thực theo nhóm (point-in-time, KHÔNG hardcode):
 * - gold: unrealized từ v_gold_lots_detail
 * - stock: Σ (last_price − avg_cost) × qty từ v_stock_positions
 * - deposits: Σ interest_accrued (lãi dồn tới hôm nay) từ v_deposit_positions
 * Dùng để bóc tách con số "Investment gain" trên Forecast KPI.
 */
export async function getInvestGainByGroup(): Promise<InvestGainGroup[]> {
  const [gold, stocks, deposits] = await Promise.all([
    getGoldSummary(),
    getStockPositions(),
    getDeposits(),
  ]);
  const stockGain = stocks.reduce((s, p) => s + (p.last_price - p.avg_cost) * p.qty, 0);
  const depGain = deposits
    .filter((d) => d.status === "active")
    .reduce((s, d) => s + d.interest_accrued, 0);
  return [
    { key: "gold", label: "Vàng", gain: Math.round(gold.unrealized) },
    { key: "stock", label: "Cổ phiếu", gain: Math.round(stockGain) },
    { key: "deposits", label: "Tiền gửi", gain: Math.round(depGain) },
  ];
}

/** net_worth_snapshots (month_key + total) — overlay actual vs forecast. Có thể rỗng. */
export async function getForecastSnapshots(): Promise<ForecastSnapshot[]> {
  const sb = await createClient();
  // order theo month_keys.sort (không theo text month_key — "T10/26" < "T2/26" sai).
  const { data } = await sb
    .from("net_worth_snapshots")
    .select("month_key, total, mk:month_keys!inner(sort)")
    .order("sort", { referencedTable: "month_keys", ascending: true });
  return (data ?? []).map((r) => ({ month_key: r.month_key, total: Number(r.total) }));
}
