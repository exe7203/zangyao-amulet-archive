import type { MetadataRoute } from "next";
import { fallbackArticles } from "./article-data";
import { products } from "./data";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
  const entry = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly") => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency,
    priority,
  });
  const baseEntries: MetadataRoute.Sitemap = [
    entry("", 1, "weekly"),
    entry("about/", 0.6, "yearly"),
    entry("service/shipping/", 0.5, "yearly"),
    entry("service/returns/", 0.5, "yearly"),
    entry("service/contact/", 0.5, "yearly"),
    ...fallbackArticles.filter((article) => !article.noindex).map((article) => entry(`articles/${article.slug}/`, 0.75, "monthly")),
  ];
  if (process.env.NEXT_PUBLIC_CATALOG_VERIFIED === "1") {
    baseEntries.push(...products.filter((product) => product.status === "active").map((product) => entry(`products/${product.slug}/`, 0.8, "weekly")));
  }
  return baseEntries;
}
