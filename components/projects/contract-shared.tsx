"use client";
import { useState } from "react";
import { fmt, full } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { DueDateButton } from "@/components/ui/DueDateButton";
import {
  createPayment,
  billPayment,
  collectPayment,
  cancelPayment,
  setPaymentDueOn,
} from "@/lib/actions/projects";
import { rollbackStatus } from "@/lib/actions/ledger";
import type { ContractFinance, Payment, PaymentModel } from "@/lib/queries/projects";
import type { Ref } from "@/lib/queries";

export const MODELS: { v: PaymentModel; label: string; hint: string }[] = [
  { v: "fixed_milestones", label: "Milestone (dự án)", hint: "nhiều đợt cố định" },
  { v: "one_shot", label: "Fixed (1 lần)", hint: "1 khoản duy nhất" },
  { v: "hourly_weekly", label: "Hourly (theo tuần)", hint: "giờ × rate mỗi tuần" },
  { v: "monthly_retainer", label: "Retainer (tháng)", hint: "khoản cố định hàng tháng" },
];
export const modelLabel = (m: PaymentModel) => MODELS.find((x) => x.v === m)?.label ?? m;
export const modelIcon = (m: PaymentModel) =>
  m === "fixed_milestones" ? "ph-duotone ph-buildings"
  : m === "hourly_weekly" ? "ph-duotone ph-clock-countdown"
  : m === "monthly_retainer" ? "ph-duotone ph-repeat"
  : "ph-duotone ph-globe";

export const contractStatusStyle: Record<string, { label: string; bg: string; fg: string }> = {
  active: { label: "Active", bg: "#EAF4EE", fg: "#17554A" },
  maintenance: { label: "Maintenance", bg: "#EAF4EE", fg: "#17554A" },
  paused: { label: "Paused", bg: "#EDEAE0", fg: "#9AA49E" },
  done: { label: "Đã kết thúc", bg: "#DFF2E7", fg: "#1F7A5C" },
  cancelled: { label: "Cancelled", bg: "#EDEAE0", fg: "#9AA49E" },
};

const payStatusStyle: Record<Payment["status"], { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#EDEAE0", fg: "#6B7570" },
  billed: { label: "Pending", bg: "#FBF0DC", fg: "#A5731F" },
  received: { label: "Received", bg: "#DFF2E7", fg: "#1F7A5C" },
  cancelled: { label: "Cancelled", bg: "#EDEAE0", fg: "#9AA49E" },
};

const usd = (v: number) => "$" + new Intl.NumberFormat("en-US").format(Math.round(v));
function ccy(v: number, cur: string) {
  const s = new Intl.NumberFormat("en-US").format(Math.round(v));
  return cur === "CAD" ? "C$" + s : cur === "USD" ? "$" + s : s + " ₫";
}
function isoAddDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, opts?: { key?: string; ok?: string }) => Promise<{ ok: boolean; error?: string }>;
type ConfirmRunner = (msg: string, fn: () => Promise<{ ok: boolean; error?: string }>, opts?: { key?: string; ok?: string }) => Promise<{ ok: boolean }>;

/**
 * Danh sách đợt của 1 hợp đồng + thao tác (bill/collect/rollback/cancel/due) + form
 * thêm đợt. Dùng CHUNG ở danh sách (variant="list") và trang detail (variant="detail").
 * Giữ nguyên hành vi/tính tiền theo model như module Upwork.
 */
