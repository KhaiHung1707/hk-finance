import { SkeletonShell, SkeletonCard, SkeletonLine, Skeleton } from "@/components/ui/Skeleton";

// Lịch sử & Phân tích: KPI strip + line net worth + chart + bảng tháng đã chốt.
export default function Loading() {
  return (
    <SkeletonShell>
      {/* KPI strip */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton rounded={10} style={{ width: 34, height: 34 }} />
            <SkeletonLine w="60%" h={22} />
            <SkeletonLine w="45%" h={12} />
          </SkeletonCard>
        ))}
      </div>
      {/* Line net worth */}
      <SkeletonCard>
        <SkeletonLine w={200} h={14} />
        <Skeleton rounded={12} style={{ height: 240 }} />
      </SkeletonCard>
      {/* 2 chart cạnh nhau */}
      <div className="grid gap-[14px] grid-cols-1 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i}>
            <SkeletonLine w={180} h={14} />
            <Skeleton rounded={12} style={{ height: 220 }} />
          </SkeletonCard>
        ))}
      </div>
      {/* Bảng */}
      <SkeletonCard style={{ padding: 0 }}>
        <div className="p-[18px] flex flex-col gap-3">
          <SkeletonLine w={160} h={14} />
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLine key={i} w="100%" h={16} />
          ))}
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
