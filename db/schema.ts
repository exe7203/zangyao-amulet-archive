import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("zh-Hant-TW"),
  currency: text("currency").notNull().default("TWD"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    contentJson: text("content_json").notNull(),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull().default(""),
    ogImageUrl: text("og_image_url").notNull().default(""),
    noindex: integer("noindex", { mode: "boolean" }).notNull().default(false),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("articles_site_slug_unique").on(table.siteId, table.slug),
  ],
);

export const articleRevisions = sqliteTable("article_revisions", {
  id: text("id").primaryKey(),
  articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().default(""),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  contentJson: text("content_json").notNull(),
  seoTitle: text("seo_title").notNull().default(""),
  seoDescription: text("seo_description").notNull().default(""),
  canonicalUrl: text("canonical_url").notNull().default(""),
  ogImageUrl: text("og_image_url").notNull().default(""),
  noindex: integer("noindex", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull(),
  savedBy: text("saved_by").notNull().default("local-preview"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
