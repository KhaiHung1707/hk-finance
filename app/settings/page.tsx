import { AppShell } from "@/components/ui/AppShell";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { getSettingsBundle } from "@/lib/queries/settings";
import { getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [data, profile] = await Promise.all([getSettingsBundle(), getProfile()]);

  return (
    <AppShell
      activePath="/settings"
      eyebrow="Parameters that drive calculations across modules"
      title="Settings"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      <SettingsClient data={data} />
    </AppShell>
  );
}
