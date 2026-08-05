import type { Metadata } from "next";
import Link from "next/link";
import { fallbackArticles } from "../article-data";
import { publishedBrandName } from "../../shared/published-site";
import styles from "./articles-index.module.css";
import { serializeJsonLd } from "../../shared/json-ld";
import PublicFooter from "../public-footer";
import PublicHeader from "../public-header";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
const canonical = new URL("articles/", siteUrl).toString();
const journalName = `${publishedBrandName}佛牌專欄`;

export const metadata: Metadata = {
  title: { absolute: `佛牌知識與收藏指南｜${publishedBrandName}` },
  description: `${publishedBrandName}提供佛牌年份、材質、來源、保存與外殼保養等實用資訊，方便讀者查閱與比較。`,
  alternates: { canonical },
  openGraph: {
    type: "website",
    url: canonical,
    title: `佛牌知識與收藏指南｜${publishedBrandName}`,
    description: "提供佛牌年份、材質、來源、保存與外殼保養等實用資訊。",
    images: [{ url: new URL("og.png", siteUrl).toString(), alt: `${publishedBrandName}佛牌知識與收藏指南` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `佛牌知識與收藏指南｜${publishedBrandName}`,
    description: "提供佛牌年份、材質、來源、保存與外殼保養等實用資訊。",
    images: [new URL("og.png", siteUrl).toString()],
  },
};

export default function ArticlesIndexPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#collection`,
        name: journalName,
        description: String(metadata.description),
        url: canonical,
        inLanguage: "zh-Hant-TW",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: fallbackArticles.map((article, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: article.title,
            url: new URL(`articles/${article.slug}/`, siteUrl).toString(),
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首頁", item: siteUrl.toString() },
          { "@type": "ListItem", position: 2, name: "佛牌專欄", item: canonical },
        ],
      },
    ],
  };

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <PublicHeader section="journal" contextLinks={[{ href: "/#journal", label: "返回首頁 →" }]} />
      <main className={styles.shell} id="main-content">
        <nav className={styles.breadcrumb} aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><span aria-current="page">佛牌專欄</span></nav>
        <header className={styles.intro}>
          <p>佛牌知識</p>
          <h1>{journalName}</h1>
          <span>提供年份、材質、來源與保存方式等入門資訊，方便讀者查閱與比較。</span>
        </header>
        <section className={styles.grid} aria-label="佛牌文章">
          {fallbackArticles.map((article, index) => (
            <article key={article.id}>
              <p>{String(index + 1).padStart(2, "0")} · {article.tag}</p>
              <h2><Link href={`/articles/${article.slug}/`}>{article.title}</Link></h2>
              <span>{article.excerpt}</span>
              <small>{article.time}</small>
            </article>
          ))}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
