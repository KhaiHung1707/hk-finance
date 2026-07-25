import { createClient } from "@/lib/supabase/server";
import { getReceivables, getMonthKeys, getMonthlySummary, getAllocation } from "@/lib/queries";

/**
 * Calendar / Agenda — sự kiện tài chính SẮP TỚI (forward-looking) + Alerts.
 * Nguồn ngày: term_deposits.maturity_on, payments.due_on (join contracts),
 * receivables (income pending), month_keys.closed_at (tháng chưa chốt).
 * Mọi số/ngày từ DB — không hardcode. "Hôm nay" tính ở server lúc request.
 */

export type EventKind = "deposit" | "milestone" | "upwork" | "receivable" | "month_close";

export type CalendarEvent = {
  id: string;
  kind: EventKind;
  date: string | null; // ISO yyyy-mm-dd; null = chưa có ngày (pipeline)
  title: string;
  subtitle: string | null;
  amount: number | null; // VND (dương = tiền vào dự kiến)
  href: string; // deep-link tới module
  icon: string;
  color: string;
};

const KIND_META: Record<EventKind, { icon: string; color: string; href: string }> = {
  deposit: { icon: "ph-duotone ph-vault", color: "#8b5cf6", href: "/investments" },
  milestone: { icon: "ph-duotone ph-flag-banner", color: "#2a78d6", href: "/projects" },
  upwork: { icon: "ph-duotone ph-globe", color: "#eda100", href: "/projects?tab=upwork" },
  receivable: { icon: "ph-duotone ph-hourglass-medium", color: "#1F7A5C", href: "/ledger" },
  month_close: { icon: "ph-duotone ph-calendar-check", color: "#B4573B", href: "/" },
};

/** Ước lượng VND của milestone/contract chưa bill (dùng fx mới nhất theo ccy). */
function toVnd(amount: number | null, ccy: string, fx: Record<string, number>): number | null {
  if (amount == null) return null;
  const rate = fx[ccy] ?? (ccy === "VND" ? 1 : 0);
  return rate ? Math.round(amount * rate) : null;
}

export async function getUpcomingEvents(): Promise<CalendarEvent[]> {
  const sb = await createClient();
  const events: CalendarEvent[] = [];

  const [{ data: deposits }, { data: payments }, { data: fxRows }, receivables] =
    await Promise.all([
      sb.from("term_deposits").select("id, name, principal, maturity_on, status").eq("status", "active"),
      sb
        .from("payments")
        .select(
          "id, name, amount, hours, status, due_on, kind, contract:contracts(client, name, currency, payment_model, hourly_rate, fee_pct)"
        )
        .in("status", ["draft", "billed"]),
      sb.from("fx_rates").select("ccy, rate, as_of").order("as_of", { ascending: false }),
      getReceivables(),
    ]);

  // fx mới nhất theo ccy
  const fx: Record<string, number> = { VND: 1 };
  for (const r of fxRows ?? []) if (!(r.ccy in fx)) fx[r.ccy] = Number(r.rate);

  // -- deposits: đáo hạn --
  for (const d of deposits ?? []) {
    events.push({
      id: `dep-${d.id}`,
      kind: "deposit",
      date: d.maturity_on ?? null,
      title: `${d.name} đáo hạn`,
      subtitle: "Sổ tiết kiệm tới hạn — có thể tất toán",
      amount: Number(d.principal),
      ...KIND_META.deposit,
    });
  }

  // -- payments (contracts hợp nhất): due_on --
  for (const p of payments ?? []) {
    const ct = (p as any).contract;
    const model = ct?.payment_model ?? "fixed_milestones";
    // Model Upwork (không phải fixed_milestones) → có phí Upwork trừ khi fee_pct set.
    const isUpworkModel = model !== "fixed_milestones";
    const feePct = isUpworkModel && ct?.fee_pct != null ? Number(ct.fee_pct) : 0;

    // Ước lượng VND: đợt hourly → hours × hourly_rate (USD); còn lại → amount theo currency contract.
    let amountVnd: number | null;
    if (model === "hourly_weekly") {
      const gross = p.hours != null && ct?.hourly_rate != null ? Number(p.hours) * Number(ct.hourly_rate) : null;
      amountVnd = toVnd(gross != null ? gross * (1 - feePct) : null, "USD", fx);
    } else {
      const ccy = ct?.currency ?? "VND";
      const gross = p.amount != null ? Number(p.amount) : null;
      amountVnd = toVnd(gross != null ? gross * (1 - feePct) : null, ccy, fx);
    }

    // Chọn kind theo payment_model: fixed_milestones → milestone; còn lại → upwork.
    const kind: EventKind = model === "fixed_milestones" ? "milestone" : "upwork";
    events.push({
      id: `pay-${p.id}`,
      kind,
      date: (p as any).due_on ?? null,
      title: `${ct?.client ?? "Contract"} · ${p.name}`,
      subtitle: p.status === "billed" ? "đã bill, chờ thu" : "dự kiến bill",
      amount: amountVnd,
      ...KIND_META[kind],
    });
  }

  // -- receivables (income pending) đã có ngày? dùng month_key làm mốc mềm (không ngày cụ thể) --
  for (const rv of receivables) {
    events.push({
      id: `rv-${rv.tx_id}`,
      kind: "receivable",
      date: null, // pending income chưa có due-date cụ thể → xếp vào "chưa có ngày"
      title: rv.ref_label ?? rv.source ?? "Khoản chờ thu",
      subtitle: `${rv.module} · ${rv.month_key}${rv.note ? " — " + rv.note : ""}`,
      amount: rv.amount,
      ...KIND_META.receivable,
    });
  }

  return events;
}

