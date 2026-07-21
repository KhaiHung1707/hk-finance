import type { ReactNode } from "react";

/**
 * Stat card KPI (Dashboard) — icon vuông màu + delta chip, giá trị lớn + nhãn.
 * value là node (thường <MoneyText/>) để giữ quy tắc tooltip-VND.
 */
export function StatCard({
  icon,
  iconBg = "#EAF4EE",
  iconFg = "#17554A",
  delta,
  value,
  label,
}: {
  icon: string;
  iconBg?: string;
  iconFg?: string;
  delta?: { text: string; bg: string; fg: string };
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-[18px] p-5 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div
          className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[20px]"
          style={{ background: iconBg, color: iconFg }}
        >
          <i className={icon} aria-hidden />
        </div>
        {delta && (
          <span
            className="text-[11px] font-bold rounded-full px-[9px] py-[4px]"
            style={{ background: delta.bg, color: delta.fg }}
          >
            {delta.text}
          </span>
        )}
      </div>
      <div>
        <div className="text-[24px] font-extrabold tracking-[-0.6px] tnum">{value}</div>
        <div className="text-[12px] text-muted mt-[3px] font-medium">{label}</div>
      </div>
    </div>
  );
}
