import type { ReactNode } from "react";

/**
 * Metric card kiểu In3D/Upwork/Projects: icon vuông trên cùng, số lớn, nhãn dưới.
 * (Khác StatCard của Dashboard vốn có delta chip cùng hàng icon.)
 */
export function MetricCard({
  icon,
  iconBg = "#EAF4EE",
  iconFg = "#17554A",
  value,
  label,
  sub,
}: {
  icon: string;
  iconBg?: string;
  iconFg?: string;
  value: ReactNode;
  label: string;
  sub?: ReactNode;
}) {
  return (
    <div className="bg-card border border-card-border rounded-[18px] p-5">
      <div
        className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center text-[19px]"
        style={{ background: iconBg, color: iconFg }}
      >
        <i className={icon} aria-hidden />
      </div>
      <div className="text-[24px] font-extrabold tracking-[-0.6px] mt-[14px] tnum">{value}</div>
      <div className="text-[12px] text-muted mt-[3px] font-medium">{label}</div>
      {sub != null && <div className="text-[11px] text-faint mt-[5px] tnum">{sub}</div>}
    </div>
  );
}
