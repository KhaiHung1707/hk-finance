import { AppShell } from "@/components/ui/AppShell";
import { HistoryAnalyticsClient } from "@/components/history/HistoryAnalyticsClient";
import {
  getClosedMonths,
  getProfile,
  getNetworthHistory,
  getNetworthDeltas,
  getMonthlyTrend,
  getSourceTrend,
  getForecastError,
} from "@/lib/queries";
import { getSettingsBundle } from "@/lib/queries/settings";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [history, deltas, monthlyTrend, sourceTrend, closedMonths, forecastError, settings, profile] =
    await Promise.all([
      getNetworthHistory(),
      getNetworthDeltas(),
      getMonthlyTrend(),
      getSourceTrend(),
      getClosedMonths(),
      getForecastError(),
      getSettingsBundle(),
      getProfile(),
    ]);

  return (
    <AppShell
      activePath="/history"
      eyebrow="Xu hướng net worth · dòng tiền · tỉ trọng tài sản theo thời gian"
      title="Lịch sử & Phân tích"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      {history.length === 0 && monthlyTrend.length === 0 ? (
        <div className="bg-card border border-card-border rounded-[18px] p-10 text-center">
          <div className="w-[54px] h-[54px] rounded-[16px] bg-chip text-primary flex items-center justify-center text-[26px] mx-auto mb-3">
            <i className="ph-duotone ph-clock-counter-clockwise" aria-hidden />
          </div>
          <div className="text-[15px] font-bold mb-1">Chưa có dữ liệu lịch sử</div>
          <div className="text-[12px] text-muted">
            Nhập giao dịch ở Ledger rồi bấm “Chốt tháng” ở Dashboard để tạo mốc net worth theo thời gian.
          </div>
        </div>
      ) : (
        <HistoryAnalyticsClient
          history={history}
          deltas={deltas}
          monthlyTrend={monthlyTrend}
          sourceTrend={sourceTrend}
          closedMonths={closedMonths}
          forecastError={forecastError}
          allocationTargets={settings.allocationTargets}
        />
      )}
    </AppShell>
  );
}
