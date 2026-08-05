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
      <p>泰國佛牌與相關收藏品。<br />提供商品資訊、文化文章與選購說明。</p>
    </div>
    <nav className={styles.footerLinks} aria-label="頁尾導覽">
      <div><b>商品</b><Link href="/#new">最新商品</Link><Link href="/#collections">商品分類</Link><Link href="/#archive">商品資訊說明</Link></div>
      <div><b>關於</b><Link href="/about/">關於{publishedBrandName}</Link><Link href="/articles/">佛牌專欄</Link></div>
      <div><b>服務</b><Link href="/service/shipping/">配送與付款</Link><Link href="/service/returns/">退換貨說明</Link><Link href="/service/privacy/">隱私權政策</Link></div>
    </nav>
    <div className={styles.footerBottom}>
      <span>© 2026 {publishedBrandName}</span>
      <span>{note || publishedSiteAppearance.settings.footerNote}</span>
    </div>
  </footer>;
}
