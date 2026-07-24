import { SkeletonShell, SkeletonCard, SkeletonLine, SkeletonList, Skeleton } from "@/components/ui/Skeleton";

// Dashboard: card net worth lớn + hàng KPI + biểu đồ + danh sách gần đây.
export default function Loading() {
  return (
    <SkeletonShell bandPadBottom={96} pullUp={64}>
      {/* Net worth card */}
      <SkeletonCard style={{ padding: 22 }}>
        <SkeletonLine w={130} h={12} />
        <SkeletonLine w={260} h={34} />
        <SkeletonLine w={180} h={12} />
      </SkeletonCard>
      {/* Hàng KPI */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <SkeletonLine w="55%" h={12} />
            <SkeletonLine w="70%" h={22} />
          </SkeletonCard>
        ))}
      </div>
      {/* Biểu đồ + danh sách */}
      <SkeletonCard>
        <SkeletonLine w={160} h={14} />
        <Skeleton rounded={12} style={{ height: 240 }} />
      </SkeletonCard>
      <SkeletonList rows={4} />
    </SkeletonShell>
  );
}
