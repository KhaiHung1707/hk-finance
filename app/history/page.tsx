import { AppShell } from "@/components/ui/AppShell";
import { fmt, full, pct } from "@/lib/format";
import { getClosedMonths, getProfile, type ClosedMonth } from "@/lib/queries";

export const dynamic = "force-dynamic";

const GRID = "96px 130px 120px 120px 120px 140px 120px 110px 96px";

export default async function HistoryPage() {
  const [months, profile] = await Promise.all([getClosedMonths(), getProfile()]);
  // months: mới → cũ. Để tính MoM cần so với tháng liền trước (cũ hơn) = phần tử kế tiếp.
  const rows = months.map((m, i) => {
    const prev = months[i + 1]; // cũ hơn
    const momPct = prev && prev.total > 0 ? ((m.total - prev.total) / prev.total) * 100 : null;
    return { m, momPct };
  });

  return (
    <AppShell
      activePath="/history"
      eyebrow="Các tháng đã chốt sổ · net worth as-of cuối tháng"
      title="Lịch sử chốt tháng"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      {months.length === 0 ? (
        <div className="bg-card border border-card-border rounded-[18px] p-10 text-center">
          <div className="w-[54px] h-[54px] rounded-[16px] bg-chip text-primary flex items-center justify-center text-[26px] mx-auto mb-3">
            <i className="ph-duotone ph-clock-counter-clockwise" aria-hidden />
          </div>
          <div className="text-[15px] font-bold mb-1">Chưa có tháng nào được chốt</div>
          <div className="text-[12px] text-muted">
            Vào Dashboard bấm “Chốt tháng” để tạo mốc net worth &amp; dòng tiền cho tháng.
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-[18px] overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 1080 }}>
              <div
                className="grid gap-2 items-center px-5 py-3 bg-fill-soft text-[11px] font-bold text-muted uppercase tracking-[0.4px]"
                style={{ gridTemplateColumns: GRID }}
              >
                <div>Tháng</div>
                <div className="text-right">Net worth</div>
                <div className="text-right">Cash</div>
                <div className="text-right">Gold</div>
                <div className="text-right">Stock</div>
                <div className="text-right">Deposits</div>
                <div className="text-right">Net tháng</div>
                <div className="text-right">Tiết kiệm</div>
                <div className="text-right">MoM</div>
              </div>

              {rows.map(({ m, momPct }) => (
                <Row key={m.month_key} m={m} momPct={momPct} />
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Row({ m, momPct }: { m: ClosedMonth; momPct: number | null }) {
  const up = (momPct ?? 0) >= 0;
  return (
    <div
      className="grid gap-2 items-center px-5 py-[13px] border-t border-divider text-[13px] tnum hover:bg-[#FAF8F2]"
      style={{ gridTemplateColumns: GRID }}
      title={`Chốt as-of ${m.as_of_date ?? "?"} · lúc ${m.taken_at?.slice(0, 10) ?? "?"}`}
    >
      <div className="font-bold text-ink-soft flex items-center gap-[6px]">
        {m.month_key}
        {m.is_reopened && (
          <i className="ph-duotone ph-lock-key-open text-[#A5731F] text-[12px]" title="Đã mở lại" aria-hidden />
        )}
      </div>
      <div className="text-right font-extrabold" title={full(m.total)}>
        {fmt(m.total)}
      </div>
      <div className="text-right" title={full(m.cash)}>
        {fmt(m.cash)}
      </div>
      <div className="text-right" title={full(m.gold)}>
        {fmt(m.gold)}
      </div>
      <div className="text-right" title={full(m.stock)}>
        {fmt(m.stock)}
      </div>
      <div className="text-right" title={full(m.deposits)}>
        {fmt(m.deposits)}
      </div>
      <div className="text-right font-bold" style={{ color: m.net >= 0 ? "#1F7A5C" : "#B4573B" }} title={full(m.net)}>
        {m.net >= 0 ? "+" : "−"}
        {fmt(Math.abs(m.net))}
      </div>
      <div className="text-right text-muted">{pct(m.savings_rate, 0)}</div>
      <div className="text-right">
        {momPct == null ? (
          <span className="text-faint">—</span>
        ) : (
          <span
            className="inline-flex items-center gap-[3px] text-[11px] font-extrabold rounded-full px-2 py-[3px]"
            style={{ background: up ? "#DFF2E7" : "#F7E3DC", color: up ? "#1F7A5C" : "#B4573B" }}
          >
            {up ? "▲" : "▼"}
            {Math.abs(momPct).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