export type FinancialAlert = {
  id: string;
  severity: "danger" | "warn" | "info";
  title: string;
  detail: string;
  action: { label: string; href: string } | null;
  icon: string;
};

/**
 * Alerts có thể hành động. Ngưỡng lấy từ dữ liệu, không hardcode business số:
 * - deposit đáo hạn ≤ 30/60 ngày
 * - tháng đã qua nhưng chưa chốt sổ
 * - allocation lệch target > 5 điểm %
 * - chi vượt thu tháng gần nhất (net < 0)
 */
export async function getFinancialAlerts(): Promise<FinancialAlert[]> {
  const sb = await createClient();
  const alerts: FinancialAlert[] = [];
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const [{ data: deposits }, allocation, monthKeys] = await Promise.all([
    sb.from("term_deposits").select("id, name, maturity_on, status").eq("status", "active"),
    getAllocation(),
    getMonthKeys(),
  ]);

  // -- deposits đáo hạn gần --
  for (const d of deposits ?? []) {
    if (!d.maturity_on) continue;
    const days = Math.round((new Date(d.maturity_on).getTime() - today.getTime()) / 86400000);
    if (days <= 60) {
      alerts.push({
        id: `dep-${d.id}`,
        severity: days <= 0 ? "danger" : days <= 30 ? "warn" : "info",
        title: days <= 0 ? `${d.name} đã đáo hạn` : `${d.name} đáo hạn trong ${days} ngày`,
        detail: days <= 0 ? "Tất toán để nhận gốc + lãi." : `Chuẩn bị tất toán (${d.maturity_on}).`,
        action: { label: "Tất toán", href: "/investments" },
        icon: "ph-duotone ph-vault",
      });
    }
  }

  // -- allocation drift --
  for (const a of allocation) {
    const share = a.total > 0 ? a.value / a.total : 0;
    const off = share - a.target;
    if (Math.abs(off) > 0.05) {
      alerts.push({
        id: `alloc-${a.grp}`,
        severity: "info",
        title: `${a.grp.toUpperCase()} lệch mục tiêu ${(off * 100 >= 0 ? "+" : "")}${(off * 100).toFixed(0)} điểm %`,
        detail: `Hiện ${(share * 100).toFixed(0)}% vs mục tiêu ${(a.target * 100).toFixed(0)}%.`,
        action: { label: "Cân bằng", href: "/assets" },
        icon: "ph-duotone ph-scales",
      });
    }
  }

  // -- tháng đã qua chưa chốt: month_keys là mới→cũ; tìm tháng có sort < tháng hiện tại & chưa closed --
  const curSort = (today.getFullYear()) * 100 + (today.getMonth() + 1);
  const { data: openMonths } = await sb
    .from("month_keys")
    .select("key, sort, closed_at")
    .is("closed_at", null)
    .lt("sort", curSort)
    .order("sort", { ascending: false })
    .limit(3);
  for (const m of openMonths ?? []) {
    alerts.push({
      id: `close-${m.key}`,
      severity: "warn",
      title: `Tháng ${m.key} chưa chốt sổ`,
      detail: "Chốt sổ để cố định net worth & dòng tiền tháng.",
      action: { label: "Chốt tháng", href: "/" },
      icon: "ph-duotone ph-calendar-check",
    });
  }

  // -- chi vượt thu tháng gần nhất có dữ liệu --
  const latestMonth = monthKeys[0];
  if (latestMonth) {
    const sum = await getMonthlySummary(latestMonth);
    if (sum && sum.net < 0) {
      alerts.push({
        id: `net-${latestMonth}`,
        severity: "warn",
        title: `Tháng ${latestMonth}: chi vượt thu`,
        detail: `Net ${sum.net.toLocaleString("en-US")} ₫ — thu ${Math.round(sum.received / 1e6)}M, chi ${Math.round(sum.expense / 1e6)}M.`,
        action: { label: "Xem Ledger", href: `/ledger?month=${encodeURIComponent(latestMonth)}` },
        icon: "ph-duotone ph-warning-octagon",
      });
    }
  }

  const rank = { danger: 0, warn: 1, info: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
