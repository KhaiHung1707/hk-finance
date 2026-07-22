import { AppShell } from "@/components/ui/AppShell";
import { MoneyText } from "@/components/ui/MoneyText";
import { Badge } from "@/components/ui/Badge";
import { BuyGoldButton } from "@/components/assets/BuyGoldButton";
import { GoldLotsCard } from "@/components/assets/GoldLotsCard";
import { fmt, full, pct, chi } from "@/lib/format";
import { getAllocation, getNetWorth, getAccountsRef, getBaselineMonthKey, getProfile } from "@/lib/queries";
import { getGoldSummary, getGoldLots, getGoldPrice } from "@/lib/queries/assets";

export const dynamic = "force-dynamic";

const GRP_META: Record<string, { label: string; color: string }> = {
  cash: { label: "Cash", color: "#17554A" },
  gold: { label: "Gold", color: "#8FBCA7" },
  stock: { label: "Stocks", color: "#C9A227" },
};

export default async function AssetsPage() {
  const monthKey = await getBaselineMonthKey();
  const [allocation, netWorth, gold, goldLots, goldPrice, accounts, profile] = await Promise.all([
    getAllocation(),
    getNetWorth(),
    getGoldSummary(),
    getGoldLots(),
    getGoldPrice(),
    getAccountsRef(),
    getProfile(),
  ]);

  const total = netWorth.total;
  // rebalance: chênh lệch giữa target value và value hiện tại, mỗi nhóm.
  const rebalance = allocation
    .map((a) => {
      const targetValue = total * a.target;
      const delta = targetValue - a.value;
      const share = total > 0 ? a.value / total : 0;
      return { grp: a.grp, delta, from: share, to: a.target };
    })
    .filter((r) => Math.abs(r.delta) > total * 0.005) // bỏ nhóm gần đúng
    .sort((a, b) => b.delta - a.delta);

  return (
    <AppShell
      activePath="/assets"
      eyebrow="Allocation vs target · gold lots · rebalance"
      title="Assets"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={72}
      pullUp={44}
    >
      <BuyGoldButton accounts={accounts} monthKey={monthKey} suggestedPrice={goldPrice.price} />

      {/* Top: value per class */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        {allocation.map((a) => {
          const share = total > 0 ? a.value / total : 0;
          const off = share - a.target;
          const color = Math.abs(off) > 0.05 ? (off > 0 ? "#B4573B" : "#A5731F") : "#1F7A5C";
          return (
            <div key={a.grp} className="bg-card border border-card-border rounded-[18px] p-5">
              <div className="flex items-center gap-2 text-[12px] text-muted font-semibold">
                <div className="w-[10px] h-[10px] rounded-[3px]" style={{ background: GRP_META[a.grp].color }} />
                {GRP_META[a.grp].label}
              </div>
              <div className="text-[24px] font-extrabold tracking-[-0.6px] mt-2 tnum" title={full(a.value)}>
                {fmt(a.value)}
              </div>
              <div className="text-[12px] mt-[6px] font-semibold" style={{ color }}>
                {pct(share, 0)} · target {pct(a.target, 0)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))" }}>
        {/* Allocation vs target */}
        <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
          <div className="text-[15px] font-bold mb-4">Current vs. target allocation</div>
          <div className="flex flex-col gap-[18px]">
            {allocation.map((a) => {
              const share = total > 0 ? a.value / total : 0;
              const gap = share - a.target;
              const over = gap > 0.005;
              const under = gap < -0.005;
              const gapColor = over ? "#B4573B" : under ? "#A5731F" : "#1F7A5C";
              return (
                <div key={a.grp}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-[9px] text-[13px] font-semibold">
                      <div className="w-[11px] h-[11px] rounded-[3px]" style={{ background: GRP_META[a.grp].color }} />
                      {GRP_META[a.grp].label}
                    </div>
                    <div className="text-[13px] font-bold tnum" title={full(a.value)}>
                      {fmt(a.value)} · {pct(share, 0)}
                    </div>
                  </div>
                  <div className="relative h-3 rounded-full bg-[#EFEAE0] overflow-hidden">
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded-full"
                      style={{ width: `${Math.min(share * 100, 100)}%`, background: GRP_META[a.grp].color }}
                    />
                  </div>
                  <div className="flex items-center gap-[6px] mt-[6px] text-[11px] text-muted">
                    <i className="ph-duotone ph-target" style={{ color: "#A5731F" }} aria-hidden />
                    Target {pct(a.target, 0)} ·{" "}
                    <span style={{ color: gapColor, fontWeight: 700 }}>
                      {over
                        ? `+${Math.round(gap * 100)}pt over`
                        : under
                        ? `${Math.round(gap * 100)}pt under`
                        : "on target"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rebalance + gold detail */}
        <div className="flex flex-col gap-[14px]">
          <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
            <div className="text-[15px] font-bold mb-[6px]">Rebalance to target</div>
            <div className="text-[12px] text-muted mb-4">Chuyển dịch để mỗi nhóm về đúng tỷ trọng mục tiêu.</div>
            <div className="flex flex-col gap-[10px]">
              {rebalance.length === 0 && (
                <div className="text-[13px] text-muted">Danh mục đã cân bằng gần mục tiêu.</div>
              )}
              {rebalance.map((r) => {
                const up = r.delta > 0;
                return (
                  <div
                    key={r.grp}
                    className="flex items-center gap-3 border border-[#EFEAE0] rounded-[12px] px-[14px] py-3 hover:border-[#C9C0AC] hover:bg-[#FAF8F2]"
                  >
                    <div
                      className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[17px]"
                      style={{
                        background: up ? "#DFF2E7" : "#F7E3DC",
                        color: up ? "#1F7A5C" : "#B4573B",
                      }}
                    >
                      <i className={up ? "ph-duotone ph-arrow-up-right" : "ph-duotone ph-arrow-down-right"} aria-hidden />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold">
                        {up ? "Tăng" : "Giảm"} {GRP_META[r.grp].label}
                      </div>
                      <div className="text-[11px] text-muted">
                        {pct(r.from, 0)} → {pct(r.to, 0)} target
                      </div>
                    </div>
                    <div className="text-[14px] font-extrabold tnum" title={full(Math.abs(r.delta))}>
                      {up ? "+" : "−"}
                      {fmt(Math.abs(r.delta))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-[18px] p-[22px]">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold">Gold holding</div>
              <Badge bg="#FBF0DC" fg="#A5731F">
                {fmt(gold.unit_price_now)} / chỉ
              </Badge>
            </div>
            <div className="flex gap-6 mt-[14px] flex-wrap">
              <GoldStat label="Quantity" value={chi(gold.qty_chi)} />
              <GoldStat label="Avg. cost" value={fmt(gold.avg_cost)} hint={full(gold.avg_cost)} />
              <GoldStat label="Market value" value={fmt(gold.market_value)} hint={full(gold.market_value)} />
              <GoldStat
                label="Unrealized"
                value={`${gold.unrealized >= 0 ? "+" : "−"}${fmt(Math.abs(gold.unrealized))}`}
                hint={full(gold.unrealized)}
                color={gold.unrealized >= 0 ? "#1F7A5C" : "#B4573B"}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Danh sách từng lô vàng + bán */}
      <GoldLotsCard lots={goldLots} accounts={accounts} monthKey={monthKey} />
    </AppShell>
  );
}

function GoldStat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted font-semibold">{label}</div>
      <div className="text-[20px] font-extrabold mt-1 tnum" style={{ color }} title={hint}>
        {value}
      </div>
    </div>
  );
}
