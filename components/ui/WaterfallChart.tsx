"use client";
import { fmt, full } from "@/lib/format";

/**
 * Waterfall một tháng: opening → +income → −expense → ±(đầu tư & định giá lại) → closing.
 * Cột "total" (opening/closing) chạm đáy; cột "delta" trôi nổi từ mức cộng dồn trước.
 * SVG stretch + nhãn HTML. Màu: xanh dương=mốc, xanh lá=+, đỏ=−, tím=residual.
 * Mọi số từ props. `steps` do caller dựng (đã gán loại + dấu).
 */
export type WaterfallStep = {
  label: string;
  value: number; // giá trị tuyệt đối của bước; total dùng làm mốc, delta là ±
  kind: "total" | "delta";
};

const KIND_COLOR = {
  base: "#2a78d6", // mốc opening/closing
  pos: "#1F7A5C", // tăng
  neg: "#B4573B", // giảm
  reval: "#8b5cf6", // residual đầu tư & định giá lại
} as const;

export function WaterfallChart({
  steps,
  height = 240,
  ariaLabel = "Biểu đồ waterfall dòng tiền",
}: {
  steps: WaterfallStep[];
  height?: number;
  ariaLabel?: string;
}) {
  // cộng dồn để biết mép trên/dưới mỗi cột + mức cộng dồn SAU mỗi bước (cho connector)
  let running = 0;
  const bars = steps.map((s) => {
    let bottom: number, top: number, color: string;
    if (s.kind === "total") {
      bottom = 0;
      top = s.value;
      color = KIND_COLOR.base;
      running = s.value;
    } else {
      const start = running;
      running += s.value; // s.value đã mang dấu ±
      bottom = Math.min(start, running);
      top = Math.max(start, running);
      color = s.label.toLowerCase().includes("định giá")
        ? KIND_COLOR.reval
        : s.value >= 0
        ? KIND_COLOR.pos
        : KIND_COLOR.neg;
    }
    return { ...s, bottom, top, color, cumAfter: running };
  });

  const yMax = Math.max(1, ...bars.map((b) => b.top));
  const yMin = Math.min(0, ...bars.map((b) => b.bottom));
  const span = yMax - yMin || 1;

  const n = bars.length;
  const slot = 100 / n;
  const barW = slot * 0.56;
  const xCenter = (i: number) => slot * i + slot / 2;
  const Y = (v: number) => 4 + (1 - (v - yMin) / span) * 88;

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full">
      <div className="flex">
        <div className="relative flex-shrink-0 w-[44px]" style={{ height }}>
          {gridSteps.map((t, i) => {
            const v = yMin + span * t;
            return (
              <div key={i} className="absolute right-2 text-[10px] font-semibold text-faint tnum -translate-y-1/2" style={{ top: `${(Y(v) / 100) * height}px` }}>
                {fmt(v)}
              </div>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-0" style={{ height }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="img" aria-label={ariaLabel}>
            {gridSteps.map((t, i) => {
              const v = yMin + span * t;
              return <line key={i} x1={0} y1={Y(v)} x2={100} y2={Y(v)} stroke="#EFEAE0" strokeWidth={0.4} strokeDasharray={v === 0 ? "0" : "1 1.4"} vectorEffect="non-scaling-stroke" />;
            })}
            {bars.map((b, i) => {
              const x = xCenter(i) - barW / 2;
              const y = Y(b.top);
              const h = Math.max(0.6, Y(b.bottom) - Y(b.top));
              return (
                <g key={i}>
                  <rect x={x} y={y} width={barW} height={h} fill={b.color} rx={0.8} />
                  {/* connector: nối mức cộng dồn SAU cột này sang chân cột kế (mảnh, xám) */}
                  {i < n - 1 && (
                    <line
                      x1={xCenter(i) + barW / 2}
                      y1={Y(bars[i + 1].kind === "total" ? bars[i + 1].top : b.cumAfter)}
                      x2={xCenter(i + 1) - barW / 2}
                      y2={Y(bars[i + 1].kind === "total" ? bars[i + 1].top : b.cumAfter)}
                      stroke="#C9C0AC"
                      strokeWidth={0.4}
                      strokeDasharray="1 1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* value labels trên mỗi cột (HTML) */}
          {bars.map((b, i) => (
            <div key={`v${i}`} className="absolute text-[10px] font-bold tnum -translate-x-1/2 -translate-y-[130%] whitespace-nowrap pointer-events-none" style={{ left: `${xCenter(i)}%`, top: `${Y(b.top)}%`, color: b.color }} title={full(b.kind === "delta" ? b.value : b.top)}>
              {b.kind === "delta" ? (b.value >= 0 ? "+" : "−") : ""}
              {fmt(Math.abs(b.kind === "delta" ? b.value : b.top))}
            </div>
          ))}

          {/* x labels */}
          {bars.map((b, i) => (
            <div key={`x${i}`} className="absolute bottom-0 text-[10px] font-semibold text-muted text-center -translate-x-1/2 translate-y-full pt-1 leading-tight pointer-events-none" style={{ left: `${xCenter(i)}%`, width: `${slot}%` }}>
              {b.label}
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 18 }} />
    </div>
  );
}
