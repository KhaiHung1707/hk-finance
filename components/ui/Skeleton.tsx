import type { CSSProperties, ReactNode } from "react";

/**
 * Skeleton loading — primitive + khung trang dùng chung.
 *
 * Dùng trong `app/<route>/loading.tsx`: Next tự render trong khi server component
 * (Promise.all các query) đang fetch, rồi thay bằng nội dung thật. Không cần "use client".
 *
 * `.skeleton` / `.skeleton-dark` + keyframe shimmer khai báo ở app/globals.css.
 */

/** Ô placeholder shimmer. `dark`=true dùng trên nền band xanh header. */
export function Skeleton({
  className = "",
  style,
  dark = false,
  rounded = 8,
}: {
  className?: string;
  style?: CSSProperties;
  dark?: boolean;
  rounded?: number | string;
}) {
  return (
    <div
      className={`${dark ? "skeleton skeleton-dark" : "skeleton"} ${className}`}
      style={{ borderRadius: rounded, ...style }}
      aria-hidden
    />
  );
}

/** Dòng chữ giả — width theo % để trông tự nhiên. */
export function SkeletonLine({
  w = "100%",
  h = 12,
  dark = false,
  className = "",
}: {
  w?: number | string;
  h?: number;
  dark?: boolean;
  className?: string;
}) {
  return <Skeleton dark={dark} rounded={6} className={className} style={{ width: w, height: h }} />;
}

/** Thẻ trắng bo góc — bao nội dung skeleton của một khối. */
export function SkeletonCard({
  children,
  className = "",
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`bg-card flex flex-col gap-3 ${className}`}
      style={{ border: "1px solid var(--color-card-border)", borderRadius: 16, padding: 18, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * Khung band header (giả AppShell) + slot nội dung. Không cần data user/title thật.
 * Tự dựng band xanh với các pill placeholder, rồi kéo nội dung lên chồng như bản thật.
 */
export function SkeletonShell({
  bandPadBottom = 72,
  pullUp = 44,
  children,
}: {
  bandPadBottom?: number;
  pullUp?: number;
  children: ReactNode;
}) {
  return (
    <div className="w-full min-h-screen bg-bg" aria-busy="true" aria-label="Đang tải">
      {/* Band xanh */}
      <div className="bg-primary px-7" style={{ paddingBottom: bandPadBottom }}>
        <div className="mx-auto">
          {/* Nav row */}
          <div
            className="flex items-center justify-between gap-6 py-[18px]"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
          >
            <div className="flex items-center gap-[10px] min-w-0">
              <Skeleton dark rounded={11} style={{ width: 36, height: 36 }} />
              <Skeleton dark className="hidden sm:block" style={{ width: 160, height: 14 }} />
            </div>
            <div className="hidden md:flex items-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} dark rounded={999} style={{ width: 84, height: 30 }} />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Skeleton dark rounded={999} style={{ width: 38, height: 38 }} />
              <Skeleton dark rounded={999} style={{ width: 38, height: 38 }} />
              <Skeleton dark rounded={999} style={{ width: 38, height: 38 }} />
            </div>
          </div>
          {/* Title row */}
          <div className="pt-[26px] px-1 flex flex-col gap-2">
            <Skeleton dark style={{ width: 220, height: 13 }} />
            <Skeleton dark style={{ width: 260, height: 26 }} />
          </div>
        </div>
      </div>

      {/* Nội dung kéo lên */}
      <div className="mx-auto px-7 pb-11 flex flex-col gap-[14px]" style={{ marginTop: -pullUp }}>
        {children}
      </div>
    </div>
  );
}

/** Hàng KPI/tab pill hay gặp ngay đầu nội dung. */
export function SkeletonTabs({ count = 2 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} rounded={999} style={{ width: 120, height: 38 }} />
      ))}
    </div>
  );
}

/** Danh sách các card đồng dạng — dùng cho list dự án / giao dịch / tài sản. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-[10px]">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} className="flex-row items-center gap-4" style={{ padding: 16 }}>
          <Skeleton rounded={12} style={{ width: 42, height: 42, flexShrink: 0 }} />
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <SkeletonLine w="45%" h={13} />
            <SkeletonLine w="30%" h={11} />
          </div>
          <SkeletonLine w={90} h={16} />
        </SkeletonCard>
      ))}
    </div>
  );
}
