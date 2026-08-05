import Link from "next/link";
import type { ReactNode } from "react";
import { publishedBrandName } from "../shared/published-site";
import { serializeJsonLd } from "../shared/json-ld";
import PublicFooter from "./public-footer";
import PublicHeader from "./public-header";
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <PublicHeader section="info" contextLinks={[{ href: "/", label: "返回典藏首頁 →" }]} />
      <main id="main-content">
        <article className={styles.article}>
          <nav aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><span aria-current="page">{title}</span></nav>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <div className={styles.content}>{children}</div>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
