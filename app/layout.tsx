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
  title: { default: `${brandName}｜泰國佛牌與聖物收藏`, template: `%s｜${brandName}` },
  description: "來源可讀，收藏可久。以完整來源紀錄與文化導讀，認識泰國佛牌與聖物。",
  keywords: ["泰國佛牌", "佛牌收藏", "泰國聖物", "佛牌來源", "佛牌台灣"],
  alternates: { canonical: siteUrl.toString() },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    siteName: brandName,
    url: siteUrl.toString(),
    title: `${brandName}｜來源可讀，收藏可久`,
    description: "以來源紀錄、實物影像與文化導讀為核心的泰國佛牌選物。",
    images: [{ url: socialImageUrl, width: 1731, height: 909, alt: `${brandName}佛牌收藏品牌視覺` }],
  },
  twitter: { card: "summary_large_image", title: `${brandName}｜來源可讀，收藏可久`, description: "以來源紀錄與文化導讀為核心的泰國佛牌選物。", images: [socialImageUrl] },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant-TW" style={themeVariables}><body>{children}</body></html>;
}
