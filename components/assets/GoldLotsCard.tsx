"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, full, chi } from "@/lib/format";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select } from "@/components/ui/Field";
import { sellGoldLot } from "@/lib/actions/assets";
import type { GoldLot } from "@/lib/queries/assets";
import type { Ref } from "@/lib/queries";

const GRID = "1fr 90px 130px 130px 140px 96px";

/** Danh sách từng lô vàng (held) + bán từng lô. */
export function GoldLotsCard({
  lots,
  accounts,
  monthKey,
}: {
  lots: GoldLot[];
  accounts: Ref[];
  monthKey: string;
}) {
  const router = useRouter();
  const [sell, setSell] = useState<GoldLot | null>(null);
  const [price, setPrice] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openSell(l: GoldLot) {
    setSell(l);
    setPrice(String(l.unit_price_now || ""));
    setAccount("");
    setErr(null);
  }
  function close() {
    setSell(null);
    setErr(null);
  }

  const soldPrice = Math.round(Number(price) || 0);
  const proceeds = sell ? soldPrice * sell.quantity : 0;
  const realized = sell ? (soldPrice - sell.unit_cost) * sell.quantity : 0;

  async function submit() {
    if (!sell || !account) return;
    setBusy(true);
    setErr(null);
    const res = await sellGoldLot(sell.id, soldPrice, account, monthKey);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "Lỗi bán vàng");
      return;
    }
    close();
    router.refresh();
  }

  return (
    <div className="bg-card border border-card-border rounded-[18px] overflow-hidden">
      <div className="px-[18px] pt-4 pb-2 text-[15px] font-bold">Gold lots · {lots.length}</div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 660 }}>
          <div
            className="grid gap-3 items-center px-[18px] py-2 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
            style={{ gridTemplateColumns: GRID }}
          >
            <div>Mua</div>
            <div className="text-right">Số chỉ</div>
            <div className="text-right">Giá vốn</div>
            <div className="text-right">Giá trị</div>
            <div className="text-right">Lãi/lỗ</div>
            <div className="text-right">Bán</div>
          </div>

          {lots.length === 0 && (
            <div className="px-[18px] py-8 text-center text-[13px] text-muted border-t border-divider">
              Chưa có lô vàng nào — bấm “Buy gold”.
            </div>
          )}

          {lots.map((l) => {
            const up = l.unrealized >= 0;
            return (
              <div
                key={l.id}
                className="grid gap-3 items-center px-[18px] py-[13px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
                style={{ gridTemplateColumns: GRID }}
              >
                <div className="flex items-center gap-[9px]">
                  <div className="w-[30px] h-[30px] rounded-[9px] bg-[#FBF0DC] text-[#A5731F] flex items-center justify-center text-[15px]">
                    <i className="ph-duotone ph-coins" aria-hidden />
                  </div>
                  <div className="text-[12px] text-muted">{l.purchased_on ?? "pre-app"}</div>
                </div>
                <div className="text-right tnum">{chi(l.quantity)}</div>
                <div className="text-right tnum" title={full(l.unit_cost)}>
                  {fmt(l.unit_cost)}
                </div>
                <div className="text-right font-bold tnum" title={full(l.market_value)}>
                  {fmt(l.market_value)}
                </div>
                <div className="text-right font-bold tnum" style={{ color: up ? "#1F7A5C" : "#B4573B" }} title={full(l.unrealized)}>
                  {up ? "+" : "−"}
                  {fmt(Math.abs(l.unrealized))}
                </div>
                <div className="text-right">
                  <button
                    onClick={() => openSell(l)}
                    className="bg-[#F7E3DC] text-[#B4573B] border-0 rounded-full px-[13px] py-[6px] text-[11px] font-bold cursor-pointer hover:bg-[#F0D2C6]"
                  >
                    Bán
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal bán lô */}
      <Modal open={sell !== null} onClose={close} title="Bán vàng" icon="ph-duotone ph-coins" iconBg="#F7E3DC" iconFg="#B4573B" width={440}>
        {sell && (
          <>
            <div className="text-[13px] text-ink-soft mb-4">
              Lô {chi(sell.quantity)} · giá vốn <b>{fmt(sell.unit_cost)}/chỉ</b> · giá hiện tại {fmt(sell.unit_price_now)}/chỉ
            </div>
            <div className="flex flex-col gap-[14px]">
              <FieldRow>
                <Field label="Giá bán / chỉ (₫)">
                  <TextInput type="number" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
                </Field>
                <Field label="Nhận vào tài khoản">
                  <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                    <option value="">— chọn —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldRow>
              <div
                className="rounded-[10px] px-[13px] py-[10px] text-[12px]"
                style={{ background: "#F7F4EC", color: "#4C5A54" }}
              >
                Thu về <b className="text-ink">{full(proceeds)}</b> · Lãi/lỗ{" "}
                <b style={{ color: realized >= 0 ? "#1F7A5C" : "#B4573B" }}>
                  {realized >= 0 ? "+" : "−"}
                  {full(Math.abs(realized))}
                </b>
              </div>
              {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
            </div>
            <ModalActions>
              <Button variant="ghost" className="flex-1" onClick={close}>
                Huỷ
              </Button>
              <Button variant="primary" className="flex-1" onClick={submit} disabled={busy || !account || soldPrice <= 0}>
                {busy ? "…" : "Bán & ghi Ledger"}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </div>
  );
}
