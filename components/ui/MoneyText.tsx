import { fmt, full } from "@/lib/format";

/**
 * Hiển thị số tiền rút gọn (M) với tooltip số VND đầy đủ khi hover.
 * Toàn app dùng component này để đảm bảo quy tắc "hiển thị tr, hover ra VND".
 */
export function MoneyText({
  value,
  className = "",
  hint,
}: {
  value: number;
  className?: string;
  /** Text tooltip tuỳ chỉnh; mặc định = số VND đầy đủ. */
  hint?: string;
}) {
  return (
    <span className={`tnum ${className}`} title={hint ?? full(value)}>
      {fmt(value)}
    </span>
  );
}
