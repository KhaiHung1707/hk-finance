import { redirect } from "next/navigation";

// Trang Tài khoản đã gộp vào /ledger (tab Tài khoản). Giữ route cũ → redirect.
export default function AccountsPage() {
  redirect("/ledger?tab=accounts");
}
