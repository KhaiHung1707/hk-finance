import { SkeletonShell, SkeletonCard, SkeletonLine, Skeleton } from "@/components/ui/Skeleton";

// Calendar: bảng alert + lưới lịch tháng + agenda.
export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonCard>
        <SkeletonLine w={140} h={14} />
        <div className="grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} rounded={14} style={{ height: 72 }} />
          ))}
        </div>
      </SkeletonCard>
      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)]">
        <SkeletonCard>
          <SkeletonLine w={100} h={14} />
          <Skeleton rounded={12} style={{ height: 280 }} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonLine w={140} h={14} />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} rounded={12} style={{ height: 56 }} />
          ))}
        </SkeletonCard>
      </div>
    </SkeletonShell>
  );
}
