import { AppShell } from "@/components/ui/AppShell";
import { ForecastClient } from "@/components/forecast/ForecastClient";
import { getForecastParams, getForecastStart, getForecastSnapshots, getInvestGainByGroup } from "@/lib/queries/forecast";
import { getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  const [params, start, snapshots, investGainGroups, profile] = await Promise.all([
    getForecastParams(),
    getForecastStart(),
    getForecastSnapshots(),
    getInvestGainByGroup(),
    getProfile(),
  ]);

  return (
    <AppShell
      activePath="/forecast"
      eyebrow="Horizon × scenario · every parameter comes from Settings"
      title="Forecast"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
      bandPadBottom={88}
      pullUp={56}
    >
      <ForecastClient params={params} start={start} snapshots={snapshots} investGainGroups={investGainGroups} />
    </AppShell>
  );
}
