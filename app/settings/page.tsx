import { AppShell } from "@/components/ui/AppShell";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { getSettingsBundle } from "@/lib/queries/settings";
import { getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [data, profile] = await Promise.all([getSettingsBundle(), getProfile()]);
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  return (
    <AppShell
      activePath="/settings"
      eyebrow="Parameters that drive calculations across modules"
      title="Settings"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      {/* Tài khoản — hồ sơ + đăng xuất */}
      <div className="bg-card border border-card-border rounded-[18px] p-[18px] flex items-center gap-4 flex-wrap">
        <div className="w-[46px] h-[46px] rounded-full bg-[#E7A87B] text-[#5B3213] flex items-center justify-center text-[16px] font-extrabold flex-shrink-0">
          {profile.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{profile.name || "Tài khoản"}</div>
          <div className="text-[12px] text-muted">
            {user?.email ?? "—"} · {profile.role}
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-2 bg-[#F7E3DC] text-[#B4573B] border-0 rounded-full px-[16px] py-[9px] text-[13px] font-bold cursor-pointer hover:bg-[#F0D2C6]"
          >
            <i className="ph-duotone ph-sign-out" aria-hidden />
            Đăng xuất
          </button>
        </form>
      </div>

      <SettingsClient data={data} />
    </AppShell>
  );
}
