"use client";

import type { PageRecord } from "../../site-builder/types";
import { normalizePageSlug, PAGE_SEO_PUBLISH_REQUIREMENTS } from "../../site-builder/validation";
import { SafePublicImage } from "../../product-artwork";
import { ADMIN_IMAGE_URL_MAX_LENGTH } from "../image-field-contract";
import styles from "./site-editor.module.css";

export function PageSettings({
  draft,
  pageCanonicalError,
  pageOgImageError,
  seoChecks,
  seoPassCount,
  onUpdate,
  onTitleChange,
}: {
  draft: PageRecord;
  pageCanonicalError: string | null;
  pageOgImageError: string | null;
  seoChecks: Array<{ label: string; pass: boolean }>;
  seoPassCount: number;
  onUpdate: <Key extends keyof PageRecord>(key: Key, value: PageRecord[Key]) => void;
  onTitleChange: (title: string) => void;
}) {
  return (
    <div className={styles.settingsPanel}>
      <div className={styles.basicFields}>
        <label>
          <span>頁面名稱</span>
          <input
            value={draft.title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="系列或專題名稱"
          />
        </label>
        <label>
          <span>頁面網址</span>
          <div className={styles.slugField}>
            <small>/pages/</small>
            <input
              value={draft.slug}
              onChange={(event) => onUpdate("slug", normalizePageSlug(event.target.value))}
              placeholder="page-slug"
            />
            <small>/</small>
          </div>
        </label>
        <label>
          <span>
            SEO 標題 <small>{draft.seoTitle.length}/60</small>
          </span>
          <input
            value={draft.seoTitle}
            onChange={(event) => onUpdate("seoTitle", event.target.value)}
            placeholder="搜尋結果顯示的標題"
          />
        </label>
        <label>
          <span>
            Meta 描述 <small>{draft.seoDescription.length}/160</small>
          </span>
          <textarea
            rows={3}
            value={draft.seoDescription}
            onChange={(event) => onUpdate("seoDescription", event.target.value)}
            placeholder="用一段話說明這頁能解決什麼問題"
          />
        </label>
        <label>
          <span>
            Canonical URL <small>{draft.canonicalUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small>
          </span>
          <input
            type="url"
            value={draft.canonicalUrl}
            maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
            aria-invalid={Boolean(pageCanonicalError)}
            onChange={(event) => onUpdate("canonicalUrl", event.target.value)}
            placeholder="https://example.com/pages/.../"
          />
          {pageCanonicalError && (
            <small className={styles.fieldError} role="status">
              {pageCanonicalError}
            </small>
          )}
        </label>
        <label>
          <span>
            社群圖片 URL <small>{draft.ogImageUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small>
          </span>
          <input
            type="url"
            value={draft.ogImageUrl}
            maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
            aria-invalid={Boolean(pageOgImageError)}
            onChange={(event) => onUpdate("ogImageUrl", event.target.value)}
            placeholder="https://example.com/og/page.jpg"
          />
          {pageOgImageError && (
            <small className={styles.fieldError} role="status">
              {pageOgImageError}
            </small>
          )}
        </label>
        <div className={styles.ogImagePreview}>
          <SafePublicImage
            src={draft.ogImageUrl}
            alt={`${draft.title || "自訂頁面"}社群圖片預覽`}
            fallback={
              <span role="img" aria-label="社群圖片尚未設定或無法載入">
                社群圖片尚未設定或無法載入
              </span>
            }
          />
        </div>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={draft.noindex}
            onChange={(event) => onUpdate("noindex", event.target.checked)}
          />
          <span>
            <b>禁止搜尋引擎收錄</b>
            <small>測試頁、短期活動或未完成內容可暫時開啟。</small>
          </span>
        </label>
      </div>
      <aside className={styles.seoReadiness}>
        <div>
          <span>SEO READINESS</span>
          <b>
            {seoPassCount}/{seoChecks.length}
          </b>
        </div>
        <ul>
          {seoChecks.map((check) => (
            <li className={check.pass ? styles.checkPass : ""} key={check.label}>
              <i>{check.pass ? "✓" : "○"}</i>
              {check.label}
            </li>
          ))}
        </ul>
        {draft.noindex && <p>目前已設定 noindex，這一頁不會進入 sitemap。</p>}
        <p>
          發布門檻：摘要／標題／描述需達 {PAGE_SEO_PUBLISH_REQUIREMENTS.seoTitleLength}/
          {PAGE_SEO_PUBLISH_REQUIREMENTS.seoDescriptionLength} 字級要求。
        </p>
      </aside>
    </div>
  );
}
