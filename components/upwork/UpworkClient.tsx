"use client";
import { useState } from "react";
import { fmt, full, pct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { DueDateButton } from "@/components/ui/DueDateButton";
import {
  createContract,
  updateContract,
  deleteContract,
  createPayment,
  billPayment,
  collectPayment,
  cancelPayment,
  setPaymentDueOn,
  generateRetainerPayments,
} from "@/lib/actions/projects";
import { rollbackStatus } from "@/lib/actions/ledger";
import type { ContractFinance, Payment, PaymentModel } from "@/lib/queries/projects";
import type { Ref } from "@/lib/queries";

const usd = (v: number) => "$" + new Intl.NumberFormat("en-US").format(Math.round(v));

const MODELS: { v: PaymentModel; label: string; hint: string }[] = [
  { v: "one_shot", label: "Fixed (1 lần)", hint: "1 khoản duy nhất" },
  { v: "hourly_weekly", label: "Hourly (theo tuần)", hint: "giờ × rate mỗi tuần" },
  { v: "monthly_retainer", label: "Retainer (tháng)", hint: "khoản cố định hàng tháng" },
];
const modelLabel = (m: PaymentModel) => MODELS.find((x) => x.v === m)?.label ?? m;

const payStatusStyle: Record<Payment["status"], { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#EDEAE0", fg: "#6B7570" },
  billed: { label: "Pending", bg: "#FBF0DC", fg: "#A5731F" },
  received: { label: "Received", bg: "#DFF2E7", fg: "#1F7A5C" },
  cancelled: { label: "Cancelled", bg: "#EDEAE0", fg: "#9AA49E" },
};

type EditState = {
  id: string | null;
  client: string;
  name: string;
  paymentModel: PaymentModel;
  hourlyRate: string;
  feePct: string; // % dạng số nguyên (10 = 10%); rỗng = mặc định settings
  retainerAmount: string;
};

export function UpworkClient({
  monthKey,
  contracts,
  accounts,
  fxUsd,
  feePctDefault,
}: {
  monthKey: string;
  contracts: ContractFinance[];
  accounts: Ref[];
  fxUsd: number;
  feePctDefault: number;
}) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // thêm đợt: form theo từng contract
  const [addFor, setAddFor] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pHours, setPHours] = useState("");
  const [pWeekStart, setPWeekStart] = useState("");

  // retainer generate
  const [genFor, setGenFor] = useState<string | null>(null);
  const [genFrom, setGenFrom] = useState(monthKey);
  const [genTo, setGenTo] = useState(monthKey);

  // collect
  const [collect, setCollect] = useState<{ id: string; label: string; amountVnd: number } | null>(null);
  const [collectAccount, setCollectAccount] = useState("");

  async function doAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) alert(res.error);
  }

  function openNew() {
    setEdit({ id: null, client: "", name: "", paymentModel: "one_shot", hourlyRate: "", feePct: "", retainerAmount: "" });
    setErr(null);
  }
  function openEdit(c: ContractFinance) {
    setEdit({
      id: c.id,
      client: c.client,
      name: c.name ?? "",
      paymentModel: c.payment_model,
      hourlyRate: c.hourly_rate != null ? String(c.hourly_rate) : "",
      feePct: c.fee_pct != null ? String(Math.round(c.fee_pct * 100)) : "",
      retainerAmount: c.retainer_amount != null ? String(c.retainer_amount) : "",
    });
    setErr(null);
  }

  async function saveContract() {
    if (!edit) return;
    if (!edit.client) return setErr("Nhập client");
    setBusy(true);
    setErr(null);
    const feePct = edit.feePct === "" ? null : Number(edit.feePct) / 100;
    const payload = {
      client: edit.client,
      name: edit.name,
      source: "Upwork",
      currency: "USD" as const,
      feePct,
      hourlyRate: edit.paymentModel === "hourly_weekly" && edit.hourlyRate ? Number(edit.hourlyRate) : null,
      retainerAmount: edit.paymentModel === "monthly_retainer" && edit.retainerAmount ? Number(edit.retainerAmount) : null,
    };
    const res = edit.id
      ? await updateContract({ id: edit.id, paymentModel: edit.paymentModel, ...payload })
      : await createContract({ paymentModel: edit.paymentModel, ...payload });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Lỗi");
    setEdit(null);
  }

  async function removeContract() {
    if (!edit?.id) return;
    if (!confirm(`Xoá hợp đồng "${edit.client}"? Đợt nháp sẽ xoá theo.`)) return;
    setBusy(true);
    const res = await deleteContract(edit.id);
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Lỗi");
    setEdit(null);
  }

  async function addPayment(c: ContractFinance) {
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
      if (!pAmount) { setBusy(false); return alert("Nhập số tiền USD"); }
      res = await createPayment({
        contractId: c.id, kind: "one_shot", name: pName || "Khoản", amount: Number(pAmount),
      });
    }
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setPName(""); setPAmount(""); setPHours(""); setPWeekStart(""); setAddFor(null);
  }

  async function runGenerate(c: ContractFinance) {
    setBusy(true);
    const res = await generateRetainerPayments(c.id, genFrom, genTo);
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setGenFor(null);
  }

  // preview net cho form contract hourly
  const previewRate = edit && edit.hourlyRate ? Number(edit.hourlyRate) : 0;
  const previewFee = edit && edit.feePct !== "" ? Number(edit.feePct) / 100 : feePctDefault;

  return (
    <>
      <HeaderPortal>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          New contract
        </button>
      </HeaderPortal>

      {contracts.length === 0 && (
        <div className="bg-card border border-card-border rounded-[18px] p-8 text-center text-[13px] text-muted">
          Chưa có hợp đồng Upwork. Bấm “New contract”.
        </div>
      )}

      {contracts.map((c) => {
        const fee = c.fee_pct ?? feePctDefault;
        return (
          <div key={c.id} className="bg-card border border-card-border rounded-[18px] p-[22px]">
            {/* Header contract */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-[14px]">
                <div className="w-[46px] h-[46px] rounded-[13px] bg-chip text-primary flex items-center justify-center text-[22px] flex-shrink-0">
                  <i className="ph-duotone ph-globe" aria-hidden />
                </div>
                <div>
                  <div className="text-[16px] font-bold">{c.client}</div>
                  <div className="text-[12px] text-muted mt-[2px]">
                    {c.name ? `${c.name} · ` : ""}
                    {modelLabel(c.payment_model)}
                    {c.payment_model === "hourly_weekly" && c.hourly_rate != null && ` · ${usd(c.hourly_rate)}/giờ`}
                    {c.payment_model === "monthly_retainer" && c.retainer_amount != null && ` · ${usd(c.retainer_amount)}/tháng`}
                    {` · fee ${pct(fee, 0)}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-right">
                  <div className="text-[11px] text-muted font-semibold">Đã thu</div>
                  <div className="text-[15px] font-extrabold tnum text-[#1F7A5C]" title={full(c.collected_vnd)}>
                    {fmt(c.collected_vnd)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted font-semibold">Chờ thu</div>
                  <div className="text-[15px] font-extrabold tnum" title={full(c.outstanding_vnd)}>
                    {fmt(c.outstanding_vnd)}
                  </div>
                </div>
                <button
                  onClick={() => openEdit(c)}
                  className="flex items-center gap-[6px] bg-transparent text-ink-soft border border-card-border rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:border-primary hover:text-primary"
                >
                  <i className="ph-duotone ph-pencil-simple" aria-hidden />
                  Edit
                </button>
              </div>
            </div>

            {/* Payments (đợt) */}
            <div className="mt-4 flex flex-col gap-2">
              {c.payments.length === 0 && (
                <div className="text-[12px] text-faint italic">Chưa có đợt nào — thêm đợt bên dưới.</div>
              )}
              {c.payments.map((p) => {
                const sm = payStatusStyle[p.status];
                const grossUsd =
                  c.payment_model === "hourly_weekly"
                    ? (p.hours ?? 0) * (c.hourly_rate ?? 0)
                    : p.amount ?? 0;
                const netUsd = grossUsd * (1 - fee);
                const vnd = p.amount_vnd ?? Math.round(netUsd * fxUsd);
                const locked = p.amount_vnd != null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 border border-[#EFEAE0] rounded-[12px] px-[14px] py-[10px] hover:border-[#C9C0AC] hover:bg-[#FAF8F2] flex-wrap"
                  >
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-[13px] font-semibold">
                        {p.name || "Đợt"}
                        {c.payment_model === "hourly_weekly" && p.hours != null && (
                          <span className="text-[11px] text-muted font-normal"> · {p.hours}h × {usd(c.hourly_rate ?? 0)}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted tnum" title={full(vnd)}>
                        gross {usd(grossUsd)} · net {usd(netUsd)} · <b>{fmt(vnd)}</b>
                        <span className="text-faint"> · {locked ? `@ ${new Intl.NumberFormat("en-US").format(p.fx_rate ?? 0)}` : "ước tính"}</span>
                        {(p.received_on || p.billed_on) && <span className="text-faint"> · {p.received_on ?? p.billed_on}</span>}
                        {!p.received_on && !p.billed_on && p.due_on && <span className="text-[#A5731F]"> · dự kiến {p.due_on}</span>}
                      </div>
                    </div>
                    <Badge bg={sm.bg} fg={sm.fg}>{sm.label}</Badge>
                    {(p.status === "draft" || p.status === "billed") && (
                      <DueDateButton value={p.due_on} onSave={(d) => doAction(() => setPaymentDueOn(p.id, d))} size={30} />
                    )}
                    {p.status === "draft" && (
                      <button
                        onClick={() => doAction(() => billPayment(p.id, monthKey))}
                        disabled={busy}
                        className="bg-primary-dark text-white border-0 rounded-full px-[12px] py-[6px] text-[11px] font-bold cursor-pointer hover:bg-[#0A211C] disabled:opacity-50"
                      >
                        Bill
                      </button>
                    )}
                    {p.status === "billed" && (
                      <button
                        onClick={() => { setCollect({ id: p.id, label: `${c.client} · ${p.name}`, amountVnd: vnd }); setCollectAccount(""); }}
                        disabled={busy}
                        className="bg-primary text-white border-0 rounded-full px-[12px] py-[6px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover disabled:opacity-50"
                      >
                        Collect
                      </button>
                    )}
                    {(p.status === "billed" || p.status === "received") && (
                      <button
                        onClick={() => {
                          const back = p.status === "received" ? "billed" : "draft";
                          if (confirm(`Lùi "${p.name}" từ ${p.status} → ${back}?${p.status === "received" ? " Tiền về chờ thu." : " Hoá đơn sẽ bị xoá."}`))
                            doAction(() => rollbackStatus("payments", p.id));
                        }}
                        disabled={busy}
                        title="Lùi 1 bước"
                        className="bg-chip text-ink-soft border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#EDE8DC] hover:text-primary disabled:opacity-50"
                      >
                        <i className="ph-duotone ph-arrow-counter-clockwise" aria-hidden />
                      </button>
                    )}
                    {(p.status === "draft" || p.status === "billed") && (
                      <button
                        onClick={() => { if (confirm(`Huỷ đợt "${p.name}"?`)) doAction(() => cancelPayment(p.id)); }}
                        disabled={busy}
                        title="Huỷ đợt"
                        className="bg-chip text-[#B4573B] border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#F7E3DC] disabled:opacity-50"
                      >
                        <i className="ph-duotone ph-x-circle" aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Thêm đợt / generate retainer */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {c.payment_model === "monthly_retainer" ? (
                genFor === c.id ? (
                  <div className="flex items-center gap-2 flex-wrap bg-fill-soft rounded-[12px] p-2">
                    <span className="text-[11px] text-muted font-semibold px-1">Sinh đợt tháng</span>
                    <TextInput value={genFrom} onChange={(e) => setGenFrom(e.target.value)} placeholder="T7/26" className="max-w-[90px]" />
                    <span className="text-muted text-[12px]">→</span>
                    <TextInput value={genTo} onChange={(e) => setGenTo(e.target.value)} placeholder="T12/26" className="max-w-[90px]" />
                    <Button variant="primary" onClick={() => runGenerate(c)} disabled={busy}>Sinh</Button>
                    <Button variant="ghost" onClick={() => setGenFor(null)}>Đóng</Button>
                  </div>
                ) : (
                  <Button variant="ghost" onClick={() => { setGenFor(c.id); setGenFrom(monthKey); setGenTo(monthKey); }}>
                    + Sinh đợt tháng (retainer)
                  </Button>
                )
              ) : addFor === c.id ? (
                <div className="flex items-center gap-2 flex-wrap bg-fill-soft rounded-[12px] p-2">
                  <TextInput value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Tên đợt" className="max-w-[140px]" />
                  {c.payment_model === "hourly_weekly" ? (
                    <>
                      <TextInput type="date" value={pWeekStart} onChange={(e) => setPWeekStart(e.target.value)} className="max-w-[150px]" />
                      <TextInput type="number" value={pHours} onChange={(e) => setPHours(e.target.value)} placeholder="Giờ" className="max-w-[90px]" />
                    </>
                  ) : (
                    <TextInput type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} placeholder="USD" className="max-w-[120px]" />
                  )}
                  <Button variant="primary" onClick={() => addPayment(c)} disabled={busy}>+ Thêm</Button>
                  <Button variant="ghost" onClick={() => setAddFor(null)}>Đóng</Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => { setAddFor(c.id); setPName(""); setPAmount(""); setPHours(""); setPWeekStart(""); }}>
                  {c.payment_model === "hourly_weekly" ? "+ Thêm đợt tuần" : "+ Thêm khoản"}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Edit / New contract modal */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Sửa hợp đồng" : "New contract"}
        icon="ph-duotone ph-globe"
        width={480}
      >
        {edit && (
          <>
            <div className="flex flex-col gap-[14px]">
              <FieldRow>
                <Field label="Client">
                  <TextInput value={edit.client} onChange={(e) => setEdit({ ...edit, client: e.target.value })} placeholder="Oakland Co." />
                </Field>
                <Field label="Job / tên">
                  <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Dashboard UI" />
                </Field>
              </FieldRow>
              <Field label="Loại chi trả">
                <Select value={edit.paymentModel} onChange={(e) => setEdit({ ...edit, paymentModel: e.target.value as PaymentModel })}>
                  {MODELS.map((m) => (
                    <option key={m.v} value={m.v}>{m.label} — {m.hint}</option>
                  ))}
                </Select>
              </Field>
              <FieldRow>
                {edit.paymentModel === "hourly_weekly" && (
                  <Field label="Rate ($/giờ)">
                    <TextInput type="number" value={edit.hourlyRate} onChange={(e) => setEdit({ ...edit, hourlyRate: e.target.value })} placeholder="35" />
                  </Field>
                )}
                {edit.paymentModel === "monthly_retainer" && (
                  <Field label="Khoản/tháng ($)">
                    <TextInput type="number" value={edit.retainerAmount} onChange={(e) => setEdit({ ...edit, retainerAmount: e.target.value })} placeholder="1500" />
                  </Field>
                )}
                <Field label="Fee % (rỗng = mặc định)">
                  <TextInput type="number" value={edit.feePct} onChange={(e) => setEdit({ ...edit, feePct: e.target.value })} placeholder={String(Math.round(feePctDefault * 100))} />
                </Field>
              </FieldRow>
              <div className="text-[11px] text-muted">
                {edit.paymentModel === "hourly_weekly" && previewRate > 0 ? (
                  <>1 giờ = {usd(previewRate)} → net sau phí {pct(previewFee, 0)}: <b className="text-[#1F7A5C]">{usd(previewRate * (1 - previewFee))}</b>/giờ · fx {new Intl.NumberFormat("en-US").format(fxUsd)}</>
                ) : (
                  <>Phí sàn {pct(previewFee, 0)} trừ khi bill mỗi đợt · quy đổi USD→VND theo fx {new Intl.NumberFormat("en-US").format(fxUsd)} lúc bill.</>
                )}
              </div>
              {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
            </div>
            <ModalActions>
              {edit.id && (
                <button
                  onClick={removeContract}
                  disabled={busy}
                  className="flex items-center gap-2 bg-[#F7E3DC] text-[#B4573B] border-0 rounded-full px-[16px] py-[10px] text-[13px] font-bold cursor-pointer hover:bg-[#F0D2C6] disabled:opacity-50"
                >
                  <i className="ph-duotone ph-trash" aria-hidden /> Xoá
                </button>
              )}
              <Button variant="ghost" className="flex-1" onClick={() => setEdit(null)}>Đóng</Button>
              <Button variant="primary" className="flex-1" onClick={saveContract} disabled={busy}>
                {busy ? "Đang lưu…" : edit.id ? "Lưu" : "Tạo hợp đồng"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>

      {/* Collect modal */}
      <Modal
        open={!!collect}
        onClose={() => setCollect(null)}
        title="Collect payment"
        icon="ph-duotone ph-hand-coins"
        iconBg="#DFF2E7"
        iconFg="#1F7A5C"
      >
        {collect && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              {collect.label} — <b>{full(collect.amountVnd)}</b>
            </div>
            <Field label="Chuyển vào tài khoản">
              <Select value={collectAccount} onChange={(e) => setCollectAccount(e.target.value)}>
                <option value="">— chọn —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={() => setCollect(null)}>Huỷ</Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!collectAccount}
                onClick={async () => { await doAction(() => collectPayment(collect.id, collectAccount)); setCollect(null); }}
              >
                Confirm & add to ledger
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}

/** yyyy-mm-dd + n ngày → yyyy-mm-dd (dùng cho period_end tuần). */
function isoAddDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
