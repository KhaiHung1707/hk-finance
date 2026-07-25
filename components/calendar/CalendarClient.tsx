"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { fmt, full } from "@/lib/format";
import type { CalendarEvent, FinancialAlert } from "@/lib/queries/calendar";

const SEV_META = {
  danger: { bg: "#F7E3DC", fg: "#B4573B", ring: "#E8B7A6" },
  warn: { bg: "#FBF0DC", fg: "#A5731F", ring: "#EBD9AE" },
  info: { bg: "#EAF4EE", fg: "#17554A", ring: "#CBE3D6" },
} as const;

const VN_MONTHS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
const VN_DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function parseIso(d: string): Date {
  return new Date(d + "T00:00:00");
}
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86400000);
}

export function CalendarClient({
  events,
  alerts,
  todayIso,
}: {
  events: CalendarEvent[];
  alerts: FinancialAlert[];
  todayIso: string;
}) {
  const today = parseIso(todayIso);
  // tháng đang xem (lưới) — mặc định tháng của hôm nay
  const [viewY, setViewY] = useState(today.getFullYear());
  const [viewM, setViewM] = useState(today.getMonth()); // 0-based

  const dated = events.filter((e) => e.date);
  const undated = events.filter((e) => !e.date);

  // gom sự kiện có ngày theo ISO date
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of dated) {
      const arr = m.get(e.date!) ?? [];
      arr.push(e);
      m.set(e.date!, arr);
    }
    return m;
  }, [dated]);

  // ---- Agenda buckets: Tuần này (≤7d) / Tháng này (≤31d) / Sau ----
  const buckets = useMemo(() => {
    const week: CalendarEvent[] = [];
    const month: CalendarEvent[] = [];
    const later: CalendarEvent[] = [];
    const overdue: CalendarEvent[] = [];
    for (const e of dated) {
      const dd = daysBetween(todayIso, e.date!);
      if (dd < 0) overdue.push(e);
      else if (dd <= 7) week.push(e);
      else if (dd <= 31) month.push(e);
      else later.push(e);
    }
    const byDateAsc = (a: CalendarEvent, b: CalendarEvent) => a.date!.localeCompare(b.date!);
    return {
      overdue: overdue.sort(byDateAsc),
      week: week.sort(byDateAsc),
      month: month.sort(byDateAsc),
      later: later.sort(byDateAsc),
    };
  }, [dated, todayIso]);

  // ---- Lưới lịch tháng ----
  const grid = useMemo(() => {
    const first = new Date(viewY, viewM, 1);
    const startDow = (first.getDay() + 6) % 7; // 0 = Thứ 2
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const cells: { iso: string | null; day: number | null }[] = [];
    for (let i = 0; i < startDow; i++) cells.push({ iso: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ iso, day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });
    return cells;
  }, [viewY, viewM]);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  const totalInflow = dated.reduce((s, e) => s + (e.amount ?? 0), 0) + undated.reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* ---- Alerts ---- */}
      {alerts.length > 0 && (
        <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
              <i className="ph-duotone ph-bell-ringing" aria-hidden />
            </div>
            <div className="text-[15px] font-bold">Cần chú ý</div>
            <span className="text-[11px] font-bold text-muted bg-fill-soft rounded-full px-[9px] py-[2px]">{alerts.length}</span>
          </div>
          <div className="grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
            {alerts.map((a) => {
              const m = SEV_META[a.severity];
              return (
                <div key={a.id} className="flex items-start gap-[11px] rounded-[14px] p-[13px]" style={{ background: m.bg, border: `1px solid ${m.ring}` }}>
                  <i className={`${a.icon} text-[18px] flex-shrink-0 mt-[1px]`} style={{ color: m.fg }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-extrabold leading-tight" style={{ color: m.fg }}>{a.title}</div>
                    <div className="text-[12px] mt-[3px] leading-[1.4]" style={{ color: m.fg, opacity: 0.85 }}>{a.detail}</div>
                    {a.action && (
                      <Link href={a.action.href} className="inline-flex items-center gap-1 mt-2 text-[12px] font-bold" style={{ color: m.fg }}>
                        {a.action.label}<i className="ph-duotone ph-arrow-right text-[12px]" aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
        {/* ---- Lưới lịch tháng ---- */}
        <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-bold">{VN_MONTHS[viewM]}/{String(viewY).slice(2)}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => shiftMonth(-1)} aria-label="Tháng trước" className="w-[28px] h-[28px] rounded-full bg-fill-soft text-ink-soft flex items-center justify-center hover:bg-chip cursor-pointer">
                <i className="ph-duotone ph-caret-left" aria-hidden />
              </button>
              <button onClick={() => { setViewY(today.getFullYear()); setViewM(today.getMonth()); }} className="text-[11px] font-bold text-primary px-2 cursor-pointer">
                Nay
              </button>
              <button onClick={() => shiftMonth(1)} aria-label="Tháng sau" className="w-[28px] h-[28px] rounded-full bg-fill-soft text-ink-soft flex items-center justify-center hover:bg-chip cursor-pointer">
                <i className="ph-duotone ph-caret-right" aria-hidden />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {VN_DOW.map((d) => (
              <div key={d} className="text-[10px] font-bold text-faint text-center py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((c, i) => {
              const evs = c.iso ? byDate.get(c.iso) ?? [] : [];
              const isToday = c.iso === todayIso;
              return (
                <div
                  key={i}
                  className="aspect-square rounded-[8px] flex flex-col items-center justify-center relative text-[12px]"
                  style={{
                    background: c.iso ? (isToday ? "#EAF4EE" : evs.length ? "#FAF8F2" : "transparent") : "transparent",
                    border: isToday ? "1.5px solid #17554A" : evs.length ? "1px solid #EFEAE0" : "1px solid transparent",
                  }}
                  title={evs.length ? evs.map((e) => `${e.title}${e.amount ? " · " + fmt(e.amount) : ""}`).join("\n") : undefined}
                >
                  {c.day && <span className={`font-semibold ${isToday ? "text-primary font-extrabold" : "text-ink-soft"}`}>{c.day}</span>}
                  {evs.length > 0 && (
                    <div className="flex gap-[2px] mt-[2px] flex-wrap justify-center">
                      {evs.slice(0, 3).map((e, j) => (
                        <span key={j} className="w-[5px] h-[5px] rounded-full" style={{ background: e.color }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {totalInflow > 0 && (
            <div className="mt-3 pt-3 border-t border-divider text-[12px] text-muted flex items-center justify-between">
              <span>Tổng tiền vào dự kiến</span>
              <span className="font-extrabold text-[#1F7A5C] tnum" title={full(totalInflow)}>+{fmt(totalInflow)}</span>
            </div>
          )}
        </div>

        {/* ---- Agenda ---- */}
        <div className="bg-card border border-card-border rounded-[18px] p-[18px]">
          <div className="text-[15px] font-bold mb-3">Sự kiện sắp tới</div>
          {dated.length === 0 && undated.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-[13px] text-faint">Chưa có sự kiện tài chính nào.</div>
          ) : (
            <div className="flex flex-col gap-4">
              <AgendaGroup title="Quá hạn" tone="danger" events={buckets.overdue} todayIso={todayIso} />
              <AgendaGroup title="Tuần này" tone="warn" events={buckets.week} todayIso={todayIso} />
              <AgendaGroup title="Trong tháng" tone="info" events={buckets.month} todayIso={todayIso} />
              <AgendaGroup title="Sau đó" tone="info" events={buckets.later} todayIso={todayIso} />
              {undated.length > 0 && (
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.4px] text-faint mb-2">Chưa có ngày (pipeline)</div>
                  <div className="flex flex-col gap-[8px]">
                    {undated.map((e) => (
                      <EventRow key={e.id} e={e} dayLabel={null} />
                    ))}
                  </div>
                  <div className="text-[11px] text-muted mt-2">
                    Thêm <b>ngày dự kiến</b> ở Projects/Upwork để các khoản này lên lịch.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgendaGroup({ title, tone, events, todayIso }: { title: string; tone: "danger" | "warn" | "info"; events: CalendarEvent[]; todayIso: string }) {
  if (events.length === 0) return null;
  const m = SEV_META[tone];
  return (
    <div>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.4px] mb-2" style={{ color: m.fg }}>{title}</div>
      <div className="flex flex-col gap-[8px]">
        {events.map((e) => {
          const dd = daysBetween(todayIso, e.date!);
          const label = dd < 0 ? `trễ ${Math.abs(dd)}n` : dd === 0 ? "hôm nay" : dd === 1 ? "mai" : `${dd}n nữa`;
          return <EventRow key={e.id} e={e} dayLabel={label} />;
        })}
      </div>
    </div>
  );
}

function EventRow({ e, dayLabel }: { e: CalendarEvent; dayLabel: string | null }) {
  return (
    <Link href={e.href} className="flex items-center gap-[11px] rounded-[12px] border border-[#EFEAE0] p-[11px] hover:bg-[#FAF8F2] hover:border-[#C9C0AC] transition-colors">
      <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[16px] flex-shrink-0" style={{ background: e.color + "1F", color: e.color }}>
        <i className={e.icon} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-ink truncate">{e.title}</div>
        {e.subtitle && <div className="text-[11px] text-muted truncate">{e.subtitle}</div>}
      </div>
      <div className="text-right flex-shrink-0">
        {e.amount != null && (
          <div className="text-[13px] font-extrabold text-[#1F7A5C] tnum" title={full(e.amount)}>+{fmt(e.amount)}</div>
        )}
        <div className="text-[11px] text-muted">
          {e.date ? e.date.slice(5).replace("-", "/") : "—"}
          {dayLabel ? ` · ${dayLabel}` : ""}
        </div>
      </div>
    </Link>
  );
}
