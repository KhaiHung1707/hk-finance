import { AppShell } from "@/components/ui/AppShell";
import { AccountsClient } from "@/components/accounts/AccountsClient";
import { getAccountBalances, getBaselineMonthKey, getProfile, getNetWorth } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, monthKey, profile, nw] = await Promise.all([
    getAccountBalances(),
    getBaselineMonthKey(),
    getProfile(),
    getNetWorth(),
  ]);
  const total = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <AppShell
      activePath="/accounts"
      eyebrow="Tiền mặt · ngân hàng · ví — chỉnh cho khớp thực tế"
      title="Tài khoản"
      user={{ initials: profile.initials, name: profile.name || undefined, role: profile.role }}
    >
      <AccountsClient
        accounts={accounts}
        monthKey={monthKey}
        total={total}
        gold={nw.gold}
        stock={nw.stock}
        deposits={nw.deposits}
        netWorth={nw.total}
      />
    </AppShell>
  );
}
