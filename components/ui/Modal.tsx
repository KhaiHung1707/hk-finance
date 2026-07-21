"use client";
import type { ReactNode } from "react";

/**
 * Modal dùng chung — khớp prototype: overlay xanh mờ, hộp trắng 460px bo 20px,
 * header (icon vuông màu + tiêu đề) + nút X, nội dung tuỳ biến.
 */
export function Modal({
  open,
  onClose,
  title,
  icon,
  iconBg = "#EAF4EE",
  iconFg = "#17554A",
  children,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  iconBg?: string;
  iconFg?: string;
  children: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-5"
      style={{ background: "rgba(14,44,38,0.45)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[20px] p-6 max-w-[94vw]"
        style={{ width, boxShadow: "0 24px 60px rgba(14,44,38,0.28)" }}
      >
        <div className="flex items-center justify-between mb-[18px]">
          <div className="flex items-center gap-[10px]">
            <div
              className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[19px]"
              style={{ background: iconBg, color: iconFg }}
            >
              <i className={icon} aria-hidden />
            </div>
            <div className="text-[17px] font-extrabold">{title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="w-[34px] h-[34px] rounded-full border-0 bg-chip text-ink-soft text-[15px] cursor-pointer flex items-center justify-center hover:bg-[#E6E0D2] hover:text-ink"
          >
            <i className="ph-duotone ph-x" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Hàng nút Cancel / Submit ở đáy modal. */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex gap-[10px] mt-[22px]">{children}</div>;
}
