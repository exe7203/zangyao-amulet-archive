import type { Metadata } from "next";
import Link from "next/link";
import { fallbackArticles } from "../article-data";
import styles from "./articles-index.module.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
const canonical = new URL("articles/", siteUrl).toString();

export const metadata: Metadata = {
  title: { absolute: "泰國佛牌收藏誌｜泰聚達" },
  description: "泰聚達收藏誌整理泰國佛牌年份、材質、來源、外殼保養與收藏履歷，從可以查證的資料開始認識佛牌文化。",
  alternates: { canonical },
  openGraph: {
    type: "website",
    url: canonical,
    title: "泰國佛牌收藏誌｜泰聚達",
    description: "從年份、材質、來源與保存紀錄開始認識泰國佛牌收藏。",
    images: [{ url: new URL("og.png", siteUrl).toString(), alt: "泰聚達泰國佛牌收藏誌" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "泰國佛牌收藏誌｜泰聚達",
    description: "從年份、材質、來源與保存紀錄開始認識泰國佛牌收藏。",
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
        name: "泰聚達收藏誌",
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
          { "@type": "ListItem", position: 2, name: "收藏誌", item: canonical },
        ],
      },
    ],
  };

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span>泰</span><b>泰聚達</b></Link>
        <Link href="/#journal">返回首頁 →</Link>
      </header>
      <main className={styles.shell}>
        <nav className={styles.breadcrumb} aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><span aria-current="page">收藏誌</span></nav>
        <header className={styles.intro}>
          <p>THE JOURNAL</p>
          <h1>泰聚達收藏誌</h1>
          <span>從可以查證的年份、材質、來源與保存紀錄開始，慢慢建立自己的收藏判斷。</span>
        </header>
        <section className={styles.grid} aria-label="收藏文章">
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
      <footer className={styles.footer}><span>© 2026 泰聚達</span><Link href="/service/contact/">聯絡與訂單協助</Link></footer>
    </div>
  );
}

