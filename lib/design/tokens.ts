/**
 * Design tokens — single source of truth, trích xuất từ prototype Claude Design (*.dc.html).
 * Mọi component dùng chung các giá trị này; KHÔNG lặp lại literal màu inline ở nơi khác.
 */

export const color = {
  bg: "#F5F1E8",
  ink: "#1B2A26",
  inkSoft: "#4C5A54",
  muted: "#7A8580",
  faint: "#9AA49E",

  primary: "#17554A",
  primaryHover: "#123F36",
  primaryDark: "#0E2C26",
  primaryDarkHover: "#0A211C",

  cardBg: "#FFFFFF",
  cardBorder: "#E7E1D3",
  divider: "#F1EDE2",
  chipBg: "#F2EFE6",
  chipBgHover: "#E6E0D2",
  fillSoft: "#F7F4EC",

  // trên nền header xanh
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "#9DC4B5",
  onPrimarySoft: "#BCD8CC",
  headerPillBg: "rgba(255,255,255,0.07)",
  headerBorder: "rgba(255,255,255,0.10)",

  accentGold: "#E8C97A",
  goldSoft: "#8FBCA7",
} as const;

/** Bảng màu badge theo loại giao dịch — khớp Ledger prototype typeMap. */
export const txTypeStyle = {
  income: { label: "Income", bg: "#DFF2E7", fg: "#1F7A5C", amount: "#1F7A5C", sign: "+" },
  expense: { label: "Expense", bg: "#F7E3DC", fg: "#B4573B", amount: "#B4573B", sign: "−" },
  transfer: { label: "Transfer", bg: "#EDEAE0", fg: "#6B7570", amount: "#4C5A54", sign: "" },
} as const;

/** Bảng màu badge theo trạng thái — khớp Ledger prototype stMap. */
export const txStatusStyle = {
  pending: { label: "Pending", bg: "#FBF0DC", fg: "#A5731F" },
  received: { label: "Received", bg: "#DFF2E7", fg: "#1F7A5C" },
  cancelled: { label: "Cancelled", bg: "#EDEAE0", fg: "#9AA49E" },
} as const;

/** Icon mặc định (Phosphor duotone) theo nguồn thu / loại account. */
export const sourceIcon: Record<string, string> = {
  Structure: "ph-duotone ph-buildings",
  Upwork: "ph-duotone ph-globe",
  Ecommerce: "ph-duotone ph-cube",
  Outsource: "ph-duotone ph-users-three",
  "Đầu tư": "ph-duotone ph-chart-line-up",
  Khác: "ph-duotone ph-dots-three-circle",
};

export const accountIcon: Record<string, string> = {
  bank: "ph-duotone ph-bank",
  broker: "ph-duotone ph-chart-line",
  cash: "ph-duotone ph-money",
  ewallet: "ph-duotone ph-wallet",
  other: "ph-duotone ph-buildings",
};

/**
 * Màu series theo nguồn thu — categorical palette đạt chuẩn CVD (colorblind-safe,
 * verified bằng dataviz validator: light mode ALL PASS). Gán theo entity, thứ tự cố định.
 */
export const sourceColor: Record<string, string> = {
  Structure: "#2a78d6", // blue
  Ecommerce: "#008300", // green
  Outsource: "#e87ba4", // magenta
  Upwork: "#eda100", // amber
  "Đầu tư": "#1baf7a", // aqua
  Khác: "#8b5cf6", // purple
};
export const chartPalette = ["#2a78d6", "#008300", "#e87ba4", "#eda100", "#1baf7a", "#8b5cf6"] as const;

/** Màu theo nhóm tài sản (Assets/Forecast) — cùng hệ categorical đã verify. */
export const groupColor: Record<string, string> = {
  cash: "#2a78d6", // blue
  gold: "#eda100", // amber
  stock: "#008300", // green
  deposits: "#8b5cf6", // purple
};

export const radius = { sm: 9, md: 12, card: 16, cardLg: 18, modal: 20, pill: 999 } as const;

/** Navigation dùng chung cho AppShell. */
export const navItems = [
  { href: "/", label: "Dashboard", icon: "ph-duotone ph-squares-four" },
  { href: "/ledger", label: "Ledger/Account", icon: "ph-duotone ph-notebook" },
  { href: "/in3d", label: "In3D", icon: "ph-duotone ph-cube-transparent" },
  { href: "/projects", label: "Projects/Upwork", icon: "ph-duotone ph-briefcase" },
  { href: "/investments", label: "Invest", icon: "ph-duotone ph-chart-line-up" },
  { href: "/forecast", label: "Forecast", icon: "ph-duotone ph-chart-line" },
  { href: "/history", label: "Lịch sử", icon: "ph-duotone ph-clock-counter-clockwise" },
] as const;
