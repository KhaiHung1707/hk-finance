/**
 * Money formatting — khớp helper `fmt` / `full` trong prototype.
 * fmt: hiển thị rút gọn (tr = M) trên card; full: số VND đầy đủ dùng cho tooltip.
 */

const nf = new Intl.NumberFormat("en-US");

/** Rút gọn: >= 1tr → "60M" / "2.5M"; nhỏ hơn → "900,000 ₫". */
export function fmt(v: number): string {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return (Number.isInteger(m) ? m : m.toFixed(1)) + "M";
  }
  return nf.format(Math.round(n)) + " ₫";
}

/** Đầy đủ: "60,000,000 ₫" — dùng cho tooltip hover. */
export function full(v: number): string {
  return nf.format(Math.round(Number(v) || 0)) + " ₫";
}

/** Phần trăm gọn: 0.793 → "79.3%". */
export function pct(v: number, digits = 1): string {
  return (Number(v) * 100).toFixed(digits) + "%";
}

/** Số chỉ vàng: 8.5 → "8.5 chỉ". */
export function chi(v: number): string {
  const n = Number(v) || 0;
  return (Number.isInteger(n) ? n : n.toFixed(1)) + " chỉ";
}
