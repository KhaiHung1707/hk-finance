"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, full, pct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import {
  openDeposit,
  updateDeposit,
  settleDeposit,
  buyStock,
  sellStock,
  recordDividend,
  updateStockTrade,
} from "@/lib/actions/investments";
import { updatePrice } from "@/lib/actions/assets";
import type { DepositPosition, StockPosition, StockHistoryRow } from "@/lib/queries/investments";
import type { Ref } from "@/lib/queries";

const DEP_GRID = "1.3fr 110px 80px 118px 96px 130px 128px 100px 130px";
const STK_GRID = "1.25fr 80px 116px 128px 118px 118px 92px 170px";

const todayISO = () => new Date().toISOString().slice(0, 10);

type ModalKind =
  | { kind: "deposit" }
  | { kind: "editDeposit"; dep: DepositPosition }
  | { kind: "settle"; dep: DepositPosition }
  | { kind: "buy" }
  | { kind: "sell"; pos: StockPosition }
  | { kind: "dividend"; pos: StockPosition }
  | { kind: "editTrade"; row: StockHistoryRow }
  | null;

export function InvestmentsClient({
  monthKey,
  deposits,
  positions,
  history,
  accounts,
  earlyRate,
}: {
  monthKey: string;
  deposits: DepositPosition[];
  positions: StockPosition[];
  history: Record<string, StockHistoryRow[]>;
  accounts: Ref[];
  earlyRate: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"deposits" | "stocks">("deposits");
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // inline price edit
  const [priceEdit, setPriceEdit] = useState<string | null>(null);
  const [priceVal, setPriceVal] = useState("");

  // shared form fields
  const [f, setF] = useState<Record<string, string>>({});
  const [preApp, setPreApp] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  function open(m: ModalKind) {
    if (m?.kind === "settle") setF({ settleOn: todayISO() });
    else if (m?.kind === "editDeposit")
      setF({
        name: m.dep.name,
        principal: String(m.dep.principal),
        rate: String(m.dep.annual_rate * 100),
        months: String(m.dep.term_months),
        start: m.dep.start_on,
      });
    else if (m?.kind === "editTrade")
      setF({ qty: String(m.row.qty ?? ""), price: String(m.row.unit_price ?? "") });
    else setF({});
    setPreApp(false);
    setErr(null);
    setModal(m);
  }
  function close() {
    setModal(null);
    setErr(null);
  }
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okToast?: string) {
    setBusy(true);
    setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "Lỗi");
      return;
    }
    close();
    if (okToast) {
      setToast(okToast);
      setTimeout(() => setToast(null), 4000);
    }
    router.refresh();
  }

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "?";
  const tabBtn = (active: boolean) =>
    `border-0 rounded-full px-5 py-[10px] text-[13px] font-bold cursor-pointer ${
      active ? "bg-primary text-white" : "bg-white text-ink-soft"
    }`;

  const active = deposits.filter((d) => d.status === "active");
  const settled = deposits.filter((d) => d.status !== "active");

  async function saveInlinePrice(ticker: string) {
    const p = Math.round(Number(priceVal) || 0);
    setPriceEdit(null);
    if (p <= 0) return;
    await updatePrice(ticker, p);
    router.refresh();
  }

  return (
    <>
      <HeaderPortal>
        <button
          onClick={() => open(tab === "stocks" ? { kind: "buy" } : { kind: "deposit" })}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          {tab === "stocks" ? "Buy stock" : "New deposit"}
        </button>
      </HeaderPortal>

      {toast && (
        <div className="bg-[#DFF2E7] border border-[#B6E0C8] text-[#1F7A5C] rounded-[12px] px-4 py-3 text-[13px] font-semibold flex items-center gap-2">
          <i className="ph-duotone ph-check-circle" aria-hidden />
          {toast}
        </div>
      )}

      <div className="flex gap-[6px]" role="tablist">
        <button role="tab" aria-selected={tab === "deposits"} onClick={() => setTab("deposits")} className={tabBtn(tab === "deposits")}>
          Term deposits
        </button>
        <button role="tab" aria-selected={tab === "stocks"} onClick={() => setTab("stocks")} className={tabBtn(tab === "stocks")}>
          Stocks
        </button>
      </div>

      {tab === "deposits" ? (
        <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 1000 }}>
              <div
                className="grid gap-[10px] items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
                style={{ gridTemplateColumns: DEP_GRID }}
              >
                <div>Bank</div>
                <div className="text-right">Principal</div>
                <div className="text-right">Rate</div>
                <div className="text-right">Maturity</div>
                <div className="text-right">Days left</div>
                <div className="text-right">Accrued</div>
                <div className="text-right">At maturity</div>
                <div>Status</div>
                <div className="text-right">Action</div>
              </div>

              {active.length === 0 && settled.length === 0 && (
                <div className="px-5 py-10 text-center border-t border-divider">
                  <div className="text-[13px] text-muted mb-3">Chưa có sổ tiết kiệm nào.</div>
                  <button
                    onClick={() => open({ kind: "deposit" })}
                    className="bg-primary text-white border-0 rounded-full px-4 py-2 text-[12px] font-bold cursor-pointer hover:bg-primary-hover"
                  >
                    + Mở sổ đầu tiên
                  </button>
                </div>
              )}

              {active.map((d) => (
                <DepositRow
                  key={d.id}
                  d={d}
                  onSettle={() => open({ kind: "settle", dep: d })}
                  onEdit={() => open({ kind: "editDeposit", dep: d })}
                />
              ))}

              {/* Đã tất toán — collapsed */}
              {settled.length > 0 && (
                <>
                  <button
                    onClick={() => setShowSettled((s) => !s)}
                    className="w-full flex items-center gap-2 px-5 py-3 border-t border-divider bg-[#FAF8F2] text-[12px] font-bold text-muted cursor-pointer"
                  >
                    <i className={`ph-duotone ${showSettled ? "ph-caret-down" : "ph-caret-right"}`} aria-hidden />
                    Đã tất toán ({settled.length})
                  </button>
                  {showSettled && settled.map((d) => <DepositRow key={d.id} d={d} settledView />)}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
          {positions.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="w-[54px] h-[54px] rounded-[16px] bg-chip text-primary flex items-center justify-center text-[26px] mx-auto mb-3">
                <i className="ph-duotone ph-chart-line-up" aria-hidden />
              </div>
              <div className="text-[15px] font-bold mb-1">Chưa có cổ phiếu</div>
              <div className="text-[12px] text-muted mb-4">Mua cổ phiếu để bắt đầu theo dõi P&L và ROI.</div>
              <button
                onClick={() => open({ kind: "buy" })}
                className="bg-primary text-white border-0 rounded-full px-5 py-[10px] text-[13px] font-bold cursor-pointer hover:bg-primary-hover"
              >
                Mua cổ phiếu đầu tiên
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: 1000 }}>
                <div
                  className="grid gap-[10px] items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
                  style={{ gridTemplateColumns: STK_GRID }}
                >
                  <div>Ticker</div>
                  <div className="text-right">Shares</div>
                  <div className="text-right">Avg cost</div>
                  <div className="text-right">Current</div>
                  <div className="text-right">Market value</div>
                  <div className="text-right">Unrealized</div>
                  <div className="text-right">ROI</div>
                  <div className="text-right">Actions</div>
                </div>

                {positions.map((p) => {
                  const mv = p.qty * p.last_price;
                  const cost = p.qty * p.avg_cost;
                  const pl = mv - cost;
                  const roi = cost > 0 ? (pl / cost) * 100 : 0;
                  const up = pl >= 0;
                  const rows = history[p.ticker] ?? [];
                  const isOpen = expanded === p.ticker;
                  return (
                    <div key={p.ticker}>
                      <div
                        className="grid gap-[10px] items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
                        style={{ gridTemplateColumns: STK_GRID }}
                      >
                        <button
                          onClick={() => setExpanded(isOpen ? null : p.ticker)}
                          className="flex items-center gap-[10px] bg-transparent border-0 cursor-pointer text-left p-0"
                          aria-label={`Lịch sử ${p.ticker}`}
                        >
                          <i className={`ph-duotone ${isOpen ? "ph-caret-down" : "ph-caret-right"} text-muted`} aria-hidden />
                          <div className="w-[34px] h-[34px] rounded-[9px] bg-primary-dark text-white flex items-center justify-center text-[11px] font-extrabold">
                            {p.ticker.slice(0, 4)}
                          </div>
                          <div>
                            <div className="font-semibold">{p.ticker}</div>
                            <div className="text-[11px] text-muted">{p.name ?? "—"}</div>
                          </div>
                        </button>
                        <div className="text-right tnum">{p.qty}</div>
                        <div className="text-right tnum" title={full(p.avg_cost)}>
                          {new Intl.NumberFormat("en-US").format(p.avg_cost)}
                        </div>
                        {/* inline price edit */}
                        <div className="text-right tnum">
                          {priceEdit === p.ticker ? (
                            <input
                              autoFocus
                              type="number"
                              value={priceVal}
                              onChange={(e) => setPriceVal(e.target.value)}
                              onBlur={() => saveInlinePrice(p.ticker)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlinePrice(p.ticker);
                                if (e.key === "Escape") setPriceEdit(null);
                              }}
                              className="w-[100px] border border-primary rounded-[8px] px-2 py-1 text-[12px] text-right outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setPriceEdit(p.ticker);
                                setPriceVal(String(p.last_price));
                              }}
                              className="bg-transparent border-0 cursor-pointer tnum text-ink hover:text-primary hover:underline p-0"
                              title="Cập nhật giá"
                            >
                              {new Intl.NumberFormat("en-US").format(p.last_price)}
                            </button>
                          )}
                        </div>
                        <div className="text-right font-bold tnum" title={full(mv)}>
                          {fmt(mv)}
                        </div>
                        <div className="text-right font-bold tnum" style={{ color: up ? "#1F7A5C" : "#B4573B" }} title={full(pl)}>
                          {up ? "+" : "−"}
                          {fmt(Math.abs(pl))}
                        </div>
                        <div className="text-right tnum text-[12px]" style={{ color: up ? "#1F7A5C" : "#B4573B" }}>
                          {up ? "+" : ""}
                          {roi.toFixed(1)}%
                        </div>
                        <div className="flex justify-end gap-[6px]">
                          <button
                            onClick={() => open({ kind: "sell", pos: p })}
                            className="bg-[#F7E3DC] text-[#B4573B] border-0 rounded-full px-[12px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-[#F0D2C6]"
                          >
                            Sell
                          </button>
                          <button
                            onClick={() => open({ kind: "dividend", pos: p })}
                            className="bg-[#DFF2E7] text-[#1F7A5C] border-0 rounded-full px-[12px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-[#CDE9D8]"
                          >
                            Dividend
                          </button>
                        </div>
                      </div>

                      {/* trade history */}
                      {isOpen && (
                        <div className="px-5 py-3 bg-[#FAF8F2] border-t border-divider">
                          <div className="text-[11px] font-bold text-muted uppercase tracking-[0.4px] mb-2">
                            Lịch sử giao dịch
                          </div>
                          {rows.length === 0 ? (
                            <div className="text-[12px] text-muted">Không có giao dịch.</div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {rows.map((h) => (
                                <div key={h.id} className="flex items-center gap-3 text-[12px]">
                                  <span
                                    className="rounded-full px-2 py-[2px] text-[10px] font-bold"
                                    style={{
                                      background: h.kind === "buy" ? "#F7E3DC" : h.kind === "sell" ? "#DFF2E7" : "#EAF4EE",
                                      color: h.kind === "buy" ? "#B4573B" : h.kind === "sell" ? "#1F7A5C" : "#17554A",
                                    }}
                                  >
                                    {h.kind === "buy" ? "Mua" : h.kind === "sell" ? "Bán" : "Cổ tức"}
                                  </span>
                                  <span className="text-muted tnum">{h.on}</span>
                                  {h.qty != null && (
                                    <span className="tnum">
                                      {h.qty} cp @ {new Intl.NumberFormat("en-US").format(h.unit_price ?? 0)}
                                    </span>
                                  )}
                                  <span className="ml-auto font-semibold tnum" title={full(h.amount)}>
                                    {fmt(h.amount)}
                                  </span>
                                  {h.kind !== "dividend" && (
                                    <button
                                      onClick={() => open({ kind: "editTrade", row: h })}
                                      aria-label="Sửa giao dịch"
                                      title="Sửa số lượng / giá"
                                      className="text-muted hover:text-primary text-[13px]"
                                    >
                                      <i className="ph-duotone ph-pencil-simple" aria-hidden />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Modals ===== */}

      {/* New deposit */}
      <Modal open={modal?.kind === "deposit"} onClose={close} title="New deposit" icon="ph-duotone ph-piggy-bank" width={480}>
        <NewDepositForm
          f={f}
          set={set}
          preApp={preApp}
          setPreApp={setPreApp}
          accounts={accounts}
          err={err}
          busy={busy}
          onClose={close}
          onSubmit={() =>
            run(() =>
              openDeposit({
                name: f.name ?? "",
                principal: Math.round(Number(f.principal) || 0),
                rate: (Number(f.rate) || 0) / 100,
                termMonths: Number(f.months) || 12,
                start: f.start || todayISO(),
                accountId: preApp ? null : f.account || null,
                monthKey,
              })
            )
          }
        />
      </Modal>

      {/* Settle deposit — G2 */}
      <Modal open={modal?.kind === "settle"} onClose={close} title="Tất toán sổ" icon="ph-duotone ph-hand-coins" iconBg="#DFF2E7" iconFg="#1F7A5C" width={480}>
        {modal?.kind === "settle" && (
          <SettleForm
            dep={modal.dep}
            earlyRate={earlyRate}
            f={f}
            set={set}
            accounts={accounts}
            accountName={accountName}
            err={err}
            busy={busy}
            onClose={close}
            onSubmit={(interestOverride) =>
              run(
                () =>
                  settleDeposit({
                    id: modal.dep.id,
                    accountId: f.account ?? "",
                    monthKey,
                    settleOn: f.settleOn || todayISO(),
                    interestOverride,
                  }),
                "Đã tất toán sổ và ghi vào Ledger."
              )
            }
          />
        )}
      </Modal>

      {/* Buy stock */}
      <Modal open={modal?.kind === "buy"} onClose={close} title="Buy stock" icon="ph-duotone ph-trend-up">
        <div className="flex flex-col gap-[14px]">
          <FieldRow>
            <Field label="Ticker">
              <TextInput value={f.ticker ?? ""} onChange={set("ticker")} placeholder="FPT" />
            </Field>
            <Field label="Số lượng">
              <TextInput type="number" value={f.qty ?? ""} onChange={set("qty")} placeholder="0" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Giá / cp (₫)">
              <TextInput type="number" value={f.price ?? ""} onChange={set("price")} placeholder="0" />
            </Field>
            <Field label="Trừ tài khoản">
              <Select value={f.account ?? ""} onChange={set("account")}>
                <option value="">— chọn —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
          <PreviewPanel
            text={
              f.account
                ? `Sẽ ghi: −${full((Number(f.qty) || 0) * (Number(f.price) || 0))} từ ${accountName(f.account)} — danh mục Đầu tư`
                : "Chọn tài khoản để xem giao dịch sẽ tạo"
            }
          />
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={close}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={busy || !f.account || !f.ticker || !(Number(f.qty) > 0) || !(Number(f.price) > 0)}
            onClick={() =>
              run(
                () =>
                  buyStock({
                    ticker: f.ticker ?? "",
                    qty: Number(f.qty) || 0,
                    price: Math.round(Number(f.price) || 0),
                    accountId: f.account,
                    monthKey,
                  }),
                "Đã mua cổ phiếu và ghi vào Ledger."
              )
            }
          >
            {busy ? "…" : "Buy"}
          </Button>
        </ModalActions>
      </Modal>

      {/* Sell stock */}
      <Modal open={modal?.kind === "sell"} onClose={close} title="Sell stock" icon="ph-duotone ph-arrow-down-right" iconBg="#F7E3DC" iconFg="#B4573B">
        {modal?.kind === "sell" && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              {modal.pos.ticker} — đang nắm <b>{modal.pos.qty}</b> cp · giá vốn{" "}
              {new Intl.NumberFormat("en-US").format(modal.pos.avg_cost)}
            </div>
            <div className="flex flex-col gap-[14px]">
              <FieldRow>
                <Field label={`Số lượng bán (tối đa ${modal.pos.qty})`}>
                  <TextInput type="number" value={f.qty ?? ""} onChange={set("qty")} placeholder="0" />
                </Field>
                <Field label="Giá bán / cp (₫)">
                  <TextInput type="number" value={f.price ?? String(modal.pos.last_price)} onChange={set("price")} />
                </Field>
              </FieldRow>
              <Field label="Nhận vào tài khoản">
                <Select value={f.account ?? ""} onChange={set("account")}>
                  <option value="">— chọn —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {(() => {
                const q = Number(f.qty) || 0;
                const price = Number(f.price) || modal.pos.last_price;
                const realized = q * (price - modal.pos.avg_cost);
                return (
                  <PreviewPanel
                    text={
                      f.account && q > 0
                        ? `Sẽ ghi: +${full(q * price)} vào ${accountName(f.account)}. Lãi/lỗ thực hiện ${realized >= 0 ? "+" : "−"}${full(Math.abs(realized))}`
                        : "Nhập số lượng và tài khoản"
                    }
                    danger={q > modal.pos.qty}
                    dangerText={q > modal.pos.qty ? `Vượt số nắm giữ (${modal.pos.qty})` : undefined}
                  />
                );
              })()}
              {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
            </div>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={close}>
                Huỷ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy || !f.account || !(Number(f.qty) > 0) || Number(f.qty) > modal.pos.qty}
                onClick={() => {
                  const q = Number(f.qty) || 0;
                  const price = Math.round(Number(f.price) || modal.pos.last_price);
                  const realized = q * (price - modal.pos.avg_cost);
                  run(
                    () =>
                      sellStock({
                        ticker: modal.pos.ticker,
                        qty: q,
                        price,
                        accountId: f.account,
                        monthKey,
                      }),
                    `Đã bán ${q} ${modal.pos.ticker}. Lãi/lỗ thực hiện ${realized >= 0 ? "+" : "−"}${full(Math.abs(realized))}.`
                  );
                }}
              >
                {busy ? "…" : "Sell"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>

      {/* Dividend */}
      <Modal open={modal?.kind === "dividend"} onClose={close} title="Record dividend" icon="ph-duotone ph-gift" iconBg="#DFF2E7" iconFg="#1F7A5C">
        {modal?.kind === "dividend" && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              {modal.pos.ticker} — {modal.pos.qty} cp
            </div>
            <div className="flex flex-col gap-[14px]">
              <FieldRow>
                <Field label="Cổ tức / cp (₫)">
                  <TextInput type="number" value={f.perShare ?? ""} onChange={set("perShare")} placeholder="0" />
                </Field>
                <Field label="Nhận vào tài khoản">
                  <Select value={f.account ?? ""} onChange={set("account")}>
                    <option value="">— chọn —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldRow>
              <PreviewPanel
                text={
                  f.account
                    ? `Sẽ ghi: +${full((Number(f.perShare) || 0) * modal.pos.qty)} vào ${accountName(f.account)} — nguồn Đầu tư`
                    : "Chọn tài khoản"
                }
              />
              {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
            </div>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={close}>
                Huỷ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy || !f.account || !(Number(f.perShare) > 0)}
                onClick={() =>
                  run(
                    () =>
                      recordDividend({
                        ticker: modal.pos.ticker,
                        amount: Math.round((Number(f.perShare) || 0) * modal.pos.qty),
                        accountId: f.account,
                        monthKey,
                      }),
                    "Đã ghi cổ tức vào Ledger."
                  )
                }
              >
                {busy ? "…" : "Record"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>

      {/* Sửa sổ tiết kiệm (active) */}
      <Modal open={modal?.kind === "editDeposit"} onClose={close} title="Sửa sổ tiết kiệm" icon="ph-duotone ph-pencil-simple" width={480}>
        {modal?.kind === "editDeposit" && (
          <>
            <div className="flex flex-col gap-[14px]">
              <Field label="Tên sổ">
                <TextInput value={f.name ?? ""} onChange={set("name")} />
              </Field>
              <FieldRow>
                <Field label="Gốc (₫)">
                  <TextInput type="number" value={f.principal ?? ""} onChange={set("principal")} />
                </Field>
                <Field label="Lãi suất (%/năm)">
                  <TextInput type="number" value={f.rate ?? ""} onChange={set("rate")} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Kỳ hạn (tháng)">
                  <TextInput type="number" value={f.months ?? ""} onChange={set("months")} />
                </Field>
                <Field label="Ngày mở">
                  <TextInput type="date" value={f.start ?? ""} onChange={set("start")} />
                </Field>
              </FieldRow>
              {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
            </div>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={close}>
                Huỷ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy || !f.name || !(Number(f.principal) > 0)}
                onClick={() =>
                  run(() =>
                    updateDeposit({
                      id: modal.dep.id,
                      name: f.name ?? "",
                      principal: Math.round(Number(f.principal) || 0),
                      rate: (Number(f.rate) || 0) / 100,
                      termMonths: Number(f.months) || 1,
                      start: f.start || todayISO(),
                    })
                  )
                }
              >
                {busy ? "…" : "Lưu"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>

      {/* Sửa giao dịch cổ phiếu */}
      <Modal open={modal?.kind === "editTrade"} onClose={close} title="Sửa giao dịch" icon="ph-duotone ph-pencil-simple" width={420}>
        {modal?.kind === "editTrade" && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              {modal.row.kind === "buy" ? "Mua" : "Bán"} {modal.row.ticker} · {modal.row.on}
            </div>
            <div className="flex flex-col gap-[14px]">
              <FieldRow>
                <Field label="Số lượng">
                  <TextInput type="number" value={f.qty ?? ""} onChange={set("qty")} autoFocus />
                </Field>
                <Field label="Giá / cp (₫)">
                  <TextInput type="number" value={f.price ?? ""} onChange={set("price")} />
                </Field>
              </FieldRow>
              <div className="text-[11px] text-muted">
                Số tiền giao dịch sẽ được cập nhật = số lượng × giá. Vị thế tự tính lại.
              </div>
              {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
            </div>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={close}>
                Huỷ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy || !(Number(f.qty) > 0) || !(Number(f.price) > 0)}
                onClick={() =>
                  run(() =>
                    updateStockTrade({
                      id: modal.row.id,
                      qty: Number(f.qty) || 0,
                      price: Math.round(Number(f.price) || 0),
                    })
                  )
                }
              >
                {busy ? "…" : "Lưu"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}

// ---------- Sub components ----------

function DepositRow({
  d,
  onSettle,
  onEdit,
  settledView,
}: {
  d: DepositPosition;
  onSettle?: () => void;
  onEdit?: () => void;
  settledView?: boolean;
}) {
  const st =
    d.status === "settled"
      ? { label: "Settled", bg: "#DFF2E7", fg: "#1F7A5C" }
      : d.status === "withdrawn_early"
        ? { label: "Tất toán sớm", bg: "#F7E3DC", fg: "#B4573B" }
        : d.matured
          ? { label: "Matured", bg: "#FBF0DC", fg: "#A5731F" }
          : { label: "Active", bg: "#EAF4EE", fg: "#17554A" };
  return (
    <div
      className="grid gap-[10px] items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
      style={{ gridTemplateColumns: DEP_GRID, opacity: settledView ? 0.75 : 1 }}
    >
      <div className="flex items-center gap-[10px]">
        <div className="w-8 h-8 rounded-[9px] bg-chip text-primary flex items-center justify-center text-[16px]">
          <i className="ph-duotone ph-piggy-bank" aria-hidden />
        </div>
        <div>
          <div className="font-semibold">{d.name}</div>
          <div className="text-[11px] text-muted">
            {d.term_months} mo · từ {d.start_on}
          </div>
        </div>
      </div>
      <div className="text-right font-bold tnum" title={full(d.principal)}>
        {fmt(d.principal)}
      </div>
      <div className="text-right tnum">{pct(d.annual_rate)}</div>
      <div className="text-right tnum text-[12px]">{d.maturity_on ?? "—"}</div>
      <div className="text-right tnum" style={{ color: d.matured ? "#1F7A5C" : "#4C5A54" }}>
        {d.status !== "active" ? "—" : d.matured ? "Matured" : `${d.days_left}d`}
      </div>
      <div className="text-right font-bold text-[#1F7A5C] tnum" title={full(d.interest_accrued)}>
        {d.status === "active" ? "+" + fmt(d.interest_accrued) : "—"}
      </div>
      <div className="text-right tnum text-muted" title={full(d.interest_full)}>
        {fmt(d.interest_full)}
      </div>
      <div>
        <Badge bg={st.bg} fg={st.fg}>
          {st.label}
        </Badge>
      </div>
      <div className="flex justify-end gap-1">
        {d.status === "active" ? (
          <>
            <button
              onClick={onEdit}
              aria-label="Sửa sổ"
              title="Sửa"
              className="text-muted hover:text-primary text-[14px] w-[28px] h-[28px] flex items-center justify-center"
            >
              <i className="ph-duotone ph-pencil-simple" aria-hidden />
            </button>
            <button
              onClick={onSettle}
              className="bg-primary text-white border-0 rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
            >
              Tất toán
            </button>
          </>
        ) : (
          <span className="flex items-center gap-[5px] text-muted text-[11px] font-bold">
            <i className="ph-duotone ph-check" aria-hidden />
            Xong
          </span>
        )}
      </div>
    </div>
  );
}

function SettleForm({
  dep,
  earlyRate,
  f,
  set,
  accounts,
  accountName,
  err,
  busy,
  onClose,
  onSubmit,
}: {
  dep: DepositPosition;
  earlyRate: number;
  f: Record<string, string>;
  set: (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  accounts: Ref[];
  accountName: (id: string) => string;
  err: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (interestOverride: number | null) => void;
}) {
  const settleOn = f.settleOn || new Date().toISOString().slice(0, 10);
  const isEarly = dep.maturity_on != null && settleOn < dep.maturity_on;

  // preview lãi — khớp công thức RPC:
  //  sớm: principal × earlyRate × daysHeld/365 ; đáo hạn: interest_full.
  const daysHeld = Math.max(
    0,
    Math.round((new Date(settleOn).getTime() - new Date(dep.start_on).getTime()) / 86400000)
  );
  const earlyInterestDefault = isEarly
    ? Math.round((dep.principal * earlyRate * daysHeld) / 365)
    : dep.interest_full;
  const overrideRaw = f.interest;
  const interest = overrideRaw !== undefined && overrideRaw !== "" ? Math.round(Number(overrideRaw) || 0) : earlyInterestDefault;
  const total = dep.principal + interest;

  return (
    <>
      <div className="text-[13px] text-ink-soft mb-3">
        {dep.name} — gốc <b>{full(dep.principal)}</b>
      </div>

      {isEarly && (
        <div className="bg-[#FBF0DC] border border-[#EBD9AE] text-[#A5731F] rounded-[10px] px-3 py-[10px] text-[12px] mb-3 leading-[1.5]">
          <b>Tất toán sớm.</b> Ngày tất toán trước đáo hạn ({dep.maturity_on}). Lãi tính theo
          lãi suất không kỳ hạn trên {daysHeld} ngày nắm giữ — thấp hơn lãi đáo hạn. Sổ chuyển
          trạng thái <b>withdrawn_early</b>.
        </div>
      )}

      <div className="flex flex-col gap-[14px]">
        <FieldRow>
          <Field label="Ngày tất toán">
            <TextInput type="date" value={settleOn} onChange={set("settleOn")} />
          </Field>
          <Field label="Nhận vào tài khoản">
            <Select value={f.account ?? ""} onChange={set("account")}>
              <option value="">— chọn —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        <Field label={`Lãi (₫) — mặc định ${isEarly ? "không kỳ hạn" : "đáo hạn"}, có thể sửa`}>
          <TextInput
            type="number"
            value={overrideRaw ?? String(earlyInterestDefault)}
            onChange={set("interest")}
          />
        </Field>
        <PreviewPanel
          text={
            f.account
              ? `Sẽ ghi: +${full(total)} vào ${accountName(f.account)} — nguồn Đầu tư (gốc ${fmt(dep.principal)} + lãi ${fmt(interest)})`
              : "Chọn tài khoản nhận"
          }
        />
        {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
      </div>
      <ModalActions>
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !f.account}
          onClick={() =>
            onSubmit(overrideRaw !== undefined && overrideRaw !== "" ? Math.round(Number(overrideRaw) || 0) : null)
          }
        >
          {busy ? "…" : "Tất toán & ghi Ledger"}
        </Button>
      </ModalActions>
    </>
  );
}

function NewDepositForm({
  f,
  set,
  preApp,
  setPreApp,
  accounts,
  err,
  busy,
  onClose,
  onSubmit,
}: {
  f: Record<string, string>;
  set: (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  preApp: boolean;
  setPreApp: (v: boolean) => void;
  accounts: Ref[];
  err: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const principal = Math.round(Number(f.principal) || 0);
  return (
    <>
      <div className="flex flex-col gap-[14px]">
        <Field label="Bank / tên sổ">
          <TextInput value={f.name ?? ""} onChange={set("name")} placeholder="Tiết kiệm Techcombank" />
        </Field>
        <FieldRow>
          <Field label="Principal (₫)">
            <TextInput type="number" value={f.principal ?? ""} onChange={set("principal")} placeholder="0" />
          </Field>
          <Field label="Rate (%/năm)">
            <TextInput type="number" value={f.rate ?? ""} onChange={set("rate")} placeholder="5" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Kỳ hạn (tháng)">
            <TextInput type="number" value={f.months ?? ""} onChange={set("months")} placeholder="12" />
          </Field>
          <Field label="Ngày mở">
            <TextInput type="date" value={f.start ?? ""} onChange={set("start")} />
          </Field>
        </FieldRow>

        <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-soft cursor-pointer">
          <input type="checkbox" checked={preApp} onChange={(e) => setPreApp(e.target.checked)} />
          Sổ đã mở trước khi dùng app (không trừ số dư tài khoản)
        </label>

        {!preApp && (
          <Field label="Nguồn tiền (trừ từ tài khoản này)">
            <Select value={f.account ?? ""} onChange={set("account")}>
              <option value="">— chọn —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <PreviewPanel
          text={
            preApp
              ? `Sổ pre-app: cộng ${fmt(principal)} vào nhóm Deposits của net worth, không tạo giao dịch.`
              : f.account
                ? `Sẽ ghi: −${full(principal)} từ tài khoản nguồn — danh mục Đầu tư.`
                : "Chọn nguồn tiền (hoặc tick sổ pre-app)."
          }
        />
        {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
      </div>
      <ModalActions>
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !f.name || !(principal > 0) || (!preApp && !f.account)}
          onClick={onSubmit}
        >
          {busy ? "…" : "Open deposit"}
        </Button>
      </ModalActions>
    </>
  );
}

function PreviewPanel({
  text,
  danger,
  dangerText,
}: {
  text: string;
  danger?: boolean;
  dangerText?: string;
}) {
  return (
    <div
      className="rounded-[10px] px-[13px] py-[10px] text-[12px] leading-[1.5]"
      style={{ background: danger ? "#F7E3DC" : "#F7F4EC", color: danger ? "#B4573B" : "#4C5A54" }}
    >
      <i className="ph-duotone ph-receipt mr-1" aria-hidden />
      {danger && dangerText ? dangerText : text}
    </div>
  );
}
