import type { ReactNode } from "react";
import Link from "next/link";
import { navItems } from "@/lib/design/tokens";

/**
 * Khung chung mọi trang: header band xanh + nav pill + user chip, rồi vùng nội dung
 * kéo lên chồng lên band (margin âm) đúng như prototype.
 *
 * - activePath: đường dẫn hiện tại để highlight nav.
 * - eyebrow / title: dòng nhỏ + tiêu đề lớn bên trái header.
 * - headerActions: nút bên phải tiêu đề (Income/Expense, Close month...).
 * - bandPadBottom / pullUp: tinh chỉnh khoảng chồng cho từng trang.
 */
export function AppShell({
  activePath,
  eyebrow,
  title,
  headerActions,
  children,
  user,
  bandPadBottom = 72,
  pullUp = 44,
}: {
  activePath: string;
  eyebrow: string;
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
  user: { initials: string; name?: string; role?: string };
  bandPadBottom?: number;
  pullUp?: number;
}) {
  return (
    <div className="w-full min-h-screen bg-bg">
      {/* Header band */}
      <div className="bg-primary px-7" style={{ paddingBottom: bandPadBottom }}>
        <div className="mx-auto">
          <div
            className="flex items-center justify-between gap-6 py-[18px]"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
          >
            <div className="flex items-center gap-[10px] flex-shrink-0">
              <div className="w-9 h-9 rounded-[11px] bg-[#EAF4EE] flex items-center justify-center text-primary text-[19px]">
                <i className="ph-duotone ph-coins" aria-hidden />
              </div>
              <div className="text-[15px] font-extrabold text-white tracking-[-0.3px] whitespace-nowrap">
                Everything will BEE ok!! <i className="ph-duotone ph-bee" style={{ color: "#E8C97A" }} aria-hidden />
              </div>
            </div>

            <nav
              className="flex items-center gap-[2px] rounded-full p-1 flex-1 justify-center min-w-0"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              {navItems.map((n) => {
                const active = n.href === activePath;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={
                      active
                        ? "flex items-center gap-[7px] bg-white text-primary rounded-full px-[11px] py-[7px] text-[12px] font-bold whitespace-nowrap"
                        : "nav-link flex items-center gap-[7px] text-white rounded-full px-[10px] py-[7px] text-[12px] font-semibold whitespace-nowrap hover:bg-white/15 transition-colors"
                    }
                  >
                    <i className={n.icon} aria-hidden />
                    {n.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/settings"
                aria-label="Settings"
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[#DCEDE4] text-[17px]"
                style={{ border: "1px solid rgba(255,255,255,0.22)" }}
              >
                <i className="ph-duotone ph-gear-six" aria-hidden />
              </Link>
              <div className="flex items-center gap-[10px]">
                <div className="w-[38px] h-[38px] rounded-full bg-[#E7A87B] text-[#5B3213] flex items-center justify-center text-[13px] font-extrabold">
                  {user.initials}
                </div>
                {user.name && (
                  <div>
                    <div className="text-[13px] font-bold text-white">{user.name}</div>
                    <div className="text-[11px] text-[#9DC4B5]">{user.role ?? "Personal"}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Title row */}
          <div className="flex items-end justify-between gap-4 flex-wrap pt-[26px] px-1">
            <div>
              <div className="text-[13px] text-[#9DC4B5] font-medium">{eyebrow}</div>
              <div className="text-[28px] font-extrabold text-white tracking-[-0.5px]">{title}</div>
            </div>
            <div id="header-actions" className="flex items-center gap-[10px]">
              {headerActions}
            </div>
          </div>
        </div>
      </div>

      {/* Content pulled up over the band */}
      <div className="mx-auto px-7 pb-11 flex flex-col gap-[14px]" style={{ marginTop: -pullUp }}>
        {children}
      </div>
    </div>
  );
}
