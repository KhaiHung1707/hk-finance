"use client";
import { useState } from "react";
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

/**
 * Ô nhập TIỀN: hiển thị dấu phân cách khi rời ô (7,500,000), gõ số thô khi focus.
 * `value` là chuỗi số thô (chỉ digit); `onValueChange` trả chuỗi số thô.
 */
export function MoneyInput({
  value,
  onValueChange,
  ...props
}: {
  value: string;
  onValueChange: (raw: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [focused, setFocused] = useState(false);
  const grouped = value ? new Intl.NumberFormat("en-US").format(Number(value) || 0) : "";
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      value={focused ? value : grouped}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onValueChange(e.target.value.replace(/[^\d]/g, ""))}
      className={`${inputCls} tnum ${props.className ?? ""}`}
    />
  );
}

/** Hàng nhiều field cạnh nhau. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-3 [&>*]:flex-1">{children}</div>;
}
