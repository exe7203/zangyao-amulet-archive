"use client";

import { FileText, Globe2, History, Image as ImageIcon } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ARTICLE_PUBLISH_REQUIREMENTS,
  evaluateArticlePublishReadiness,
} from "../../../lib/article-content-contract";
import {
  ADMIN_IMAGE_ALT_MAX_LENGTH,
  ADMIN_IMAGE_URL_MAX_LENGTH,
} from "../image-field-contract";
import { ArticleMediaPreview } from "./article-image-extension";
import type { Article, ArticleRevision, Draft, InspectorTab } from "./types";
import { INSPECTOR_TABS } from "./types";
import { formatUpdatedAt, slugify } from "./helpers";
import editorStyles from "../admin.module.css";

export function ArticleInspector({
  draft,
  selectedArticle,
  inspectorTab,
  revisions,
  revisionsLoading,
  saving,
  heroImageError,
  ogImageError,
  canonicalUrlError,
  publishReadiness,
  onTab,
  onUpdate,
  onLoadRevisions,
  onRestoreRevision,
}: {
  draft: Draft;
  selectedArticle: Article | undefined;
  inspectorTab: InspectorTab;
  revisions: ArticleRevision[];
  revisionsLoading: boolean;
  saving: boolean;
  heroImageError: string | null;
  ogImageError: string | null;
  canonicalUrlError: string | null;
  publishReadiness: ReturnType<typeof evaluateArticlePublishReadiness>;
  onTab: (tab: InspectorTab) => void;
  onUpdate: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  onLoadRevisions: () => void;
  onRestoreRevision: (revision: ArticleRevision) => void;
}) {
  const seoTitle = draft.seoTitle || draft.title || "文章標題";
  const seoDescription = draft.seoDescription || draft.excerpt || "文章摘要會顯示在這裡。";
  const articlePath = `/articles/${slugify(draft.slug || draft.title) || "article-slug"}/`;
  const seoChecks = [
    { label: "標題", pass: Boolean(draft.title.trim()) },
    { label: "固定網址", pass: Boolean(draft.slug.trim()) },
    { label: `摘要至少 ${ARTICLE_PUBLISH_REQUIREMENTS.excerptLength} 字`, pass: publishReadiness.excerptReady },
    { label: `SEO 標題至少 ${ARTICLE_PUBLISH_REQUIREMENTS.seoTitleLength} 字`, pass: publishReadiness.seoTitleReady },
    {
      label: `SEO 描述至少 ${ARTICLE_PUBLISH_REQUIREMENTS.seoDescriptionLength} 字`,
      pass: publishReadiness.seoDescriptionReady,
    },
    { label: "圖片替代文字", pass: !draft.heroImageUrl || Boolean(draft.heroImageAlt.trim()) },
    { label: `正文至少 ${ARTICLE_PUBLISH_REQUIREMENTS.bodyTextLength} 字`, pass: publishReadiness.bodyReady },
  ];

  const handleInspectorTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: InspectorTab) => {
    const currentIndex = INSPECTOR_TABS.indexOf(current);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % INSPECTOR_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = INSPECTOR_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = INSPECTOR_TABS[nextIndex];
    onTab(nextTab);
    window.setTimeout(() => document.getElementById(`article-tab-${nextTab}`)?.focus(), 0);
  };

  return (
    <aside className={editorStyles.inspector}>
      <div className={editorStyles.inspectorTabs} role="tablist" aria-label="文章設定">
        <button
          id="article-tab-publish"
          type="button"
          role="tab"
          aria-selected={inspectorTab === "publish"}
          aria-controls="article-panel-publish"
          tabIndex={inspectorTab === "publish" ? 0 : -1}
          className={inspectorTab === "publish" ? editorStyles.tabActive : ""}
          onKeyDown={(event) => handleInspectorTabKeyDown(event, "publish")}
          onClick={() => onTab("publish")}
        >
          <FileText size={14} />
          發布
        </button>
        <button
          id="article-tab-seo"
          type="button"
          role="tab"
          aria-selected={inspectorTab === "seo"}
          aria-controls="article-panel-seo"
          tabIndex={inspectorTab === "seo" ? 0 : -1}
          className={inspectorTab === "seo" ? editorStyles.tabActive : ""}
          onKeyDown={(event) => handleInspectorTabKeyDown(event, "seo")}
          onClick={() => onTab("seo")}
        >
          <Globe2 size={14} />
          SEO
        </button>
        <button
          id="article-tab-media"
          type="button"
          role="tab"
          aria-selected={inspectorTab === "media"}
          aria-controls="article-panel-media"
          tabIndex={inspectorTab === "media" ? 0 : -1}
          className={inspectorTab === "media" ? editorStyles.tabActive : ""}
          onKeyDown={(event) => handleInspectorTabKeyDown(event, "media")}
          onClick={() => onTab("media")}
        >
          <ImageIcon size={14} />
          圖片
        </button>
        <button
          id="article-tab-history"
          type="button"
          role="tab"
          aria-selected={inspectorTab === "history"}
          aria-controls="article-panel-history"
          tabIndex={inspectorTab === "history" ? 0 : -1}
          className={inspectorTab === "history" ? editorStyles.tabActive : ""}
          onKeyDown={(event) => handleInspectorTabKeyDown(event, "history")}
          onClick={() => onTab("history")}
        >
          <History size={14} />
          版本
        </button>
      </div>

      {inspectorTab === "publish" && (
        <section
          id="article-panel-publish"
          className={editorStyles.inspectorBody}
          role="tabpanel"
          aria-labelledby="article-tab-publish"
        >
          <div className={editorStyles.panelTitle}>
            <span>發布設定</span>
            <small>{draft.status === "published" ? "已發布" : "草稿"}</small>
          </div>
          <label className={editorStyles.field}>
            <span>文章網址</span>
            <div className={editorStyles.slugField}>
              <small>/articles/</small>
              <input
                value={draft.slug}
                onChange={(event) => onUpdate("slug", slugify(event.target.value))}
                placeholder="article-slug"
              />
            </div>
          </label>
          <label className={editorStyles.field}>
            <span>文章分類</span>
            <input value={draft.tag} onChange={(event) => onUpdate("tag", event.target.value)} placeholder="例如：新手指南" />
          </label>
          <label className={editorStyles.field}>
            <span>
              關鍵字 <small>最多 12 組</small>
            </span>
            <input
              value={draft.keywords.join(", ")}
              onChange={(event) =>
                onUpdate(
                  "keywords",
                  event.target.value
                    .split(/[,，]/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .slice(0, 12),
                )
              }
              placeholder="泰國佛牌入門, 佛牌年份"
            />
          </label>
          <dl className={editorStyles.articleFacts}>
            <div>
              <dt>狀態</dt>
              <dd>{draft.status === "published" ? "已發布" : draft.status === "archived" ? "已封存" : "草稿"}</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>{draft.version || "尚未建立"}</dd>
            </div>
            <div>
              <dt>公開時間</dt>
              <dd>{selectedArticle?.publishedAt ? formatUpdatedAt(selectedArticle.publishedAt) : "尚未發布"}</dd>
            </div>
          </dl>
          <p className={editorStyles.helperText}>發布會先寫入這台電腦的內容資料庫；公開網站仍需執行同步建置。</p>
        </section>
      )}

      {inspectorTab === "seo" && (
        <section id="article-panel-seo" className={editorStyles.inspectorBody} role="tabpanel" aria-labelledby="article-tab-seo">
          <div className={editorStyles.panelTitle}>
            <span>搜尋顯示</span>
            <small>
              {seoChecks.filter((check) => check.pass).length}/{seoChecks.length}
            </small>
          </div>
          <label className={editorStyles.field}>
            <span>
              SEO 標題 <small>{draft.seoTitle.length}/60</small>
            </span>
            <input
              value={draft.seoTitle}
              onChange={(event) => onUpdate("seoTitle", event.target.value)}
              placeholder={`發布前至少 ${ARTICLE_PUBLISH_REQUIREMENTS.seoTitleLength} 字`}
            />
          </label>
          <label className={editorStyles.field}>
            <span>
              Meta 描述 <small>{draft.seoDescription.length}/160（建議）</small>
            </span>
            <textarea
              rows={4}
              value={draft.seoDescription}
              onChange={(event) => onUpdate("seoDescription", event.target.value)}
              placeholder={`發布前至少 ${ARTICLE_PUBLISH_REQUIREMENTS.seoDescriptionLength} 字`}
            />
          </label>
          <div className={editorStyles.searchPreview}>
            <span>{articlePath}</span>
            <h2>{seoTitle.slice(0, 70)}</h2>
            <p>{seoDescription.slice(0, 180)}</p>
          </div>
          <ul className={editorStyles.seoChecks}>
            {seoChecks.map((check) => (
              <li key={check.label} className={check.pass ? editorStyles.checkPass : ""}>
                {check.label}
              </li>
            ))}
          </ul>
          <details className={editorStyles.advancedSettings}>
            <summary>進階設定</summary>
            <label className={editorStyles.field}>
              <span>
                Canonical URL <small>{draft.canonicalUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small>
              </span>
              <input
                type="url"
                value={draft.canonicalUrl}
                maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
                aria-invalid={Boolean(canonicalUrlError)}
                onChange={(event) => onUpdate("canonicalUrl", event.target.value)}
                placeholder="https://example.com/articles/..."
              />
              {canonicalUrlError && (
                <small className={editorStyles.fieldError} role="status">
                  {canonicalUrlError}
                </small>
              )}
            </label>
            <label className={editorStyles.checkField}>
              <input type="checkbox" checked={draft.noindex} onChange={(event) => onUpdate("noindex", event.target.checked)} />
              <span>
                <b>不要讓搜尋引擎收錄</b>
                <small>適合測試頁或尚未完成的文章</small>
              </span>
            </label>
          </details>
        </section>
      )}

      {inspectorTab === "media" && (
        <section id="article-panel-media" className={editorStyles.inspectorBody} role="tabpanel" aria-labelledby="article-tab-media">
          <div className={editorStyles.panelTitle}>
            <span>文章圖片</span>
            <small>網址模式</small>
          </div>
          <div className={editorStyles.mediaNotice}>
            <ImageIcon size={18} />
            <span>
              <b>可貼公開網址，或到媒體庫上傳</b>
              <small>在「媒體庫」上傳後複製網址，貼到下方欄位即可。</small>
            </span>
          </div>
          <ArticleMediaPreview src={draft.heroImageUrl} alt={draft.heroImageAlt || "文章首圖預覽"} label="文章首圖" />
          <label className={editorStyles.field}>
            <span>
              文章首圖 URL <small>{draft.heroImageUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small>
            </span>
            <input
              type="url"
              value={draft.heroImageUrl}
              maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
              aria-invalid={Boolean(heroImageError)}
              onChange={(event) => onUpdate("heroImageUrl", event.target.value)}
              placeholder="https://example.com/articles/photo.jpg"
            />
          </label>
          <label className={editorStyles.field}>
            <span>
              首圖替代文字 <small>{draft.heroImageAlt.length}/{ADMIN_IMAGE_ALT_MAX_LENGTH}</small>
            </span>
            <input
              value={draft.heroImageAlt}
              maxLength={ADMIN_IMAGE_ALT_MAX_LENGTH}
              aria-invalid={Boolean(heroImageError)}
              onChange={(event) => onUpdate("heroImageAlt", event.target.value)}
              placeholder="描述圖片內容與角度"
            />
          </label>
          {heroImageError && (
            <p className={editorStyles.fieldError} role="status">
              {heroImageError}
            </p>
          )}
          <ArticleMediaPreview src={draft.ogImageUrl} alt="社群分享圖預覽" label="社群分享圖" />
          <label className={editorStyles.field}>
            <span>
              社群分享圖 URL <small>{draft.ogImageUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small>
            </span>
            <input
              type="url"
              value={draft.ogImageUrl}
              maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
              aria-invalid={Boolean(ogImageError)}
              onChange={(event) => onUpdate("ogImageUrl", event.target.value)}
              placeholder="https://example.com/og/article.jpg"
            />
          </label>
          {ogImageError && (
            <p className={editorStyles.fieldError} role="status">
              {ogImageError}
            </p>
          )}
        </section>
      )}

      {inspectorTab === "history" && (
        <section id="article-panel-history" className={editorStyles.inspectorBody} role="tabpanel" aria-labelledby="article-tab-history">
          <div className={editorStyles.panelTitle}>
            <span>版本紀錄</span>
            <button
              type="button"
              className={editorStyles.panelAction}
              onClick={onLoadRevisions}
              disabled={!draft.id || revisionsLoading}
            >
              {revisionsLoading ? "讀取中…" : "重新整理"}
            </button>
          </div>
          {!draft.id && <p className={editorStyles.helperText}>第一次儲存後會開始建立版本。</p>}
          {draft.id && !revisionsLoading && revisions.length === 0 && (
            <p className={editorStyles.helperText}>目前沒有可用的版本紀錄。</p>
          )}
          <div className={editorStyles.revisionList}>
            {revisions.map((revision) => (
              <button
                type="button"
                key={revision.revisionId}
                onClick={() => onRestoreRevision(revision)}
                disabled={saving || revision.version === draft.version}
              >
                <span>
                  <b>第 {revision.version} 版</b>
                  <small>
                    {revision.status === "published" ? "已發布" : revision.status === "archived" ? "已封存" : "草稿"}
                  </small>
                </span>
                <time dateTime={revision.createdAt}>{formatUpdatedAt(revision.createdAt)}</time>
              </button>
            ))}
          </div>
          <p className={editorStyles.helperText}>還原會建立新草稿，不會刪除現在或過去的紀錄。</p>
        </section>
      )}
    </aside>
  );
}
