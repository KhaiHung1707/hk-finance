"use client";
import { useState } from "react";
import { fmt, full } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select, MoneyInput } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { DueDateButton } from "@/components/ui/DueDateButton";
import {
  createContract,
  updateContract,
  deleteContract,
  createPayment,
  updatePayment,
  deletePayment,
  billPayment,
  billContractDrafts,
  collectPayment,
  cancelPayment,
  setPaymentDueOn,
} from "@/lib/actions/projects";
import { rollbackStatus } from "@/lib/actions/ledger";
import { useActionRunner, SuccessToast } from "@/components/ui/useActionRunner";
import { ContractOverview, useContractFilter } from "@/components/projects/ContractOverview";
import type { ContractFinance, Payment } from "@/lib/queries/projects";
import type { Ref } from "@/lib/queries";

const CURRENCIES = ["VND", "CAD", "USD"] as const;
const STATUSES = [
  { v: "active", label: "In progress" },
  { v: "maintenance", label: "Maintenance" },
  { v: "done", label: "Completed" },
  { v: "paused", label: "Paused" },
];

const projStatusStyle: Record<string, { label: string; bg: string; fg: string }> = {
  active: { label: "In progress", bg: "#FBF0DC", fg: "#A5731F" },
  maintenance: { label: "Maintenance", bg: "#EAF4EE", fg: "#17554A" },
  done: { label: "Completed", bg: "#DFF2E7", fg: "#1F7A5C" },
  paused: { label: "Paused", bg: "#EDEAE0", fg: "#9AA49E" },
};

const msIcon: Record<Payment["status"], { icon: string; bg: string; fg: string }> = {
  draft: { icon: "ph-duotone ph-clock", bg: "#F2EFE6", fg: "#9AA49E" },
  billed: { icon: "ph-duotone ph-hourglass-medium", bg: "#FBF0DC", fg: "#A5731F" },
  received: { icon: "ph-duotone ph-check-circle", bg: "#DFF2E7", fg: "#1F7A5C" },
  cancelled: { icon: "ph-duotone ph-x-circle", bg: "#EDEAE0", fg: "#9AA49E" },
};

function ccy(v: number, cur: string): string {
  const s = new Intl.NumberFormat("en-US").format(Math.round(v));
  if (cur === "CAD") return "C$" + s;
  if (cur === "USD") return "$" + s;
  return s + " ₫";
}

type EditState = {
  id: string | null; // null = new project
  client: string;
  name: string;
  currency: "VND" | "CAD" | "USD";
  contractValue: string;
  status: string;
  location: string;
  source: string;
};

