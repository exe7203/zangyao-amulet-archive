import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { publishedBrandName, publishedSiteAppearance } from "../shared/published-site";
import { resolveSiteUrl } from "../shared/site-url";

const { publicUrl: publicSiteUrl, indexable: siteIndexable } = resolveSiteUrl();
const socialImageUrl = publicSiteUrl ? new URL("og.png", publicSiteUrl).toString() : null;
const brandName = publishedBrandName;
const themeVariables = {
  "--site-accent": publishedSiteAppearance.theme.accent,
  "--site-surface": publishedSiteAppearance.theme.surface,
  "--site-ink": publishedSiteAppearance.theme.ink,
} as CSSProperties;

export const metadata: Metadata = {
  ...(publicSiteUrl ? {
    metadataBase: publicSiteUrl,
    alternates: { canonical: publicSiteUrl.toString() },
  } : {}),
  title: { default: `${brandName}｜泰國佛牌與收藏品`, template: `%s｜${brandName}` },
  description: "提供泰國佛牌與相關收藏品資訊，整理年份、材質、尺寸、來源與保存狀況。",
  keywords: ["泰國佛牌", "佛牌收藏", "泰國聖物", "佛牌來源", "佛牌台灣"],
  openGraph: {
    type: "website",
    locale: "zh_TW",
    siteName: brandName,
    ...(publicSiteUrl ? { url: publicSiteUrl.toString() } : {}),
    title: `${brandName}｜泰國佛牌與收藏品`,
    description: "提供泰國佛牌與相關收藏品資訊、文化文章與選購說明。",
    ...(socialImageUrl ? { images: [{ url: socialImageUrl, width: 1731, height: 909, alt: `${brandName}泰國佛牌與收藏品` }] } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: `${brandName}｜泰國佛牌與收藏品`,
    description: "提供泰國佛牌與相關收藏品資訊、文化文章與選購說明。",
    ...(socialImageUrl ? { images: [socialImageUrl] } : {}),
  },
  robots: { index: siteIndexable, follow: siteIndexable },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW" style={themeVariables}><body>{children}</body></html>;
}
