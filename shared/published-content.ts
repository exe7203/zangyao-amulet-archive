import snapshotJson from "../content/published-site.json";
import type { Product } from "./catalog";

export type PublishedPage = {
  id: string;
  slug: string;
  title: string;
  data: {
    root: { props?: Record<string, unknown> };
    content: Array<{ type: string; props: Record<string, unknown> }>;
  };
  status: "published";
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  noindex: boolean;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishedArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentJson: Record<string, unknown>;
  status: "published";
  publishedAt: string | null;
  updatedAt: string | null;
  tag: string;
  time?: string;
  art?: "paper" | "case" | "stamp";
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  heroImageUrl: string;
  heroImageAlt: string;
  noindex: boolean;
  keywords: string[];
  version: number;
};

type PublishedSnapshot = {
  schemaVersion: 1;
  exportedAt: string;
  snapshotHash: string;
  site: {
    id: string;
    code: string;
    name: string;
    locale: string;
    currency: string;
  };
  siteSettings: {
    settings: Record<string, unknown>;
    theme: Record<string, unknown>;
    version: number;
    updatedAt: string;
  };
  pages: PublishedPage[];
  articles: PublishedArticle[];
  products: Product[];
};

export const publishedSnapshot = snapshotJson as unknown as PublishedSnapshot;
export const publishedPages = publishedSnapshot.pages;
export const publishedArticles = publishedSnapshot.articles;
export const publishedProducts = publishedSnapshot.products;

export function getPublishedPage(slug: string) {
  return publishedPages.find((page) => page.slug === slug);
}

export function getPublishedArticle(slug: string) {
  return publishedArticles.find((article) => article.slug === slug);
}

export function getPublishedProduct(slug: string) {
  return publishedProducts.find((product) => product.slug === slug);
}

