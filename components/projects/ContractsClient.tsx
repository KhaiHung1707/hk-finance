"use client";
import { useState } from "react";
import Link from "next/link";
import { fmt, full, pct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select, MoneyInput } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { useActionRunner, SuccessToast } from "@/components/ui/useActionRunner";
import { ContractOverview, useContractFilter } from "@/components/projects/ContractOverview";
import { PaymentRows, MODELS, modelLabel, modelIcon, contractStatusStyle } from "@/components/projects/contract-shared";
import { ContractTableView, ContractTimelineView, type ProjectView } from "@/components/projects/contract-views";
import {
  createContract,
  updateContract,
  billContractDrafts,
  generateRetainerPayments,
} from "@/lib/actions/projects";
import type { ContractFinance, PaymentModel } from "@/lib/queries/projects";
import type { Ref } from "@/lib/queries";

/** Định dạng số theo tiền tệ cho preview form (VND/CAD/USD). */
function previewCcy(v: number, cur: string): string {
  const s = new Intl.NumberFormat("en-US").format(Math.round(v));
  return cur === "CAD" ? "C$" + s : cur === "USD" ? "$" + s : s + " ₫";
}

type EditState = {
  id: string | null;
  client: string;
  name: string;
  paymentModel: PaymentModel;
  source: string;
  currency: "VND" | "CAD" | "USD";
  hourlyRate: string;
  feePct: string;
  retainerAmount: string;
  contractValue: string;
};

/**
 * Danh sách hợp đồng HỢP NHẤT (thay ProjectsClient + UpworkClient) — 1 danh sách,
 * mỗi card render theo payment_model. Card + thao tác đợt tách ra contract-shared
 * (PaymentRows) để trang detail dùng chung. "Upwork" chỉ là các model USD.
 */
