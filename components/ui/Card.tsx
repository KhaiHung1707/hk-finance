import type { ReactNode } from "react";

/** Card trắng bo tròn — nền tảng mọi widget. Khớp prototype: bg #FFF, border #E7E1D3, radius 18px. */
export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return (
    <Tag
      className={`bg-card border border-card-border rounded-[18px] p-[22px] ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Header của widget: tiêu đề trái + link/action phải. */
export function CardHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <div className="text-[15px] font-bold">{title}</div>
      {action}
    </div>
  );
}
