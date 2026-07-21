import { AppShell } from "@/components/ui/AppShell";
import { getProfile } from "@/lib/queries";

/** Placeholder cho các module Phase 2–4 (giữ nav hoạt động, đúng khung design). */
export async function ComingSoon({
  activePath,
  title,
  eyebrow,
  phase,
}: {
  activePath: string;
  title: string;
  eyebrow: string;
  phase: string;
}) {
  const profile = await getProfile();
  return (
    <AppShell
      activePath={activePath}
      eyebrow={eyebrow}
      title={title}
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      <div className="bg-card border border-card-border rounded-[18px] p-10 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-[16px] bg-chip text-primary flex items-center justify-center text-[26px]">
          <i className="ph-duotone ph-wrench" aria-hidden />
        </div>
        <div className="text-[17px] font-extrabold">{title} — đang triển khai</div>
        <div className="text-[13px] text-muted max-w-[420px]">
          Module này thuộc {phase}. Data core (schema · views · RPC) đã sẵn sàng; giao diện sẽ được
          hoàn thiện theo mẫu prototype ở phase kế tiếp.
        </div>
      </div>
    </AppShell>
  );
}
