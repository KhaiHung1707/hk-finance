"use client";
import { useState } from "react";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { closeMonth } from "@/lib/actions/ledger";

/** Nút "Close month" ở header — gọi close_month(monthKey) → upsert snapshot. */
export function CloseMonthButton({ monthKey, closed }: { monthKey: string; closed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(closed);

  async function onClose() {
    setBusy(true);
    const res = await closeMonth(monthKey);
    setBusy(false);
    if (res.ok) setDone(true);
  }

  return (
    <HeaderPortal>
      <div className="flex items-center gap-2 border border-white/20 rounded-full px-[18px] py-[10px] text-[#EAF4EE] text-[13px] font-semibold">
        <i className="ph-duotone ph-calendar-blank" aria-hidden />
        {monthKey}
      </div>
      {done ? (
        <div className="flex items-center gap-2 bg-[#2E7D64] text-white rounded-full px-[22px] py-[12px] text-[13px] font-bold">
          <i className="ph-duotone ph-check-circle" aria-hidden />
          {monthKey} closed
        </div>
      ) : (
        <button
          onClick={onClose}
          disabled={busy}
          className="flex items-center gap-2 bg-primary-dark text-white border-0 rounded-full px-[22px] py-[12px] text-[13px] font-bold cursor-pointer hover:bg-[#0A211C] disabled:opacity-60"
        >
          <i className="ph-duotone ph-flag-checkered" aria-hidden />
          {busy ? "Đang chốt…" : "Close month"}
        </button>
      )}
    </HeaderPortal>
  );
}
