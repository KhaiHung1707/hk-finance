"use client";
import { useState } from "react";
import Link from "next/link";
import { fmt, full } from "@/lib/format";
import { ReceiveModal } from "@/components/ledger/ReceiveModal";
import type { ReceivableItem, Ref } from "@/lib/queries";

const MODULE_ICON: Record<string, string> = {
  Upwork: "ph-duotone ph-globe",
  Projects: "ph-duotone ph-briefcase",
  In3D: "ph-duotone ph-cube-transparent",
  Ecommerce: "ph-duotone ph-shopping-cart",
  Khác: "ph-duotone ph-tag",
};

/** Gom receivables theo module, sắp tổng phụ giảm dần. */
function groupByModule(items: ReceivableItem[]) {
  const map = new Map<string, ReceivableItem[]>();
  for (const r of items) {
    const k = r.module || "Khác";
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  return [...map.entries()]
    .map(([module, list]) => ({
      module,
      items: list,
      total: list.reduce((s, r) => s + r.amount, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Card Receivables với nút "Nhận tiền" inline (mở account picker). */
export function ReceivablesCard({
  items,
  total,
  accounts,
}: {
  items: ReceivableItem[];
  total: number;
  accounts: Ref[];
}) {
  const [receiveTx, setReceiveTx] = useState<{ id: string; amount: number; label: string } | null>(null);

  return (
    <div className="bg-card border border-card-border rounded-[18px] p-[22px] flex flex-col">
      <div className="flex justify-between items-baseline">
        <div className="text-[15px] font-bold">Receivables</div>
        <Link href="/ledger" className="text-[12px] font-semibold text-primary flex items-center gap-1">
          View all<i className="ph-duotone ph-arrow-right text-[12px]" aria-hidden />
        </Link>
      </div>
      <div className="flex items-baseline gap-2 mt-1 mb-[6px]">
        <span className="text-[23px] font-extrabold tracking-[-0.5px] tnum" title={full(total)}>
          {fmt(total)}
        </span>
        <span className="text-[12px] text-muted">to collect</span>
      </div>

      <div className="flex flex-col">
        {items.length === 0 && (
          <div className="py-6 text-[13px] text-muted text-center">Không có khoản chờ thu.</div>
        )}
        {groupByModule(items).map((g) => (
          <div key={g.module} className="mt-2 first:mt-0">
            {/* Header nhóm module + tổng phụ */}
            <div className="flex items-center gap-2 py-2 border-b border-divider">
              <i className={`${MODULE_ICON[g.module] ?? "ph-duotone ph-tag"} text-primary text-[15px]`} aria-hidden />
              <span className="text-[12px] font-bold text-ink-soft">{g.module}</span>
              <span className="text-[11px] text-muted">({g.items.length})</span>
              <span className="ml-auto text-[12px] font-extrabold tnum" title={full(g.total)}>
                {fmt(g.total)}
              </span>
            </div>
            {g.items.map((r) => (
              <div key={r.tx_id} className="flex items-center gap-3 py-[11px] border-b border-divider last:border-0">
                <div className="flex-1 min-w-0 pl-[6px]">
                  <div className="text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                    {r.ref_label || r.note || r.source || "Khoản thu"}
                  </div>
                  <div className="text-[11px] text-muted mt-[1px]">
                    {r.month_key} ·{" "}
                    <b className="text-ink-soft" title={full(r.amount)}>
                      {fmt(r.amount)}
                    </b>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setReceiveTx({ id: r.tx_id, amount: r.amount, label: `${r.ref_label ?? r.module} · ${r.month_key}` })
                  }
                  className="bg-primary text-white border-0 rounded-full px-[13px] py-[8px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
                >
                  Nhận tiền
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <ReceiveModal tx={receiveTx} accounts={accounts} onClose={() => setReceiveTx(null)} />
    </div>
  );
}