export function PaymentRows({
  contract: c,
  monthKey,
  accounts,
  fx,
  fxUsd,
  feePctDefault,
  run,
  confirmRun,
  pending,
  variant = "list",
}: {
  contract: ContractFinance;
  monthKey: string;
  accounts: Ref[];
  fx: Record<string, number>;
  fxUsd: number;
  feePctDefault: number;
  run: Runner;
  confirmRun?: ConfirmRunner;
  pending: (key: string) => boolean;
  variant?: "list" | "detail";
}) {
  const upwork = c.payment_model !== "fixed_milestones";
  const fee = c.fee_pct ?? (upwork ? feePctDefault : 0);

  const [addOpen, setAddOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pHours, setPHours] = useState("");
  const [pWeekStart, setPWeekStart] = useState("");
  const [busy, setBusy] = useState(false);

  const [collect, setCollect] = useState<{ id: string; label: string; amountVnd: number } | null>(null);
  const [collectAccount, setCollectAccount] = useState("");

  const confirm2: ConfirmRunner =
    confirmRun ?? ((msg, fn, opts) => (window.confirm(msg) ? run(fn, opts) : Promise.resolve({ ok: false })));

  async function addPayment() {
    setBusy(true);
    let res;
    if (c.payment_model === "hourly_weekly") {
      if (!pHours) { setBusy(false); return alert("Nhập số giờ"); }
      const end = pWeekStart ? isoAddDays(pWeekStart, 6) : null;
      res = await createPayment({
        contractId: c.id, kind: "weekly",
        name: pName || (pWeekStart ? `Tuần ${pWeekStart}` : "Tuần"),
        hours: Number(pHours), periodStart: pWeekStart || null, periodEnd: end,
      });
    } else {
      if (!pAmount) { setBusy(false); return alert("Nhập số tiền"); }
      res = await createPayment({
        contractId: c.id,
        kind: c.payment_model === "fixed_milestones" ? "milestone" : "one_shot",
        name: pName || "Khoản", amount: Number(pAmount),
      });
    }
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setPName(""); setPAmount(""); setPHours(""); setPWeekStart(""); setAddOpen(false);
    run(async () => ({ ok: true })); // trigger refresh
  }

  // giá trị đợt hiển thị theo model + currency
  function rowValue(p: Payment) {
    if (upwork) {
      const grossUsd = c.payment_model === "hourly_weekly" ? (p.hours ?? 0) * (c.hourly_rate ?? 0) : p.amount ?? 0;
      const netUsd = grossUsd * (1 - fee);
      const vnd = p.amount_vnd ?? Math.round(netUsd * fxUsd);
      return { primary: `net ${usd(netUsd)}`, secondary: `gross ${usd(grossUsd)}`, vnd };
    }
    const amt = p.amount ?? 0;
    const vnd = p.amount_vnd ?? Math.round(amt * (fx[c.currency] ?? 1));
    return { primary: ccy(amt, c.currency), secondary: null as string | null, vnd };
  }

  const showAdd = c.status !== "done" && c.status !== "cancelled" && c.payment_model !== "monthly_retainer";

  return (
    <div className={variant === "detail" ? "" : "mt-4"}>
      <div className="flex flex-col gap-2">
        {c.payments.length === 0 && (
          <div className="text-[12px] text-faint italic">Chưa có đợt nào.</div>
        )}
        {c.payments.map((p) => {
          const sm = payStatusStyle[p.status];
          const rv = rowValue(p);
          const locked = p.amount_vnd != null;
          const k = `pay-${p.id}`;
          return (
            <div key={p.id} className="flex items-center gap-3 border border-[#EFEAE0] rounded-[12px] px-[14px] py-[10px] hover:border-[#C9C0AC] hover:bg-[#FAF8F2] flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <div className="text-[13px] font-semibold">
                  {p.name || "Đợt"}
                  {c.payment_model === "hourly_weekly" && p.hours != null && (
                    <span className="text-[11px] text-muted font-normal"> · {p.hours}h × {usd(c.hourly_rate ?? 0)}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted tnum" title={full(rv.vnd)}>
                  {rv.secondary ? `${rv.secondary} · ` : ""}{rv.primary} · <b>{fmt(rv.vnd)}</b>
                  <span className="text-faint"> · {locked ? `@ ${new Intl.NumberFormat("en-US").format(p.fx_rate ?? 0)}` : "ước tính"}</span>
                  {(p.received_on || p.billed_on) && <span className="text-faint"> · {p.received_on ?? p.billed_on}</span>}
                  {!p.received_on && !p.billed_on && p.due_on && <span className="text-[#A5731F]"> · dự kiến {p.due_on}</span>}
                </div>
              </div>
              <Badge bg={sm.bg} fg={sm.fg}>{sm.label}</Badge>
              {(p.status === "draft" || p.status === "billed") && (
                <DueDateButton value={p.due_on} onSave={(d) => run(() => setPaymentDueOn(p.id, d))} size={30} />
              )}
              {p.status === "draft" && (
                <button onClick={() => run(() => billPayment(p.id, monthKey), { key: k, ok: "Đã bill đợt" })} disabled={pending(k)}
                  className="bg-primary-dark text-white border-0 rounded-full px-[12px] py-[6px] text-[11px] font-bold cursor-pointer hover:bg-[#0A211C] disabled:opacity-50">
                  {pending(k) ? "…" : "Bill"}
                </button>
              )}
              {p.status === "billed" && (
                <button onClick={() => { setCollect({ id: p.id, label: `${c.client} · ${p.name}`, amountVnd: rv.vnd }); setCollectAccount(""); }} disabled={pending(k)}
                  className="bg-primary text-white border-0 rounded-full px-[12px] py-[6px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover disabled:opacity-50">
                  Collect
                </button>
              )}
              {(p.status === "billed" || p.status === "received") && (
                <button
                  onClick={() => {
                    const back = p.status === "received" ? "billed" : "draft";
                    confirm2(`Lùi "${p.name}" từ ${p.status} → ${back}?${p.status === "received" ? " Tiền về chờ thu." : " Hoá đơn sẽ bị xoá."}`, () => rollbackStatus("payments", p.id), { key: k });
                  }}
                  disabled={pending(k)} title="Lùi 1 bước"
                  className="bg-chip text-ink-soft border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#EDE8DC] hover:text-primary disabled:opacity-50">
                  <i className="ph-duotone ph-arrow-counter-clockwise" aria-hidden />
                </button>
              )}
              {(p.status === "draft" || p.status === "billed") && (
                <button onClick={() => confirm2(`Huỷ đợt "${p.name}"?`, () => cancelPayment(p.id), { key: k })} disabled={pending(k)} title="Huỷ đợt"
                  className="bg-chip text-[#B4573B] border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#F7E3DC] disabled:opacity-50">
                  <i className="ph-duotone ph-x-circle" aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Thêm đợt */}
      {showAdd && (
        <div className="mt-3">
          {addOpen ? (
            <div className="flex items-center gap-2 flex-wrap bg-fill-soft rounded-[12px] p-2">
              <TextInput value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Tên đợt" className="max-w-[140px]" />
              {c.payment_model === "hourly_weekly" ? (
                <>
                  <TextInput type="date" value={pWeekStart} onChange={(e) => setPWeekStart(e.target.value)} className="max-w-[150px]" />
                  <TextInput type="number" value={pHours} onChange={(e) => setPHours(e.target.value)} placeholder="Giờ" className="max-w-[90px]" />
                </>
              ) : (
                <TextInput type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} placeholder={upwork ? "USD" : c.currency} className="max-w-[120px]" />
              )}
              <Button variant="primary" onClick={addPayment} disabled={busy}>+ Thêm</Button>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Đóng</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => { setAddOpen(true); setPName(""); setPAmount(""); setPHours(""); setPWeekStart(""); }}>
              {c.payment_model === "hourly_weekly" ? "+ Thêm đợt tuần" : c.payment_model === "fixed_milestones" ? "+ Thêm milestone" : "+ Thêm khoản"}
            </Button>
          )}
        </div>
      )}

      {/* Collect modal */}
      <Modal open={!!collect} onClose={() => setCollect(null)} title="Collect payment" icon="ph-duotone ph-hand-coins" iconBg="#DFF2E7" iconFg="#1F7A5C">
        {collect && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">{collect.label} — <b>{full(collect.amountVnd)}</b></div>
            <Field label="Chuyển vào tài khoản">
              <Select value={collectAccount} onChange={(e) => setCollectAccount(e.target.value)}>
                <option value="">— chọn —</option>
                {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
              </Select>
            </Field>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={() => setCollect(null)}>Huỷ</Button>
              <Button variant="primary" className="flex-1" disabled={!collectAccount}
                onClick={async () => { await run(() => collectPayment(collect.id, collectAccount), { ok: "Đã thu vào tài khoản" }); setCollect(null); }}>
                Confirm & add to ledger
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </div>
  );
}
