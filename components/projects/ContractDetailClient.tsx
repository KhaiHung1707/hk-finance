"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmt, full, pct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Field, FieldRow, TextInput, Select, MoneyInput } from "@/components/ui/Field";
import { useActionRunner, SuccessToast } from "@/components/ui/useActionRunner";
import { PaymentRows, MODELS, modelLabel, modelIcon, contractStatusStyle } from "@/components/projects/contract-shared";
import {
  updateContract,
  deleteContract,
  endContract,
  reactivateContract,
  generateRetainerPayments,
} from "@/lib/actions/projects";
import type { ContractFinance, PaymentModel } from "@/lib/queries/projects";
import type { Ref } from "@/lib/queries";

export function ContractDetailClient({
  contract: c,
  monthKey,
  accounts,
  sources,
  fx,
  fxUsd,
  feePctDefault,
}: {
  contract: ContractFinance;
  monthKey: string;
  accounts: Ref[];
  sources: Ref[];
  fx: Record<string, number>;
  fxUsd: number;
  feePctDefault: number;
}) {
  const router = useRouter();
  const { run, confirmRun, pending, toast } = useActionRunner();
  const upwork = c.payment_model !== "fixed_milestones";
  const fee = c.fee_pct ?? (upwork ? feePctDefault : 0);
  const sm = contractStatusStyle[c.status] ?? contractStatusStyle.active;

  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ed, setEd] = useState({
    client: c.client, name: c.name ?? "", paymentModel: c.payment_model as PaymentModel,
    source: c.source ?? sources[0]?.name ?? "Structure", currency: c.currency,
    hourlyRate: c.hourly_rate != null ? String(c.hourly_rate) : "",
    feePct: c.fee_pct != null ? String(Math.round(c.fee_pct * 100)) : "",
    retainerAmount: c.retainer_amount != null ? String(c.retainer_amount) : "",
    contractValue: c.contract_value != null ? String(c.contract_value) : "",
  });

  // retainer generate
  const [genFrom, setGenFrom] = useState(monthKey);
  const [genTo, setGenTo] = useState(monthKey);

  const isUp = (m: PaymentModel) => m !== "fixed_milestones";

  async function save() {
    if (!ed.client) return setErr("Nhập client");
    setBusy(true); setErr(null);
    const up = isUp(ed.paymentModel);
    const res = await updateContract({
      id: c.id, client: ed.client, name: ed.name, paymentModel: ed.paymentModel,
      source: up ? "Upwork" : ed.source, currency: up ? "USD" : ed.currency,
      feePct: up ? (ed.feePct === "" ? null : Number(ed.feePct) / 100) : null,
      hourlyRate: ed.paymentModel === "hourly_weekly" && ed.hourlyRate ? Number(ed.hourlyRate) : null,
      retainerAmount: ed.paymentModel === "monthly_retainer" && ed.retainerAmount ? Number(ed.retainerAmount) : null,
      contractValue: !up && ed.contractValue ? Number(ed.contractValue) : null,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Lỗi");
    setEditOpen(false);
    router.refresh();
  }

  const pctColl = c.contract_value_vnd > 0 ? Math.min(100, Math.round((c.collected_vnd / c.contract_value_vnd) * 100)) : 0;
  const upEdit = isUp(ed.paymentModel);

  return (
    <>
      <SuccessToast toast={toast} />

      {/* Thanh điều hướng + hành động vòng đời hợp đồng */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/projects" className="text-[13px] font-bold text-ink-soft hover:text-primary flex items-center gap-[6px]">
          <i className="ph-duotone ph-arrow-left" aria-hidden /> Tất cả hợp đồng
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {c.status !== "done" && c.status !== "cancelled" && (
            <button
              onClick={() => confirmRun("Kết thúc hợp đồng này? (phải xử lý hết đợt nháp trước)", () => endContract(c.id), { key: "end", ok: "Đã kết thúc hợp đồng" })}
              disabled={pending("end")}
              className="flex items-center gap-[6px] bg-fill-soft text-ink-soft border border-card-border rounded-full px-[14px] py-[8px] text-[12px] font-bold cursor-pointer hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <i className="ph-duotone ph-flag-checkered" aria-hidden /> Kết thúc
            </button>
          )}
          {c.status === "done" && (
            <button
              onClick={() => run(() => reactivateContract(c.id), { key: "react", ok: "Đã mở lại hợp đồng" })}
              disabled={pending("react")}
              className="flex items-center gap-[6px] bg-fill-soft text-ink-soft border border-card-border rounded-full px-[14px] py-[8px] text-[12px] font-bold cursor-pointer hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <i className="ph-duotone ph-arrow-counter-clockwise" aria-hidden /> Mở lại
            </button>
          )}
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-[6px] bg-transparent text-ink-soft border border-card-border rounded-full px-[14px] py-[8px] text-[12px] font-bold cursor-pointer hover:border-primary hover:text-primary"
          >
            <i className="ph-duotone ph-pencil-simple" aria-hidden /> Sửa
          </button>
          <button
            onClick={() => confirmRun(`Xoá hợp đồng "${c.client}"? Đợt nháp xoá theo.`, async () => {
              const r = await deleteContract(c.id);
              if (r.ok) router.push("/projects");
              return r;
            }, { key: "del" })}
            disabled={pending("del")}
            className="flex items-center gap-[6px] bg-[#F7E3DC] text-[#B4573B] border-0 rounded-full px-[14px] py-[8px] text-[12px] font-bold cursor-pointer hover:bg-[#F0D2C6] disabled:opacity-50"
          >
            <i className="ph-duotone ph-trash" aria-hidden /> Xoá
          </button>
        </div>
      </div>

      {/* Header info card */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="flex items-start gap-[16px] flex-wrap">
          <div className="w-[54px] h-[54px] rounded-[15px] bg-chip text-primary flex items-center justify-center text-[26px] flex-shrink-0">
            <i className={modelIcon(c.payment_model)} aria-hidden />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[18px] font-extrabold">{c.name || c.client}</div>
              <Badge bg={sm.bg} fg={sm.fg}>{sm.label}</Badge>
            </div>
            <div className="text-[13px] text-muted mt-1">
              {c.client} · {modelLabel(c.payment_model)} · {c.source ?? "—"} · {c.currency}
              {c.payment_model === "hourly_weekly" && c.hourly_rate != null && ` · ${c.hourly_rate} ${c.currency}/giờ`}
              {c.payment_model === "monthly_retainer" && c.retainer_amount != null && ` · ${c.retainer_amount} ${c.currency}/tháng`}
              {upwork && ` · fee ${pct(fee, 0)}`}
            </div>
            {/* Hạn gần nhất — thông tin hành động, đưa lên header thành chip */}
            {c.next_due && (
              <span className="inline-flex items-center gap-[5px] mt-2 text-[11px] font-bold text-[#A5731F] bg-[#FBF0DC] rounded-full px-[10px] py-[3px]">
                <i className="ph-duotone ph-alarm" aria-hidden />
                Hạn gần nhất: {c.next_due}
              </span>
            )}
          </div>
        </div>

        {/* Progress cho fixed_milestones */}
        {!upwork && c.contract_value_vnd > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-[12px] text-ink-soft mb-[7px]">
              <span className="font-semibold">{c.payment_paid}/{c.payment_count} đợt đã thu · giá trị {fmt(c.contract_value_vnd)}</span>
              <span className="font-extrabold">{pctColl}% thu</span>
            </div>
            <div className="h-2 rounded-full bg-[#EFEAE0] overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pctColl}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* KPI tài chính */}
      <div className="grid gap-[12px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <Kpi icon="ph-duotone ph-hand-coins" bg="#DFF2E7" fg="#1F7A5C" label="Đã thu" value={fmt(c.collected_vnd)} title={full(c.collected_vnd)} />
        <Kpi icon="ph-duotone ph-hourglass-medium" bg="#FBF0DC" fg="#A5731F" label="Chờ thu" value={fmt(c.outstanding_vnd)} title={full(c.outstanding_vnd)} />
        <Kpi icon="ph-duotone ph-scales" bg="#EAF4EE" fg="#17554A" label="Giá trị HĐ" value={c.contract_value_vnd > 0 ? fmt(c.contract_value_vnd) : "—"} title={c.contract_value_vnd > 0 ? full(c.contract_value_vnd) : undefined} />
        <Kpi icon="ph-duotone ph-clock" bg="#F2EFE6" fg="#6B7570" label="Đợt chưa bill" value={String(c.draft_count)} />
      </div>

      {/* Đợt chi trả (dùng chung PaymentRows) */}
      <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
            <i className="ph-duotone ph-list-bullets" aria-hidden />
          </div>
          <div className="text-[15px] font-bold">Các đợt chi trả</div>
          <span className="text-[11px] text-muted ml-auto">{c.payment_paid}/{c.payment_count} đợt đã thu</span>
        </div>
        <PaymentRows
          contract={c} monthKey={monthKey} accounts={accounts} fx={fx} fxUsd={fxUsd}
          feePctDefault={feePctDefault} run={run} confirmRun={confirmRun} pending={pending} variant="detail"
        />

        {/* Generate retainer */}
        {c.payment_model === "monthly_retainer" && c.status !== "done" && c.status !== "cancelled" && (
          <div className="mt-3 flex items-center gap-2 flex-wrap bg-fill-soft rounded-[12px] p-2">
            <span className="text-[11px] text-muted font-semibold px-1">Sinh đợt tháng</span>
            <TextInput value={genFrom} onChange={(e) => setGenFrom(e.target.value)} placeholder="T7/26" className="max-w-[90px]" />
            <span className="text-muted text-[12px]">→</span>
            <TextInput value={genTo} onChange={(e) => setGenTo(e.target.value)} placeholder="T12/26" className="max-w-[90px]" />
            <Button variant="primary" onClick={() => run(() => generateRetainerPayments(c.id, genFrom, genTo), { ok: "Đã sinh đợt tháng" })}>Sinh</Button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Sửa hợp đồng" icon="ph-duotone ph-pencil-simple" width={520}>
        <div className="flex flex-col gap-[14px]">
          <FieldRow>
            <Field label="Client"><TextInput value={ed.client} onChange={(e) => setEd({ ...ed, client: e.target.value })} /></Field>
            <Field label="Tên dự án / job"><TextInput value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></Field>
          </FieldRow>
          <Field label="Loại chi trả">
            <Select value={ed.paymentModel} onChange={(e) => setEd({ ...ed, paymentModel: e.target.value as PaymentModel })}>
              {MODELS.map((m) => (<option key={m.v} value={m.v}>{m.label} — {m.hint}</option>))}
            </Select>
          </Field>
          {!upEdit && (
            <FieldRow>
              <Field label="Nguồn thu">
                <Select value={ed.source} onChange={(e) => setEd({ ...ed, source: e.target.value })}>
                  {sources.map((s) => (<option key={s.id} value={s.name}>{s.name}</option>))}
                </Select>
              </Field>
              <Field label="Tiền tệ">
                <Select value={ed.currency} onChange={(e) => setEd({ ...ed, currency: e.target.value as "VND" | "CAD" | "USD" })}>
                  {(["VND", "CAD", "USD"] as const).map((cc) => (<option key={cc}>{cc}</option>))}
                </Select>
              </Field>
              <Field label="Giá trị hợp đồng">
                <MoneyInput value={ed.contractValue} onValueChange={(v) => setEd({ ...ed, contractValue: v })} placeholder="0" />
              </Field>
            </FieldRow>
          )}
          {upEdit && (
            <FieldRow>
              {ed.paymentModel === "hourly_weekly" && (
                <Field label="Rate ($/giờ)"><TextInput type="number" value={ed.hourlyRate} onChange={(e) => setEd({ ...ed, hourlyRate: e.target.value })} /></Field>
              )}
              {ed.paymentModel === "monthly_retainer" && (
                <Field label="Khoản/tháng ($)"><TextInput type="number" value={ed.retainerAmount} onChange={(e) => setEd({ ...ed, retainerAmount: e.target.value })} /></Field>
              )}
              <Field label="Fee % (rỗng = mặc định)"><TextInput type="number" value={ed.feePct} onChange={(e) => setEd({ ...ed, feePct: e.target.value })} placeholder={String(Math.round(feePctDefault * 100))} /></Field>
            </FieldRow>
          )}
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={() => setEditOpen(false)}>Đóng</Button>
          <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</Button>
        </ModalActions>
      </Modal>
    </>
  );
}

function Kpi({ icon, bg, fg, label, value, title }: { icon: string; bg: string; fg: string; label: string; value: string; title?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-[14px]" title={title}>
      <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[15px]" style={{ background: bg, color: fg }}>
        <i className={icon} aria-hidden />
      </div>
      <div className="text-[19px] font-extrabold tracking-[-0.4px] mt-[10px] tnum" style={{ color: fg }}>{value}</div>
      <div className="text-[11px] text-muted mt-[1px] font-medium">{label}</div>
    </div>
  );
}
