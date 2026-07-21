import { createClient } from "@/lib/supabase/server";

export type FilamentStock = {
  id: string;
  material: string;
  color: string | null;
  cost_per_kg: number;
  remaining_kg: number;
  used_kg: number;
  stock_value: number;
  low_stock: boolean;
};

export type PrintOrder = {
  id: string;
  name: string;
  filament_id: string | null;
  filament_label: string | null;
  filament_kg: number;
  cost_snapshot: number;
  price: number;
  month_key: string | null;
  status: "pending" | "received" | "cancelled";
  note: string | null;
  income_tx_id: string | null;
};

export type In3dSummary = {
  month_key: string;
  order_count: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export async function getFilamentStock(): Promise<FilamentStock[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_filament_stock").select("*").order("material");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    cost_per_kg: Number(r.cost_per_kg),
    remaining_kg: Number(r.remaining_kg),
    used_kg: Number(r.used_kg),
    stock_value: Number(r.stock_value),
  }));
}

export async function getPrintOrders(monthKey?: string): Promise<PrintOrder[]> {
  const sb = await createClient();
  let q = sb
    .from("print_orders")
    .select(
      `id, name, filament_id, filament_kg, cost_snapshot, price, month_key, status, note, income_tx_id,
       filament:filaments(material, color)`
    )
    .order("month_key", { ascending: false });
  if (monthKey) q = q.eq("month_key", monthKey);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    filament_id: r.filament_id,
    filament_label: r.filament ? `${r.filament.material}${r.filament.color ? " " + r.filament.color : ""}` : null,
    filament_kg: Number(r.filament_kg),
    cost_snapshot: Number(r.cost_snapshot),
    price: Number(r.price),
    month_key: r.month_key,
    status: r.status,
    note: r.note,
    income_tx_id: r.income_tx_id,
  }));
}

export async function getIn3dSummary(monthKey: string): Promise<In3dSummary | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("v_in3d_summary")
    .select("*")
    .eq("month_key", monthKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    month_key: data.month_key,
    order_count: Number(data.order_count),
    revenue: Number(data.revenue),
    cost: Number(data.cost),
    profit: Number(data.profit),
    margin: Number(data.margin),
  };
}
