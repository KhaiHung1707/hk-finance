import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Everything will BEE ok!! — HK Finance",
  description: "Personal finance — single ledger, no hardcoded numbers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Phosphor duotone icons — dùng jsdelivr (ổn định); preload font để icon
            không nháy trống lúc tải. */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/duotone/Phosphor-Duotone.woff2"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/duotone/style.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