export function ContractsClient({
  monthKey,
  contracts,
  accounts,
  sources,
  fx,
  fxUsd,
  feePctDefault,
  todayIso,
}: {
  monthKey: string;
  contracts: ContractFinance[];
  accounts: Ref[];
  sources: Ref[];
  fx: Record<string, number>;
  fxUsd: number;
  feePctDefault: number;
  todayIso: string;
}) {
  const { run, pending, toast } = useActionRunner();
  const { filter, setFilter, filtered } = useContractFilter(contracts);
  const [view, setView] = useState<ProjectView>("list");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // retainer generate (theo contract)
  const [genFor, setGenFor] = useState<string | null>(null);
  const [genFrom, setGenFrom] = useState(monthKey);
  const [genTo, setGenTo] = useState(monthKey);

  const defaultSource = sources[0]?.name ?? "Structure";

  function openNew() {
    setEdit({
      id: null, client: "", name: "", paymentModel: "fixed_milestones", source: defaultSource,
      currency: "VND", hourlyRate: "", feePct: "", retainerAmount: "", contractValue: "",
    });
    setErr(null);
  }
  function openEdit(c: ContractFinance) {
    setEdit({
      id: c.id, client: c.client, name: c.name ?? "", paymentModel: c.payment_model,
      source: c.source ?? defaultSource,
      currency: c.currency,
      hourlyRate: c.hourly_rate != null ? String(c.hourly_rate) : "",
      feePct: c.fee_pct != null ? String(Math.round(c.fee_pct * 100)) : "",
      retainerAmount: c.retainer_amount != null ? String(c.retainer_amount) : "",
      contractValue: c.contract_value != null ? String(c.contract_value) : "",
    });
    setErr(null);
  }

  // Upwork models (USD, source Upwork, có fee); fixed_milestones = "project" đa tiền tệ.
  const isUpworkModel = (m: PaymentModel) => m !== "fixed_milestones";

  async function saveContract() {
    if (!edit) return;
    if (!edit.client) return setErr("Nhập client");
    setBusy(true);
    setErr(null);
    const upwork = isUpworkModel(edit.paymentModel);
    const feePct = edit.feePct === "" ? null : Number(edit.feePct) / 100;
    const payload = {
      client: edit.client,
      name: edit.name,
      source: upwork ? "Upwork" : edit.source,
      currency: edit.currency, // luôn theo lựa chọn — tránh sai mệnh giá (USD/CAD/VND)
      feePct: upwork ? feePct : null,
      hourlyRate: edit.paymentModel === "hourly_weekly" && edit.hourlyRate ? Number(edit.hourlyRate) : null,
      retainerAmount: edit.paymentModel === "monthly_retainer" && edit.retainerAmount ? Number(edit.retainerAmount) : null,
      contractValue: !upwork && edit.contractValue ? Number(edit.contractValue) : null,
    };
    const res = edit.id
      ? await updateContract({ id: edit.id, paymentModel: edit.paymentModel, ...payload })
      : await createContract({ paymentModel: edit.paymentModel, ...payload });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Lỗi");
    setEdit(null);
  }

  async function runGenerate(c: ContractFinance) {
    setBusy(true);
    const res = await generateRetainerPayments(c.id, genFrom, genTo);
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setGenFor(null);
  }

  const previewRate = edit && edit.hourlyRate ? Number(edit.hourlyRate) : 0;
  const previewFee = edit && edit.feePct !== "" ? Number(edit.feePct) / 100 : feePctDefault;
  const upworkEdit = edit ? isUpworkModel(edit.paymentModel) : false;
  const previewFx = edit ? (edit.currency === "USD" ? fxUsd : fx[edit.currency] ?? 1) : 1;

  return (
    <>
      <HeaderPortal>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          Hợp đồng mới
        </button>
      </HeaderPortal>

      <SuccessToast toast={toast} />
      <ContractOverview contracts={contracts} filter={filter} setFilter={setFilter} shownCount={filtered.length} />

      {/* View switcher — nhiều góc nhìn khi dữ liệu dày */}
      {contracts.length > 0 && (
        <div className="flex gap-1 bg-card border border-card-border rounded-full p-1 w-fit">
          {([
            { v: "list", label: "Danh sách", icon: "ph-duotone ph-cards" },
            { v: "table", label: "Bảng", icon: "ph-duotone ph-table" },
            { v: "timeline", label: "Sắp tới hạn", icon: "ph-duotone ph-calendar-check" },
          ] as const).map((t) => (
            <button key={t.v} onClick={() => setView(t.v)}
              className={`flex items-center gap-[6px] rounded-full px-[14px] py-[7px] text-[12px] font-bold cursor-pointer border-0 ${view === t.v ? "bg-primary text-white" : "bg-transparent text-ink-soft hover:text-primary"}`}>
              <i className={t.icon} aria-hidden /> {t.label}
            </button>
          ))}
        </div>
      )}

      {contracts.length === 0 && (
        <div className="bg-card border border-card-border rounded-[18px] p-8 text-center text-[13px] text-muted">
          Chưa có hợp đồng. Bấm “Hợp đồng mới”.
        </div>
      )}
      {contracts.length > 0 && filtered.length === 0 && (
        <div className="bg-card border border-card-border rounded-[18px] p-6 text-center text-[13px] text-muted">
          Không có hợp đồng khớp bộ lọc.
        </div>
      )}

      {view === "table" && filtered.length > 0 && <ContractTableView contracts={filtered} />}
      {view === "timeline" && filtered.length > 0 && <ContractTimelineView contracts={filtered} todayIso={todayIso} />}

      {view === "list" && filtered.map((c) => {
        const fee = c.fee_pct ?? feePctDefault;
        const upwork = isUpworkModel(c.payment_model);
        const sm = contractStatusStyle[c.status] ?? contractStatusStyle.active;
        return (
          <div key={c.id} className="bg-card border border-card-border rounded-[18px] p-[22px]">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-[14px]">
                <div className="w-[46px] h-[46px] rounded-[13px] bg-chip text-primary flex items-center justify-center text-[22px] flex-shrink-0">
                  <i className={modelIcon(c.payment_model)} aria-hidden />
                </div>
                <div>
                  <Link href={`/projects/${c.id}`} className="text-[16px] font-bold hover:text-primary hover:underline">
                    {c.name || c.client}
                  </Link>
                  <div className="text-[12px] text-muted mt-[2px]">
                    {c.client}
                    {` · ${modelLabel(c.payment_model)}`}
                    {c.source ? ` · ${c.source}` : ""}
                    {c.payment_model === "hourly_weekly" && c.hourly_rate != null && ` · $${c.hourly_rate}/giờ`}
                    {c.payment_model === "monthly_retainer" && c.retainer_amount != null && ` · $${c.retainer_amount}/tháng`}
                    {upwork && ` · fee ${pct(fee, 0)}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-right">
                  <div className="text-[11px] text-muted font-semibold">Đã thu</div>
                  <div className="text-[15px] font-extrabold tnum text-[#1F7A5C]" title={full(c.collected_vnd)}>{fmt(c.collected_vnd)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted font-semibold">Chờ thu</div>
                  <div className="text-[15px] font-extrabold tnum" title={full(c.outstanding_vnd)}>{fmt(c.outstanding_vnd)}</div>
                </div>
                <Badge bg={sm.bg} fg={sm.fg}>{sm.label}</Badge>
                {c.draft_count > 1 && (
                  <button
                    onClick={() => run(() => billContractDrafts(c.id, monthKey), { key: `bulk-${c.id}`, ok: `Đã bill ${c.draft_count} đợt` })}
                    disabled={pending(`bulk-${c.id}`)}
                    title="Bill mọi đợt nháp"
                    className="flex items-center gap-[6px] bg-primary-dark text-white border-0 rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-[#0A211C] disabled:opacity-50 whitespace-nowrap"
                  >
                    <i className="ph-duotone ph-lightning" aria-hidden />
                    {pending(`bulk-${c.id}`) ? "…" : `Bill ${c.draft_count}`}
                  </button>
                )}
                <Link
                  href={`/projects/${c.id}`}
                  className="flex items-center gap-[6px] bg-transparent text-ink-soft border border-card-border rounded-full px-[13px] py-[7px] text-[11px] font-bold hover:border-primary hover:text-primary"
                >
                  <i className="ph-duotone ph-arrow-square-out" aria-hidden />
                  Chi tiết
                </Link>
                <button
                  onClick={() => openEdit(c)}
                  className="flex items-center gap-[6px] bg-transparent text-ink-soft border border-card-border rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:border-primary hover:text-primary"
                >
                  <i className="ph-duotone ph-pencil-simple" aria-hidden />
                  Sửa
                </button>
              </div>
            </div>

            {/* Progress cho fixed_milestones có contract_value */}
            {!upwork && c.contract_value_vnd > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-[12px] text-ink-soft mb-[7px]">
                  <span className="font-semibold">{c.payment_paid}/{c.payment_count} đợt đã thu</span>
                  <span className="font-extrabold">{Math.min(100, Math.round((c.collected_vnd / c.contract_value_vnd) * 100))}% thu</span>
                </div>
                <div className="h-2 rounded-full bg-[#EFEAE0] overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.round((c.collected_vnd / c.contract_value_vnd) * 100))}%` }} />
                </div>
              </div>
            )}

            {/* Đợt + thao tác (dùng chung với detail) */}
            <PaymentRows
              contract={c}
              monthKey={monthKey}
              accounts={accounts}
              fx={fx}
              fxUsd={fxUsd}
              feePctDefault={feePctDefault}
              run={run}
              pending={pending}
              variant="list"
            />

            {/* Generate retainer */}
            {c.payment_model === "monthly_retainer" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {genFor === c.id ? (
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
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Edit / New modal */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Sửa hợp đồng" : "Hợp đồng mới"} icon="ph-duotone ph-briefcase" width={520}>
        {edit && (
          <>
            <div className="flex flex-col gap-[14px]">
              <FieldRow>
                <Field label="Client">
                  <TextInput value={edit.client} onChange={(e) => setEdit({ ...edit, client: e.target.value })} placeholder="Oakland Co." />
                </Field>
                <Field label="Tên dự án / job">
                  <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Dashboard UI" />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Loại chi trả">
                  <Select value={edit.paymentModel} onChange={(e) => {
                    const m = e.target.value as PaymentModel;
                    // đổi model → gợi ý tiền tệ mặc định (project→VND, Upwork→USD) nhưng vẫn cho đổi.
                    const defCcy = m === "fixed_milestones" ? "VND" : "USD";
                    setEdit({ ...edit, paymentModel: m, currency: edit.id ? edit.currency : (defCcy as "VND" | "CAD" | "USD") });
                  }}>
                    {MODELS.map((m) => (
                      <option key={m.v} value={m.v}>{m.label} — {m.hint}</option>
                    ))}
                  </Select>
                </Field>
                {/* Tiền tệ LUÔN chọn được — tránh sai mệnh giá (USD/CAD/VND) cho mọi loại. */}
                <Field label="Tiền tệ">
                  <Select value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value as "VND" | "CAD" | "USD" })}>
                    {(["VND", "CAD", "USD"] as const).map((cc) => (<option key={cc}>{cc}</option>))}
                  </Select>
                </Field>
              </FieldRow>

              {/* fixed_milestones (project): source + contract_value */}
              {!upworkEdit && (
                <FieldRow>
                  <Field label="Nguồn thu">
                    <Select value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })}>
                      {sources.map((s) => (<option key={s.id} value={s.name}>{s.name}</option>))}
                    </Select>
                  </Field>
                  <Field label={`Giá trị hợp đồng (${edit.currency})`}>
                    <MoneyInput value={edit.contractValue} onValueChange={(v) => setEdit({ ...edit, contractValue: v })} placeholder="0" />
                  </Field>
                </FieldRow>
              )}

              {/* Upwork models: rate/retainer + fee */}
              {upworkEdit && (
                <FieldRow>
                  {edit.paymentModel === "hourly_weekly" && (
                    <Field label={`Rate (${edit.currency}/giờ)`}>
                      <TextInput type="number" value={edit.hourlyRate} onChange={(e) => setEdit({ ...edit, hourlyRate: e.target.value })} placeholder="35" />
                    </Field>
                  )}
                  {edit.paymentModel === "monthly_retainer" && (
                    <Field label={`Khoản/tháng (${edit.currency})`}>
                      <TextInput type="number" value={edit.retainerAmount} onChange={(e) => setEdit({ ...edit, retainerAmount: e.target.value })} placeholder="1500" />
                    </Field>
                  )}
                  <Field label="Fee % (rỗng = mặc định)">
                    <TextInput type="number" value={edit.feePct} onChange={(e) => setEdit({ ...edit, feePct: e.target.value })} placeholder={String(Math.round(feePctDefault * 100))} />
                  </Field>
                </FieldRow>
              )}

              <div className="text-[11px] text-muted">
                {edit.paymentModel === "hourly_weekly" && previewRate > 0 ? (
                  <>1 giờ = {previewCcy(previewRate, edit.currency)} → net sau phí {pct(previewFee, 0)}: <b className="text-[#1F7A5C]">{previewCcy(Math.round(previewRate * (1 - previewFee)), edit.currency)}</b>/giờ{edit.currency !== "VND" && ` · fx ${new Intl.NumberFormat("en-US").format(previewFx)}`}</>
                ) : upworkEdit ? (
                  <>Phí sàn {pct(previewFee, 0)} trừ khi bill mỗi đợt{edit.currency !== "VND" && ` · ${edit.currency}→VND theo fx ${new Intl.NumberFormat("en-US").format(previewFx)}`} lúc bill.</>
                ) : (
                  <>Mỗi milestone khoá fx {edit.currency}→VND khi bill. Không trừ phí sàn.</>
                )}
              </div>
              {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
            </div>
            <ModalActions>
              {edit.id && (
                <Link
                  href={`/projects/${edit.id}`}
                  className="flex items-center gap-2 bg-fill-soft text-ink-soft border border-card-border rounded-full px-[16px] py-[10px] text-[13px] font-bold hover:border-primary hover:text-primary"
                >
                  <i className="ph-duotone ph-arrow-square-out" aria-hidden /> Chi tiết
                </Link>
              )}
              <Button variant="ghost" className="flex-1" onClick={() => setEdit(null)}>Đóng</Button>
              <Button variant="primary" className="flex-1" onClick={saveContract} disabled={busy}>
                {busy ? "Đang lưu…" : edit.id ? "Lưu" : "Tạo hợp đồng"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}
