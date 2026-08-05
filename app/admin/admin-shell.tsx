"use client";

import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Archive,
  FileText,
  Globe2,
  History,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { SafePublicImage } from "../product-artwork";
import ArticleEditorToolbar from "./article-editor-toolbar";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "./admin-chrome";
import {
  ADMIN_IMAGE_ALT_MAX_LENGTH,
  ADMIN_IMAGE_URL_MAX_LENGTH,
  validateHttpUrlField,
  validateImagePair,
} from "./image-field-contract";
import styles from "./admin.module.css";

type ArticleDocument = JSONContent;

type ArticleStatus = "draft" | "published" | "archived";
type ArticleFilter = "all" | ArticleStatus;
type InspectorTab = "publish" | "seo" | "media" | "history";

type Article = {
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

type Draft = Omit<Article, "id" | "publishedAt" | "createdAt" | "updatedAt"> & {
  id: string | null;
};

type ArticleRevision = {
  revisionId: string;
  articleId: string;
  title: string;
  status: ArticleStatus;
  version: number;
  createdAt: string;
};

const SITE_CODE = "taijuda";
const INSPECTOR_TABS: InspectorTab[] = ["publish", "seo", "media", "history"];
const API_BASE = (process.env.NEXT_PUBLIC_CONTENT_API_URL || "").replace(/\/$/, "");
const EMPTY_DOCUMENT: ArticleDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function emptyDraft(): Draft {
  return {
    id: null,
    slug: "",
    title: "",
    excerpt: "",
    contentJson: EMPTY_DOCUMENT,
    status: "draft",
    seoTitle: "",
    seoDescription: "",
    canonicalUrl: "",
    ogImageUrl: "",
    tag: "收藏誌",
    keywords: [],
    heroImageUrl: "",
    heroImageAlt: "",
    noindex: false,
    version: 0,
  };
}

function slugify(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function formatUpdatedAt(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeArticle(value: Article): Article {
  return {
    ...value,
    contentJson: value.contentJson || EMPTY_DOCUMENT,
    status: value.status || "draft",
    tag: value.tag || "收藏誌",
    keywords: Array.isArray(value.keywords) ? value.keywords : [],
    heroImageUrl: value.heroImageUrl || "",
    heroImageAlt: value.heroImageAlt || "",
    version: Number.isSafeInteger(value.version) ? value.version : 1,
  };
}

function ArticleMediaPreview({ src, alt, label }: { src: string; alt: string; label: string }) {
  return <div className={styles.mediaPreview}>
    <SafePublicImage
      key={src}
      src={src}
      alt={alt}
      className={styles.mediaPreviewImage}
      fallback={(
        <div className={styles.mediaPreviewFallback} role="img" aria-label={`${label}尚未設定或無法載入`}>
          <ImageIcon size={24} aria-hidden="true" />
          <span>{label}尚未設定或無法載入</span>
        </div>
      )}
    />
  </div>;
}

export default function AdminShell() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [revisions, setRevisions] = useState<ArticleRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [articleQuery, setArticleQuery] = useState("");
  const [articleFilter, setArticleFilter] = useState<ArticleFilter>("all");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("publish");
  const editRevision = useRef(0);
  const initialLoadStarted = useRef(false);

  const markDirty = useCallback(() => {
    editRevision.current += 1;
    setDirty(true);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false, heading: { levels: [2, 3, 4] } }),
      TiptapLink.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: false,
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { target: null, rel: null, class: null },
      }),
      Placeholder.configure({ placeholder: "開始撰寫正文…" }),
    ],
    content: EMPTY_DOCUMENT,
    editorProps: {
      attributes: {
        class: styles.editorBody,
        "aria-label": "文章內容編輯區",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      setDraft((current) => ({
        ...current,
        contentJson: currentEditor.getJSON() as ArticleDocument,
      }));
      setEditorVersion((value) => value + 1);
      markDirty();
    },
  });

  const selectArticle = useCallback((article: Article) => {
    if (dirty && draft.id !== article.id && !window.confirm("目前文章還有未儲存變更，確定要切換嗎？")) {
      return;
    }
    const normalized = normalizeArticle(article);
    setDraft({
      id: normalized.id,
      slug: normalized.slug,
      title: normalized.title,
      excerpt: normalized.excerpt,
      contentJson: normalized.contentJson,
      status: normalized.status,
      seoTitle: normalized.seoTitle,
      seoDescription: normalized.seoDescription,
      canonicalUrl: normalized.canonicalUrl,
      ogImageUrl: normalized.ogImageUrl,
      tag: normalized.tag || "收藏誌",
      keywords: normalized.keywords || [],
      heroImageUrl: normalized.heroImageUrl || "",
      heroImageAlt: normalized.heroImageAlt || "",
      noindex: normalized.noindex,
      version: normalized.version || 1,
    });
    editor?.commands.setContent(normalized.contentJson, { emitUpdate: false });
    setRevisions([]);
    setDirty(false);
    setError("");
    setNotice("");
  }, [dirty, draft.id, editor]);

  const createArticle = useCallback(() => {
    if (dirty && !window.confirm("目前文章還有未儲存變更，確定要建立新文章嗎？")) {
      return;
    }
    const next = emptyDraft();
    setDraft(next);
    editor?.commands.setContent(next.contentJson, { emitUpdate: false });
    setRevisions([]);
    setDirty(false);
    setError("");
    setNotice("");
  }, [dirty, editor]);

  const loadArticles = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/articles?site=${SITE_CODE}`, {
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({})) as {
        articles?: Article[];
        error?: string;
      };
      if (response.status === 401) {
        setAuthRequired(true);
        throw new Error(payload.error || "請先登入後台");
      }
      if (!response.ok) throw new Error(payload.error || "文章清單讀取失敗");

      const nextArticles = (payload.articles || []).map(normalizeArticle);
      setArticles(nextArticles);
      setAuthRequired(false);
      const selected = nextArticles.find((article) => article.id === preferredId) || nextArticles[0];
      if (selected) selectArticle(selected);
      else createArticle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章清單讀取失敗");
    } finally {
      setLoading(false);
    }
  }, [createArticle, selectArticle]);

  useEffect(() => {
    if (!editor || initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadArticles();
  }, [editor, loadArticles]);

  useEffect(() => {
    if (editor && !draft.id && editor.isEmpty) {
      editor.commands.setContent(draft.contentJson, { emitUpdate: false });
    }
  }, [draft.contentJson, draft.id, editor]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const updateDraft = <Key extends keyof Draft,>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    markDirty();
  };
  const heroImageError = validateImagePair({
    url: draft.heroImageUrl,
    alt: draft.heroImageAlt,
    urlLabel: "文章首圖 URL",
    altLabel: "首圖替代文字",
  });
  const ogImageError = validateHttpUrlField(draft.ogImageUrl, "社群分享圖 URL");
  const canonicalUrlError = validateHttpUrlField(draft.canonicalUrl, "Canonical URL");

  const loadRevisions = useCallback(async (articleId: string) => {
    setRevisionsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/articles/${encodeURIComponent(articleId)}/revisions?site=${SITE_CODE}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { revisions?: ArticleRevision[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "文章版本讀取失敗");
      setRevisions(Array.isArray(payload.revisions) ? payload.revisions : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章版本讀取失敗");
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!draft.id) return;
    const articleId = draft.id;
    const timer = window.setTimeout(() => void loadRevisions(articleId), 0);
    return () => window.clearTimeout(timer);
  }, [draft.id, loadRevisions]);

  const save = async (status: ArticleStatus) => {
    const title = draft.title.trim();
    const slug = slugify(draft.slug || title);
    if (!title) {
      setError("請先填寫文章標題");
      return;
    }
    if (!slug) {
      setError("請填寫可使用的文章網址");
      return;
    }
    const mediaFieldError = heroImageError || ogImageError || canonicalUrlError;
    if (mediaFieldError) {
      setError(mediaFieldError);
      return;
    }

    setSaving(true);
    const savingRevision = editRevision.current;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/articles`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          ...draft,
          siteCode: SITE_CODE,
          slug,
          status,
          contentJson: editor?.getJSON() || draft.contentJson,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        article?: Article;
        error?: string;
      };
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok || !payload.article) {
        throw new Error(payload.error || "文章儲存失敗");
      }

      const saved = normalizeArticle(payload.article);
      setDraft((current) => ({ ...current, id: saved.id, slug: saved.slug, status: saved.status, version: saved.version }));
      setArticles((current) => [saved, ...current.filter((article) => article.id !== saved.id)]);
      if (editRevision.current === savingRevision) setDirty(false);
      setNotice(status === "published" ? "文章已發布並建立版本紀錄" : "草稿已儲存並建立版本紀錄");
      await loadRevisions(saved.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const restoreRevision = async (revision: ArticleRevision) => {
    if (!draft.id || saving) return;
    if (dirty && !window.confirm("目前文章有未儲存變更。還原版本會以所選版本建立一份新草稿，確定繼續嗎？")) return;
    if (!window.confirm(`確定要把文章還原到第 ${revision.version} 版嗎？原有紀錄不會被刪除。`)) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/articles/${encodeURIComponent(draft.id)}/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ siteCode: SITE_CODE, revisionId: revision.revisionId, version: draft.version }),
      });
      const payload = await response.json().catch(() => ({})) as { article?: Article; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error || "文章版本還原失敗");

      const restored = normalizeArticle(payload.article);
      setDraft({
        id: restored.id,
        slug: restored.slug,
        title: restored.title,
        excerpt: restored.excerpt,
        contentJson: restored.contentJson,
        status: restored.status,
        seoTitle: restored.seoTitle,
        seoDescription: restored.seoDescription,
        canonicalUrl: restored.canonicalUrl,
        ogImageUrl: restored.ogImageUrl,
        tag: restored.tag,
        keywords: restored.keywords,
        heroImageUrl: restored.heroImageUrl,
        heroImageAlt: restored.heroImageAlt,
        noindex: restored.noindex,
        version: restored.version,
      });
      editor?.commands.setContent(restored.contentJson, { emitUpdate: false });
      setArticles((current) => [restored, ...current.filter((article) => article.id !== restored.id)]);
      setDirty(false);
      setNotice(`已還原第 ${revision.version} 版並建立新的草稿版本；尚未重新發布。`);
      await loadRevisions(restored.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章版本還原失敗");
    } finally {
      setSaving(false);
    }
  };

  const archiveCurrent = async () => {
    if (!draft.id || !window.confirm("確定要把這篇文章封存嗎？")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/articles/${encodeURIComponent(draft.id)}?site=${SITE_CODE}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "文章封存失敗");
      setNotice("文章已封存");
      await loadArticles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章封存失敗");
    } finally {
      setSaving(false);
    }
  };

  const textContent = editor?.getText().trim() || "";
  const wordCount = useMemo(
    () => textContent ? textContent.split(/\s+|(?=[\p{Script=Han}])/u).filter(Boolean).length : 0,
    // editorVersion intentionally refreshes the text-derived count after editor transactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorVersion, textContent],
  );
  const seoTitle = draft.seoTitle || draft.title || "文章標題";
  const seoDescription = draft.seoDescription || draft.excerpt || "文章摘要會顯示在這裡。";
  const articlePath = `/articles/${slugify(draft.slug || draft.title) || "article-slug"}/`;
  const selectedArticle = articles.find((article) => article.id === draft.id);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 500));
  const filteredArticles = useMemo(() => {
    const query = articleQuery.trim().toLocaleLowerCase("zh-TW");
    return articles.filter((article) => {
      if (articleFilter !== "all" && article.status !== articleFilter) return false;
      if (!query) return true;
      return `${article.title} ${article.slug} ${article.tag}`.toLocaleLowerCase("zh-TW").includes(query);
    });
  }, [articleFilter, articleQuery, articles]);
  const seoChecks = [
    { label: "標題", pass: Boolean(draft.title.trim()) },
    { label: "固定網址", pass: Boolean(draft.slug.trim()) },
    { label: "SEO 描述 50–160 字", pass: draft.seoDescription.length >= 50 && draft.seoDescription.length <= 160 },
    { label: "圖片替代文字", pass: !draft.heroImageUrl || Boolean(draft.heroImageAlt.trim()) },
    { label: "正文至少 300 字", pass: wordCount >= 300 },
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
    setInspectorTab(nextTab);
    window.setTimeout(() => document.getElementById(`article-tab-${nextTab}`)?.focus(), 0);
  };

  return (
    <main className={styles.shell}>
      <AdminTopbar
        active="articles"
        refreshing={loading}
        hasUnsavedChanges={dirty}
        onRefresh={() => {
          void loadArticles(draft.id || undefined);
        }}
      />

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <div><h1>文章</h1><span>{articles.length} 篇內容</span></div>
            <button type="button" className={styles.newArticleButton} onClick={createArticle}><Plus size={15} />新增</button>
          </div>
          <div className={styles.sidebarControls}>
            <label className={styles.searchField}>
              <Search size={14} aria-hidden="true" />
              <span className={styles.srOnly}>搜尋文章</span>
              <input value={articleQuery} onChange={(event) => setArticleQuery(event.target.value)} placeholder="搜尋標題或網址" />
            </label>
            <label>
              <span className={styles.srOnly}>依狀態篩選</span>
              <select value={articleFilter} onChange={(event) => setArticleFilter(event.target.value as ArticleFilter)}>
                <option value="all">全部狀態</option>
                <option value="draft">草稿</option>
                <option value="published">已發布</option>
                <option value="archived">已封存</option>
              </select>
            </label>
          </div>
          <nav className={styles.articleList} aria-label="文章清單">
            {loading && <p className={styles.muted}>正在讀取文章…</p>}
            {!loading && filteredArticles.length === 0 && (
              <div className={styles.emptyList}>
                <FileText size={20} />
                <b>{articles.length ? "沒有符合條件的文章" : "還沒有文章"}</b>
                <span>{articles.length ? "請調整搜尋文字或狀態。" : "按「新增」開始建立第一篇內容。"}</span>
              </div>
            )}
            {filteredArticles.map((article) => (
              <button
                type="button"
                key={article.id}
                className={draft.id === article.id ? styles.articleActive : ""}
                onClick={() => selectArticle(article)}
              >
                <span className={styles.articleRowMain}>
                  <b>{article.title}</b>
                  <small>/{article.slug}</small>
                </span>
                <span className={styles.articleRowMeta}>
                  <span className={`${styles.statusDot} ${styles[`status_${article.status}`]}`} />
                  {article.status === "published" ? "已發布" : article.status === "archived" ? "已封存" : "草稿"}
                  <time dateTime={article.updatedAt}>{formatUpdatedAt(article.updatedAt)}</time>
                </span>
              </button>
            ))}
          </nav>
          <div className={styles.sidebarFoot}>
            <span>已發布 {articles.filter((article) => article.status === "published").length}</span>
            <span>草稿 {articles.filter((article) => article.status === "draft").length}</span>
          </div>
        </aside>

        <section className={styles.editorPane}>
          <AdminActionBar
            status={<AdminStatus tone={draft.status === "published" ? "success" : draft.status === "draft" ? "warning" : "neutral"}>{draft.status === "published" ? "已發布" : draft.status === "archived" ? "已封存" : "草稿"}</AdminStatus>}
            title={draft.title || "未命名文章"}
            detail={dirty ? "有未儲存變更" : selectedArticle ? `最後儲存 ${formatUpdatedAt(selectedArticle.updatedAt)}` : "尚未儲存"}
          >
            <AdminButton
              type="button"
              variant="ghost"
              iconOnly
              aria-label="重新整理文章"
              title="重新整理文章"
              onClick={() => {
                if (dirty && !window.confirm("目前文章還有未儲存變更，確定要重新整理嗎？")) return;
                void loadArticles(draft.id || undefined);
              }}
              disabled={loading || saving}
            ><RefreshCw size={15} /></AdminButton>
            {draft.id && <AdminButton type="button" variant="danger" iconOnly aria-label="封存文章" title="封存文章" onClick={() => void archiveCurrent()} disabled={saving}><Archive size={15} /></AdminButton>}
            <AdminButton type="button" onClick={() => void save("draft")} disabled={saving}>{saving ? "處理中…" : "儲存草稿"}</AdminButton>
            <AdminButton type="button" variant="primary" onClick={() => void save("published")} disabled={saving}>發布</AdminButton>
          </AdminActionBar>

          {(error || notice) && (
            <div className={error ? styles.errorBanner : styles.noticeBanner} role="status">
              <span>{error || notice}</span>
              {authRequired && <a href="/signin-with-chatgpt?return_to=%2Fadmin">登入後台</a>}
            </div>
          )}

          <div className={styles.contentGrid}>
            <div className={styles.editColumn}>
              <article className={styles.documentCanvas} aria-label="文章文件">
                <div className={styles.documentHeading}>
                  <label>
                    <span className={styles.srOnly}>文章標題</span>
                    <textarea
                      className={styles.titleInput}
                      rows={1}
                      value={draft.title}
                      onChange={(event) => {
                        const nextTitle = event.target.value;
                        setDraft((current) => ({ ...current, title: nextTitle, slug: current.slug || slugify(nextTitle) }));
                        markDirty();
                      }}
                      placeholder="文章標題"
                    />
                  </label>
                  <label>
                    <span className={styles.srOnly}>文章摘要</span>
                    <textarea
                      className={styles.excerptInput}
                      rows={2}
                      value={draft.excerpt}
                      onChange={(event) => updateDraft("excerpt", event.target.value)}
                      placeholder="用一小段話說明這篇文章的重點"
                    />
                  </label>
                </div>
                <ArticleEditorToolbar editor={editor} />
                <EditorContent editor={editor} />
                <footer className={styles.editorStats}>
                  <span>{wordCount} 字 · 約 {readingMinutes} 分鐘閱讀</span>
                  <span>{dirty ? "尚未儲存" : draft.id ? `第 ${draft.version} 版` : "新草稿"}</span>
                </footer>
              </article>
            </div>

            <aside className={styles.inspector}>
              <div className={styles.inspectorTabs} role="tablist" aria-label="文章設定">
                <button id="article-tab-publish" type="button" role="tab" aria-selected={inspectorTab === "publish"} aria-controls="article-panel-publish" tabIndex={inspectorTab === "publish" ? 0 : -1} className={inspectorTab === "publish" ? styles.tabActive : ""} onKeyDown={(event) => handleInspectorTabKeyDown(event, "publish")} onClick={() => setInspectorTab("publish")}><FileText size={14} />發布</button>
                <button id="article-tab-seo" type="button" role="tab" aria-selected={inspectorTab === "seo"} aria-controls="article-panel-seo" tabIndex={inspectorTab === "seo" ? 0 : -1} className={inspectorTab === "seo" ? styles.tabActive : ""} onKeyDown={(event) => handleInspectorTabKeyDown(event, "seo")} onClick={() => setInspectorTab("seo")}><Globe2 size={14} />SEO</button>
                <button id="article-tab-media" type="button" role="tab" aria-selected={inspectorTab === "media"} aria-controls="article-panel-media" tabIndex={inspectorTab === "media" ? 0 : -1} className={inspectorTab === "media" ? styles.tabActive : ""} onKeyDown={(event) => handleInspectorTabKeyDown(event, "media")} onClick={() => setInspectorTab("media")}><ImageIcon size={14} />圖片</button>
                <button id="article-tab-history" type="button" role="tab" aria-selected={inspectorTab === "history"} aria-controls="article-panel-history" tabIndex={inspectorTab === "history" ? 0 : -1} className={inspectorTab === "history" ? styles.tabActive : ""} onKeyDown={(event) => handleInspectorTabKeyDown(event, "history")} onClick={() => setInspectorTab("history")}><History size={14} />版本</button>
              </div>

              {inspectorTab === "publish" && <section id="article-panel-publish" className={styles.inspectorBody} role="tabpanel" aria-labelledby="article-tab-publish">
                <div className={styles.panelTitle}><span>發布設定</span><small>{draft.status === "published" ? "已發布" : "草稿"}</small></div>
                <label className={styles.field}>
                  <span>文章網址</span>
                  <div className={styles.slugField}><small>/articles/</small><input value={draft.slug} onChange={(event) => updateDraft("slug", slugify(event.target.value))} placeholder="article-slug" /></div>
                </label>
                <label className={styles.field}><span>文章分類</span><input value={draft.tag} onChange={(event) => updateDraft("tag", event.target.value)} placeholder="例如：新手指南" /></label>
                <label className={styles.field}><span>關鍵字 <small>最多 12 組</small></span><input value={draft.keywords.join(", ")} onChange={(event) => updateDraft("keywords", event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 12))} placeholder="泰國佛牌入門, 佛牌年份" /></label>
                <dl className={styles.articleFacts}>
                  <div><dt>狀態</dt><dd>{draft.status === "published" ? "已發布" : draft.status === "archived" ? "已封存" : "草稿"}</dd></div>
                  <div><dt>版本</dt><dd>{draft.version || "尚未建立"}</dd></div>
                  <div><dt>公開時間</dt><dd>{selectedArticle?.publishedAt ? formatUpdatedAt(selectedArticle.publishedAt) : "尚未發布"}</dd></div>
                </dl>
                <p className={styles.helperText}>發布會先寫入這台電腦的內容資料庫；公開網站仍需執行同步建置。</p>
              </section>}

              {inspectorTab === "seo" && <section id="article-panel-seo" className={styles.inspectorBody} role="tabpanel" aria-labelledby="article-tab-seo">
                <div className={styles.panelTitle}><span>搜尋顯示</span><small>{seoChecks.filter((check) => check.pass).length}/{seoChecks.length}</small></div>
                <label className={styles.field}><span>SEO 標題 <small>{draft.seoTitle.length}/60</small></span><input value={draft.seoTitle} onChange={(event) => updateDraft("seoTitle", event.target.value)} placeholder="留白時使用文章標題" /></label>
                <label className={styles.field}><span>Meta 描述 <small>{draft.seoDescription.length}/160</small></span><textarea rows={4} value={draft.seoDescription} onChange={(event) => updateDraft("seoDescription", event.target.value)} placeholder="搜尋結果中顯示的文章摘要" /></label>
                <div className={styles.searchPreview}>
                  <span>taijuda.tw{articlePath}</span>
                  <h2>{seoTitle.slice(0, 70)}</h2>
                  <p>{seoDescription.slice(0, 180)}</p>
                </div>
                <ul className={styles.seoChecks}>{seoChecks.map((check) => <li key={check.label} className={check.pass ? styles.checkPass : ""}>{check.label}</li>)}</ul>
                <details className={styles.advancedSettings}>
                  <summary>進階設定</summary>
                  <label className={styles.field}>
                    <span>Canonical URL <small>{draft.canonicalUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small></span>
                    <input
                      type="url"
                      value={draft.canonicalUrl}
                      maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
                      aria-invalid={Boolean(canonicalUrlError)}
                      onChange={(event) => updateDraft("canonicalUrl", event.target.value)}
                      placeholder="https://example.com/articles/..."
                    />
                    {canonicalUrlError && <small className={styles.fieldError} role="status">{canonicalUrlError}</small>}
                  </label>
                  <label className={styles.checkField}>
                    <input type="checkbox" checked={draft.noindex} onChange={(event) => updateDraft("noindex", event.target.checked)} />
                    <span><b>不要讓搜尋引擎收錄</b><small>適合測試頁或尚未完成的文章</small></span>
                  </label>
                </details>
              </section>}

              {inspectorTab === "media" && <section id="article-panel-media" className={styles.inspectorBody} role="tabpanel" aria-labelledby="article-tab-media">
                <div className={styles.panelTitle}><span>文章圖片</span><small>網址模式</small></div>
                <div className={styles.mediaNotice}><ImageIcon size={18} /><span><b>目前僅支援公開圖片網址</b><small>檔案上傳需啟用雲端儲存。</small></span></div>
                <ArticleMediaPreview src={draft.heroImageUrl} alt={draft.heroImageAlt || "文章首圖預覽"} label="文章首圖" />
                <label className={styles.field}>
                  <span>文章首圖 URL <small>{draft.heroImageUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small></span>
                  <input
                    type="url"
                    value={draft.heroImageUrl}
                    maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
                    aria-invalid={Boolean(heroImageError)}
                    onChange={(event) => updateDraft("heroImageUrl", event.target.value)}
                    placeholder="https://example.com/articles/photo.jpg"
                  />
                </label>
                <label className={styles.field}>
                  <span>首圖替代文字 <small>{draft.heroImageAlt.length}/{ADMIN_IMAGE_ALT_MAX_LENGTH}</small></span>
                  <input
                    value={draft.heroImageAlt}
                    maxLength={ADMIN_IMAGE_ALT_MAX_LENGTH}
                    aria-invalid={Boolean(heroImageError)}
                    onChange={(event) => updateDraft("heroImageAlt", event.target.value)}
                    placeholder="描述圖片內容與角度"
                  />
                </label>
                {heroImageError && <p className={styles.fieldError} role="status">{heroImageError}</p>}
                <ArticleMediaPreview src={draft.ogImageUrl} alt="社群分享圖預覽" label="社群分享圖" />
                <label className={styles.field}>
                  <span>社群分享圖 URL <small>{draft.ogImageUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small></span>
                  <input
                    type="url"
                    value={draft.ogImageUrl}
                    maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
                    aria-invalid={Boolean(ogImageError)}
                    onChange={(event) => updateDraft("ogImageUrl", event.target.value)}
                    placeholder="https://example.com/og/article.jpg"
                  />
                </label>
                {ogImageError && <p className={styles.fieldError} role="status">{ogImageError}</p>}
              </section>}

              {inspectorTab === "history" && <section id="article-panel-history" className={styles.inspectorBody} role="tabpanel" aria-labelledby="article-tab-history">
                <div className={styles.panelTitle}>
                  <span>版本紀錄</span>
                  <button type="button" className={styles.panelAction} onClick={() => draft.id && void loadRevisions(draft.id)} disabled={!draft.id || revisionsLoading}>{revisionsLoading ? "讀取中…" : "重新整理"}</button>
                </div>
                {!draft.id && <p className={styles.helperText}>第一次儲存後會開始建立版本。</p>}
                {draft.id && !revisionsLoading && revisions.length === 0 && <p className={styles.helperText}>目前沒有可用的版本紀錄。</p>}
                <div className={styles.revisionList}>
                  {revisions.map((revision) => <button type="button" key={revision.revisionId} onClick={() => void restoreRevision(revision)} disabled={saving || revision.version === draft.version}>
                    <span><b>第 {revision.version} 版</b><small>{revision.status === "published" ? "已發布" : revision.status === "archived" ? "已封存" : "草稿"}</small></span>
                    <time dateTime={revision.createdAt}>{formatUpdatedAt(revision.createdAt)}</time>
                  </button>)}
                </div>
                <p className={styles.helperText}>還原會建立新草稿，不會刪除現在或過去的紀錄。</p>
              </section>}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
