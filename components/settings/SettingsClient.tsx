"use client";
import { useState } from "react";
import { fmt, full, pct } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { useActionRunner, ConfirmHost } from "@/components/ui/useActionRunner";
import { setFxRate, setUpworkFee, setGoldPrice, setAllocationTargets, setHouseGoal } from "@/lib/actions/settings";
import type { SettingsBundle } from "@/lib/queries/settings";

/** Ô số có thể sửa tại chỗ: hiển thị giá trị, bấm sửa → input + Lưu. */
function EditableValue({
  value,
  suffix,
  onSave,
  format,
}: {
  value: number;
  suffix?: string;
  onSave: (v: number) => Promise<{ ok: boolean; error?: string }>;
  format?: (v: number) => string;
}) {
  const runner = useActionRunner();
  const { notify } = runner;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await onSave(Number(draft) || 0);
    setBusy(false);
    if (!res.ok) return notify(res.error ?? "Lỗi lưu");
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="bg-fill-soft rounded-[10px] px-[14px] py-2 text-[14px] font-extrabold tnum cursor-pointer hover:bg-[#EDE8DC]"
        title={format ? full(value) : undefined}
      >
        {format ? format(value) : new Intl.NumberFormat("en-US").format(value)}
        {suffix ? ` ${suffix}` : ""}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-[6px]">
      <ConfirmHost host={runner} />
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        className="border border-card-border rounded-[10px] px-3 py-[7px] text-[13px] w-[120px] outline-none focus:border-primary bg-white tnum"
      />
      <button
        onClick={save}
        disabled={busy}
        className="bg-primary text-white border-0 rounded-[10px] px-[12px] py-[7px] text-[12px] font-bold cursor-pointer hover:bg-primary-hover"
      >
        {busy ? "…" : "Lưu"}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="bg-chip text-ink-soft border-0 rounded-[10px] px-[10px] py-[7px] text-[12px] font-bold cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
}

const ALLOC_META: Record<string, { label: string; color: string }> = {
  stock: { label: "Stocks", color: "#C9A227" },
  cash: { label: "Cash", color: "#17554A" },
  gold: { label: "Gold", color: "#8FBCA7" },
};

