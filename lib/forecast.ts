import type { ForecastParams, ForecastStart } from "@/lib/queries/forecast";

/**
 * Engine dự phóng thuần (không I/O, không hardcode). Mọi tham số đến từ settings/live views.
 *
 * Mô hình (khớp Forecast spec §2 + xlsx Forecast sheet):
 * - ĐƯỜNG HEADLINE net-worth dùng scenario.annual_return:
 *     nw[t] = nw[t−1] × (1 + annual_return/12) + (Σ planIncome × income_pct − planExpense)
 *   + receivablesPending cộng MỘT LẦN ở t=1 (nếu bật).
 * - GROUP CURVES (cash/gold/stock/deposits) độc lập với headline: mỗi nhóm compound
 *   theo groupReturnsAnnual/12 của riêng nó (KHÔNG dùng scenario return, KHÔNG tái đầu tư).
 *   Chúng minh hoạ growth từng nhóm ở lãi suất giả định, không phải phân rã của headline.
 * - goalReachedAt: tháng đầu tiên headline ≥ houseGoal.down_payment.
 */

export type MonthRow = {
  monthKey: string;
  bySource: Record<string, number>;
  income: number;
  expense: number;
  net: number;
  // monthlyDetail theo spec: opening → savings → return_ → closing (trên đường headline)
  opening: number;
  savings: number;
  return_: number;
  closing: number;
  netWorth: number; // = closing (giữ tên cũ cho UI)
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
  nwSeries: number[]; // [start, ...N] — đường headline
  monthKeys: string[]; // nhãn tháng cho series (bao gồm baseline ở index 0)
  startTotal: number;
  endTotal: number;
  totalGrowth: number;
  totalGrowthPct: number;
  avgMonthlyPct: number;
  totalIncome: number;
  totalExpense: number;
  investGain: number; // phần tăng nhờ lãi = ΔNW − net saving (trên đường headline)
  sources: SourceSummary[];
  groups: GroupSeries[];
  goalReachedAt: string | null; // tháng đầu tiên headline ≥ down_payment; null nếu không đạt
  goalTarget: number; // down_payment (0 = không đặt mục tiêu)
};

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
  const monthlyReturn = sc.annual_return / 12;

  const startTotal = start.cash + start.gold + start.stock + start.deposits;
  const sources = Object.keys(params.planIncomeMonthly);

  // ---- Đường headline (dùng scenario.annual_return) ----
  const nwSeries = [startTotal];
  const monthKeys = [start.baselineMonthKey];

  // ---- Group curves (độc lập, mỗi nhóm compound theo groupReturnsAnnual) ----
  const gr = params.groupReturnsAnnual;
  let cash = start.cash;
  let gold = start.gold;
  let stock = start.stock;
  let deposits = start.deposits;
  const cashS = [cash];
  const goldS = [gold];
  const stockS = [stock];
  const depS = [deposits];

  const months: MonthRow[] = [];
  const srcTotals: Record<string, number> = Object.fromEntries(sources.map((s) => [s, 0]));
  let totalIncome = 0;
  let totalExpense = 0;
  let prevNw = startTotal;

  const goalTarget = params.houseGoal?.down_payment ?? 0;
  let goalReachedAt: string | null =
    goalTarget > 0 && startTotal >= goalTarget ? start.baselineMonthKey : null;

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
    let savings = income - expense;

    // receivables land tháng 1 (một lần)
    if (i === 1 && params.receivablesLandFirstMonth) {
      savings += start.receivablesFirstMonth;
    }

    totalIncome += income;
    totalExpense += expense;

    // --- Headline: nw[t] = nw[t-1] × (1 + annual_return/12) + savings ---
    const opening = prevNw;
    const return_ = opening * monthlyReturn;
    const closing = opening + return_ + savings;
    const netWorth = closing;

    const momPct = opening > 0 ? ((netWorth - opening) / opening) * 100 : 0;
    const monthKey = shiftMonthKey(start.baselineMonthKey, i);
    nwSeries.push(netWorth);
    monthKeys.push(monthKey);

    if (goalReachedAt === null && goalTarget > 0 && netWorth >= goalTarget) {
      goalReachedAt = monthKey;
    }

    // --- Group curves (độc lập) ---
    cash += cash * (gr.cash / 12);
    gold += gold * (gr.gold / 12);
    stock += stock * (gr.stock / 12);
    deposits += deposits * (gr.deposit / 12);
    cashS.push(cash);
    goldS.push(gold);
    stockS.push(stock);
    depS.push(deposits);

    months.push({
      monthKey,
      bySource,
      income,
      expense,
      net: savings,
      opening,
      savings,
      return_,
      closing,
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
    goalReachedAt,
    goalTarget,
  };
}
