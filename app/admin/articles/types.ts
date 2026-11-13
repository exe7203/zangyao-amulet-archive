import type { JSONContent } from "@tiptap/core";

export type ArticleDocument = JSONContent;

export type ArticleStatus = "draft" | "published" | "archived";
export type ArticleFilter = "all" | ArticleStatus;
export type InspectorTab = "publish" | "seo" | "media" | "history";

export type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentJson: ArticleDocument;
  status: ArticleStatus;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  tag: string;
  keywords: string[];
  heroImageUrl: string;
  heroImageAlt: string;
  noindex: boolean;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Draft = Omit<Article, "id" | "publishedAt" | "createdAt" | "updatedAt"> & {
  id: string | null;
};

export type ArticleRevision = {
  revisionId: string;
  articleId: string;
  title: string;
  status: ArticleStatus;
  version: number;
  createdAt: string;
};

export type ArticleListPagination = {
  page: number;
  limit: number;
  maxLimit: number;
  total: number;
  totalPages: number;
  returned: number;
};

export type ArticleListSelection = "initial" | "preserve" | "force";

export type ArticleListOptions = {
  query?: string;
  status?: ArticleFilter;
  page?: number;
  preferredId?: string;
  selection?: ArticleListSelection;
};

export const INSPECTOR_TABS: InspectorTab[] = ["publish", "seo", "media", "history"];

export const EMPTY_DOCUMENT: ArticleDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const EMPTY_ARTICLE_PAGINATION: ArticleListPagination = {
  page: 1,
  limit: 40,
  maxLimit: 100,
  total: 0,
  totalPages: 0,
  returned: 0,
};
