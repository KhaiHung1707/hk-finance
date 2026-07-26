"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { ok: boolean; error?: string };

/**
 * Hook dùng chung cho thao tác server-action: toast thành công, alert lỗi (Việt-hoá),
 * loading PER-ACTION theo key (không khoá cả trang), tự router.refresh() khi ok.
 * Thay pattern lặp (busy chung + alert thô) rải rác ở các *Client. Dùng:
 *   const { run, confirmRun, pending, toast } = useActionRunner();
 *   run(() => billPayment(id, mk), { key: `bill-${id}`, ok: "Đã bill" })
 */
export function useActionRunner() {
  const router = useRouter();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const setPending = useCallback((key: string, on: boolean) => {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const run = useCallback(
    async (fn: () => Promise<ActionResult>, opts?: { key?: string; ok?: string }) => {
      const key = opts?.key ?? "_global";
      setPending(key, true);
      let res: ActionResult;
      try {
        res = await fn();
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định" };
      }
      setPending(key, false);
      if (!res.ok) {
        alert(res.error ?? "Thao tác thất bại");
        return res;
      }
      if (opts?.ok) {
        setToast(opts.ok);
        setTimeout(() => setToast(null), 3500);
      }
      router.refresh();
      return res;
    },
    [router, setPending]
  );

  /** Như run nhưng hỏi confirm trước (thao tác phá huỷ/không hoàn tác dễ). */
  const confirmRun = useCallback(
    async (message: string, fn: () => Promise<ActionResult>, opts?: { key?: string; ok?: string }) => {
      if (!confirm(message)) return { ok: false };
      return run(fn, opts);
    },
    [run]
  );

  const pending = useCallback((key: string) => pendingKeys.has(key), [pendingKeys]);
  const anyPending = pendingKeys.size > 0;

  return { run, confirmRun, pending, anyPending, toast };
}

/** Toast thành công dùng chung (đặt đầu nội dung). */
export function SuccessToast({ toast }: { toast: string | null }) {
  if (!toast) return null;
  return (
    <div className="bg-[#DFF2E7] border border-[#B6E0C8] text-[#1F7A5C] rounded-[12px] px-4 py-3 text-[13px] font-semibold flex items-center gap-2">
      <i className="ph-duotone ph-check-circle" aria-hidden />
      {toast}
    </div>
  );
}
