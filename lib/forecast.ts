import type { ForecastParams, ForecastStart } from "@/lib/queries/forecast";

/**
 * Engine dự phóng thuần (không I/O, không hardcode). Mọi tham số đến từ settings/live views.
 *
 * Mô hình (khớp plan §8 + prototype):
 * - Mỗi tháng: thu = Σ plan_income_source × scenario.income_pct; chi = plan_expense.
 * - Receivables (pending) cộng vào tháng 1 (nếu bật).
 * - Mỗi nhóm tài sản sinh lãi theo group_returns_annual/12; deposits cũng compound.
 * - Net saving mỗi tháng đầu tư lại: 55% vào stock, 45% giữ cash (đúng prototype).
 */

export type MonthRow = {
  monthKey: string;
  bySource: Record<string, number>;
  income: number;
  expense: number;
  net: number;
  cash: number;
  gold: number;
  stock: number;
  deposits: number;
  netWorth: number;
  momPct: number;
};

export type SourceSummary = {
  source: string;
  total: number;
  avg: number;
  sharePct: number; // % của tổng thu
};

export type GroupSeries = {
  key: "cash" | "gold" | "stock" | "deposits";
  label: string;
  series: number[]; // [start, ...N]
  growthPct: number;
};

export type ForecastResult = {
  months: MonthRow[];
  nwSeries: number[]; // [start, ...N]
  monthKeys: string[]; // nhãn tháng cho series (bao gồm baseline ở index 0)
  startTotal: number;
  endTotal: number;
  totalGrowth: number;
  totalGrowthPct: number;
  avgMonthlyPct: number;
  totalIncome: number;
  totalExpense: number;
  investGain: number; // phần tăng nhờ lãi = ΔNW − net saving
  sources: SourceSummary[];
  groups: GroupSeries[];
};

const INVEST_TO_STOCK = 0.55;
const INVEST_TO_CASH = 0.45;

/** T7/26 + i tháng → 'T8/26'... */
function shiftMonthKey(baseline: string, i: number): string {
  const month = Number(baseline.replace("T", "").split("/")[0]);
  const year = 2000 + Number(baseline.split("/")[1]);
  let m = month + i;
  let y = year;
  while (m > 12) {
    m -= 12;
    y++;
  }
  return `T${m}/${String(y).slice(2)}`;
}

export function runForecast(
  params: ForecastParams,
  start: ForecastStart,
  scenarioKey: string,
  horizon: number
): ForecastResult {
  const sc = params.scenarios[scenarioKey] ?? { income_pct: 1, annual_return: 0.08 };
  const N = horizon;

  let cash = start.cash;
  let gold = start.gold;
  let stock = start.stock;
  let deposits = start.deposits;

  const startTotal = cash + gold + stock + deposits;
  const sources = Object.keys(params.planIncomeMonthly);

  const nwSeries = [startTotal];
  const monthKeys = [start.baselineMonthKey];
  const cashS = [cash];
  const goldS = [gold];
  const stockS = [stock];
  const depS = [deposits];

  const months: MonthRow[] = [];
  const srcTotals: Record<string, number> = Object.fromEntries(sources.map((s) => [s, 0]));
  let totalIncome = 0;
  let totalExpense = 0;
  let prevNw = startTotal;

  const gr = params.groupReturnsAnnual;

  for (let i = 1; i <= N; i++) {
    const bySource: Record<string, number> = {};
    let income = 0;
    for (const s of sources) {
      const v = params.planIncomeMonthly[s] * sc.income_pct;
      bySource[s] = v;
      income += v;
      srcTotals[s] += v;
    }
    const expense = params.planExpenseMonthly;
    let net = income - expense;

    // receivables land tháng 1
    if (i === 1 && params.receivablesLandFirstMonth) {
      net += start.receivablesFirstMonth;
    }

    totalIncome += income;
    totalExpense += expense;

    // lãi từng nhóm (annual/12)
    cash += cash * (gr.cash / 12);
    gold += gold * (gr.gold / 12);
    stock += stock * (gr.stock / 12);
    deposits += deposits * (gr.deposit / 12);

    // đầu tư lại net saving
    stock += net * INVEST_TO_STOCK;
    cash += net * INVEST_TO_CASH;

    cashS.push(cash);
    goldS.push(gold);
    stockS.push(stock);
    depS.push(deposits);

    const netWorth = cash + gold + stock + deposits;
    const momPct = prevNw > 0 ? ((netWorth - prevNw) / prevNw) * 100 : 0;
    nwSeries.push(netWorth);
    monthKeys.push(shiftMonthKey(start.baselineMonthKey, i));

    months.push({
      monthKey: shiftMonthKey(start.baselineMonthKey, i),
      bySource,
      income,
      expense,
      net,
      cash,
      gold,
      stock,
      deposits,
      netWorth,
      momPct,
    });
    prevNw = netWorth;
  }

  const endTotal = nwSeries[nwSeries.length - 1];
  const totalGrowth = endTotal - startTotal;
  const totalGrowthPct = startTotal > 0 ? (totalGrowth / startTotal) * 100 : 0;
  const avgMonthlyPct = startTotal > 0 && N > 0 ? (Math.pow(endTotal / startTotal, 1 / N) - 1) * 100 : 0;
  const netSaving = totalIncome - totalExpense + (params.receivablesLandFirstMonth ? start.receivablesFirstMonth : 0);
  const investGain = totalGrowth - netSaving;

  const sourceSummaries: SourceSummary[] = sources.map((s) => ({
    source: s,
    total: srcTotals[s],
    avg: N > 0 ? srcTotals[s] / N : 0,
    sharePct: totalIncome > 0 ? (srcTotals[s] / totalIncome) * 100 : 0,
  }));

  const growth = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : b > 0 ? 100 : 0);
  const groups: GroupSeries[] = [
    { key: "cash", label: "Cash", series: cashS, growthPct: growth(cashS[0], cashS[cashS.length - 1]) },
    { key: "gold", label: "Gold", series: goldS, growthPct: growth(goldS[0], goldS[goldS.length - 1]) },
    { key: "stock", label: "Stocks", series: stockS, growthPct: growth(stockS[0], stockS[stockS.length - 1]) },
    { key: "deposits", label: "Deposits", series: depS, growthPct: growth(depS[0], depS[depS.length - 1]) },
  ];

  return {
    months,
    nwSeries,
    monthKeys,
    startTotal,
    endTotal,
    totalGrowth,
    totalGrowthPct,
    avgMonthlyPct,
    totalIncome,
    totalExpense,
    investGain,
    sources: sourceSummaries,
    groups,
  };
}
