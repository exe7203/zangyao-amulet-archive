import Link from "next/link";
import type { ReactNode } from "react";
import {
  publishedBrandMark,
  publishedBrandName,
  publishedBrandSubtitle,
  publishedSiteAppearance,
} from "../shared/published-site";
import styles from "./public-chrome.module.css";

export default function PublicFooter({ note }: { note?: ReactNode }) {
  return <footer className={styles.footer}>
    <div className={styles.footerBrand}>
      <Link className={styles.brand} href="/" aria-label={`${publishedBrandName}首頁`}>
        <span className={styles.footerBrandMark} aria-hidden="true">{publishedBrandMark}</span>
        <span className={styles.brandCopy}><b>{publishedBrandName}</b><small>{publishedBrandSubtitle}</small></span>
      </Link>
      <p>來源可讀，收藏可久。<br />從文化、工藝與紀錄開始認識泰國佛牌。</p>
    </div>
    <nav className={styles.footerLinks} aria-label="頁尾導覽">
      <div><b>典藏</b><Link href="/#new">本週新藏</Link><Link href="/#collections">佛牌與聖物</Link><Link href="/#archive">來源履歷</Link></div>
      <div><b>認識</b><Link href="/pages/brand-story/">品牌故事</Link><Link href="/articles/">收藏誌</Link><Link href="/about/">關於{publishedBrandName}</Link></div>
      <div><b>服務</b><Link href="/service/shipping/">配送與付款</Link><Link href="/service/returns/">退換貨說明</Link><Link href="/service/privacy/">隱私說明</Link><Link href="/service/contact/">聯絡我們</Link></div>
    </nav>
    <div className={styles.footerBottom}>
      <span>© 2026 {publishedBrandName}</span>
      <span>{note || publishedSiteAppearance.settings.footerNote}</span>
    </div>
  </footer>;
}
