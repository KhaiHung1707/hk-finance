"use client";
import { useState } from "react";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select, MoneyInput } from "@/components/ui/Field";
import { txTypeStyle } from "@/lib/design/tokens";
import { recordIncome, recordExpense } from "@/lib/actions/ledger";
import type { Ref } from "@/lib/queries";

type Kind = "income" | "expense";

/**
 * Modal thêm giao dịch (Thu/Chi) — khớp screenshot ledger-modal.png.
 * Income: source + amount + account + status(pending/received) + note.
 * Expense: category + amount + account + note (luôn received).
 * Source/category/account đều lấy từ DB (props), KHÔNG hardcode.
 */
export function EntryModal({
  open,
  kind,
  onClose,
  monthKey,
  sources,
  categories,
  accounts,
}: {
  open: boolean;
  kind: Kind;
  onClose: () => void;
  monthKey: string;
  sources: Ref[];
  categories: Ref[];
  accounts: Ref[];
}) {
  const isIncome = kind === "income";
  const [refId, setRefId] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<"received" | "pending">("received");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setRefId("");
    setAmount("");
    setAccountId("");
    setStatus(isIncome ? "received" : "received");
    setNote("");
    setErr(null);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    const amt = Math.round(Number(amount) || 0);
    let res;
    if (isIncome) {
      if (!refId) return fail("Chọn nguồn thu");
      if (status === "received" && !accountId) return fail("Chọn tài khoản nhận");
      res = await recordIncome({
        sourceId: refId,
        amount: amt,
        monthKey,
        status,
        accountId: status === "received" ? accountId : null,
        note,
      });
    } else {
      if (!refId) return fail("Chọn danh mục");
      if (!accountId) return fail("Chọn tài khoản chi");
      res = await recordExpense({
        categoryId: refId,
        amount: amt,
        monthKey,
        accountId,
        note,
      });
    }
    if (!res?.ok) return fail(res?.error ?? "Lỗi lưu giao dịch");
    setBusy(false);
    reset();
    onClose();

    function fail(m: string) {
      setErr(m);
      setBusy(false);
      return undefined;
    }
  }

  const t = isIncome ? txTypeStyle.income : txTypeStyle.expense;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={isIncome ? "Thêm khoản thu" : "Thêm khoản chi"}
      icon={isIncome ? "ph-duotone ph-plus-circle" : "ph-duotone ph-minus-circle"}
      iconBg={t.bg}
      iconFg={t.fg}
    >
      <div className="flex flex-col gap-[14px]">
        <Field label={isIncome ? "Nguồn" : "Danh mục"}>
          <Select value={refId} onChange={(e) => setRefId(e.target.value)}>
            <option value="">— chọn —</option>
            {(isIncome ? sources : categories).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>

        <FieldRow>
          <Field label="Số tiền (₫)">
            <MoneyInput value={amount} onValueChange={setAmount} placeholder="0" />
          </Field>
          <Field label="Tài khoản">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>

        {isIncome && (
          <Field label="Trạng thái">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "received" | "pending")}>
              <option value="received">Received (đã nhận)</option>
              <option value="pending">Pending (chờ thu)</option>
            </Select>
          </Field>
        )}

        <Field label="Ghi chú">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tuỳ chọn" />
        </Field>

        {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
      </div>

      <ModalActions>
        <Button
          variant="ghost"
          className="flex-1"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Huỷ
        </Button>
        <Button variant="primary" className="flex-1" onClick={submit} disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu giao dịch"}
        </Button>
      </ModalActions>
    </Modal>
  );
}
