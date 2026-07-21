"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "dark" | "ghost" | "white";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-sans";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover border-0",
  dark: "bg-primary-dark text-white hover:bg-[#0A211C] border-0",
  white: "bg-white text-primary hover:bg-[#EAF4EE] border-0",
  ghost: "bg-chip text-ink-soft hover:bg-[#E6E0D2] border-0",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = size === "sm" ? "px-[13px] py-[7px] text-[11px]" : "px-[20px] py-[11px] text-[13px]";
  return (
    <button className={`${base} ${variants[variant]} ${sizes} ${className}`} {...props}>
      {children}
    </button>
  );
}
