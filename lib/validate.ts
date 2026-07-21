/**
 * Validation cho server actions — server action là public endpoint, guard ở
 * client (Number(x)||0) KHÔNG bảo vệ được nếu gọi trực tiếp. Mọi action ghi tiền
 * phải tự chặn số âm / 0 / NaN / Infinity trước khi tới RPC (defense-in-depth;
 * DB cũng có guard riêng ở tầng RPC).
 */

export class ValidationError extends Error {}

/** Số tiền/số lượng dương hữu hạn (> 0). Ném ValidationError nếu không hợp lệ. */
export function positive(v: unknown, field = "value"): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`${field} phải là số dương hợp lệ (nhận: ${String(v)})`);
  }
  return n;
}

/** Số hữu hạn >= 0 (cho phép 0, ví dụ giá thị trường có thể = 0). */
export function nonNegative(v: unknown, field = "value"): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${field} phải là số >= 0 hợp lệ (nhận: ${String(v)})`);
  }
  return n;
}

/** Tỷ lệ % kỳ vọng trong [0, 100] (lãi suất/scenario). */
export function ratePercent(v: unknown, field = "rate"): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError(`${field} phải trong khoảng 0–100 (nhận: ${String(v)})`);
  }
  return n;
}

/** Số nguyên dương (ví dụ số tháng kỳ hạn). */
export function positiveInt(v: unknown, field = "value"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`${field} phải là số nguyên dương (nhận: ${String(v)})`);
  }
  return n;
}

/** Chuỗi không rỗng sau trim. */
export function nonEmpty(v: unknown, field = "value"): string {
  const s = String(v ?? "").trim();
  if (!s) throw new ValidationError(`${field} không được để trống`);
  return s;
}

/** Bọc thân action: bắt ValidationError → trả {ok:false,error}. */
export async function guard(
  fn: () => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    throw e;
  }
}
