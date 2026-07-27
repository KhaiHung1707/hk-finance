"use client";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { useActionRunner, ConfirmHost } from "@/components/ui/useActionRunner";
import { closeMonth, reopenMonth } from "@/lib/actions/ledger";

/**
 * Nút chốt/mở lại tháng ở header. Khi đã chốt → hiện trạng thái + nút Mở lại
 * (rollback nếu lỡ bấm nhầm). Trạng thái `closed` đến từ server (getMonthCloseStatus).
 */
export function CloseMonthButton({ monthKey, closed }: { monthKey: string; closed: boolean }) {
  const runner = useActionRunner();
  const { run, confirmRun, pending } = runner;
  const busy = pending("close-month");

  function onClose() {
    run(() => closeMonth(monthKey), { key: "close-month" });
  }
  function onReopen() {
    confirmRun(
      `Mở lại tháng ${monthKey}? Tháng sẽ cho phép ghi/sửa lại (rollback chốt sổ).`,
      () => reopenMonth(monthKey),
      { key: "close-month", danger: true, title: "Mở lại tháng", confirmLabel: "Mở lại" }
    );
  }

  return (
    <>
      <ConfirmHost host={runner} />
      <HeaderPortal>
      <div className="flex items-center gap-2 border border-white/20 rounded-full px-[18px] py-[10px] text-[#EAF4EE] text-[13px] font-semibold">
        <i className="ph-duotone ph-calendar-blank" aria-hidden />
        {monthKey}
      </div>
      {closed ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#2E7D64] text-white rounded-full px-[18px] py-[12px] text-[13px] font-bold">
            <i className="ph-duotone ph-check-circle" aria-hidden />
            {monthKey} đã chốt
          </div>
          <button
            onClick={onReopen}
            disabled={busy}
            title="Mở lại tháng (rollback)"
            className="flex items-center gap-2 bg-white/10 text-white border border-white/20 rounded-full px-[16px] py-[12px] text-[13px] font-bold cursor-pointer hover:bg-white/20 disabled:opacity-60"
          >
            <i className="ph-duotone ph-lock-key-open" aria-hidden />
            {busy ? "…" : "Mở lại"}
          </button>
        </div>
      ) : (
        <button
          onClick={onClose}
          disabled={busy}
          className="flex items-center gap-2 bg-primary-dark text-white border-0 rounded-full px-[22px] py-[12px] text-[13px] font-bold cursor-pointer hover:bg-[#0A211C] disabled:opacity-60"
        >
          <i className="ph-duotone ph-flag-checkered" aria-hidden />
          {busy ? "Đang chốt…" : "Chốt tháng"}
        </button>
      )}
      </HeaderPortal>
    </>
  );
}
