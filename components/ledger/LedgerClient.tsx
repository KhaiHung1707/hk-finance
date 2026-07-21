"use client";
import { useMemo, useState } from "react";
import { fmt, full } from "@/lib/format";
import { txTypeStyle, txStatusStyle, sourceIcon } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { EntryModal } from "./EntryModal";
import { ReceiveModal } from "./ReceiveModal";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
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
  rows,
  summary,
  sources,
  categories,
  accounts,
}: {
  monthKey: string;
  rows: LedgerRow[];
  summary: MonthlySummary | null;
  sources: Ref[];
  categories: Ref[];
  accounts: Ref[];
}) {
  const [entryKind, setEntryKind] = useState<"income" | "expense" | null>(null);
  const [receiveTx, setReceiveTx] = useState<{ id: string; amount: number; label: string } | null>(null);

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
        <div className="flex items-center gap-[7px] bg-primary text-white rounded-full px-[14px] py-[8px] text-[12px] font-bold">
          <i className="ph-duotone ph-calendar-blank" aria-hidden />
          {monthKey}
        </div>
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
              <div className="flex justify-end gap-[6px]">
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
