import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { publishedBrandName, publishedSiteAppearance } from "../shared/published-site";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/",
);
const socialImageUrl = new URL("og.png", siteUrl).toString();
const brandName = publishedBrandName;
const themeVariables = {
  "--site-accent": publishedSiteAppearance.theme.accent,
  "--site-surface": publishedSiteAppearance.theme.surface,
  "--site-ink": publishedSiteAppearance.theme.ink,
} as CSSProperties;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: `${brandName}｜泰國佛牌與收藏品`, template: `%s｜${brandName}` },
  description: "提供泰國佛牌與相關收藏品資訊，整理年份、材質、尺寸、來源與保存狀況。",
  keywords: ["泰國佛牌", "佛牌收藏", "泰國聖物", "佛牌來源", "佛牌台灣"],
  alternates: { canonical: siteUrl.toString() },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    siteName: brandName,
    url: siteUrl.toString(),
    title: `${brandName}｜泰國佛牌與收藏品`,
    description: "提供泰國佛牌與相關收藏品資訊、文化文章與選購說明。",
    images: [{ url: socialImageUrl, width: 1731, height: 909, alt: `${brandName}泰國佛牌與收藏品` }],
  },
  twitter: { card: "summary_large_image", title: `${brandName}｜泰國佛牌與收藏品`, description: "提供泰國佛牌與相關收藏品資訊、文化文章與選購說明。", images: [socialImageUrl] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW" style={themeVariables}><body>{children}</body></html>;
}
