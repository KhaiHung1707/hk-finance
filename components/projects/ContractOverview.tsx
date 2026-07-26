"use client";
import { useMemo, useState } from "react";
import { fmt, full } from "@/lib/format";
import type { ContractFinance } from "@/lib/queries/projects";

export type ContractFilter = {
  q: string;
  status: string; // "" = all
  sort: "client" | "outstanding" | "collected" | "next_due";
};

/**
 * Overview cho danh sách hợp đồng — GIỮ trang dùng được khi dữ liệu dày:
 * - KPI strip: đã thu / chờ thu / hợp đồng active / đợt chưa bill (draft).
 * - Toolbar: search (client/name), lọc status, sort. Trả filter cho parent áp.
 * Dùng chung cho tab Projects + Upwork.
 */
export function useContractFilter(contracts: ContractFinance[]) {
  const [filter, setFilter] = useState<ContractFilter>({ q: "", status: "", sort: "client" });

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    let out = contracts.filter((c) => {
      if (filter.status && c.status !== filter.status) return false;
      if (q) {
        const hay = `${c.client} ${c.name ?? ""} ${c.source ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (filter.sort) {
        case "outstanding": return b.outstanding_vnd - a.outstanding_vnd;
        case "collected": return b.collected_vnd - a.collected_vnd;
        case "next_due":
          if (!a.next_due) return 1;
          if (!b.next_due) return -1;
          return a.next_due.localeCompare(b.next_due);
        default: return a.client.localeCompare(b.client);
      }
    });
    return out;
  }, [contracts, filter]);

  return { filter, setFilter, filtered };
}

export function ContractOverview({
  contracts,
  filter,
  setFilter,
  shownCount,
}: {
  contracts: ContractFinance[];
  filter: ContractFilter;
  setFilter: (f: ContractFilter) => void;
  shownCount: number;
}) {
  const kpi = useMemo(() => {
    let collected = 0, outstanding = 0, active = 0, drafts = 0;
    for (const c of contracts) {
      collected += c.collected_vnd;
      outstanding += c.outstanding_vnd;
      if (c.status === "active") active++;
      drafts += c.draft_count;
    }
    return { collected, outstanding, active, drafts, total: contracts.length };
  }, [contracts]);

  return (
    <div className="flex flex-col gap-3">
      {/* KPI strip */}
      <div className="grid gap-[12px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <Kpi icon="ph-duotone ph-hand-coins" bg="#DFF2E7" fg="#1F7A5C" label="Đã thu" value={fmt(kpi.collected)} title={full(kpi.collected)} />
        <Kpi icon="ph-duotone ph-hourglass-medium" bg="#FBF0DC" fg="#A5731F" label="Chờ thu" value={fmt(kpi.outstanding)} title={full(kpi.outstanding)} />
        <Kpi icon="ph-duotone ph-briefcase" bg="#EAF4EE" fg="#17554A" label="Hợp đồng active" value={`${kpi.active}/${kpi.total}`} />
        <Kpi icon="ph-duotone ph-clock" bg="#F2EFE6" fg="#6B7570" label="Đợt chưa bill" value={String(kpi.drafts)} />
      </div>

      {/* Toolbar — chỉ hiện khi có ≥1 hợp đồng */}
      {contracts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-card border border-card-border rounded-[14px] px-3 py-[10px]">
          <div className="relative flex-1 min-w-[160px]">
            <i className="ph-duotone ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[14px]" aria-hidden />
            <input
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              placeholder="Tìm client / tên / nguồn…"
              className="w-full bg-fill-soft border border-card-border rounded-full pl-9 pr-3 py-[8px] text-[13px] outline-none focus:border-primary"
            />
          </div>
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            className="bg-fill-soft border border-card-border rounded-full px-[13px] py-[8px] text-[12px] font-bold text-ink-soft cursor-pointer"
            aria-label="Lọc trạng thái"
          >
            <option value="">Mọi trạng thái</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="paused">Paused</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={filter.sort}
            onChange={(e) => setFilter({ ...filter, sort: e.target.value as ContractFilter["sort"] })}
            className="bg-fill-soft border border-card-border rounded-full px-[13px] py-[8px] text-[12px] font-bold text-ink-soft cursor-pointer"
            aria-label="Sắp xếp"
          >
            <option value="client">Sắp: Client A→Z</option>
            <option value="outstanding">Sắp: Chờ thu ↓</option>
            <option value="collected">Sắp: Đã thu ↓</option>
            <option value="next_due">Sắp: Hạn gần nhất</option>
          </select>
          {(filter.q || filter.status) && (
            <span className="text-[11px] text-muted px-1">{shownCount}/{contracts.length}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, bg, fg, label, value, title }: { icon: string; bg: string; fg: string; label: string; value: string; title?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-[14px]" title={title}>
      <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[15px]" style={{ background: bg, color: fg }}>
        <i className={icon} aria-hidden />
      </div>
      <div className="text-[19px] font-extrabold tracking-[-0.4px] mt-[10px] tnum" style={{ color: fg }}>{value}</div>
      <div className="text-[11px] text-muted mt-[1px] font-medium">{label}</div>
    </div>
  );
}
