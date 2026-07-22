"use client";
import { useState } from "react";
import { fmt, full } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import {
  createProject,
  updateProject,
  createMilestone,
  billMilestone,
  collectMilestone,
  cancelMilestone,
} from "@/lib/actions/projects";
import type { ProjectFinance, Milestone } from "@/lib/queries/projects";
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

const msIcon: Record<Milestone["status"], { icon: string; bg: string; fg: string }> = {
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
};

export function ProjectsClient({
  monthKey,
  projects,
  accounts,
  fx,
}: {
  monthKey: string;
  projects: ProjectFinance[];
  accounts: Ref[];
  fx: Record<string, number>;
}) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const [newMsName, setNewMsName] = useState("");
  const [newMsAmount, setNewMsAmount] = useState("");
  const [collect, setCollect] = useState<{ id: string; label: string; amountVnd: number } | null>(null);
  const [collectAccount, setCollectAccount] = useState("");
  const [busy, setBusy] = useState(false);

  async function doAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) alert(res.error);
  }

  function openNew() {
    setEdit({ id: null, client: "", name: "", currency: "CAD", contractValue: "", status: "active", location: "" });
  }
  function openEdit(p: ProjectFinance) {
    setEdit({
      id: p.id,
      client: p.client,
      name: p.name,
      currency: p.currency,
      contractValue: p.contract_value != null ? String(p.contract_value) : "",
      status: p.status,
      location: p.location ?? "",
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
    };
    const res = edit.id
      ? await updateProject({ id: edit.id, ...payload })
      : await createProject({ ...payload, source: "Structure" });
    setBusy(false);
    if (!res.ok) return alert(res.error);
    setEdit(null);
  }

  async function addMilestone() {
    if (!edit?.id || !newMsName || !newMsAmount) return;
    setBusy(true);
    const res = await createMilestone({
      projectId: edit.id,
      name: newMsName,
      amount: Number(newMsAmount),
      sort: 0,
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

      {projects.length === 0 && (
        <div className="bg-card border border-card-border rounded-[18px] p-8 text-center text-[13px] text-muted">
          Chưa có dự án. Bấm “New project”.
        </div>
      )}

      {projects.map((p) => {
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
                    {p.location ? ` · ${p.location}` : ""}
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
                  {p.milestone_paid}/{p.milestone_count} milestones paid
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
              {p.milestones.map((m) => {
                const mi = msIcon[m.status];
                const vnd = m.amount_vnd ?? Math.round(m.amount * (fx[p.currency] ?? 1));
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
                        {ccy(m.amount, p.currency)} · {fmt(vnd)}
                      </div>
                    </div>
                    {m.status === "draft" && (
                      <button
                        onClick={() => doAction(() => billMilestone(m.id, monthKey))}
                        disabled={busy}
                        className="ml-[6px] bg-primary-dark text-white border-0 rounded-full px-[11px] py-[6px] text-[10.5px] font-bold cursor-pointer hover:bg-[#0A211C] whitespace-nowrap disabled:opacity-50"
                      >
                        Bill
                      </button>
                    )}
                    {m.status === "billed" && (
                      <button
                        onClick={() => {
                          setCollect({ id: m.id, label: `${p.name} · ${m.name}`, amountVnd: vnd });
                          setCollectAccount("");
                        }}
                        disabled={busy}
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
                    {(m.status === "draft" || m.status === "billed") && (
                      <button
                        onClick={() => {
                          if (confirm(`Huỷ milestone "${m.name}"?`)) doAction(() => cancelMilestone(m.id));
                        }}
                        disabled={busy}
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
                <Field label="Location">
                  <TextInput value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Currency">
                  <Select
                    value={edit.currency}
                    onChange={(e) => setEdit({ ...edit, currency: e.target.value as "VND" | "CAD" | "USD" })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Contract value">
                  <TextInput
                    type="number"
                    value={edit.contractValue}
                    onChange={(e) => setEdit({ ...edit, contractValue: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field label="Status">
                  <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s.v} value={s.v}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldRow>

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
              <Button variant="ghost" className="flex-1" onClick={() => setEdit(null)}>
                Đóng
              </Button>
              <Button variant="primary" className="flex-1" onClick={saveProject} disabled={busy}>
                {edit.id ? "Save changes" : "Create project"}
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
                  await doAction(() => collectMilestone(collect.id, collectAccount));
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
