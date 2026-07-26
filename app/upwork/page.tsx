import { redirect } from "next/navigation";

// Upwork đã gộp hoàn toàn vào /projects (1 danh sách hợp đồng, lọc theo loại). Redirect.
export default function UpworkPage() {
  redirect("/projects");
}
