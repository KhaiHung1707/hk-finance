"use client";
import { useState } from "react";
import Link from "next/link";
import { fmt, full } from "@/lib/format";
import { sourceIcon } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { ReceiveModal } from "@/components/ledger/ReceiveModal";
import type { ReceivableItem, Ref } from "@/lib/queries";

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
        {items.map((r) => (
          <div key={r.tx_id} className="flex items-center gap-3 py-[13px] border-b border-divider last:border-0">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-chip text-primary flex items-center justify-center text-[18px] flex-shrink-0">
              <i className={sourceIcon[r.source ?? ""] ?? "ph-duotone ph-plus-circle"} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                {r.note || r.source || "Khoản thu"}
              </div>
              <div className="text-[11px] text-muted mt-[1px]">
                {r.source ?? "—"} · {r.month_key} ·{" "}
                <b className="text-ink-soft" title={full(r.amount)}>
                  {fmt(r.amount)}
                </b>
              </div>
            </div>
            <button
              onClick={() =>
                setReceiveTx({ id: r.tx_id, amount: r.amount, label: `${r.source ?? ""} · ${r.month_key}` })
              }
              className="bg-primary text-white border-0 rounded-full px-[13px] py-[8px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
            >
              Nhận tiền
            </button>
          </div>
        ))}
      </div>

      <ReceiveModal tx={receiveTx} accounts={accounts} onClose={() => setReceiveTx(null)} />
    </div>
  );
}
