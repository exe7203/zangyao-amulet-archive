import type { MetadataRoute } from "next";
import { fallbackArticles } from "./article-data";
import { products } from "./data";
import { publishedPages } from "../shared/published-content";
import {
  isPublishedArticleIndexable,
  isPublishedPageIndexable,
  isStaticPathIndexable,
} from "../shared/seo-indexing";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
  const hasMatchingCanonical = (configured: string, path: string) => {
    if (!configured) return true;
    try {
      const expected = new URL(path, siteUrl);
      const canonical = new URL(configured, siteUrl);
      canonical.hash = "";
      expected.hash = "";
      return canonical.toString() === expected.toString();
    } catch {
      return false;
    }
  };
  const entry = (
    path: string,
    priority: number,
    changeFrequency: "weekly" | "monthly" | "yearly",
    lastModified?: string | null,
  ) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
  });
  const staticRoutes = [
    ["", 1, "weekly"],
    ["about/", 0.6, "yearly"],
    ["articles/", 0.8, "weekly"],
    ["service/shipping/", 0.5, "yearly"],
    ["service/returns/", 0.5, "yearly"],
    ["service/contact/", 0.5, "yearly"],
    ["service/privacy/", 0.4, "yearly"],
  ] as const;
  const baseEntries: MetadataRoute.Sitemap = [
    ...staticRoutes
      .filter(([path]) => isStaticPathIndexable(path))
      .map(([path, priority, frequency]) => entry(path, priority, frequency)),
    ...publishedPages
      .filter((page) => isPublishedPageIndexable(page) && hasMatchingCanonical(page.canonicalUrl, `pages/${page.slug}/`))
      .map((page) => entry(`pages/${page.slug}/`, 0.65, "monthly", page.updatedAt)),
    ...fallbackArticles
      .filter((article) => isPublishedArticleIndexable(article) && hasMatchingCanonical(article.canonicalUrl, `articles/${article.slug}/`))
      .map((article) => entry(`articles/${article.slug}/`, 0.75, "monthly", article.updatedAt)),
  ];
  if (process.env.NEXT_PUBLIC_CATALOG_VERIFIED === "1") {
    baseEntries.push(...products
      .filter((product) => ["active", "sold_out"].includes(product.status) && product.seoReady === true)
      .map((product) => entry(`products/${product.slug}/`, 0.8, "weekly", product.updatedAt || null)));
  }
  return baseEntries;
}
