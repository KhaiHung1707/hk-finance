import { SkeletonShell, SkeletonList } from "@/components/ui/Skeleton";

// Lịch sử chốt tháng: danh sách các lần chốt.
export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonList rows={6} />
    </SkeletonShell>
  );
}
