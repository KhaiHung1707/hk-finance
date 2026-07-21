"use client";
import { useState } from "react";
import Link from "next/link";
import { navItems } from "@/lib/design/tokens";

/**
 * Thanh điều hướng responsive:
 * - lg+ : hàng ngang, cuộn ngang được nếu chật (không tràn/chồng lên logo).
 * - < lg: nút hamburger → dropdown dọc.
 */
export function NavBar({ activePath }: { activePath: string }) {
  const [open, setOpen] = useState(false);

  const linkCls = (active: boolean, block = false) =>
    active
      ? `flex items-center gap-[7px] bg-white text-primary rounded-full px-[11px] py-[7px] text-[12px] font-bold whitespace-nowrap ${block ? "w-full" : ""}`
      : `nav-link flex items-center gap-[7px] text-white rounded-full px-[10px] py-[7px] text-[12px] font-semibold whitespace-nowrap hover:bg-white/15 transition-colors ${block ? "w-full" : ""}`;

  return (
    <>
      {/* Desktop: hàng ngang, cuộn ngang khi chật */}
      <nav
        className="hidden lg:flex items-center gap-[2px] rounded-full p-1 flex-1 justify-center min-w-0 overflow-x-auto no-scrollbar"
        style={{ background: "rgba(255,255,255,0.07)" }}
        aria-label="Điều hướng chính"
      >
        {navItems.map((n) => (
          <Link key={n.href} href={n.href} className={linkCls(n.href === activePath)}>
            <i className={n.icon} aria-hidden />
            {n.label}
          </Link>
        ))}
      </nav>

      {/* Mobile/tablet: hamburger */}
      <div className="lg:hidden relative">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Mở menu"
          aria-expanded={open}
          className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-white text-[19px] cursor-pointer"
          style={{ background: "rgba(255,255,255,0.10)" }}
        >
          <i className={`ph-duotone ${open ? "ph-x" : "ph-list"}`} aria-hidden />
        </button>

        {open && (
          <>
            {/* overlay đóng khi bấm ngoài */}
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-hidden />
            <div
              className="absolute right-0 top-[46px] z-[71] w-[220px] rounded-[16px] p-2 flex flex-col gap-[2px]"
              style={{ background: "#123F36", boxShadow: "0 18px 44px rgba(14,44,38,0.4)" }}
            >
              {navItems.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={linkCls(n.href === activePath, true)}
                >
                  <i className={n.icon} aria-hidden />
                  {n.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
