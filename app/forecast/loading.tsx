import { SkeletonShell, SkeletonCard, SkeletonLine, Skeleton } from "@/components/ui/Skeleton";

// Forecast: card chỉ số + biểu đồ đường dự phóng.
export default function Loading() {
  return (
    <SkeletonShell bandPadBottom={88} pullUp={56}>
      {/* Hàng KPI */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i}>
            <SkeletonLine w="55%" h={12} />
            <SkeletonLine w="70%" h={24} />
          </SkeletonCard>
        ))}
      </div>
      {/* Biểu đồ */}
      <SkeletonCard>
        <SkeletonLine w={180} h={14} />
        <Skeleton rounded={12} style={{ height: 280 }} />
      </SkeletonCard>
    </SkeletonShell>
  );
}
