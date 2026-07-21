import type { ReactNode } from "react";

/** Pill badge dùng chung — nhận màu nền/chữ trực tiếp (từ tokens txTypeStyle/txStatusStyle). */
export function Badge({
  children,
  bg,
  fg,
  className = "",
}: {
  children: ReactNode;
  bg: string;
  fg: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] text-[11px] font-bold rounded-full px-[10px] py-[4px] whitespace-nowrap ${className}`}
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}
