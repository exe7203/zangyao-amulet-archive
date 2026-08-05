import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageRenderer from "../../site-builder/page-renderer";
import {
  getPublishedPage,
  publishedArticles,
  publishedPages,
  publishedProducts,
} from "../../../shared/published-content";
import { publishedBrandName } from "../../../shared/published-site";
import styles from "./page.module.css";
import { serializeJsonLd } from "../../../shared/json-ld";
import { isPublishedPageIndexable } from "../../../shared/seo-indexing";
import PublicFooter from "../../public-footer";
import PublicHeader from "../../public-header";

type PageProps = { params: Promise<{ slug: string }> };

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");

function publicUrl(path: string) {
  return new URL(path.replace(/^\/+/, ""), siteUrl).toString();
}

function absoluteUrl(value: string, fallbackPath: string) {
  try {
    return new URL(value || fallbackPath, siteUrl).toString();
  } catch {
    return publicUrl(fallbackPath);
  }
}

export function generateStaticParams() {
  return publishedPages.map((page) => ({ slug: page.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublishedPage(slug);
  if (!page) return { title: "找不到頁面", robots: { index: false, follow: false } };

  const canonical = absoluteUrl(page.canonicalUrl, `pages/${page.slug}/`);
  const image = absoluteUrl(page.ogImageUrl, "og.png");
  const title = page.seoTitle || page.title;

  return {
    title: { absolute: title.includes(publishedBrandName) ? title : `${title}｜${publishedBrandName}` },
    description: page.seoDescription,
    alternates: { canonical },
    robots: { index: isPublishedPageIndexable(page), follow: true },
    openGraph: {
      type: "website",
      locale: "zh_TW",
      siteName: publishedBrandName,
      url: canonical,
      title,
      description: page.seoDescription,
      images: [{ url: image, alt: page.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.seoDescription,
      images: [image],
    },
  };
}

export default async function PublishedPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPublishedPage(slug);
  if (!page) notFound();

  const canonical = absoluteUrl(page.canonicalUrl, `pages/${page.slug}/`);
  const faqItems = page.data.content
    .filter((block) => block.type === "FAQ" && Array.isArray(block.props.items))
    .flatMap((block) => block.props.items as Array<{ question?: unknown; answer?: unknown }>)
    .filter((item) => typeof item.question === "string" && typeof item.answer === "string")
    .map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    }));
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: page.seoTitle || page.title,
      description: page.seoDescription,
      inLanguage: "zh-Hant-TW",
      datePublished: page.publishedAt || page.createdAt,
      dateModified: page.updatedAt,
      isPartOf: { "@type": "WebSite", name: publishedBrandName, url: siteUrl.toString() },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: siteUrl.toString() },
        { "@type": "ListItem", position: 2, name: page.title, item: canonical },
      ],
    },
  ];
  if (faqItems.length > 0) graph.push({ "@type": "FAQPage", mainEntity: faqItems });

  return <div className={styles.page}>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@graph": graph }) }}
    />
    <PublicHeader section="page" />
    <main id="main-content">
      <nav className={styles.breadcrumb} aria-label="麵包屑">
        <Link href="/">首頁</Link><span>/</span><span aria-current="page">{page.title}</span>
      </nav>
      <PageRenderer data={page.data} products={publishedProducts} articles={publishedArticles} />
    </main>
    <PublicFooter />
  </div>;
}
