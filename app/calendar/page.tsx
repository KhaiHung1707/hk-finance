import { AppShell } from "@/components/ui/AppShell";
import { CalendarClient } from "@/components/calendar/CalendarClient";
import { getUpcomingEvents, getFinancialAlerts } from "@/lib/queries/calendar";
import { getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [events, alerts, profile] = await Promise.all([
    getUpcomingEvents(),
    getFinancialAlerts(),
    getProfile(),
  ]);
  // "Hôm nay" tính ở server lúc request → truyền xuống client để tránh lệch hydration.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <AppShell
      activePath="/calendar"
      eyebrow="Sự kiện tài chính sắp tới · cảnh báo cần hành động"
      title="Lịch tài chính"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      <CalendarClient events={events} alerts={alerts} todayIso={todayIso} />
    </AppShell>
  );
}
