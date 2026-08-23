import Link from "next/link";
import type { ReactNode } from "react";
import { publishedBrandName } from "../shared/published-site";
import { serializeJsonLd } from "../shared/json-ld";
import PublicFooter from "./public-footer";
import PublicHeader from "./public-header";
import styles from "./info-page.module.css";
import { resolveSiteUrl } from "../shared/site-url";

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
  const publicSiteUrl = resolveSiteUrl().publicUrl;
  const canonical = publicSiteUrl
    ? new URL(path.replace(/^\/+/, ""), publicSiteUrl).toString()
    : null;
  const structuredData = canonical && publicSiteUrl ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonical,
        url: canonical,
        name: title,
        description: intro,
        inLanguage: "zh-Hant-TW",
        isPartOf: { "@type": "WebSite", name: publishedBrandName, url: publicSiteUrl.toString() },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: publicSiteUrl.toString() },
          { "@type": "ListItem", position: 2, name: title, item: canonical },
        ],
      },
    ],
  } : null;
  return (
    <div className={styles.page}>
      {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />}
      <PublicHeader section="info" contextLinks={[{ href: "/", label: "返回首頁 →" }]} />
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
