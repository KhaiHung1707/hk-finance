import { redirect } from "next/navigation";

// Trang Assets đã gộp vào /investments (tab Gold + tab Phân bổ). Giữ route cũ → redirect.
export default function AssetsPage() {
  redirect("/investments");
}
