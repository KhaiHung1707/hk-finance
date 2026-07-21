"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, full } from "@/lib/format";
import { accountIcon } from "@/lib/design/tokens";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { adjustAccountBalance } from "@/lib/actions/accounts";
import type { AccountBalance } from "@/lib/queries";

const GRID = "34px 1.4fr 120px 160px 150px";

export function AccountsClient({
  accounts,
  monthKey,
  total,
}: {
  accounts: AccountBalance[];
  monthKey: string;
  total: number;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<AccountBalance | null>(null);
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function open(a: AccountBalance) {
    setEdit(a);
    setActual(String(a.balance));
    setNote("");
    setErr(null);
  }
  function close() {
    setEdit(null);
    setActual("");
    setNote("");
    setErr(null);
  }

  const actualNum = Math.round(Number(actual) || 0);
  const diff = edit ? actualNum - edit.balance : 0;

  async function submit() {
    if (!edit) return;
    setBusy(true);
    setErr(null);
    const res = await adjustAccountBalance({
      accountId: edit.id,
      actual: actualNum,
      monthKey,
      note,
    });
    if (!res?.ok) {
      setErr(res?.error ?? "Lỗi điều chỉnh số dư");
      setBusy(false);
      return;
    }
    setBusy(false);
    close();
    router.refresh();
  }

  return (
    <>
      {/* Tổng nguồn tiền (chỉ tiền mặt/tài khoản — không gồm vàng/cổ phiếu) */}
      <div className="bg-primary-dark rounded-[16px] px-6 py-5 flex items-center gap-4 flex-wrap">
        <div className="w-[42px] h-[42px] rounded-[12px] bg-[#1E4A40] text-[#8FBCA7] flex items-center justify-center text-[22px]">
          <i className="ph-duotone ph-wallet" aria-hidden />
        </div>
        <div>
          <div className="text-[12px] text-[#9DC4B5] font-medium">
            Tổng số dư tài khoản (tiền mặt · ngân hàng · ví)
          </div>
          <div className="text-[26px] font-extrabold text-white tnum" title={full(total)}>
            {fmt(total)}
          </div>
        </div>
        <div className="ml-auto text-[11px] text-[#9DC4B5] max-w-[280px] leading-[1.5]">
          Không gồm vàng, cổ phiếu, sổ tiết kiệm — xem ở Assets / Invest. Chỉnh số dư
          ở đây khi con số thực tế lệch với app.
        </div>
      </div>

      {/* Bảng tài khoản */}
      <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
        <div
          className="grid gap-3 items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
          style={{ gridTemplateColumns: GRID }}
        >
          <div />
          <div>Tài khoản</div>
          <div>Loại</div>
          <div className="text-right">Số dư (app tính)</div>
          <div className="text-right">Hành động</div>
        </div>

        {accounts.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
            Chưa có tài khoản nào.
          </div>
        )}

        {accounts.map((a) => (
          <div
            key={a.id}
            className="grid gap-3 items-center px-5 py-[14px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
              <i className={accountIcon[a.type] ?? "ph-duotone ph-bank"} aria-hidden />
            </div>
            <div className="font-semibold">{a.name}</div>
            <div className="text-muted text-[12px] capitalize">{a.type}</div>
            <div className="text-right font-bold tnum" title={full(a.balance)}>
              {fmt(a.balance)}
            </div>
            <div className="text-right">
              <button
                onClick={() => open(a)}
                className="bg-primary text-white border-0 rounded-full px-[14px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
              >
                Chỉnh số dư
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal chỉnh số dư */}
      <Modal
        open={edit !== null}
        onClose={close}
        title={`Chỉnh số dư — ${edit?.name ?? ""}`}
        icon="ph-duotone ph-scales"
        iconBg="#EAF4EE"
        iconFg="#17554A"
      >
        <div className="flex flex-col gap-[14px]">
          <div className="bg-fill-soft rounded-[10px] px-[14px] py-[11px] text-[12px] text-ink-soft">
            Số dư app đang tính:{" "}
            <b className="tnum" title={full(edit?.balance ?? 0)}>
              {fmt(edit?.balance ?? 0)}
            </b>
            . Nhập số dư <b>thực tế</b> — app sẽ tạo một giao dịch điều chỉnh bằng
            đúng phần chênh lệch (tháng {monthKey}).
          </div>

          <Field label="Số dư thực tế (₫)">
            <TextInput
              type="number"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>

          {actual !== "" && (
            <div
              className="text-[12px] font-semibold"
              style={{ color: diff === 0 ? "#7A8580" : diff > 0 ? "#1F7A5C" : "#B4573B" }}
            >
              {diff === 0
                ? "Đã khớp — không tạo giao dịch nào."
                : diff > 0
                  ? `Sẽ ghi khoản THU điều chỉnh +${full(diff)}`
                  : `Sẽ ghi khoản CHI điều chỉnh −${full(-diff)}`}
            </div>
          )}

          <Field label="Ghi chú (tuỳ chọn)">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Điều chỉnh số dư"
            />
          </Field>

          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>

        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={close}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={submit}
            disabled={busy || diff === 0}
          >
            {busy ? "Đang lưu…" : diff === 0 ? "Đã khớp" : "Lưu điều chỉnh"}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
