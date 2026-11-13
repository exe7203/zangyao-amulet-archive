import type { Metadata } from "next";
import PageLiveView from "./page-live-view";
import {
  getPublishedPage,
  publishedPages,
} from "../../../shared/published-content";
import { publishedBrandName } from "../../../shared/published-site";
import styles from "./page.module.css";
import { serializeJsonLd } from "../../../shared/json-ld";
import { isPublishedPageIndexable } from "../../../shared/seo-indexing";
import PublicFooter from "../../public-footer";
import PublicHeader from "../../public-header";
import { resolveSiteUrl } from "../../../shared/site-url";

type PageProps = { params: Promise<{ slug: string }> };

const resolvedSite = resolveSiteUrl();
const publicSiteUrl = resolvedSite.publicUrl;

function publicUrl(path: string) {
  return publicSiteUrl ? new URL(path.replace(/^\/+/, ""), publicSiteUrl).toString() : null;
}

function absoluteUrl(value: string, fallbackPath: string) {
  if (!publicSiteUrl) return null;
  try {
    return new URL(value || fallbackPath, publicSiteUrl).toString();
  } catch {
    return publicUrl(fallbackPath);
  }
}

// Snapshot pages stay prerendered for SEO. Newly published D1 slugs resolve
// at Worker runtime via dynamicParams + PageLiveView.
export function generateStaticParams() {
  return publishedPages.map((page) => ({ slug: page.slug }));
}

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublishedPage(slug);
  if (!page) {
    return {
      title: "頁面",
      robots: { index: false, follow: false },
    };
  }

  const canonical = absoluteUrl(page.canonicalUrl, `pages/${page.slug}/`);
  const image = absoluteUrl(page.ogImageUrl, "og.png");
  const title = page.seoTitle || page.title;

  return {
    title: { absolute: title.includes(publishedBrandName) ? title : `${title}｜${publishedBrandName}` },
    description: page.seoDescription,
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: { index: resolvedSite.indexable && isPublishedPageIndexable(page), follow: resolvedSite.indexable },
    openGraph: {
      type: "website",
      locale: "zh_TW",
      siteName: publishedBrandName,
      ...(canonical ? { url: canonical } : {}),
      title,
      description: page.seoDescription,
      ...(image ? { images: [{ url: image, alt: page.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.seoDescription,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PublishedPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPublishedPage(slug) ?? null;

  const canonical = page ? absoluteUrl(page.canonicalUrl, `pages/${page.slug}/`) : null;
  const faqItems = page
    ? page.data.content
      .filter((block) => block.type === "FAQ" && Array.isArray(block.props.items))
      .flatMap((block) => block.props.items as Array<{ question?: unknown; answer?: unknown }>)
      .filter((item) => typeof item.question === "string" && typeof item.answer === "string")
      .map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      }))
    : [];
  const graph: Record<string, unknown>[] = page && canonical && publicSiteUrl ? [
    {
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: page.seoTitle || page.title,
      description: page.seoDescription,
      inLanguage: "zh-Hant-TW",
      datePublished: page.publishedAt || page.createdAt,
      dateModified: page.updatedAt,
      isPartOf: { "@type": "WebSite", name: publishedBrandName, url: publicSiteUrl.toString() },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: publicSiteUrl.toString() },
        { "@type": "ListItem", position: 2, name: page.title, item: canonical },
      ],
    },
  ] : [];
  if (graph.length > 0 && faqItems.length > 0) {
    graph.push({ "@type": "FAQPage", mainEntity: faqItems });
  }

  return <div className={styles.page}>
    {graph.length > 0 && (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@graph": graph }) }}
      />
    )}
    <PublicHeader section="page" />
    <main id="main-content">
      <PageLiveView slug={slug} initialPage={page} />
    </main>
    <PublicFooter />
  </div>;
}
