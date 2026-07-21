"use client";
import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const inputCls =
  "border border-card-border rounded-[10px] px-3 py-[10px] text-[13px] font-sans text-ink outline-none focus:border-primary bg-white w-full";

/** Label + input theo mẫu form modal prototype. */
export function Field({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-[6px] text-[12px] font-semibold text-ink-soft ${className}`}>
      {label}
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

/** Hàng nhiều field cạnh nhau. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 [&>*]:flex-1">{children}</div>;
}
