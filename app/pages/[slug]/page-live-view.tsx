"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  publishedArticles,
  publishedProducts,
  type PublishedPage,
} from "../../../shared/published-content";
import { publicContentPagePath } from "../../../shared/admin/api-paths";
import { PUBLIC_SITE_CODE } from "../../../shared/site-context";
import PageRenderer from "../../site-builder/page-renderer";
import { validatePageData } from "../../site-builder/validation";
import styles from "./page.module.css";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSafeSlug(value: string): boolean {
  return /^[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u.test(value);
}

export function normalizePublishedPage(value: unknown): PublishedPage | null {
  if (!isRecord(value) || value.status !== "published") return null;
  const title = cleanString(value.title);
  const slug = cleanString(value.slug);
  if (!title || !isSafeSlug(slug)) return null;
  const dataResult = validatePageData(value.data);
  if (!dataResult.ok) return null;

  return {
    id: cleanString(value.id) || `page-${slug}`,
    slug,
    title,
    data: {
      root: dataResult.data.root,
      content: dataResult.data.content as PublishedPage["data"]["content"],
    },
    status: "published",
    seoTitle: cleanString(value.seoTitle),
    seoDescription: cleanString(value.seoDescription),
    canonicalUrl: cleanString(value.canonicalUrl),
    ogImageUrl: cleanString(value.ogImageUrl),
    noindex: value.noindex === true,
    version: Number.isSafeInteger(value.version) ? Number(value.version) : 1,
    publishedAt: cleanString(value.publishedAt) || null,
    createdAt: cleanString(value.createdAt),
    updatedAt: cleanString(value.updatedAt),
  };
}

export default function PageLiveView({
  slug,
  initialPage,
}: {
  slug: string;
  initialPage: PublishedPage | null;
}) {
  const [page, setPage] = useState<PublishedPage | null>(initialPage);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    initialPage ? "ready" : "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(publicContentPagePath(PUBLIC_SITE_CODE, slug), {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const isJsonApiResponse = response.headers.get("content-type")?.toLowerCase().includes("application/json");
        if (response.status === 404 && isJsonApiResponse) {
          setPage(null);
          setState("unavailable");
          return;
        }
        if (!response.ok) {
          setState(initialPage ? "ready" : "unavailable");
          return;
        }
        const payload = await response.json() as { page?: unknown };
        const livePage = normalizePublishedPage(payload.page);
        if (!livePage || livePage.slug !== slug) {
          setState(initialPage ? "ready" : "unavailable");
          return;
        }
        setPage(livePage);
        setState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState(initialPage ? "ready" : "unavailable");
      }
    }
    void load();
    return () => controller.abort();
  }, [initialPage, slug]);

  if (state === "loading") {
    return (
      <section className={styles.state} role="status">
        <p>正在載入頁面…</p>
      </section>
    );
  }

  if (!page) {
    return (
      <section className={styles.state}>
        <h1>找不到這個頁面</h1>
        <p>頁面可能尚未發布，或網址已變更。</p>
        <Link href="/">返回首頁 →</Link>
      </section>
    );
  }

  return (
    <>
      <nav className={styles.breadcrumb} aria-label="麵包屑">
        <Link href="/">首頁</Link><span>/</span><span aria-current="page">{page.title}</span>
      </nav>
      <PageRenderer data={page.data} products={publishedProducts} articles={publishedArticles} />
    </>
  );
}
