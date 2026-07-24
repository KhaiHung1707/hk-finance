import { SkeletonShell, SkeletonCard, SkeletonLine, SkeletonList, Skeleton } from "@/components/ui/Skeleton";

// In3D — Ecommerce: card doanh thu + đơn hàng.
export default function Loading() {
  return (
    <SkeletonShell bandPadBottom={88} pullUp={56}>
      <SkeletonCard>
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2">
            <SkeletonLine w={120} h={12} />
            <SkeletonLine w={200} h={28} />
          </div>
          <Skeleton rounded={12} style={{ width: 220, height: 90 }} />
        </div>
      </SkeletonCard>
      <SkeletonList rows={5} />
    </SkeletonShell>
  );
}
