import {
  SkeletonShell,
  SkeletonCard,
  SkeletonTabs,
  SkeletonLine,
  Skeleton,
} from "@/components/ui/Skeleton";

// Projects/Upwork: 2 tab (Projects | Upwork) + quick-add + list card dự án.
export default function Loading() {
  return (
    <SkeletonShell bandPadBottom={88} pullUp={56}>
      <SkeletonTabs count={2} />
      {/* Quick-add card */}
      <SkeletonCard>
        <SkeletonLine w={140} h={14} />
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} rounded={9} style={{ height: 40, flex: "1 1 160px" }} />
          ))}
        </div>
      </SkeletonCard>
      {/* Danh sách dự án */}
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} style={{ padding: 16 }}>
          <div className="flex items-center gap-4">
            <Skeleton rounded={12} style={{ width: 44, height: 44, flexShrink: 0 }} />
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <SkeletonLine w="40%" h={14} />
              <SkeletonLine w="25%" h={11} />
            </div>
            <SkeletonLine w={110} h={18} />
          </div>
          <Skeleton rounded={999} style={{ height: 8, marginTop: 4 }} />
        </SkeletonCard>
      ))}
    </SkeletonShell>
  );
}
