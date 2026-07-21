"use client";
import { useState } from "react";
import { fmt, full, pct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import {
  openDeposit,
  settleDeposit,
  buyStock,
  sellStock,
  recordDividend,
} from "@/lib/actions/investments";
import type { DepositPosition, StockPosition } from "@/lib/queries/investments";
import type { Ref } from "@/lib/queries";

const DEP_GRID = "1.3fr 120px 90px 120px 110px 130px 110px 150px";
const STK_GRID = "1.3fr 90px 120px 120px 130px 130px 200px";

type ModalKind =
  | { kind: "deposit" }
  | { kind: "settle"; dep: DepositPosition }
  | { kind: "buy" }
  | { kind: "sell"; pos: StockPosition }
  | { kind: "dividend"; pos: StockPosition }
  | null;

export function InvestmentsClient({
  monthKey,
  deposits,
  positions,
  accounts,
}: {
  monthKey: string;
  deposits: DepositPosition[];
  positions: StockPosition[];
  accounts: Ref[];
}) {
  const [tab, setTab] = useState<"deposits" | "stocks">("deposits");
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // shared form fields
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  function open(m: ModalKind) {
    setF({});
    setErr(null);
    setModal(m);
  }
  function close() {
    setModal(null);
    setErr(null);
  }
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "Lỗi");
      return;
    }
    close();
  }

  const tabBtn = (active: boolean) =>
    `border-0 rounded-full px-5 py-[10px] text-[13px] font-bold cursor-pointer ${
      active ? "bg-primary text-white" : "bg-white text-ink-soft"
    }`;

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

      <div className="flex gap-[6px]">
        <button onClick={() => setTab("deposits")} className={tabBtn(tab === "deposits")}>
          Term deposits
        </button>
        <button onClick={() => setTab("stocks")} className={tabBtn(tab === "stocks")}>
          Stocks
        </button>
      </div>

      {tab === "deposits" ? (
        <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 900 }}>
              <div
                className="grid gap-[10px] items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
                style={{ gridTemplateColumns: DEP_GRID }}
              >
                <div>Bank</div>
                <div className="text-right">Principal</div>
                <div className="text-right">Rate</div>
                <div className="text-right">Maturity</div>
                <div className="text-right">Days left</div>
                <div className="text-right">Interest</div>
                <div>Status</div>
                <div className="text-right">Action</div>
              </div>
              {deposits.length === 0 && (
                <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
                  Chưa có sổ tiết kiệm.
                </div>
              )}
              {deposits.map((d) => {
                const st =
                  d.status === "settled"
                    ? { label: "Settled", bg: "#DFF2E7", fg: "#1F7A5C" }
                    : d.matured
                    ? { label: "Matured", bg: "#FBF0DC", fg: "#A5731F" }
                    : { label: "Active", bg: "#EAF4EE", fg: "#17554A" };
                return (
                  <div
                    key={d.id}
                    className="grid gap-[10px] items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
                    style={{ gridTemplateColumns: DEP_GRID }}
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
                    <div
                      className="text-right tnum"
                      style={{ color: d.matured ? "#1F7A5C" : "#4C5A54" }}
                    >
                      {d.status === "settled" ? "—" : d.matured ? "Matured" : `${d.days_left}d`}
                    </div>
                    <div className="text-right font-bold text-[#1F7A5C] tnum" title={full(d.interest_full)}>
                      +{fmt(d.interest_full)}
                    </div>
                    <div>
                      <Badge bg={st.bg} fg={st.fg}>
                        {st.label}
                      </Badge>
                    </div>
                    <div className="flex justify-end">
                      {d.status === "active" ? (
                        <button
                          onClick={() => open({ kind: "settle", dep: d })}
                          className="bg-primary text-white border-0 rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
                        >
                          Settle interest
                        </button>
                      ) : (
                        <span className="flex items-center gap-[5px] bg-[#DFF2E7] text-[#1F7A5C] rounded-full px-[11px] py-[6px] text-[11px] font-bold">
                          <i className="ph-duotone ph-check" aria-hidden />
                          Settled
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 960 }}>
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
                <div className="text-right">Actions</div>
              </div>
              {positions.length === 0 && (
                <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
                  Chưa nắm cổ phiếu nào. Bấm “Buy stock”.
                </div>
              )}
              {positions.map((p) => {
                const mv = p.qty * p.last_price;
                const cost = p.qty * p.avg_cost;
                const pl = mv - cost;
                const up = pl >= 0;
                return (
                  <div
                    key={p.ticker}
                    className="grid gap-[10px] items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
                    style={{ gridTemplateColumns: STK_GRID }}
                  >
                    <div className="flex items-center gap-[10px]">
                      <div className="w-[34px] h-[34px] rounded-[9px] bg-primary-dark text-white flex items-center justify-center text-[11px] font-extrabold">
                        {p.ticker.slice(0, 4)}
                      </div>
                      <div>
                        <div className="font-semibold">{p.ticker}</div>
                        <div className="text-[11px] text-muted">{p.name ?? "—"}</div>
                      </div>
                    </div>
                    <div className="text-right tnum">{p.qty}</div>
                    <div className="text-right tnum" title={full(p.avg_cost)}>
                      {new Intl.NumberFormat("en-US").format(p.avg_cost)}
                    </div>
                    <div className="text-right tnum" title={full(p.last_price)}>
                      {new Intl.NumberFormat("en-US").format(p.last_price)}
                    </div>
                    <div className="text-right font-bold tnum" title={full(mv)}>
                      {fmt(mv)}
                    </div>
                    <div
                      className="text-right font-bold tnum"
                      style={{ color: up ? "#1F7A5C" : "#B4573B" }}
                      title={full(pl)}
                    >
                      {up ? "+" : "−"}
                      {fmt(Math.abs(pl))}
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
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== Modals ===== */}

      {/* New deposit */}
      <Modal open={modal?.kind === "deposit"} onClose={close} title="New deposit" icon="ph-duotone ph-piggy-bank" width={480}>
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
          <Field label="Nguồn tiền (để trống nếu sổ có sẵn)">
            <Select value={f.account ?? ""} onChange={set("account")}>
              <option value="">— pre-app (không trừ số dư) —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={close}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={busy}
            onClick={() =>
              run(() =>
                openDeposit({
                  name: f.name ?? "",
                  principal: Math.round(Number(f.principal) || 0),
                  rate: (Number(f.rate) || 0) / 100,
                  termMonths: Number(f.months) || 12,
                  start: f.start || new Date().toISOString().slice(0, 10),
                  accountId: f.account || null,
                  monthKey,
                })
              )
            }
          >
            {busy ? "…" : "Open deposit"}
          </Button>
        </ModalActions>
      </Modal>

      {/* Settle deposit */}
      <Modal open={modal?.kind === "settle"} onClose={close} title="Settle interest" icon="ph-duotone ph-hand-coins" iconBg="#DFF2E7" iconFg="#1F7A5C">
        {modal?.kind === "settle" && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              {modal.dep.name} — gốc <b>{full(modal.dep.principal)}</b> + lãi{" "}
              <b className="text-[#1F7A5C]">{full(modal.dep.interest_full)}</b>
            </div>
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
            {err && <div className="text-[12px] text-[#B4573B] font-semibold mt-2">{err}</div>}
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={close}>
                Huỷ
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy || !f.account}
                onClick={() => run(() => settleDeposit(modal.dep.id, f.account, monthKey))}
              >
                {busy ? "…" : "Settle & add to ledger"}
              </Button>
            </ModalActions>
          </>
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
          <div className="text-[11px] text-muted">
            Tổng chi <b className="text-ink">{full((Number(f.qty) || 0) * (Number(f.price) || 0))}</b>
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
            disabled={busy || !f.account}
            onClick={() =>
              run(() =>
                buyStock({
                  ticker: f.ticker ?? "",
                  qty: Number(f.qty) || 0,
                  price: Math.round(Number(f.price) || 0),
                  accountId: f.account,
                  monthKey,
                })
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
                <Field label="Số lượng bán">
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
              <div className="text-[11px] text-muted">
                Thu về <b className="text-ink">{full((Number(f.qty) || 0) * (Number(f.price) || modal.pos.last_price))}</b>
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
                disabled={busy || !f.account}
                onClick={() =>
                  run(() =>
                    sellStock({
                      ticker: modal.pos.ticker,
                      qty: Number(f.qty) || 0,
                      price: Math.round(Number(f.price) || modal.pos.last_price),
                      accountId: f.account,
                      monthKey,
                    })
                  )
                }
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
              <div className="text-[11px] text-muted">
                Tổng cổ tức <b className="text-[#1F7A5C]">{full((Number(f.perShare) || 0) * modal.pos.qty)}</b>
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
                disabled={busy || !f.account}
                onClick={() =>
                  run(() =>
                    recordDividend({
                      ticker: modal.pos.ticker,
                      amount: Math.round((Number(f.perShare) || 0) * modal.pos.qty),
                      accountId: f.account,
                      monthKey,
                    })
                  )
                }
              >
                {busy ? "…" : "Record"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}
