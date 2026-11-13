"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  safeInternalNavigationHref,
  type PrimaryNavigationItem,
  type SiteIdentitySettings,
} from "../shared/site-settings";
import styles from "./public-chrome.module.css";
import { useLiveSiteAppearance } from "./use-live-site-appearance";

function safeFooterNavigation(
  value: readonly PrimaryNavigationItem[] | undefined,
  fallback: readonly PrimaryNavigationItem[],
) {
  if (!value || value.length < 2 || value.length > 6) return fallback;
  const links = value.flatMap((item) => {
    const href = safeInternalNavigationHref(item.href);
    const label = typeof item.label === "string" ? item.label.trim() : "";
    return href && label && label.length <= 30 ? [{ href, label }] : [];
  });
  const hrefs = new Set(links.map((link) => link.href));
  const hasHome = links.some((link) => link.href === "/" || link.href === "/#hero" || link.href === "#hero");
  const hasProducts = links.some((link) => link.href === "/#products" || link.href === "#products");
  return links.length === value.length && hrefs.size === links.length && hasHome && hasProducts ? links : fallback;
}

export default function PublicFooter({
  note,
  brandName,
  brandSubtitle,
  brandMark,
  primaryNavigation,
  settings: settingsOverride,
}: {
  note?: ReactNode;
  brandName?: string;
  brandSubtitle?: string;
  brandMark?: string;
  primaryNavigation?: readonly PrimaryNavigationItem[];
  settings?: Partial<SiteIdentitySettings>;
}) {
  const { appearance } = useLiveSiteAppearance();
  const settings: SiteIdentitySettings = {
    ...appearance.settings,
    ...settingsOverride,
  };
  const resolvedBrandName = brandName ?? settings.brandName;
  const resolvedBrandSubtitle = brandSubtitle ?? settings.brandSubtitle;
  const resolvedBrandMark = brandMark ?? (Array.from(settings.brandName)[0] || "T");
  const mainLinks = safeFooterNavigation(
    primaryNavigation ?? settings.primaryNavigation,
    appearance.settings.primaryNavigation,
  );
  const navigationSplit = Math.ceil(mainLinks.length / 2);
  const mainLinkNodes = mainLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>);
  const contactLines = [
    settings.businessLegalName,
    settings.contactPhone ? `電話 ${settings.contactPhone}` : "",
    settings.contactEmail ? `Email ${settings.contactEmail}` : "",
    settings.contactHours ? `服務時間 ${settings.contactHours}` : "",
  ].filter(Boolean);

  return <footer className={styles.footer}>
    <div className={styles.footerBrand}>
      <Link className={styles.brand} href="/" aria-label={`${resolvedBrandName}首頁`}>
        <span className={styles.footerBrandMark} aria-hidden="true">{resolvedBrandMark}</span>
        <span className={styles.brandCopy}><b>{resolvedBrandName}</b><small>{resolvedBrandSubtitle}</small></span>
      </Link>
      <p>泰國佛牌與相關收藏品。<br />提供商品資訊、文化文章與選購說明。</p>
      {contactLines.length > 0 ? (
        <p className={styles.footerContact}>{contactLines.join(" · ")}</p>
      ) : (
        <p className={styles.footerContact}>客服窗口將於正式開放訂購前公布。</p>
      )}
    </div>
    <nav className={styles.footerLinks} aria-label="頁尾導覽">
      <div><b>主要導覽</b>{mainLinkNodes.slice(0, navigationSplit)}</div>
      <div><b>更多連結</b>{mainLinkNodes.slice(navigationSplit)}</div>
      <div><b>服務</b><Link href="/service/shipping/">配送與付款</Link><Link href="/service/returns/">退換貨說明</Link><Link href="/service/contact/">聯絡客服</Link><Link href="/service/privacy/">隱私權政策</Link></div>
    </nav>
    <div className={styles.footerBottom}>
      <span>© 2026 {resolvedBrandName}</span>
      <span>{note || settings.footerNote}</span>
    </div>
  </footer>;
}
