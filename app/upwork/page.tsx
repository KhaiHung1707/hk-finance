import { redirect } from "next/navigation";

// Trang Upwork đã gộp vào /projects (tab Upwork). Giữ route cũ → redirect.
export default function UpworkPage() {
  redirect("/projects?tab=upwork");
}
