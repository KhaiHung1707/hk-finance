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
  // Hợp đồng đã kết thúc/huỷ → chặn thao tác tạo mới (bill/due); vẫn cho thu nốt (collect/rollback).
  const contractOpen = c.status !== "done" && c.status !== "cancelled";

  const [addOpen, setAddOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pHours, setPHours] = useState("");
  const [pWeekStart, setPWeekStart] = useState("");
  const [busy, setBusy] = useState(false);

  const [collect, setCollect] = useState<{ id: string; label: string; amountVnd: number } | null>(null);
  const [collectAccount, setCollectAccount] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null); // đợt đang xem chi tiết

  const confirm2: ConfirmRunner =
    confirmRun ?? ((msg, fn, opts) => (window.confirm(msg) ? run(fn, opts) : Promise.resolve({ ok: false })));

  function openCollect(p: Payment, vnd: number) {
    setCollect({ id: p.id, label: `${c.client} · ${p.name}`, amountVnd: vnd });
    setCollectAccount("");
  }

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
            <div key={p.id} className="flex items-center gap-3 border border-[#EFEAE0] rounded-[12px] px-[14px] py-[10px] hover:border-[#C9C0AC] hover:bg-[#FAF8F2]">
              <button
                type="button"
                onClick={() => setDetailId(p.id)}
                className="flex-1 min-w-0 text-left bg-transparent border-0 cursor-pointer p-0"
                title="Xem chi tiết đợt"
              >
                <div className="text-[13px] font-semibold hover:text-primary flex items-center gap-[6px]">
                  <span className="truncate">{p.name || "Đợt"}</span>
                  {c.payment_model === "hourly_weekly" && p.hours != null && (
                    <span className="text-[11px] text-muted font-normal whitespace-nowrap">· {p.hours}h × {usd(c.hourly_rate ?? 0)}</span>
                  )}
                  <i className="ph-duotone ph-caret-right text-faint text-[11px] flex-shrink-0" aria-hidden />
                </div>
                <div className="text-[11px] text-muted tnum truncate" title={full(rv.vnd)}>
                  {rv.secondary ? `${rv.secondary} · ` : ""}{rv.primary} · <b>{fmt(rv.vnd)}</b>
                  <span className="text-faint"> · {locked ? `@ ${new Intl.NumberFormat("en-US").format(p.fx_rate ?? 0)} ${c.currency}` : "ước tính"}</span>
                  {(p.received_on || p.billed_on) && <span className="text-faint"> · {p.received_on ?? p.billed_on}</span>}
                  {!p.received_on && !p.billed_on && p.due_on && <span className="text-[#A5731F]"> · dự kiến {p.due_on}</span>}
                </div>
              </button>
              {/* Cụm action: luôn dính nhau, chỉ cả cụm xuống dòng nguyên khối khi hẹp */}
              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              <Badge bg={sm.bg} fg={sm.fg}>{sm.label}</Badge>
              {(p.status === "draft" || p.status === "billed") && contractOpen && (
                <DueDateButton value={p.due_on} onSave={(d) => run(() => setPaymentDueOn(p.id, d))} size={30} />
              )}
              {p.status === "draft" && contractOpen && (
                <button onClick={() => run(() => billPayment(p.id, monthKey), { key: k, ok: "Đã bill đợt" })} disabled={pending(k)}
                  className="bg-primary-dark text-white border-0 rounded-full px-[12px] py-[6px] text-[11px] font-bold cursor-pointer hover:bg-[#0A211C] disabled:opacity-50">
                  {pending(k) ? "…" : "Bill"}
                </button>
              )}
              {p.status === "billed" && (
                <button onClick={() => openCollect(p, rv.vnd)} disabled={pending(k)}
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

      {/* Pop-up chi tiết từng đợt/milestone */}
      <PaymentDetailModal
        payment={c.payments.find((p) => p.id === detailId) ?? null}
        contract={c}
        monthKey={monthKey}
        fx={fx}
        fxUsd={fxUsd}
        fee={fee}
        upwork={upwork}
        run={run}
        confirm2={confirm2}
        pending={pending}
        onClose={() => setDetailId(null)}
        onCollect={(p, vnd) => { setDetailId(null); openCollect(p, vnd); }}
      />
    </div>
  );
}

