"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { full } from "@/lib/format";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select, MoneyInput } from "@/components/ui/Field";
import { recordIncome, recordExpense, recordTransfer } from "@/lib/actions/ledger";
import { adjustAccountBalance } from "@/lib/actions/accounts";
import type { Ref } from "@/lib/queries";

type Kind = "income" | "expense" | "transfer" | "adjust";

const KINDS: { k: Kind; label: string; icon: string; bg: string; fg: string }[] = [
  { k: "income", label: "Thu", icon: "ph-duotone ph-plus-circle", bg: "#DFF2E7", fg: "#1F7A5C" },
  { k: "expense", label: "Chi", icon: "ph-duotone ph-minus-circle", bg: "#F7E3DC", fg: "#B4573B" },
  { k: "transfer", label: "Chuyển", icon: "ph-duotone ph-arrows-left-right", bg: "#EAF4EE", fg: "#17554A" },
  { k: "adjust", label: "Điều chỉnh số dư", icon: "ph-duotone ph-sliders-horizontal", bg: "#FBF0DC", fg: "#A5731F" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Quick-add THỐNG NHẤT: 1 modal chọn Thu/Chi/Chuyển/Điều chỉnh số dư.
 * MoneyInput (dấu phân cách), ngày giao dịch (occurred_on), "Lưu & nhập tiếp".
 */
export function QuickAddModal({
  open,
  initialKind = "income",
  onClose,
  monthKey,
  sources,
  categories,
  accounts,
  balances = {},
}: {
  open: boolean;
  initialKind?: Kind;
  onClose: () => void;
  monthKey: string;
  sources: Ref[];
  categories: Ref[];
  accounts: Ref[];
  balances?: Record<string, number>; // accountId → số dư app tính (cho preview adjust)
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [refId, setRefId] = useState(""); // source | category | account (adjust) | fromAccount (transfer)
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState(""); // raw digits
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<"received" | "pending">("received");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);

  const amt = Math.round(Number(amount) || 0);
  const adjustBalance = refId in balances ? balances[refId] : null;

  function resetFields() {
    setRefId("");
    setToAccount("");
    setAmount("");
    setAccountId("");
    setStatus("received");
    setNote("");
    setErr(null);
  }
  function switchKind(k: Kind) {
    setKind(k);
    resetFields();
  }
  function fail(m: string) {
    setErr(m);
    setBusy(false);
    return undefined;
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    let res: { ok: boolean; error?: string } | undefined;

    if (kind === "income") {
      if (!refId) return fail("Chọn nguồn thu");
      if (amt <= 0) return fail("Nhập số tiền");
      if (status === "received" && !accountId) return fail("Chọn tài khoản nhận");
      res = await recordIncome({
        sourceId: refId,
        amount: amt,
        monthKey,
        status,
        accountId: status === "received" ? accountId : null,
        note,
        occurredOn: date,
      });
    } else if (kind === "expense") {
      if (!refId) return fail("Chọn danh mục");
      if (amt <= 0) return fail("Nhập số tiền");
      if (!accountId) return fail("Chọn tài khoản chi");
      res = await recordExpense({ categoryId: refId, amount: amt, monthKey, accountId, note, occurredOn: date });
    } else if (kind === "transfer") {
      if (!refId || !toAccount) return fail("Chọn tài khoản nguồn và đích");
      if (amt <= 0) return fail("Nhập số tiền");
      res = await recordTransfer({ fromAccountId: refId, toAccountId: toAccount, amount: amt, monthKey, note, occurredOn: date });
    } else {
      // adjust: nhập số dư THỰC TẾ → RPC tạo tx bù chênh lệch.
      if (!refId) return fail("Chọn tài khoản");
      res = await adjustAccountBalance({ accountId: refId, actual: amt, monthKey, note });
    }

    setBusy(false);
    if (!res?.ok) return fail(res?.error ?? "Lỗi lưu");

    if (keepOpen) {
      // giữ modal + loại + ngày, chỉ xoá số tiền/ghi chú để nhập tiếp nhanh.
      setAmount("");
      setNote("");
      setErr(null);
      router.refresh();
    } else {
      resetFields();
      onClose();
      router.refresh();
    }
  }

  const cur = KINDS.find((x) => x.k === kind)!;

  return (
    <Modal open={open} onClose={onClose} title="Thêm giao dịch" icon={cur.icon} iconBg={cur.bg} iconFg={cur.fg} width={480}>
      {/* Chọn loại */}
      <div className="flex gap-[6px] mb-4 flex-wrap">
        {KINDS.map((x) => (
          <button
            key={x.k}
            onClick={() => switchKind(x.k)}
            className="flex items-center gap-[6px] rounded-full px-[13px] py-[8px] text-[12px] font-bold cursor-pointer border-0"
            style={{
              background: kind === x.k ? x.fg : "#F2EFE6",
              color: kind === x.k ? "#fff" : "#4C5A54",
            }}
          >
            <i className={x.icon} aria-hidden />
            {x.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-[14px]">
        {/* Nguồn / Danh mục / Tài khoản tuỳ loại */}
        {kind === "income" && (
          <Field label="Nguồn thu">
            <Select value={refId} onChange={(e) => setRefId(e.target.value)}>
              <option value="">— chọn —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {kind === "expense" && (
          <Field label="Danh mục chi">
            <Select value={refId} onChange={(e) => setRefId(e.target.value)}>
              <option value="">— chọn —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {(kind === "transfer" || kind === "adjust") && (
          <Field label={kind === "transfer" ? "Từ tài khoản" : "Tài khoản"}>
            <Select value={refId} onChange={(e) => setRefId(e.target.value)}>
              <option value="">— chọn —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {kind === "transfer" && (
          <Field label="Đến tài khoản">
            <Select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <option value="">— chọn —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        )}

        {/* Số tiền + ngày */}
        <FieldRow>
          <Field label={kind === "adjust" ? "Số dư thực tế (₫)" : "Số tiền (₫)"}>
            <MoneyInput value={amount} onValueChange={setAmount} placeholder="0" autoFocus />
          </Field>
          {kind !== "adjust" && (
            <Field label="Ngày">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
        </FieldRow>

        {/* Tài khoản nhận/chi (income received + expense) */}
        {(kind === "income" || kind === "expense") && !(kind === "income" && status === "pending") && (
          <Field label={kind === "income" ? "Nhận vào tài khoản" : "Chi từ tài khoản"}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— chọn —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {kind === "income" && (
          <Field label="Trạng thái">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "received" | "pending")}>
              <option value="received">Đã nhận</option>
              <option value="pending">Chờ thu</option>
            </Select>
          </Field>
        )}

        {kind === "adjust" && adjustBalance != null && (
          <div className="rounded-[10px] px-[13px] py-[10px] text-[12px] bg-[#F7F4EC] text-[#4C5A54]">
            App đang tính <b>{full(adjustBalance)}</b>. Chênh lệch:{" "}
            <b style={{ color: amt - adjustBalance >= 0 ? "#1F7A5C" : "#B4573B" }}>
              {amt - adjustBalance >= 0 ? "+" : "−"}
              {full(Math.abs(amt - adjustBalance))}
            </b>{" "}
            — sẽ tạo giao dịch bù.
          </div>
        )}

        <Field label="Ghi chú">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tuỳ chọn" />
        </Field>

        <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-soft cursor-pointer">
          <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} />
          Lưu &amp; nhập tiếp (giữ modal)
        </label>

        {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
      </div>

      <ModalActions>
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Đóng
        </Button>
        <Button variant="primary" className="flex-1" onClick={submit} disabled={busy}>
          {busy ? "Đang lưu…" : keepOpen ? "Lưu & nhập tiếp" : "Lưu"}
        </Button>
      </ModalActions>
    </Modal>
  );
}
