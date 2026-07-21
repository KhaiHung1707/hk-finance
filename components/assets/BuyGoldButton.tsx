"use client";
import { useState } from "react";
import { full } from "@/lib/format";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { buyGoldLot } from "@/lib/actions/assets";
import type { Ref } from "@/lib/queries";

/** Nút + modal "Buy gold" ở header Assets. */
export function BuyGoldButton({
  accounts,
  monthKey,
  suggestedPrice,
}: {
  accounts: Ref[];
  monthKey: string;
  suggestedPrice: number;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(String(suggestedPrice || ""));
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const res = await buyGoldLot({
      quantity: Number(qty) || 0,
      unitCost: Math.round(Number(cost) || 0),
      accountId: account || null,
      monthKey,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "Lỗi");
      return;
    }
    setQty("");
    setAccount("");
    setOpen(false);
  }

  return (
    <>
      <HeaderPortal>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          Buy gold
        </button>
      </HeaderPortal>

      <Modal open={open} onClose={() => setOpen(false)} title="Buy gold" icon="ph-duotone ph-coins" iconBg="#FBF0DC" iconFg="#A5731F">
        <div className="flex flex-col gap-[14px]">
          <FieldRow>
            <Field label="Số lượng (chỉ)">
              <TextInput type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" />
            </Field>
            <Field label="Giá / chỉ (₫)">
              <TextInput type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
            </Field>
          </FieldRow>
          <Field label="Nguồn tiền (để trống nếu mua trước app)">
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">— pre-app (không trừ số dư) —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="text-[11px] text-muted">
            Tổng chi <b className="text-ink">{full((Number(qty) || 0) * (Number(cost) || 0))}</b>
          </div>
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button variant="primary" className="flex-1" onClick={submit} disabled={busy}>
            {busy ? "…" : "Add gold lot"}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
