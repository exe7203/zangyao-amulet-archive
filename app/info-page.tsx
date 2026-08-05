import Link from "next/link";
import type { ReactNode } from "react";
import { publishedBrandMark, publishedBrandName } from "../shared/published-site";
import { serializeJsonLd } from "../shared/json-ld";
import DeviceCartLink from "./device-cart-link";
import styles from "./info-page.module.css";

export default function InfoPage({
  eyebrow,
  title,
  intro,
  path,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  path: string;
  children: ReactNode;
}) {
  const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
  const canonical = new URL(path.replace(/^\/+/, ""), siteUrl).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonical,
        url: canonical,
        name: title,
        description: intro,
        inLanguage: "zh-Hant-TW",
        isPartOf: { "@type": "WebSite", name: publishedBrandName, url: siteUrl.toString() },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: siteUrl.toString() },
          { "@type": "ListItem", position: 2, name: title, item: canonical },
        ],
      },
    ],
  };
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">跳至主要內容</a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span>{publishedBrandMark}</span><b>{publishedBrandName}</b></Link>
        <nav className={styles.utilities} aria-label="網站工具"><DeviceCartLink /><Link href="/">返回典藏首頁 →</Link></nav>
      </header>
      <main id="main-content">
        <article className={styles.article}>
          <nav aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><span aria-current="page">{title}</span></nav>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <div className={styles.content}>{children}</div>
        </article>
      </main>
      <footer className={styles.footer}><span>© 2026 {publishedBrandName}</span><Link href="/service/contact/">聯絡與訂單協助</Link></footer>
    </div>
  );
}
