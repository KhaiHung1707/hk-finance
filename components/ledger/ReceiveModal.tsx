"use client";
import { useState } from "react";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { full } from "@/lib/format";
import { markReceived } from "@/lib/actions/ledger";
import type { Ref } from "@/lib/queries";

/** Modal "Nhận tiền" — chọn tài khoản để chuyển pending → received. */
export function ReceiveModal({
  tx,
  accounts,
  onClose,
}: {
  tx: { id: string; amount: number; label: string } | null;
  accounts: Ref[];
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!tx) return;
    if (!accountId) return setErr("Chọn tài khoản nhận");
    setBusy(true);
    setErr(null);
    const res = await markReceived(tx.id, accountId);
    if (!res.ok) {
      setErr(res.error ?? "Lỗi");
      setBusy(false);
      return;
    }
    setBusy(false);
    setAccountId("");
    onClose();
  }

  return (
    <Modal
      open={!!tx}
      onClose={onClose}
      title="Nhận tiền"
      icon="ph-duotone ph-hand-coins"
      iconBg="#DFF2E7"
      iconFg="#1F7A5C"
    >
      {tx && (
        <>
          <div className="text-[13px] text-ink-soft mb-4">
            {tx.label} — <b>{full(tx.amount)}</b>
          </div>
          <Field label="Chuyển vào tài khoản">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— chọn —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {err && <div className="text-[12px] text-[#B4573B] font-semibold mt-2">{err}</div>}
          <ModalActions>
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" className="flex-1" onClick={submit} disabled={busy}>
              {busy ? "Đang xử lý…" : "Xác nhận"}
            </Button>
          </ModalActions>
        </>
      )}
    </Modal>
  );
}
