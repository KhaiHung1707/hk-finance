"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render children vào ô #header-actions do AppShell đặt trong header band.
 * Cho phép nút hành động (Income/Expense, Close month...) sống trên band xanh
 * trong khi logic ở client component vùng content.
 */
export function HeaderPortal({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.getElementById("header-actions"));
  }, []);
  if (!el) return null;
  return createPortal(children, el);
}
