"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, full } from "@/lib/format";
import { txTypeStyle, txStatusStyle, sourceIcon } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput } from "@/components/ui/Field";
import { EntryModal } from "./EntryModal";
import { ReceiveModal } from "./ReceiveModal";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { updateTransaction, deleteTransaction } from "@/lib/actions/ledger";
import type { LedgerRow, MonthlySummary, Ref } from "@/lib/queries";

const GRID = "70px 100px 1.4fr 130px 110px 130px 1fr 150px";

/** Icon cho từng dòng: theo source (income) / mặc định expense/transfer. */
function rowIcon(r: LedgerRow): string {
  if (r.type === "transfer") return "ph-duotone ph-arrows-left-right";
  if (r.type === "expense") return "ph-duotone ph-minus-circle";
  return sourceIcon[r.source_name ?? ""] ?? "ph-duotone ph-plus-circle";
}

function rowName(r: LedgerRow): string {
  if (r.type === "transfer")
    return `${r.account_name ?? "?"} → ${r.counter_account_name ?? "?"}`;
  return r.source_name ?? r.category_name ?? "—";
}

export function LedgerClient({
  monthKey,
  months = [],
  closed = false,
  rows,
  summary,
  sources,
  categories,
  accounts,
}: {
  monthKey: string;
  months?: string[];
  closed?: boolean;
  rows: LedgerRow[];
  summary: MonthlySummary | null;
  sources: Ref[];
  categories: Ref[];
  accounts: Ref[];
}) {
  const router = useRouter();
  const [entryKind, setEntryKind] = useState<"income" | "expense" | null>(null);
  const [receiveTx, setReceiveTx] = useState<{ id: string; amount: number; label: string } | null>(null);

  // edit tx
  const [edit, setEdit] = useState<LedgerRow | null>(null);
  const [eAmount, setEAmount] = useState("");
  const [eNote, setENote] = useState("");
  const [eMonth, setEMonth] = useState("");
  const [busy, setBusy] = useState(false);
  const [eErr, setEErr] = useState<string | null>(null);
  const isModuleTx = !!edit?.ref_table;

  function openEdit(r: LedgerRow) {
    setEdit(r);
    setEAmount(String(r.amount));
    setENote(r.note ?? "");
    setEMonth(r.month_key);
    setEErr(null);
  }
  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    setEErr(null);
    const res = await updateTransaction({
      id: edit.id,
      amount: Number(eAmount) || 0,
      note: eNote,
      monthKey: eMonth,
    });
    setBusy(false);
    if (!res.ok) return setEErr(res.error ?? "Lỗi");
    setEdit(null);
    router.refresh();
  }
  async function removeTx(r: LedgerRow) {
    const warn = r.ref_table
      ? `Xoá giao dịch này? Nó sinh từ module (${r.ref_table}) — module gốc sẽ được hoàn về trạng thái trước.`
      : "Xoá giao dịch này? Số dư sẽ được hoàn nguyên.";
    if (!confirm(warn)) return;
    const res = await deleteTransaction(r.id);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }

  const [typeF, setTypeF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [text, setText] = useState("");

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (typeF !== "all" && r.type !== typeF) return false;
        if (statusF !== "all" && r.status !== statusF) return false;
        if (text) {
          const hay = `${rowName(r)} ${r.note ?? ""}`.toLowerCase();
          if (!hay.includes(text.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, typeF, statusF, text]
  );

  const filterChip =
    "flex items-center gap-[7px] border border-card-border rounded-full px-[14px] py-[8px] text-[12px] font-semibold text-ink-soft cursor-pointer hover:border-primary hover:text-primary bg-white";

  return (
    <>
      {/* Nút Income/Expense hiển thị ở header band qua portal */}
      <HeaderPortal>
        <button
          onClick={() => setEntryKind("income")}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          Income
        </button>
        <button
          onClick={() => setEntryKind("expense")}
          className="flex items-center gap-2 bg-primary-dark text-white border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#0A211C]"
        >
          <i className="ph-duotone ph-minus-circle" aria-hidden />
          Expense
        </button>
      </HeaderPortal>

      {/* Filter bar */}
      <div className="bg-card border border-card-border rounded-[16px] px-4 py-3 flex items-center gap-[10px] flex-wrap">
        {/* Month picker — đổi tháng qua URL */}
        <div className="flex items-center gap-[7px] bg-primary text-white rounded-full pl-[14px] pr-2 py-[6px] text-[12px] font-bold">
          <i className="ph-duotone ph-calendar-blank" aria-hidden />
          {months.length > 0 ? (
            <select
              value={monthKey}
              onChange={(e) => router.push(`/ledger?month=${encodeURIComponent(e.target.value)}`)}
              className="bg-transparent text-white border-0 outline-none cursor-pointer font-bold text-[12px] [&>option]:text-ink"
              aria-label="Chọn tháng"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <span>{monthKey}</span>
          )}
        </div>
        {closed && (
          <div className="flex items-center gap-[6px] bg-[#DFF2E7] text-[#1F7A5C] rounded-full px-[12px] py-[7px] text-[11px] font-bold">
            <i className="ph-duotone ph-lock-simple" aria-hidden />
            Đã chốt — chỉ đọc
          </div>
        )}
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className={filterChip}>
          <option value="all">Type: All</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfer</option>
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={filterChip}>
          <option value="all">Status: All</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-fill-soft rounded-full px-[15px] py-[9px] text-[12px]">
          <i className="ph-duotone ph-magnifying-glass text-faint" aria-hidden />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tìm ghi chú…"
            className="bg-transparent outline-none flex-1 text-ink"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
        <div
          className="grid gap-3 items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
          style={{ gridTemplateColumns: GRID }}
        >
          <div>Month</div>
          <div>Type</div>
          <div>Source / Category</div>
          <div className="text-right">Amount</div>
          <div>Status</div>
          <div>Account</div>
          <div>Note · Origin</div>
          <div className="text-right">Action</div>
        </div>

        {filtered.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
            Chưa có giao dịch nào khớp bộ lọc.
          </div>
        )}

        {filtered.map((r) => {
          const tm = txTypeStyle[r.type];
          const sm = txStatusStyle[r.status];
          const amtColor = r.status === "cancelled" ? "#9AA49E" : tm.amount;
          return (
            <div
              key={r.id}
              className="grid gap-3 items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
              style={{ gridTemplateColumns: GRID }}
            >
              <div className="text-muted font-semibold text-[12px]">{r.month_key}</div>
              <div>
                <Badge bg={tm.bg} fg={tm.fg}>
                  {tm.label}
                </Badge>
              </div>
              <div className="flex items-center gap-[9px]">
                <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px] flex-shrink-0">
                  <i className={rowIcon(r)} aria-hidden />
                </div>
                <div className="font-semibold">{rowName(r)}</div>
              </div>
              <div className="text-right font-bold tnum" style={{ color: amtColor }} title={full(r.amount)}>
                {tm.sign}
                {fmt(r.amount)}
              </div>
              <div>
                <Badge bg={sm.bg} fg={sm.fg}>
                  {sm.label}
                </Badge>
              </div>
              <div className="text-ink-soft text-[12px] font-semibold">{r.account_name ?? "—"}</div>
              <div className="text-muted text-[12px] whitespace-nowrap overflow-hidden text-ellipsis">
                {r.note || "—"}
              </div>
              <div className="flex justify-end items-center gap-[6px]">
                {/* Tháng đã chốt → chỉ đọc (trigger DB chặn ghi) */}
                {closed ? (
                  <span className="text-faint text-[11px]">—</span>
                ) : (
                  <>
                    {r.status === "pending" && (
                      <button
                        onClick={() =>
                          setReceiveTx({ id: r.id, amount: r.amount, label: `${rowName(r)} · ${r.month_key}` })
                        }
                        className="bg-primary text-white border-0 rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
                      >
                        Nhận tiền
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(r)}
                      aria-label="Sửa giao dịch"
                      title={r.ref_table ? "Sửa (chỉ ghi chú — tx từ module)" : "Sửa"}
                      className="text-muted hover:text-primary text-[14px] w-[26px] h-[26px] flex items-center justify-center"
                    >
                      <i className="ph-duotone ph-pencil-simple" aria-hidden />
                    </button>
                    <button
                      onClick={() => removeTx(r)}
                      aria-label="Xoá giao dịch"
                      title="Xoá"
                      className="text-muted hover:text-[#B4573B] text-[14px] w-[26px] h-[26px] flex items-center justify-center"
                    >
                      <i className="ph-duotone ph-trash" aria-hidden />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Month footer strip */}
      <div className="bg-primary-dark rounded-[16px] px-6 py-4 flex items-center gap-8 flex-wrap">
        <div className="text-[13px] font-bold text-white flex items-center gap-2">
          <i className="ph-duotone ph-sigma" style={{ color: "#8FBCA7" }} aria-hidden />
          {monthKey} totals
        </div>
        <FooterStat label="Recognized" value={summary?.recognized ?? 0} color="#FFFFFF" />
        <FooterStat label="Received" value={summary?.received ?? 0} color="#7FD6AE" />
        <FooterStat label="Pending" value={summary?.pending ?? 0} color="#E8C97A" />
        <FooterStat label="Expenses" value={summary?.expense ?? 0} color="#EFA48B" />
        <div className="ml-auto flex items-baseline gap-[7px]">
          <span className="text-[12px] text-[#9DC4B5]">Net savings</span>
          <span className="text-[17px] font-extrabold text-[#7FD6AE] tnum" title={full(summary?.net ?? 0)}>
            {(summary?.net ?? 0) >= 0 ? "+" : ""}
            {fmt(summary?.net ?? 0)}
          </span>
        </div>
      </div>

      <EntryModal
        open={entryKind !== null}
        kind={entryKind ?? "income"}
        onClose={() => setEntryKind(null)}
        monthKey={monthKey}
        sources={sources}
        categories={categories}
        accounts={accounts}
      />
      <ReceiveModal tx={receiveTx} accounts={accounts} onClose={() => setReceiveTx(null)} />

      {/* Sửa giao dịch */}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title="Sửa giao dịch" icon="ph-duotone ph-pencil-simple" width={440}>
        {edit && (
          <>
            {isModuleTx && (
              <div className="bg-[#FBF0DC] border border-[#EBD9AE] text-[#A5731F] rounded-[10px] px-3 py-[10px] text-[12px] mb-3 leading-[1.5]">
                Giao dịch này sinh từ module <b>{edit.ref_table}</b>. Chỉ sửa được <b>ghi chú</b> ở đây;
                số tiền/tháng phải sửa ở module gốc để không lệch dữ liệu.
              </div>
            )}
            <div className="flex flex-col gap-[14px]">
              <FieldRow>
                <Field label="Số tiền (₫)">
                  <TextInput
                    type="number"
                    value={eAmount}
                    onChange={(e) => setEAmount(e.target.value)}
                    disabled={isModuleTx}
                  />
                </Field>
                <Field label="Tháng (VD T7/26)">
                  <TextInput value={eMonth} onChange={(e) => setEMonth(e.target.value)} disabled={isModuleTx} />
                </Field>
              </FieldRow>
              <Field label="Ghi chú">
                <TextInput value={eNote} onChange={(e) => setENote(e.target.value)} />
              </Field>
              {eErr && <div className="text-[12px] text-[#B4573B] font-semibold">{eErr}</div>}
            </div>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={() => setEdit(null)}>
                Huỷ
              </Button>
              <Button variant="primary" className="flex-1" onClick={saveEdit} disabled={busy}>
                {busy ? "…" : "Lưu"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}

function FooterStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-baseline gap-[7px]">
      <span className="text-[12px] text-[#9DC4B5]">{label}</span>
      <span className="text-[15px] font-extrabold tnum" style={{ color }} title={full(value)}>
        {fmt(value)}
      </span>
    </div>
  );
}
