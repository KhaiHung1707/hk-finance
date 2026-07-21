import { createClient } from "@/lib/supabase/server";

// ---- Types (khớp views/tables) ----
export type AccountBalance = {
  id: string;
  name: string;
  type: string;
  sort: number;
  balance: number;
};

export type LedgerRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  status: "pending" | "received" | "cancelled";
  amount: number;
  month_key: string;
  note: string | null;
  account_name: string | null;
  counter_account_name: string | null;
  source_name: string | null;
  category_name: string | null;
};

export type MonthlySummary = {
  month_key: string;
  recognized: number;
  received: number;
  pending: number;
  expense: number;
  net: number;
  savings_rate: number;
};

export type ReceivableItem = {
  tx_id: string;
  amount: number;
  month_key: string;
  note: string | null;
  source: string | null;
};

export type NetWorth = {
  cash: number;
  gold: number;
  stock: number;
  deposits: number;
  total: number;
};

export type AllocationRow = {
  grp: "cash" | "gold" | "stock";
  value: number;
  total: number;
  target: number;
};

export type Ref = { id: string; name: string };

// ---- Fetchers ----

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_account_balances").select("*").order("sort");
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, balance: Number(r.balance) }));
}

export async function getMonthlySummary(monthKey: string): Promise<MonthlySummary | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("v_monthly_summary")
    .select("*")
    .eq("month_key", monthKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    month_key: data.month_key,
    recognized: Number(data.recognized),
    received: Number(data.received),
    pending: Number(data.pending),
    expense: Number(data.expense),
    net: Number(data.net),
    savings_rate: Number(data.savings_rate),
  };
}

export async function getRecognizedBySource(
  monthKey: string
): Promise<{ source: string; recognized: number; source_sort: number }[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("v_monthly_by_source")
    .select("source, recognized, source_sort")
    .eq("month_key", monthKey)
    .order("source_sort");
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, recognized: Number(r.recognized) }));
}

export async function getReceivables(monthKey?: string): Promise<ReceivableItem[]> {
  const sb = await createClient();
  let q = sb.from("v_receivable_items").select("*");
  if (monthKey) q = q.eq("month_key", monthKey);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function getNetWorth(): Promise<NetWorth> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_net_worth").select("*").single();
  if (error) throw error;
  return {
    cash: Number(data.cash),
    gold: Number(data.gold),
    stock: Number(data.stock),
    deposits: Number(data.deposits),
    total: Number(data.total),
  };
}

export async function getAllocation(): Promise<AllocationRow[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_allocation").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    grp: r.grp,
    value: Number(r.value),
    total: Number(r.total),
    target: Number(r.target),
  }));
}

/** Ledger rows với tên account/source/category join sẵn. */
export async function getLedgerRows(monthKey?: string): Promise<LedgerRow[]> {
  const sb = await createClient();
  let q = sb
    .from("transactions")
    .select(
      `id, type, status, amount, month_key, note, created_at,
       account:accounts!transactions_account_id_fkey(name),
       counter:accounts!transactions_counter_account_id_fkey(name),
       source:income_sources(name),
       category:expense_categories(name)`
    )
    .order("created_at", { ascending: false });
  if (monthKey) q = q.eq("month_key", monthKey);
  const { data, error } = await q;
  if (error) throw error;
  // supabase trả nested object; chuẩn hoá về phẳng
  return (data ?? []).map((r: any) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    amount: Number(r.amount),
    month_key: r.month_key,
    note: r.note,
    account_name: r.account?.name ?? null,
    counter_account_name: r.counter?.name ?? null,
    source_name: r.source?.name ?? null,
    category_name: r.category?.name ?? null,
  }));
}

export async function getIncomeSources(): Promise<Ref[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("income_sources").select("id, name").order("sort");
  if (error) throw error;
  return data ?? [];
}

export async function getExpenseCategories(): Promise<Ref[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("expense_categories").select("id, name").order("sort");
  if (error) throw error;
  return data ?? [];
}

export async function getAccountsRef(): Promise<Ref[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("accounts").select("id, name").order("sort");
  if (error) throw error;
  return data ?? [];
}

/** month_keys có sẵn (cho selector), mới nhất trước. */
export async function getMonthKeys(): Promise<string[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("month_keys")
    .select("key, sort")
    .order("sort", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.key);
}

/**
 * month_key làm việc mặc định. Ưu tiên settings.baseline_month_key (seed từ _meta),
 * rồi tháng MỚI NHẤT CÓ GIAO DỊCH, cuối cùng fallback 'T7/26'.
 * (KHÔNG lấy tháng cuối dải month_keys — dải chạy tới T12/28 nên sẽ ra tháng rỗng.)
 */
export async function getBaselineMonthKey(): Promise<string> {
  const sb = await createClient();

  // 1) settings.baseline_month_key (jsonb string, vd "T7/26")
  const { data: baseline } = await sb
    .from("settings")
    .select("value")
    .eq("key", "baseline_month_key")
    .maybeSingle();
  if (baseline?.value) {
    return typeof baseline.value === "string" ? baseline.value : String(baseline.value);
  }

  // 2) fallback: tháng mới nhất thực sự có transaction
  const { data: tx } = await sb
    .from("transactions")
    .select("month_key")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tx?.month_key) return tx.month_key;

  return "T7/26";
}

export async function getProfile(): Promise<{ name: string; initials: string; role: string }> {
  const sb = await createClient();
  const { data } = await sb.from("app_profile").select("name, initials, role").limit(1).maybeSingle();
  return {
    name: data?.name ?? "",
    initials: data?.initials ?? "HK",
    role: data?.role ?? "Personal",
  };
}