export function SettingsClient({ data }: { data: SettingsBundle }) {
  const runner = useActionRunner();
  const { notify } = runner;
  const usd = data.fx.find((f) => f.ccy === "USD");
  const cad = data.fx.find((f) => f.ccy === "CAD");

  // allocation targets editing
  const [targets, setTargets] = useState(data.allocationTargets);
  const [savingTargets, setSavingTargets] = useState(false);
  const totalPct = Math.round((targets.cash + targets.gold + targets.stock) * 100);

  async function saveTargets() {
    setSavingTargets(true);
    const res = await setAllocationTargets(targets);
    setSavingTargets(false);
    if (!res.ok) notify(res.error ?? "Lỗi lưu mục tiêu");
  }

  const rowIcon = "w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[16px]";

  return (
    <div
      className="grid gap-[14px] items-start"
      style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}
    >
      <ConfirmHost host={runner} />
      {/* Rates & fees */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="text-[15px] font-bold mb-[6px]">Rates & fees</div>
        <div className="text-[12px] text-muted mb-4">
          Mỗi nguồn ghi theo tiền tệ riêng, rồi quy về VND.
        </div>
        <div className="flex flex-col gap-[14px]">
          <div className="flex items-center gap-3">
            <div className={rowIcon} style={{ background: "#EAF4EE", color: "#17554A" }}>
              <i className="ph-duotone ph-currency-dollar" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold flex items-center gap-2">
                USD → VND
                {usd?.is_assumption && <Badge bg="#FBF0DC" fg="#A5731F">ước lượng</Badge>}
              </div>
              <div className="text-[11px] text-muted">Upwork payouts</div>
            </div>
            <EditableValue value={usd?.rate ?? 0} suffix="₫" onSave={(v) => setFxRate("USD", v)} />
          </div>

          <div className="flex items-center gap-3">
            <div className={rowIcon} style={{ background: "#EAF4EE", color: "#17554A" }}>
              <i className="ph-duotone ph-currency-circle-dollar" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold flex items-center gap-2">
                CAD → VND
                {cad?.is_assumption && <Badge bg="#FBF0DC" fg="#A5731F">ước lượng</Badge>}
              </div>
              <div className="text-[11px] text-muted">Structure contracts</div>
            </div>
            <EditableValue value={cad?.rate ?? 0} suffix="₫" onSave={(v) => setFxRate("CAD", v)} />
          </div>

          <div className="flex items-center gap-3">
            <div className={rowIcon} style={{ background: "#F7E3DC", color: "#B4573B" }}>
              <i className="ph-duotone ph-percent" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Upwork fee</div>
              <div className="text-[11px] text-muted">Trừ khỏi gross billed</div>
            </div>
            <EditableValue
              value={Math.round(data.upworkFeePct * 100)}
              suffix="%"
              onSave={(v) => setUpworkFee(v / 100)}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className={rowIcon} style={{ background: "#FBF0DC", color: "#A5731F" }}>
              <i className="ph-duotone ph-coins" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Giá vàng / chỉ</div>
              <div className="text-[11px] text-muted">
                {data.goldPrice.as_of ? `Cập nhật ${data.goldPrice.as_of}` : "Chưa có"}
              </div>
            </div>
            <EditableValue
              value={data.goldPrice.price}
              onSave={(v) => setGoldPrice(v)}
              format={(v) => fmt(v)}
            />
          </div>
        </div>
      </div>

      {/* Target allocation */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="text-[15px] font-bold mb-[6px]">Target allocation</div>
        <div className="text-[12px] text-muted mb-4">Điều khiển gợi ý rebalance ở Assets.</div>
        <div className="flex flex-col gap-[14px]">
          {(["stock", "cash", "gold"] as const).map((grp) => (
            <div key={grp}>
              <div className="flex justify-between text-[13px] font-semibold mb-[6px]">
                <span className="flex items-center gap-2">
                  <div className="w-[10px] h-[10px] rounded-[3px]" style={{ background: ALLOC_META[grp].color }} />
                  {ALLOC_META[grp].label}
                </span>
                <span className="tnum">{Math.round(targets[grp] * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(targets[grp] * 100)}
                onChange={(e) => setTargets({ ...targets, [grp]: Number(e.target.value) / 100 })}
                className="w-full accent-[#17554A]"
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-divider pt-3">
            <span className="text-[12px] font-semibold" style={{ color: totalPct === 100 ? "#1F7A5C" : "#B4573B" }}>
              Tổng {totalPct}% {totalPct !== 100 && "(nên = 100%)"}
            </span>
            <button
              onClick={saveTargets}
              disabled={savingTargets}
              className="bg-primary text-white border-0 rounded-full px-[16px] py-[8px] text-[12px] font-bold cursor-pointer hover:bg-primary-hover disabled:opacity-60"
            >
              {savingTargets ? "…" : "Lưu mục tiêu"}
            </button>
          </div>
        </div>
      </div>

      {/* House goal — sửa được */}
      <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
        <div className="text-[15px] font-bold mb-4">House goal</div>
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="flex justify-between items-center">
            <span className="text-ink-soft">Down payment</span>
            <EditableValue
              value={data.houseGoal.down_payment}
              format={fmt}
              onSave={(v) => setHouseGoal({ down_payment: v, target_year: data.houseGoal.target_year })}
            />
          </div>
          <div className="flex justify-between items-center border-t border-divider pt-3">
            <span className="text-ink-soft">Target year</span>
            <EditableValue
              value={data.houseGoal.target_year}
              onSave={(v) => setHouseGoal({ down_payment: data.houseGoal.down_payment, target_year: v })}
            />
          </div>
          <div className="flex justify-between border-t border-divider pt-3">
            <span className="text-ink-soft">Deposit default rate</span>
            <span className="font-bold tnum">{pct(data.depositDefaultRate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
