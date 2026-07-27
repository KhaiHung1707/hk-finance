"use client";
import Link from "next/link";
import { fmt, full } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { modelLabel, modelIcon, contractStatusStyle } from "@/components/projects/contract-shared";
import type { ContractFinance, Payment } from "@/lib/queries/projects";

export type ProjectView = "list" | "table" | "timeline";

/** ---------- Bảng compact: nhiều hợp đồng / 1 màn ---------- */
const TCOLS = "minmax(160px,1.6fr) 130px 110px 120px 120px 90px 110px 60px";

export function ContractTableView({ contracts }: { contracts: ContractFinance[] }) {
  if (contracts.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-[18px] overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 880 }}>
          <div className="grid gap-2 items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]" style={{ gridTemplateColumns: TCOLS }}>
            <div>Hợp đồng</div>
            <div>Loại</div>
            <div>Trạng thái</div>
            <div className="text-right">Đã thu</div>
            <div className="text-right">Chờ thu</div>
            <div className="text-right">Đợt</div>
            <div>Hạn gần</div>
            <div></div>
          </div>
          {contracts.map((c) => {
            const sm = contractStatusStyle[c.status] ?? contractStatusStyle.active;
            return (
              <Link key={c.id} href={`/projects/${c.id}`}
                className="grid gap-2 items-center px-5 py-[12px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]" style={{ gridTemplateColumns: TCOLS }}>
                <div className="flex items-center gap-2 min-w-0">
                  <i className={`${modelIcon(c.payment_model)} text-primary text-[16px] flex-shrink-0`} aria-hidden />
                  <div className="min-w-0">
                    <div className="font-bold truncate">{c.name || c.client}</div>
                    <div className="text-[11px] text-muted truncate">{c.client}</div>
                  </div>
                </div>
                <div className="text-[12px] text-ink-soft truncate">{modelLabel(c.payment_model)}</div>
                <div><Badge bg={sm.bg} fg={sm.fg}>{sm.label}</Badge></div>
                <div className="text-right font-bold text-[#1F7A5C] tnum" title={full(c.collected_vnd)}>{fmt(c.collected_vnd)}</div>
                <div className="text-right tnum" title={full(c.outstanding_vnd)}>{fmt(c.outstanding_vnd)}</div>
                <div className="text-right tnum text-muted">{c.payment_paid}/{c.payment_count}</div>
                <div className="text-[12px] text-[#A5731F]">{c.next_due ?? <span className="text-faint">—</span>}</div>
                <div className="text-right text-muted"><i className="ph-duotone ph-caret-right" aria-hidden /></div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** ---------- Timeline: đợt sắp tới hạn theo bucket ---------- */
type DueItem = { contract: ContractFinance; payment: Payment; days: number | null };

const BUCKETS = [
  { key: "overdue", label: "Quá hạn", icon: "ph-duotone ph-warning-octagon", color: "#B4573B" },
  { key: "week", label: "Trong tuần", icon: "ph-duotone ph-calendar-dot", color: "#A5731F" },
  { key: "month", label: "Trong tháng", icon: "ph-duotone ph-calendar", color: "#17554A" },
  { key: "later", label: "Sau đó", icon: "ph-duotone ph-calendar-blank", color: "#6B7570" },
  { key: "nodate", label: "Chưa có ngày", icon: "ph-duotone ph-clock", color: "#9AA49E" },
] as const;

export function ContractTimelineView({ contracts, todayIso }: { contracts: ContractFinance[]; todayIso: string }) {
  const today = new Date(todayIso + "T00:00:00").getTime();
  const items: DueItem[] = [];
  for (const c of contracts) {
    for (const p of c.payments) {
      if (p.status !== "draft" && p.status !== "billed") continue;
      const dateStr = p.due_on || (p.status === "billed" ? p.billed_on : null);
      const days = dateStr ? Math.round((new Date(dateStr + "T00:00:00").getTime() - today) / 86400000) : null;
      items.push({ contract: c, payment: p, days });
    }
  }
  const bucketOf = (d: number | null) =>
    d == null ? "nodate" : d < 0 ? "overdue" : d <= 7 ? "week" : d <= 31 ? "month" : "later";

  const grouped = BUCKETS.map((b) => ({
    ...b,
    items: items.filter((it) => bucketOf(it.days) === b.key).sort((a, z) => (a.days ?? 1e9) - (z.days ?? 1e9)),
  })).filter((b) => b.items.length > 0);

  if (grouped.length === 0) {
    return <div className="bg-card border border-card-border rounded-[18px] p-8 text-center text-[13px] text-muted">Không có đợt nào đang chờ (draft/billed).</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped.map((b) => (
        <div key={b.key} className="bg-card border border-card-border rounded-[18px] p-[18px]">
          <div className="flex items-center gap-2 mb-3">
            <i className={b.icon} style={{ color: b.color }} aria-hidden />
            <div className="text-[14px] font-bold" style={{ color: b.color }}>{b.label}</div>
            <span className="text-[11px] text-muted">· {b.items.length} đợt</span>
          </div>
          <div className="flex flex-col gap-2">
            {b.items.map(({ contract: c, payment: p, days }) => {
              const vnd = p.amount_vnd ?? 0;
              const dateStr = p.due_on || p.billed_on;
              return (
                <Link key={p.id} href={`/projects/${c.id}`}
                  className="flex items-center gap-3 border border-[#EFEAE0] rounded-[12px] px-[14px] py-[10px] hover:border-[#C9C0AC] hover:bg-[#FAF8F2]">
                  <i className={`${modelIcon(c.payment_model)} text-primary text-[16px] flex-shrink-0`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{c.client} · {p.name || "Đợt"}</div>
                    <div className="text-[11px] text-muted truncate">
                      {modelLabel(c.payment_model)}
                      {p.status === "billed" ? " · đã bill, chờ thu" : " · nháp"}
                    </div>
                  </div>
                  {vnd > 0 && <span className="text-[12px] font-bold tnum" title={full(vnd)}>{fmt(vnd)}</span>}
                  <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: b.color }}>
                    {days == null ? "—" : days < 0 ? `${Math.abs(days)}n trước` : days === 0 ? "hôm nay" : `còn ${days}n`}
                    {dateStr && <span className="text-faint font-normal"> · {dateStr}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