/** Pop-up chi tiết 1 đợt: mọi trường + timeline + thao tác. */
function PaymentDetailModal({
  payment: p, contract: c, monthKey, fx, fxUsd, fee, upwork, run, confirm2, pending, onClose, onCollect,
}: {
  payment: Payment | null;
  contract: ContractFinance;
  monthKey: string;
  fx: Record<string, number>;
  fxUsd: number;
  fee: number;
  upwork: boolean;
  run: Runner;
  confirm2: ConfirmRunner;
  pending: (key: string) => boolean;
  onClose: () => void;
  onCollect: (p: Payment, vnd: number) => void;
}) {
  if (!p) return null;
  const sm = payStatusStyle[p.status];
  const k = `pay-${p.id}`;
  const grossUsd = upwork ? (c.payment_model === "hourly_weekly" ? (p.hours ?? 0) * (c.hourly_rate ?? 0) : p.amount ?? 0) : 0;
  const netUsd = grossUsd * (1 - fee);
  const vnd = p.amount_vnd ?? (upwork ? Math.round(netUsd * fxUsd) : Math.round((p.amount ?? 0) * (fx[c.currency] ?? 1)));
  const locked = p.amount_vnd != null;

  const rows: [string, React.ReactNode][] = [];
  rows.push(["Loại đợt", kindLabel(p.kind)]);
  if (c.payment_model === "hourly_weekly") {
    rows.push(["Số giờ", `${p.hours ?? 0}h × ${usd(c.hourly_rate ?? 0)}/giờ`]);
    rows.push(["Gross", usd(grossUsd)]);
    rows.push([`Net (sau phí ${Math.round(fee * 100)}%)`, usd(netUsd)]);
  } else if (upwork) {
    rows.push(["Gross", usd(grossUsd)]);
    rows.push([`Net (sau phí ${Math.round(fee * 100)}%)`, usd(netUsd)]);
  } else {
    rows.push(["Giá trị", ccy(p.amount ?? 0, c.currency)]);
  }
  rows.push([locked ? "VND (đã khoá)" : "VND (ước tính)", <b key="vnd">{full(vnd)}</b>]);
  if (p.fx_rate != null) rows.push(["Tỷ giá khoá", `${new Intl.NumberFormat("en-US").format(p.fx_rate)} (${c.currency}→VND)`]);
  if (p.period_start || p.period_end) rows.push(["Kỳ (tuần)", `${p.period_start ?? "?"} → ${p.period_end ?? "?"}`]);
  if (p.period_month) rows.push(["Tháng (retainer)", p.period_month]);

  return (
    <Modal open onClose={onClose} title={p.name || "Chi tiết đợt"} icon="ph-duotone ph-receipt" width={460}>
      <div className="flex items-center gap-2 mb-3">
        <Badge bg={sm.bg} fg={sm.fg}>{sm.label}</Badge>
        <span className="text-[12px] text-muted">{c.client}{c.name ? ` · ${c.name}` : ""}</span>
      </div>

      {/* Bảng thông tin */}
      <div className="flex flex-col gap-0 rounded-[12px] border border-card-border overflow-hidden mb-3">
        {rows.map(([label, val], i) => (
          <div key={label} className="flex items-center justify-between px-4 py-[9px] text-[13px]" style={{ background: i % 2 ? "#FAF8F2" : "#fff" }}>
            <span className="text-muted">{label}</span>
            <span className="font-semibold tnum text-right">{val}</span>
          </div>
        ))}
      </div>

      {/* Timeline ngày */}
      <div className="mb-3">
        <div className="text-[11px] font-bold text-muted uppercase tracking-[0.4px] mb-2">Timeline</div>
        <div className="flex flex-col gap-2">
          <TimelineStep done={!!p.due_on} label="Dự kiến bill" date={p.due_on} icon="ph-duotone ph-calendar-dots" />
          <TimelineStep done={!!p.billed_on} label="Đã bill (chờ thu)" date={p.billed_on} icon="ph-duotone ph-hourglass-medium" />
          <TimelineStep done={!!p.received_on} label="Đã thu" date={p.received_on} icon="ph-duotone ph-check-circle" />
        </div>
      </div>

      {/* Thao tác theo trạng thái */}
      <ModalActions>
        {p.status === "draft" && (
          <Button variant="primary" className="flex-1" disabled={pending(k)}
            onClick={() => run(() => billPayment(p.id, monthKey), { key: k, ok: "Đã bill đợt" }).then((r) => { if (r.ok) onClose(); })}>
            Bill đợt này
          </Button>
        )}
        {p.status === "billed" && (
          <Button variant="primary" className="flex-1" onClick={() => onCollect(p, vnd)}>Collect (thu tiền)</Button>
        )}
        {(p.status === "billed" || p.status === "received") && (
          <Button variant="ghost" className="flex-1"
            onClick={() => {
              const back = p.status === "received" ? "billed" : "draft";
              confirm2(`Lùi "${p.name}" từ ${p.status} → ${back}?`, () => rollbackStatus("payments", p.id), { key: k }).then((r) => { if (r.ok) onClose(); });
            }}>
            Lùi 1 bước
          </Button>
        )}
        {(p.status === "draft" || p.status === "billed") && (
          <button
            onClick={() => confirm2(`Huỷ đợt "${p.name}"?`, () => cancelPayment(p.id), { key: k }).then((r) => { if (r.ok) onClose(); })}
            className="bg-[#F7E3DC] text-[#B4573B] border-0 rounded-full px-[16px] py-[10px] text-[13px] font-bold cursor-pointer hover:bg-[#F0D2C6]">
            Huỷ
          </button>
        )}
        <Button variant="ghost" onClick={onClose}>Đóng</Button>
      </ModalActions>
    </Modal>
  );
}

function TimelineStep({ done, label, date, icon }: { done: boolean; label: string; date: string | null; icon: string }) {
  return (
    <div className="flex items-center gap-[10px]">
      <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[13px] flex-shrink-0"
        style={{ background: done ? "#DFF2E7" : "#F2EFE6", color: done ? "#1F7A5C" : "#9AA49E" }}>
        <i className={icon} aria-hidden />
      </div>
      <div className="flex-1 flex items-center justify-between">
        <span className={`text-[13px] ${done ? "font-semibold" : "text-muted"}`}>{label}</span>
        <span className="text-[12px] text-muted tnum">{date ?? "—"}</span>
      </div>
    </div>
  );
}

function kindLabel(k: Payment["kind"]): string {
  return k === "milestone" ? "Milestone" : k === "weekly" ? "Tuần (hourly)" : k === "monthly" ? "Tháng (retainer)" : "Một lần";
}
