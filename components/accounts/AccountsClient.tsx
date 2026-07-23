"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, full } from "@/lib/format";
import { accountIcon, groupColor } from "@/lib/design/tokens";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, FieldRow, TextInput, Select, MoneyInput } from "@/components/ui/Field";
import {
  adjustAccountBalance,
  createAccount,
  deleteAccount,
  type AccountType,
} from "@/lib/actions/accounts";
import type { AccountBalance } from "@/lib/queries";

const GRID = "34px 1.3fr 110px 150px 190px";

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "bank", label: "Ngân hàng" },
  { value: "broker", label: "Chứng khoán" },
  { value: "cash", label: "Tiền mặt" },
  { value: "ewallet", label: "Ví điện tử" },
  { value: "other", label: "Khác" },
];

export function AccountsClient({
  accounts,
  monthKey,
  total,
  gold,
  stock,
  deposits,
  netWorth,
}: {
  accounts: AccountBalance[];
  monthKey: string;
  total: number;
  gold: number;
  stock: number;
  deposits: number;
  netWorth: number;
}) {
  const router = useRouter();

  // ---- Modal chỉnh số dư ----
  const [edit, setEdit] = useState<AccountBalance | null>(null);
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");

  // ---- Modal thêm tài khoản ----
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("bank");
  const [newOpening, setNewOpening] = useState("");
  const [newNote, setNewNote] = useState("");

  // ---- Xoá ----
  const [del, setDel] = useState<AccountBalance | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function clearErr() {
    setErr(null);
  }

  // -- chỉnh số dư --
  function openEdit(a: AccountBalance) {
    setEdit(a);
    setActual(String(a.balance));
    setNote("");
    clearErr();
  }
  function closeEdit() {
    setEdit(null);
    setActual("");
    setNote("");
    clearErr();
  }
  const actualNum = Math.round(Number(actual) || 0);
  const diff = edit ? actualNum - edit.balance : 0;

  async function submitAdjust() {
    if (!edit) return;
    setBusy(true);
    clearErr();
    const res = await adjustAccountBalance({ accountId: edit.id, actual: actualNum, monthKey, note });
    setBusy(false);
    if (!res?.ok) return setErr(res?.error ?? "Lỗi điều chỉnh số dư");
    closeEdit();
    router.refresh();
  }

  // -- thêm tài khoản --
  function closeAdd() {
    setAdding(false);
    setNewName("");
    setNewType("bank");
    setNewOpening("");
    setNewNote("");
    clearErr();
  }
  async function submitAdd() {
    setBusy(true);
    clearErr();
    const res = await createAccount({
      name: newName,
      type: newType,
      openingBalance: Math.round(Number(newOpening) || 0),
      note: newNote,
    });
    setBusy(false);
    if (!res?.ok) return setErr(res?.error ?? "Lỗi thêm tài khoản");
    closeAdd();
    router.refresh();
  }

  // -- xoá --
  async function submitDelete() {
    if (!del) return;
    setBusy(true);
    clearErr();
    const res = await deleteAccount(del.id);
    setBusy(false);
    if (!res?.ok) return setErr(res?.error ?? "Lỗi xoá tài khoản");
    setDel(null);
    router.refresh();
  }

  return (
    <>
      {/* Tổng số dư tài khoản (tiền) */}
      <div className="bg-primary-dark rounded-[16px] px-6 py-5 flex items-center gap-4 flex-wrap">
        <div className="w-[42px] h-[42px] rounded-[12px] bg-[#1E4A40] text-[#8FBCA7] flex items-center justify-center text-[22px]">
          <i className="ph-duotone ph-wallet" aria-hidden />
        </div>
        <div>
          <div className="text-[12px] text-[#9DC4B5] font-medium">
            Tổng số dư tài khoản (tiền mặt · ngân hàng · ví)
          </div>
          <div className="text-[26px] font-extrabold text-white tnum" title={full(total)}>
            {fmt(total)}
          </div>
        </div>
        <div className="ml-auto flex items-baseline gap-[7px]">
          <span className="text-[12px] text-[#9DC4B5]">Tổng tài sản ròng</span>
          <span className="text-[17px] font-extrabold text-white tnum" title={full(netWorth)}>
            {fmt(netWorth)}
          </span>
        </div>
      </div>

      {/* Tài sản khác — CHỈ XEM (quản lý ở Assets / Invest) */}
      <div className="grid grid-cols-3 gap-[14px] max-[640px]:grid-cols-1">
        <ReadonlyAsset label="Vàng" value={gold} color={groupColor.gold} icon="ph-duotone ph-coins" href="/assets" />
        <ReadonlyAsset label="Cổ phiếu" value={stock} color={groupColor.stock} icon="ph-duotone ph-chart-line-up" href="/investments" />
        <ReadonlyAsset label="Sổ tiết kiệm" value={deposits} color={groupColor.deposits} icon="ph-duotone ph-vault" href="/investments" />
      </div>

      {/* Bảng tài khoản tiền */}
      <div className="bg-card border border-card-border rounded-[16px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-fill-soft">
          <div className="text-[11px] font-bold text-muted uppercase tracking-[0.4px]">
            Tài khoản tiền
          </div>
          <button
            onClick={() => {
              setAdding(true);
              clearErr();
            }}
            className="flex items-center gap-[6px] bg-primary text-white border-0 rounded-full px-[13px] py-[6px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover"
          >
            <i className="ph-duotone ph-plus" aria-hidden />
            Thêm tài khoản
          </button>
        </div>

        <div
          className="grid gap-3 items-center px-5 py-2 text-[11px] font-bold text-muted uppercase tracking-[0.4px] border-t border-divider"
          style={{ gridTemplateColumns: GRID }}
        >
          <div />
          <div>Tài khoản</div>
          <div>Loại</div>
          <div className="text-right">Số dư (app tính)</div>
          <div className="text-right">Hành động</div>
        </div>

        {accounts.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-muted border-t border-divider">
            Chưa có tài khoản nào — bấm “Thêm tài khoản”.
          </div>
        )}

        {accounts.map((a) => (
          <div
            key={a.id}
            className="grid gap-3 items-center px-5 py-[14px] border-t border-divider text-[13px] hover:bg-[#FAF8F2]"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="w-[30px] h-[30px] rounded-[9px] bg-chip text-primary flex items-center justify-center text-[15px]">
              <i className={accountIcon[a.type] ?? "ph-duotone ph-bank"} aria-hidden />
            </div>
            <div className="font-semibold">{a.name}</div>
            <div className="text-muted text-[12px] capitalize">{a.type}</div>
            <div className="text-right font-bold tnum" title={full(a.balance)}>
              {fmt(a.balance)}
            </div>
            <div className="flex justify-end gap-[6px]">
              <button
                onClick={() => openEdit(a)}
                className="bg-primary text-white border-0 rounded-full px-[13px] py-[7px] text-[11px] font-bold cursor-pointer hover:bg-primary-hover whitespace-nowrap"
              >
                Chỉnh số dư
              </button>
              <button
                onClick={() => {
                  setDel(a);
                  clearErr();
                }}
                aria-label={`Xoá ${a.name}`}
                className="bg-chip text-[#B4573B] border-0 rounded-full w-[30px] h-[30px] flex items-center justify-center text-[14px] cursor-pointer hover:bg-[#F7E3DC]"
              >
                <i className="ph-duotone ph-trash" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: chỉnh số dư */}
      <Modal
        open={edit !== null}
        onClose={closeEdit}
        title={`Chỉnh số dư — ${edit?.name ?? ""}`}
        icon="ph-duotone ph-scales"
      >
        <div className="flex flex-col gap-[14px]">
          <div className="bg-fill-soft rounded-[10px] px-[14px] py-[11px] text-[12px] text-ink-soft">
            Số dư app đang tính:{" "}
            <b className="tnum" title={full(edit?.balance ?? 0)}>
              {fmt(edit?.balance ?? 0)}
            </b>
            . Nhập số dư <b>thực tế</b> — app tạo một giao dịch điều chỉnh bằng đúng
            phần chênh lệch (tháng {monthKey}).
          </div>
          <Field label="Số dư thực tế (₫)">
            <MoneyInput value={actual} onValueChange={setActual} placeholder="0" autoFocus />
          </Field>
          {actual !== "" && (
            <div
              className="text-[12px] font-semibold"
              style={{ color: diff === 0 ? "#7A8580" : diff > 0 ? "#1F7A5C" : "#B4573B" }}
            >
              {diff === 0
                ? "Đã khớp — không tạo giao dịch nào."
                : diff > 0
                  ? `Sẽ ghi khoản THU điều chỉnh +${full(diff)}`
                  : `Sẽ ghi khoản CHI điều chỉnh −${full(-diff)}`}
            </div>
          )}
          <Field label="Ghi chú (tuỳ chọn)">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Điều chỉnh số dư" />
          </Field>
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={closeEdit}>
            Huỷ
          </Button>
          <Button variant="primary" className="flex-1" onClick={submitAdjust} disabled={busy || diff === 0}>
            {busy ? "Đang lưu…" : diff === 0 ? "Đã khớp" : "Lưu điều chỉnh"}
          </Button>
        </ModalActions>
      </Modal>

      {/* Modal: thêm tài khoản */}
      <Modal open={adding} onClose={closeAdd} title="Thêm tài khoản" icon="ph-duotone ph-plus-circle">
        <div className="flex flex-col gap-[14px]">
          <Field label="Tên tài khoản">
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="VD: Techcombank" autoFocus />
          </Field>
          <FieldRow>
            <Field label="Loại">
              <Select value={newType} onChange={(e) => setNewType(e.target.value as AccountType)}>
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Số dư đầu kỳ (₫)">
              <MoneyInput value={newOpening} onValueChange={setNewOpening} placeholder="0" />
            </Field>
          </FieldRow>
          <Field label="Ghi chú (tuỳ chọn)">
            <TextInput value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Tuỳ chọn" />
          </Field>
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={closeAdd}>
            Huỷ
          </Button>
          <Button variant="primary" className="flex-1" onClick={submitAdd} disabled={busy || !newName.trim()}>
            {busy ? "Đang lưu…" : "Thêm"}
          </Button>
        </ModalActions>
      </Modal>

      {/* Modal: xác nhận xoá */}
      <Modal open={del !== null} onClose={() => setDel(null)} title="Xoá tài khoản" icon="ph-duotone ph-trash" iconBg="#F7E3DC" iconFg="#B4573B">
        <div className="flex flex-col gap-[14px]">
          <div className="text-[13px] text-ink-soft leading-[1.6]">
            Xoá tài khoản <b>{del?.name}</b>? Chỉ xoá được khi tài khoản{" "}
            <b>không còn giao dịch hay sổ tiết kiệm</b> nào tham chiếu (giữ đúng liên
            kết dữ liệu). Nếu còn, app sẽ báo và không xoá.
          </div>
          {err && <div className="text-[12px] text-[#B4573B] font-semibold">{err}</div>}
        </div>
        <ModalActions>
          <Button variant="ghost" className="flex-1" onClick={() => setDel(null)}>
            Huỷ
          </Button>
          <Button variant="danger" className="flex-1" onClick={submitDelete} disabled={busy}>
            {busy ? "Đang xoá…" : "Xoá tài khoản"}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}

function ReadonlyAsset({
  label,
  value,
  color,
  icon,
  href,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="bg-card border border-card-border rounded-[16px] px-[18px] py-[16px] flex items-center gap-3 hover:border-primary transition-colors"
    >
      <div
        className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[19px] flex-shrink-0"
        style={{ background: `${color}22`, color }}
      >
        <i className={icon} aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] text-muted font-medium flex items-center gap-1">
          {label}
          <i className="ph-duotone ph-lock-simple text-[11px]" aria-hidden title="Chỉ xem — quản lý ở trang tương ứng" />
        </div>
        <div className="text-[18px] font-extrabold text-ink tnum" title={full(value)}>
          {fmt(value)}
        </div>
      </div>
    </a>
  );
}
