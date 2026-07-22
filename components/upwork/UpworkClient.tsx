"use client";
import { useState } from "react";
import { fmt, full, pct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { createContract, updateContract, activateContract, billContract, receiveContract, cancelContract } from "@/lib/actions/upwork";
import type { UpworkContract } from "@/lib/queries/upwork";
import type { Ref } from "@/lib/queries";

const GRID = "1.5fr 120px 100px 100px 100px 120px 130px 110px 150px";

const usd = (v: number) => "$" + new Intl.NumberFormat("en-US").format(Math.round(v));

const statusStyle: Record<UpworkContract["status"], { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#EDEAE0", fg: "#6B7570" },
  active: { label: "Active", bg: "#EAF4EE", fg: "#17554A" },
  billed: { label: "Pending", bg: "#FBF0DC", fg: "#A5731F" },
  received: { label: "Received", bg: "#DFF2E7", fg: "#1F7A5C" },
  cancelled: { label: "Cancelled", bg: "#EDEAE0", fg: "#9AA49E" },
};

export function UpworkClient({
  monthKey,
  contracts,
  accounts,
  fxUsd,
  feePctDefault,
}: {
  monthKey: string;
  contracts: UpworkContract[];
  accounts: Ref[];
  fxUsd: number;
  feePctDefault: number;
}) {
  const [modal, setModal] = useState(false);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [receiveAccount, setReceiveAccount] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [client, setClient] = useState("");
  const [job, setJob] = useState("");
  const [kind, setKind] = useState<"fixed" | "hourly">("fixed");
  const [gross, setGross] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const g = Number(gross) || 0;
  const previewNet = g * (1 - feePctDefault);

  function openEdit(c: (typeof contracts)[number]) {
    setEditId(c.id);
    setClient(c.client);
    setJob(c.job ?? "");
    setKind(c.contract_type);
    setGross(c.amount_usd != null ? String(c.amount_usd) : "");
    setErr(null);
    setModal(true);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    if (!client) return fail("Nhập client");
    const res = editId
      ? await updateContract({ id: editId, client, job, contractType: kind, amountUsd: g || null, feePct: null })
      : await createContract({ client, job, contractType: kind, amountUsd: g || null, feePct: null });
    if (!res.ok) return fail(res.error ?? "Lỗi");
    reset();
    setModal(false);
    setBusy(false);
  }

  function reset() {
    setEditId(null);
    setClient("");
    setJob("");
    setKind("fixed");
    setGross("");
    setErr(null);
  }
  function fail(m: string) {
    setErr(m);
    setBusy(false);
    return undefined;
  }

  async function doAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) alert(res.error);
  }

  const receiveContractRow = contracts.find((c) => c.id === receiveId);

  return (
    <>
      <HeaderPortal>
        <button
          onClick={() => {
            reset();
            setModal(true);
          }}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          New contract
        </button>
      </HeaderPortal>

      <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
        <div
          className="grid gap-[10px] items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
          style={{ gridTemplateColumns: GRID }}
        >
          <div>Contract</div>
          <div>Client</div>
          <div>Type</div>
          <div className="text-right">Gross $</div>
          <div className="text-right">Fee</div>
          <div className="text-right">Net $</div>
          <div className="text-right">Net ₫</div>
          <div>Status</div>
          <div className="text-right">Action</div>
        </div>

        {contracts.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
            Chưa có hợp đồng. Bấm “New contract”.
          </div>
        )}

        {contracts.map((c) => {
          const sm = statusStyle[c.status];
          const feeUsd = c.amount_usd ? c.amount_usd * c.fee_pct : 0;
          const locked = c.amount_vnd != null; // billed/received → VND & fx đã khoá
          const netVnd = c.amount_vnd ?? (c.net_usd ? c.net_usd * fxUsd : 0);
          return (
            <div
              key={c.id}
              className="grid gap-[10px] items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
              style={{ gridTemplateColumns: GRID }}
            >
              <div className="font-semibold">{c.job || "—"}</div>
              <div className="text-ink-soft text-[12px]">{c.client}</div>
              <div>
                <Badge bg="#F2EFE6" fg="#4C5A54">
                  {c.contract_type}
                </Badge>
              </div>
              <div className="text-right font-bold tnum">{c.amount_usd ? usd(c.amount_usd) : "—"}</div>
              <div className="text-right tnum text-[#B4573B]">
                {c.amount_usd ? (
                  <>
                    −{usd(feeUsd)}
                    <div className="text-[10px] text-faint">{pct(c.fee_pct, 0)}</div>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="text-right font-bold tnum text-[#1F7A5C]">
                {c.net_usd ? usd(c.net_usd) : "—"}
              </div>
              <div className="text-right tnum" title={full(netVnd)}>
                {c.status === "cancelled" || !c.amount_usd ? (
                  "—"
                ) : (
                  <>
                    {fmt(netVnd)}
                    <div className="text-[10px] text-faint">
                      {locked ? `@ ${new Intl.NumberFormat("en-US").format(c.fx_rate ?? 0)}` : "ước tính"}
                      {(c.received_on || c.billed_on) && ` · ${c.received_on ?? c.billed_on}`}
                    </div>
                  </>
                )}
              </div>
              <div>
                <Badge bg={sm.bg} fg={sm.fg}>
                  {sm.label}
                </Badge>
              </div>
              <div className="flex justify-end gap-[6px]">
                {(c.status === "draft" || c.status === "active") && (
                  <button
                    onClick={() => openEdit(c)}
                    disabled={busy}
                    aria-label="Sửa hợp đồng"
                    title="Sửa"
                    className="bg-transparent text-muted border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-chip hover:text-primary disabled:opacity-50"
                  >
                    <i className="ph-duotone ph-pencil-simple" aria-hidden />
                  </button>
                )}
                {c.status === "draft" && (
                  <button
                    onClick={() => doAction(() => activateContract(c.id))}
                    disabled={busy}
                    className="border border-card-border text-ink-soft rounded-full px-[12px] py-[7px] text-[11px] font-bold cursor-pointer hover:border-primary hover:text-primary whitespace-nowrap disabled:opacity-50"
                  >
                    Activate
                  </button>
                )}
                {(c.status === "draft" || c.status === "active") && (
                  <button
                    onClick={() => doAction(() => billContract(c.id, monthKey))}
                    disabled={busy}
                    className="bg-primary text-white border-0 rounded-full px-[12px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap disabled:opacity-50"
                  >
                    Bill
                  </button>
                )}
                {c.status === "billed" && (
                  <button
                    onClick={() => {
                      setReceiveId(c.id);
                      setReceiveAccount("");
                    }}
                    disabled={busy}
                    className="bg-primary text-white border-0 rounded-full px-[12px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap disabled:opacity-50"
                  >
                    Mark received
                  </button>
                )}
                {(c.status === "draft" || c.status === "active" || c.status === "billed") && (
                  <button
                    onClick={() => {
                      if (confirm(`Huỷ hợp đồng "${c.client}"?`)) doAction(() => cancelContract(c.id));
                    }}
                    disabled={busy}
                    aria-label="Huỷ hợp đồng"
                    title="Huỷ hợp đồng"
                    className="bg-chip text-[#B4573B] border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#F7E3DC] disabled:opacity-50"
                  >
                    <i className="ph-duotone ph-x-circle" aria-hidden />
                  </button>
                )}
                {(c.status === "received" || c.status === "cancelled") && (
                  <span className="text-faint text-[11px] font-semibold">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New contract modal */}
      <Modal
        open={modal}
        onClose={() => {
          reset();
          setModal(false);
        }}
        title={editId ? "Sửa hợp đồng" : "New contract"}
        icon="ph-duotone ph-globe"
      >
        <div className="flex flex-col gap-[14px]">
          <Field label="Client">
            <TextInput value={client} onChange={(e) => setClient(e.target.value)} placeholder="Oakland Co." />
          </Field>
          <Field label="Job">
            <TextInput value={job} onChange={(e) => setJob(e.target.value)} placeholder="Dashboard UI" />
          </Field>
          <FieldRow>
            <Field label="Type">
              <Select value={kind} onChange={(e) => setKind(e.target.value as "fixed" | "hourly")}>
                <option value="fixed">Fixed</option>
                <option value="hourly">Hourly</option>
              </Select>
            </Field>
            <Field label="Gross ($)">
              <TextInput type="number" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0" />
            </Field>
          </FieldRow>
          <div className="text-[11px] text-muted">
            Sau phí {pct(feePctDefault, 0)}: net <b className="text-[#1F7A5C]">{usd(previewNet)}</b> ·{" "}
            <b className="text-ink">{full(Math.round(previewNet * fxUsd))}</b> (fx {new Intl.NumberFormat("en-US").format(fxUsd)})
          </div>
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              reset();
              setModal(false);
            }}
          >
            Huỷ
          </Button>
          <Button variant="primary" className="flex-1" onClick={submit} disabled={busy}>
            {busy ? "Đang lưu…" : editId ? "Lưu thay đổi" : "Add contract (draft)"}
          </Button>
        </ModalActions>
      </Modal>

      {/* Receive modal (account picker) */}
      <Modal
        open={!!receiveId}
        onClose={() => setReceiveId(null)}
        title="Receive payment"
        icon="ph-duotone ph-hand-coins"
        iconBg="#DFF2E7"
        iconFg="#1F7A5C"
      >
        {receiveContractRow && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              {receiveContractRow.client} · {receiveContractRow.job} —{" "}
              <b>{full(receiveContractRow.amount_vnd ?? 0)}</b>
            </div>
            <Field label="Chuyển vào tài khoản">
              <Select value={receiveAccount} onChange={(e) => setReceiveAccount(e.target.value)}>
                <option value="">— chọn —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={() => setReceiveId(null)}>
                Huỷ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!receiveAccount}
                onClick={async () => {
                  await doAction(() => receiveContract(receiveContractRow.id, receiveAccount));
                  setReceiveId(null);
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