export function ProjectsClient({
  monthKey,
  projects,
  accounts,
  sources,
  fx,
}: {
  monthKey: string;
  projects: ContractFinance[];
  accounts: Ref[];
  sources: Ref[];
  fx: Record<string, number>;
}) {
  const { run, confirmRun, pending, toast } = useActionRunner();
  const { filter, setFilter, filtered } = useContractFilter(projects);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [newMsName, setNewMsName] = useState("");
  const [newMsAmount, setNewMsAmount] = useState("");
  const [msEdits, setMsEdits] = useState<Record<string, { name: string; amount: string }>>({});
  const [collect, setCollect] = useState<{ id: string; label: string; amountVnd: number } | null>(null);
  const [collectAccount, setCollectAccount] = useState("");
  const [busy, setBusy] = useState(false);

  // giữ doAction cho các nút inline modal (sửa/xoá milestone trong edit) — dùng run cho vòng đời chính.
  async function doAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) alert(res.error);
  }

  const defaultSource = sources[0]?.name ?? "Structure";
  function openNew() {
    setEdit({ id: null, client: "", name: "", currency: "CAD", contractValue: "", status: "active", location: "", source: defaultSource });
  }
  function openEdit(p: ContractFinance) {
    setEdit({
      id: p.id,
      client: p.client,
      name: p.name ?? "",
      currency: p.currency,
      contractValue: p.contract_value != null ? String(p.contract_value) : "",
      status: p.status,
      location: p.location ?? "",
      source: p.source ?? defaultSource,
    });
  }

  async function saveProject() {
    if (!edit) return;
    setBusy(true);
    const payload = {
      client: edit.client,
      name: edit.name,
      currency: edit.currency,
      contractValue: edit.contractValue ? Number(edit.contractValue) : null,
      status: edit.status,
      location: edit.location,
      source: edit.source,
    };
    const res = edit.id
      ? await updateContract({ id: edit.id, ...payload })
      : await createContract({ ...payload, paymentModel: "fixed_milestones" });
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setEdit(null);
  }

  async function removeProject() {
    if (!edit?.id) return;
    if (!confirm(`Xoá dự án "${edit.name}"? Mọi milestone nháp sẽ bị xoá theo.`)) return;
    setBusy(true);
    const res = await deleteContract(edit.id);
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setEdit(null);
  }

  async function addMilestone() {
    if (!edit?.id || !newMsName || !newMsAmount) return;
    setBusy(true);
    // sort tự tăng theo số đợt hiện có của dự án (bỏ sort=0 cứng).
    const existing = projects.find((pp) => pp.id === edit.id)?.payments.length ?? 0;
    const res = await createPayment({
      contractId: edit.id,
      kind: "milestone",
      name: newMsName,
      amount: Number(newMsAmount),
      sort: existing,
    });
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setNewMsName("");
    setNewMsAmount("");
  }

  return (
    <>
      <HeaderPortal>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          New project
        </button>
      </HeaderPortal>

      <SuccessToast toast={toast} />

      <ContractOverview contracts={projects} filter={filter} setFilter={setFilter} shownCount={filtered.length} />

      {projects.length === 0 && (
        <div className="bg-card border border-card-border rounded-[18px] p-8 text-center text-[13px] text-muted">
          Chưa có dự án. Bấm “New project”.
        </div>
      )}
      {projects.length > 0 && filtered.length === 0 && (
        <div className="bg-card border border-card-border rounded-[18px] p-6 text-center text-[13px] text-muted">
          Không có dự án khớp bộ lọc.
        </div>
      )}

      {filtered.map((p) => {
        const sm = projStatusStyle[p.status] ?? projStatusStyle.active;
        const pctColl =
          p.contract_value_vnd > 0
            ? Math.min(100, Math.round((p.collected_vnd / p.contract_value_vnd) * 100))
            : 0;
        return (
          <div key={p.id} className="bg-card border border-card-border rounded-[18px] p-[22px]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-[14px]">
                <div className="w-[46px] h-[46px] rounded-[13px] bg-chip text-primary flex items-center justify-center text-[22px] flex-shrink-0">
                  <i className="ph-duotone ph-buildings" aria-hidden />
                </div>
                <div>
                  <div className="text-[16px] font-bold">{p.name}</div>
                  <div className="text-[12px] text-muted mt-[2px]">
                    {p.client}
                    {p.source ? ` · ${p.source}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <div className="text-right">
                  <div className="text-[11px] text-muted font-semibold">Contract</div>
                  <div className="text-[16px] font-extrabold tnum" title={full(p.contract_value_vnd)}>
                    {p.contract_value != null
                      ? `${ccy(p.contract_value, p.currency)} · ${fmt(p.contract_value_vnd)}`
                      : "—"}
                  </div>
                </div>
                <Badge bg={sm.bg} fg={sm.fg}>
                  {sm.label}
                </Badge>
                {p.draft_count > 1 && (
                  <button
                    onClick={() => run(() => billContractDrafts(p.id, monthKey), { key: `bulk-${p.id}`, ok: `Đã bill ${p.draft_count} milestone` })}
                    disabled={pending(`bulk-${p.id}`)}
                    title="Bill mọi milestone nháp"
                    className="flex items-center gap-[6px] bg-primary-dark text-white border-0 rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-[#0A211C] disabled:opacity-50 whitespace-nowrap"
                  >
                    <i className="ph-duotone ph-lightning" aria-hidden />
                    {pending(`bulk-${p.id}`) ? "…" : `Bill ${p.draft_count}`}
                  </button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  className="flex items-center gap-[6px] bg-transparent text-ink-soft border border-card-border rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:border-primary hover:text-primary"
                >
                  <i className="ph-duotone ph-pencil-simple" aria-hidden />
                  Edit
                </button>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex justify-between text-[12px] text-ink-soft mb-[7px]">
                <span className="font-semibold">
                  {p.payment_paid}/{p.payment_count} milestones paid
                </span>
                <span className="font-extrabold">{pctColl}% collected</span>
              </div>
              <div className="h-2 rounded-full bg-[#EFEAE0] overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${pctColl}%` }} />
              </div>
              <div className="flex justify-between text-[11px] mt-[6px]">
                <span className="text-muted">
                  Đã thu <b className="text-[#1F7A5C] tnum" title={full(p.collected_vnd)}>{fmt(p.collected_vnd)}</b>
                </span>
                <span className="text-muted">
                  Còn lại <b className="text-ink tnum" title={full(p.outstanding_vnd)}>{fmt(p.outstanding_vnd)}</b>
                </span>
              </div>
            </div>

            {/* Milestones */}
            <div className="mt-4 flex gap-2 flex-wrap">
              {p.payments.map((m) => {
                const mi = msIcon[m.status];
                const locked = m.amount_vnd != null; // billed/received → fx đã khoá
                const amt = m.amount ?? 0;
                const vnd = m.amount_vnd ?? Math.round(amt * (fx[p.currency] ?? 1));
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 border border-[#EFEAE0] rounded-[12px] px-[13px] py-[9px] hover:border-[#C9C0AC] hover:bg-[#FAF8F2]"
                  >
                    <div
                      className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center text-[13px]"
                      style={{ background: mi.bg, color: mi.fg }}
                    >
                      <i className={mi.icon} aria-hidden />
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold">{m.name}</div>
                      <div className="text-[11px] text-muted tnum" title={full(vnd)}>
                        {ccy(amt, p.currency)} · {fmt(vnd)}
                        {p.currency !== "VND" && (
                          <span className="text-faint">
                            {" "}
                            · {locked ? `@ ${new Intl.NumberFormat("en-US").format(m.fx_rate ?? 0)}` : "ước tính"}
                          </span>
                        )}
                        {(m.received_on || m.billed_on) && (
                          <span className="text-faint"> · {m.received_on ?? m.billed_on}</span>
                        )}
                        {!m.received_on && !m.billed_on && m.due_on && (
                          <span className="text-[#A5731F]"> · dự kiến {m.due_on}</span>
                        )}
                      </div>
                    </div>
                    {(m.status === "draft" || m.status === "billed") && (
                      <DueDateButton value={m.due_on} onSave={(d) => run(() => setPaymentDueOn(m.id, d))} />
                    )}
                    {m.status === "draft" && (
                      <button
                        onClick={() => run(() => billPayment(m.id, monthKey), { key: `pay-${m.id}`, ok: "Đã bill milestone" })}
                        disabled={pending(`pay-${m.id}`)}
                        className="ml-[6px] bg-primary-dark text-white border-0 rounded-full px-[11px] py-[6px] text-[10.5px] font-bold cursor-pointer hover:bg-[#0A211C] whitespace-nowrap disabled:opacity-50"
                      >
                        {pending(`pay-${m.id}`) ? "…" : "Bill"}
                      </button>
                    )}
                    {m.status === "billed" && (
                      <button
                        onClick={() => {
                          setCollect({ id: m.id, label: `${p.name} · ${m.name}`, amountVnd: vnd });
                          setCollectAccount("");
                        }}
                        disabled={pending(`pay-${m.id}`)}
                        className="ml-[6px] bg-primary text-white border-0 rounded-full px-[11px] py-[6px] text-[10.5px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap disabled:opacity-50"
                      >
                        Collect
                      </button>
                    )}
                    {(m.status === "received" || m.status === "cancelled") && (
                      <span
                        className="ml-[6px] text-[10px] font-bold rounded-full px-[9px] py-[3px] whitespace-nowrap"
                        style={{
                          background: m.status === "received" ? "#DFF2E7" : "#F1EDE6",
                          color: m.status === "received" ? "#1F7A5C" : "#8A8577",
                        }}
                      >
                        {m.status === "received" ? "Đã thu" : "Đã huỷ"}
                      </span>
                    )}
                    {/* Lùi 1 bước trạng thái milestone */}
                    {(m.status === "billed" || m.status === "received") && (
                      <button
                        onClick={() => {
                          const back = m.status === "received" ? "billed" : "draft";
                          confirmRun(
                            `Lùi "${m.name}" từ ${m.status} → ${back}?${m.status === "received" ? " Tiền về chờ thu." : " Hoá đơn sẽ bị xoá."}`,
                            () => rollbackStatus("payments", m.id),
                            { key: `pay-${m.id}` }
                          );
                        }}
                        disabled={pending(`pay-${m.id}`)}
                        aria-label="Lùi trạng thái"
                        title="Lùi 1 bước trạng thái"
                        className="ml-[2px] bg-transparent text-muted border-0 rounded-full w-[26px] h-[26px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#EDE8DC] hover:text-primary disabled:opacity-50"
                      >
                        <i className="ph-duotone ph-arrow-counter-clockwise" aria-hidden />
                      </button>
                    )}
                    {(m.status === "draft" || m.status === "billed") && (
                      <button
                        onClick={() => confirmRun(`Huỷ milestone "${m.name}"?`, () => cancelPayment(m.id), { key: `pay-${m.id}` })}
                        disabled={pending(`pay-${m.id}`)}
                        aria-label="Huỷ milestone"
                        title="Huỷ milestone"
                        className="ml-[2px] bg-transparent text-muted border-0 rounded-full w-[26px] h-[26px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#F7E3DC] hover:text-[#B4573B] disabled:opacity-50"
                      >
                        <i className="ph-duotone ph-x-circle" aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Edit / New project modal */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit project" : "New project"}
        icon="ph-duotone ph-pencil-simple"
        width={520}
      >
        {edit && (
          <>
            <div className="flex flex-col gap-[14px]">
              <Field label="Project name">
                <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <FieldRow>
                <Field label="Client">
                  <TextInput value={edit.client} onChange={(e) => setEdit({ ...edit, client: e.target.value })} />
                </Field>
                <Field label="Nguồn thu">
                  <Select value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })}>
                    {sources.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Tiền tệ">
                  <Select
                    value={edit.currency}
                    onChange={(e) => setEdit({ ...edit, currency: e.target.value as "VND" | "CAD" | "USD" })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Giá trị hợp đồng">
                  <MoneyInput value={edit.contractValue} onValueChange={(v) => setEdit({ ...edit, contractValue: v })} placeholder="0" />
                </Field>
                <Field label="Trạng thái">
                  <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s.v} value={s.v}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldRow>

              {/* Milestone hiện có — sửa/xoá (chỉ draft) */}
              {edit.id && (() => {
                const proj = projects.find((pp) => pp.id === edit.id);
                const ms = proj?.payments ?? [];
                if (ms.length === 0) return null;
                return (
                  <div className="border-t border-divider pt-3">
                    <div className="text-[12px] font-semibold text-ink-soft mb-2">Milestone hiện có</div>
                    <div className="flex flex-col gap-2">
                      {ms.map((m) => (
                        <div key={m.id} className="flex items-center gap-2">
                          {m.status === "draft" ? (
                            <>
                              <TextInput
                                value={msEdits[m.id]?.name ?? m.name}
                                onChange={(e) => setMsEdits((s) => ({ ...s, [m.id]: { name: e.target.value, amount: s[m.id]?.amount ?? String(m.amount) } }))}
                              />
                              <TextInput
                                type="number"
                                value={msEdits[m.id]?.amount ?? String(m.amount)}
                                onChange={(e) => setMsEdits((s) => ({ ...s, [m.id]: { name: s[m.id]?.name ?? m.name, amount: e.target.value } }))}
                                className="max-w-[120px]"
                              />
                              <button
                                onClick={async () => {
                                  const e = msEdits[m.id];
                                  await doAction(() => updatePayment({ id: m.id, name: e?.name ?? m.name ?? "", amount: Number(e?.amount ?? m.amount) || 0 }));
                                }}
                                disabled={busy}
                                className="text-primary text-[16px] px-1 disabled:opacity-50"
                                title="Lưu"
                              >
                                <i className="ph-duotone ph-check-circle" aria-hidden />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Xoá milestone "${m.name}"?`)) doAction(() => deletePayment(m.id));
                                }}
                                disabled={busy}
                                className="text-[#B4573B] text-[16px] px-1 disabled:opacity-50"
                                title="Xoá"
                              >
                                <i className="ph-duotone ph-trash" aria-hidden />
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2 flex-1 text-[12px] text-muted">
                              <span className="flex-1">{m.name}</span>
                              <span className="tnum">{ccy(m.amount ?? 0, edit.currency)}</span>
                              <span className="text-[10px] font-bold rounded-full px-[8px] py-[2px] bg-fill-soft">
                                {m.status === "received" ? "Đã thu" : m.status === "billed" ? "Đã bill" : "Đã huỷ"}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Add milestone (chỉ khi project đã tồn tại) */}
              {edit.id && (
                <div className="border-t border-divider pt-3">
                  <div className="text-[12px] font-semibold text-ink-soft mb-2">Thêm milestone</div>
                  <div className="flex gap-2">
                    <TextInput
                      value={newMsName}
                      onChange={(e) => setNewMsName(e.target.value)}
                      placeholder="Deposit 25%"
                    />
                    <TextInput
                      type="number"
                      value={newMsAmount}
                      onChange={(e) => setNewMsAmount(e.target.value)}
                      placeholder="0"
                      className="max-w-[140px]"
                    />
                    <Button variant="ghost" onClick={addMilestone} disabled={busy}>
                      + Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <ModalActions>
              {edit.id && (
                <button
                  onClick={removeProject}
                  disabled={busy}
                  className="flex items-center gap-2 bg-[#F7E3DC] text-[#B4573B] border-0 rounded-full px-[16px] py-[10px] text-[13px] font-bold cursor-pointer hover:bg-[#F0D2C6] disabled:opacity-50"
                >
                  <i className="ph-duotone ph-trash" aria-hidden />
                  Xoá
                </button>
              )}
              <Button variant="ghost" className="flex-1" onClick={() => setEdit(null)}>
                Đóng
              </Button>
              <Button variant="primary" className="flex-1" onClick={saveProject} disabled={busy}>
                {edit.id ? "Lưu" : "Tạo dự án"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>

      {/* Collect milestone modal */}
      <Modal
        open={!!collect}
        onClose={() => setCollect(null)}
        title="Collect milestone"
        icon="ph-duotone ph-hand-coins"
        iconBg="#DFF2E7"
        iconFg="#1F7A5C"
      >
        {collect && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              {collect.label} — <b>{full(collect.amountVnd)}</b>
            </div>
            <Field label="Deposit into ledger account">
              <Select value={collectAccount} onChange={(e) => setCollectAccount(e.target.value)}>
                <option value="">— chọn —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={() => setCollect(null)}>
                Huỷ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!collectAccount}
                onClick={async () => {
                  await run(() => collectPayment(collect.id, collectAccount), { ok: "Đã thu vào tài khoản" });
                  setCollect(null);
                }}
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
