import {
  SkeletonShell,
  SkeletonCard,
  SkeletonTabs,
  SkeletonLine,
  SkeletonList,
  Skeleton,
} from "@/components/ui/Skeleton";

// Invest: 2 tab (Danh mục | Phân bổ) + card tổng + biểu đồ + danh mục.
export default function Loading() {
  return (
    <SkeletonShell bandPadBottom={88} pullUp={56}>
      <SkeletonTabs count={2} />
      {/* Card tổng + donut phân bổ */}
      <SkeletonCard>
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2">
            <SkeletonLine w={120} h={12} />
            <SkeletonLine w={200} h={28} />
          </div>
          <Skeleton rounded={999} style={{ width: 150, height: 150 }} />
        </div>
      </SkeletonCard>
      <SkeletonList rows={5} />
    </SkeletonShell>
  );
}
