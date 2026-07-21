"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** /login — trang duy nhất public. Signup tắt (tạo user tay trong Supabase). */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Email hoặc mật khẩu không đúng.");
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const inputCls =
    "border border-card-border rounded-[10px] px-3 py-[11px] text-[14px] text-ink outline-none focus:border-primary bg-white w-full";

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-5">
      <div
        className="bg-white rounded-[20px] p-8 w-[400px] max-w-[94vw]"
        style={{ boxShadow: "0 24px 60px rgba(14,44,38,0.28)" }}
      >
        <div className="flex items-center gap-[10px] mb-6">
          <div className="w-10 h-10 rounded-[12px] bg-[#EAF4EE] flex items-center justify-center text-primary text-[20px]">
            <i className="ph-duotone ph-coins" aria-hidden />
          </div>
          <div>
            <div className="text-[16px] font-extrabold tracking-[-0.3px]">
              Everything will BEE ok!! <i className="ph-duotone ph-bee" style={{ color: "#E8C97A" }} aria-hidden />
            </div>
            <div className="text-[12px] text-muted">Đăng nhập để tiếp tục</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-[14px]">
          <label className="flex flex-col gap-[6px] text-[12px] font-semibold text-ink-soft">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              required
            />
          </label>
          <label className="flex flex-col gap-[6px] text-[12px] font-semibold text-ink-soft">
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
            />
          </label>
          {error && <div className="text-[12px] text-[#B4573B] font-semibold">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-white border-0 rounded-full py-[12px] text-[14px] font-bold cursor-pointer hover:bg-primary-hover disabled:opacity-60 mt-1"
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
