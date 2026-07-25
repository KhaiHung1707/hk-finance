"use client";
/**
 * Nút đặt "ngày dự kiến" (S-1) cho milestone/contract — mở <input type="date"> gọn.
 * Ngày này KHÔNG đụng tiền, chỉ để đổ sự kiện lên Lịch tài chính (/calendar).
 * value = ISO yyyy-mm-dd hiện tại (null = chưa đặt). onSave(null) để xoá.
 */
export function DueDateButton({
  value,
  onSave,
  size = 26,
}: {
  value: string | null;
  onSave: (d: string | null) => void;
  size?: number;
}) {
  return (
    <label
      className="relative flex items-center justify-center rounded-full cursor-pointer"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: value ? "#FBF0DC" : "transparent",
        color: value ? "#A5731F" : "#9AA49E",
      }}
      title={value ? `Dự kiến ${value} — bấm để đổi` : "Đặt ngày dự kiến (lên Lịch)"}
    >
      <i className="ph-duotone ph-calendar-plus" aria-hidden />
      <input
        type="date"
        defaultValue={value ?? ""}
        onChange={(e) => onSave(e.target.value || null)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Ngày dự kiến"
      />
    </label>
  );
}
