import {
  SkeletonShell,
  SkeletonCard,
  SkeletonTabs,
  SkeletonLine,
  SkeletonList,
  Skeleton,
} from "@/components/ui/Skeleton";

// Ledger/Account: 2 tab (Sổ | Tài khoản) + quick-add + danh sách giao dịch.
export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonTabs count={2} />
      {/* Quick-add giao dịch */}
      <SkeletonCard>
        <SkeletonLine w={160} h={14} />
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} rounded={9} style={{ height: 40, flex: "1 1 140px" }} />
          ))}
        </div>
      </SkeletonCard>
      <SkeletonList rows={7} />
    </SkeletonShell>
  );
}
