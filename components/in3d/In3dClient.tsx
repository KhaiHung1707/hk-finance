"use client";
import { useState } from "react";
import { fmt, full } from "@/lib/format";
import { txStatusStyle } from "@/lib/design/tokens";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { HeaderPortal } from "@/components/ui/HeaderPortal";
import { useActionRunner, ConfirmHost } from "@/components/ui/useActionRunner";
import { ReceiveModal } from "@/components/ledger/ReceiveModal";
import { buyFilament, createPrintOrder, cancelPrintOrder } from "@/lib/actions/in3d";
import { rollbackStatus } from "@/lib/actions/ledger";
import type { FilamentStock, PrintOrder } from "@/lib/queries/in3d";
import type { Ref } from "@/lib/queries";

const CHANNELS = ["Shopee", "TikTok", "Facebook", "Direct"];
const MATERIALS = ["PLA", "PETG", "ABS", "TPU"];
const ORDER_GRID = "70px 1.4fr 110px 1fr 100px 120px 120px 110px 130px";

export function In3dClient({
  monthKey,
  filaments,
  orders,
  accounts,
}: {
  monthKey: string;
  filaments: FilamentStock[];
  orders: PrintOrder[];
  accounts: Ref[];
}) {
  const runner = useActionRunner();
  const { confirmRun } = runner;
  const [tab, setTab] = useState<"orders" | "stock">("orders");
  const [modal, setModal] = useState<"buy" | "order" | null>(null);
  const [receiveTx, setReceiveTx] = useState<{ id: string; amount: number; label: string } | null>(null);

  // Buy filament form
  const [bMaterial, setBMaterial] = useState("PLA");
  const [bColor, setBColor] = useState("");
  const [bKg, setBKg] = useState("");
  const [bPrice, setBPrice] = useState("");
  const [bAccount, setBAccount] = useState("");

  // New order form
  const [oName, setOName] = useState("");
  const [oChannel, setOChannel] = useState("Shopee");
  const [oFilament, setOFilament] = useState("");
  const [oKg, setOKg] = useState("");
  const [oPrice, setOPrice] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selFil = filaments.find((f) => f.id === oFilament);
  const oCost = selFil ? Math.round((Number(oKg) || 0) * selFil.cost_per_kg) : 0;
  const oProfit = (Number(oPrice) || 0) - oCost;

  function closeModal() {
    setModal(null);
    setErr(null);
  }

  async function submitBuy() {
    setBusy(true);
    setErr(null);
    if (!bMaterial || !bKg || !bPrice || !bAccount) return fail("Nhập đủ thông tin");
    const res = await buyFilament({
      material: bMaterial,
      color: bColor,
      kg: Number(bKg),
      costPerKg: Math.round(Number(bPrice)),
      accountId: bAccount,
      monthKey,
    });
    if (!res.ok) return fail(res.error ?? "Lỗi");
    setBusy(false);
    setBColor("");
    setBKg("");
    setBPrice("");
    setModal(null);
    setTab("stock");
  }

  async function submitOrder() {
    setBusy(true);
    setErr(null);
    if (!oName || !oFilament || !oKg || !oPrice) return fail("Nhập đủ thông tin");
    const res = await createPrintOrder({
      name: oName,
      filamentId: oFilament,
      kg: Number(oKg),
      price: Math.round(Number(oPrice)),
      monthKey,
      channel: oChannel,
    });
    if (!res.ok) return fail(res.error ?? "Lỗi");
    setBusy(false);
    setOName("");
    setOKg("");
    setOPrice("");
    setModal(null);
    setTab("orders");
  }

  function fail(m: string) {
    setErr(m);
    setBusy(false);
    return undefined;
  }

  const tabBtn = (active: boolean) =>
    `border-0 rounded-full px-5 py-[10px] text-[13px] font-bold cursor-pointer ${
      active ? "bg-primary text-white" : "bg-white text-ink-soft"
    }`;

  return (
    <>
      <ConfirmHost host={runner} />
      <HeaderPortal>
        <button
          onClick={() => setModal("buy")}
          className="flex items-center gap-2 bg-white text-primary border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#EAF4EE]"
        >
          <i className="ph-duotone ph-package" aria-hidden />
          Buy filament
        </button>
        <button
          onClick={() => setModal("order")}
          className="flex items-center gap-2 bg-primary-dark text-white border-0 rounded-full px-5 py-[11px] text-[13px] font-bold cursor-pointer hover:bg-[#0A211C]"
        >
          <i className="ph-duotone ph-plus-circle" aria-hidden />
          New order
        </button>
      </HeaderPortal>

      {/* Tabs */}
      <div className="flex gap-[6px]">
        <button onClick={() => setTab("orders")} className={tabBtn(tab === "orders")}>
          Orders
        </button>
        <button onClick={() => setTab("stock")} className={tabBtn(tab === "stock")}>
          Filament stock
        </button>
      </div>

      {tab === "stock" ? (
        <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
          <div
            className="grid gap-3 items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
            style={{ gridTemplateColumns: "1.6fr 100px 120px 130px 130px 130px" }}
          >
            <div>Filament</div>
            <div>Material</div>
            <div className="text-right">Used</div>
            <div className="text-right">Remaining</div>
            <div className="text-right">Price / kg</div>
            <div className="text-right">Stock value</div>
          </div>
          {filaments.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
              Chưa có filament. Bấm “Buy filament”.
            </div>
          )}
          {filaments.map((f) => (
            <div
              key={f.id}
              className="grid gap-3 items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
              style={{ gridTemplateColumns: "1.6fr 100px 120px 130px 130px 130px" }}
            >
              <div className="font-semibold">
                {f.material}
                {f.color ? ` ${f.color}` : ""}
              </div>
              <div className="text-muted font-semibold text-[12px]">{f.material}</div>
              <div className="text-right tnum text-muted">{f.used_kg} kg</div>
              <div className="text-right">
                <Badge
                  bg={f.low_stock ? "#F7E3DC" : "#DFF2E7"}
                  fg={f.low_stock ? "#B4573B" : "#1F7A5C"}
                >
                  {f.remaining_kg} kg
                </Badge>
              </div>
              <div className="text-right tnum" title={full(f.cost_per_kg)}>
                {new Intl.NumberFormat("en-US").format(f.cost_per_kg)} ₫
              </div>
              <div className="text-right font-bold tnum" title={full(f.stock_value)}>
                {fmt(f.stock_value)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
          <div
            className="grid gap-[10px] items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
            style={{ gridTemplateColumns: ORDER_GRID }}
          >
            <div>Month</div>
            <div>Product</div>
            <div>Channel</div>
            <div>Filament</div>
            <div className="text-right">Sale</div>
            <div className="text-right">Cost</div>
            <div className="text-right">Profit</div>
            <div>Status</div>
            <div className="text-right">Action</div>
          </div>
          {orders.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
              Chưa có đơn in nào.
            </div>
          )}
          {orders.map((o) => {
            const sm = txStatusStyle[o.status];
            const profit = o.price - o.cost_snapshot;
            return (
              <div
                key={o.id}
                className="grid gap-[10px] items-center px-5 py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
                style={{ gridTemplateColumns: ORDER_GRID }}
              >
                <div className="text-muted font-semibold text-[12px]">{o.month_key}</div>
                <div className="font-semibold">{o.name}</div>
                <div>
                  <Badge bg="#F2EFE6" fg="#4C5A54">
                    {o.note || "—"}
                  </Badge>
                </div>
                <div className="text-muted text-[12px]">{o.filament_label ?? "—"}</div>
                <div className="text-right font-bold tnum" title={full(o.price)}>
                  {fmt(o.price)}
                </div>
                <div className="text-right tnum text-muted" title={full(o.cost_snapshot)}>
                  {fmt(o.cost_snapshot)}
                </div>
                <div
                  className="text-right font-bold tnum"
                  style={{ color: o.status === "cancelled" ? "#9AA49E" : "#1F7A5C" }}
                  title={full(profit)}
                >
                  {o.status === "cancelled" ? "—" : "+" + fmt(profit)}
                </div>
                <div>
                  <Badge bg={sm.bg} fg={sm.fg}>
                    {sm.label}
                  </Badge>
                </div>
                <div className="flex justify-end items-center gap-[6px]">
                  {o.status === "pending" && o.income_tx_id && (
                    <button
                      onClick={() => setReceiveTx({ id: o.income_tx_id!, amount: o.price, label: o.name })}
                      className="bg-primary text-white border-0 rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
                    >
                      Mark received
                    </button>
                  )}
                  {o.status === "received" && (
                    <button
                      onClick={() =>
                        confirmRun(
                          `Lùi "${o.name}" từ received → pending? Tiền về chờ thu.`,
                          () => rollbackStatus("print_orders", o.id),
                          { danger: true, title: "Lùi trạng thái", confirmLabel: "Lùi về chờ thu" }
                        )
                      }
                      aria-label="Lùi trạng thái"
                      title="Lùi về chờ thu"
                      className="bg-chip text-ink-soft border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[13px] cursor-pointer hover:bg-[#EDE8DC] hover:text-primary"
                    >
                      <i className="ph-duotone ph-arrow-counter-clockwise" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Buy filament modal */}
      <Modal open={modal === "buy"} onClose={closeModal} title="Buy filament" icon="ph-duotone ph-package">
        <div className="flex flex-col gap-[14px]">
          <FieldRow>
            <Field label="Material">
              <Select value={bMaterial} onChange={(e) => setBMaterial(e.target.value)}>
                {MATERIALS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Màu (tuỳ chọn)">
              <TextInput value={bColor} onChange={(e) => setBColor(e.target.value)} placeholder="White" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Số lượng (kg)">
              <TextInput type="number" value={bKg} onChange={(e) => setBKg(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Giá / kg (₫)">
              <TextInput type="number" value={bPrice} onChange={(e) => setBPrice(e.target.value)} placeholder="0" />
            </Field>
          </FieldRow>
          <Field label="Trừ vào tài khoản">
            <Select value={bAccount} onChange={(e) => setBAccount(e.target.value)}>
              <option value="">— chọn —</option>
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
          <Button variant="ghost" className="flex-1" onClick={closeModal}>
            Huỷ
          </Button>
          <Button variant="primary" className="flex-1" onClick={submitBuy} disabled={busy}>
            {busy ? "Đang lưu…" : "Add to stock"}
          </Button>
        </ModalActions>
      </Modal>

      {/* New order modal */}
      <Modal open={modal === "order"} onClose={closeModal} title="New order" icon="ph-duotone ph-cube" width={480}>
        <div className="flex flex-col gap-[14px]">
          <Field label="Product">
            <TextInput value={oName} onChange={(e) => setOName(e.target.value)} placeholder="Phone stand" />
          </Field>
          <FieldRow>
            <Field label="Channel">
              <Select value={oChannel} onChange={(e) => setOChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Filament">
              <Select value={oFilament} onChange={(e) => setOFilament(e.target.value)}>
                <option value="">— chọn —</option>
                {filaments.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.material}
                    {f.color ? ` ${f.color}` : ""} ({f.remaining_kg} kg)
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Filament (kg)">
              <TextInput type="number" value={oKg} onChange={(e) => setOKg(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Giá bán (₫)">
              <TextInput type="number" value={oPrice} onChange={(e) => setOPrice(e.target.value)} placeholder="0" />
            </Field>
          </FieldRow>
          <div className="text-[11px] text-muted">
            Ước tính chi phí filament <b className="text-ink">{full(oCost)}</b> · lợi nhuận{" "}
            <b style={{ color: oProfit >= 0 ? "#1F7A5C" : "#B4573B" }}>
              {oProfit >= 0 ? "+" : ""}
              {full(oProfit)}
            </b>
          </div>
          {selFil && Number(oKg) > selFil.remaining_kg && (
            <div className="text-[12px] text-[#B4573B] font-semibold">
              Vượt tồn kho (còn {selFil.remaining_kg} kg)
            </div>
          )}
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={closeModal}>
            Huỷ
          </Button>
          <Button variant="primary" className="flex-1" onClick={submitOrder} disabled={busy}>
            {busy ? "Đang lưu…" : "Add order"}
          </Button>
        </ModalActions>
      </Modal>

      <ReceiveModal tx={receiveTx} accounts={accounts} onClose={() => setReceiveTx(null)} />
    </>
  );
}
