"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ActionResult = { ok: boolean; error?: string };

type ConfirmState = {
  message: string;
  title?: string;
  danger?: boolean;
  confirmLabel?: string;
} | null;

/**
 * Hook dùng chung cho thao tác server-action: toast thành công, LỖI + XÁC NHẬN qua
 * MODAL trong app (không dùng window.confirm/alert xấu của trình duyệt), loading
 * PER-ACTION theo key, tự router.refresh() khi ok. Nhớ render <ConfirmHost host={...}/>
 * một lần trong component (giống SuccessToast). Dùng:
 *   const runner = useActionRunner();
 *   runner.run(() => billPayment(id, mk), { key: `bill-${id}`, ok: "Đã bill" })
 *   runner.confirmRun("Huỷ đợt này?", () => cancelPayment(id), { key, danger: true })
 *   ... <SuccessToast toast={runner.toast} /> <ConfirmHost host={runner} />
 */
export function useActionRunner() {
  const router = useRouter();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null);

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
        setError(res.error ?? "Thao tác thất bại");
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

  /** Mở modal xác nhận, trả Promise<boolean> theo lựa chọn của người dùng. */
  const confirm = useCallback((message: string, opts?: { title?: string; danger?: boolean; confirmLabel?: string }) => {
    return new Promise<boolean>((resolve) => {
      confirmResolve.current = resolve;
      setConfirmState({ message, ...opts });
    });
  }, []);

  const resolveConfirm = useCallback((ok: boolean) => {
    setConfirmState(null);
    confirmResolve.current?.(ok);
    confirmResolve.current = null;
  }, []);

  /** Như run nhưng hỏi xác nhận (modal) trước. */
  const confirmRun = useCallback(
    async (message: string, fn: () => Promise<ActionResult>, opts?: { key?: string; ok?: string; title?: string; danger?: boolean; confirmLabel?: string }) => {
      const agreed = await confirm(message, { title: opts?.title, danger: opts?.danger, confirmLabel: opts?.confirmLabel });
      if (!agreed) return { ok: false };
      return run(fn, opts);
    },
    [confirm, run]
  );

  /** Báo lỗi/thông báo qua modal (thay alert). */
  const notify = useCallback((message: string) => setError(message), []);

  const pending = useCallback((key: string) => pendingKeys.has(key), [pendingKeys]);
  const anyPending = pendingKeys.size > 0;

  return { run, confirmRun, confirm, notify, pending, anyPending, toast, _error: error, _confirmState: confirmState, _resolveConfirm: resolveConfirm, _clearError: () => setError(null) };
}

export type ActionRunner = ReturnType<typeof useActionRunner>;

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

/** Modal xác nhận + báo lỗi (thay window.confirm/alert). Render 1 lần/component. */
export function ConfirmHost({ host }: { host: ActionRunner }) {
  const cs = host._confirmState;
  const err = host._error;
  return (
    <>
      {cs && (
        <Modal
          open
          onClose={() => host._resolveConfirm(false)}
          title={cs.title ?? "Xác nhận"}
          icon={cs.danger ? "ph-duotone ph-warning" : "ph-duotone ph-question"}
          iconBg={cs.danger ? "#F7E3DC" : "#EAF4EE"}
          iconFg={cs.danger ? "#B4573B" : "#17554A"}
          width={420}
        >
          <div className="text-[13.5px] text-ink-soft leading-[1.5]">{cs.message}</div>
          <ModalActions>
            <Button variant="ghost" className="flex-1" onClick={() => host._resolveConfirm(false)}>Huỷ</Button>
            {cs.danger ? (
              <button
                onClick={() => host._resolveConfirm(true)}
                className="flex-1 bg-[#B4573B] text-white border-0 rounded-full px-[16px] py-[10px] text-[13px] font-bold cursor-pointer hover:bg-[#9A4530]"
              >
                {cs.confirmLabel ?? "Xác nhận"}
              </button>
            ) : (
              <Button variant="primary" className="flex-1" onClick={() => host._resolveConfirm(true)}>{cs.confirmLabel ?? "Đồng ý"}</Button>
            )}
          </ModalActions>
        </Modal>
      )}
      {err && (
        <Modal
          open
          onClose={host._clearError}
          title="Có lỗi"
          icon="ph-duotone ph-warning-octagon"
          iconBg="#F7E3DC"
          iconFg="#B4573B"
          width={420}
        >
          <div className="text-[13.5px] text-ink-soft leading-[1.5]">{err}</div>
          <ModalActions>
            <Button variant="primary" className="flex-1" onClick={host._clearError}>Đã hiểu</Button>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
