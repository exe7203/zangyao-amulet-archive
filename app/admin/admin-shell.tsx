"use client";

import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./admin.module.css";

type ArticleDocument = JSONContent;

type ArticleStatus = "draft" | "published" | "archived";

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
  noindex: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Draft = Omit<Article, "id" | "publishedAt" | "createdAt" | "updatedAt"> & {
  id: string | null;
};

const SITE_CODE = "taijuda";
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
    noindex: false,
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
  };
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={active ? styles.toolbarActive : ""}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
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
  const editRevision = useRef(0);
  const initialLoadStarted = useRef(false);

  const markDirty = useCallback(() => {
    editRevision.current += 1;
    setDirty(true);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: false,
        protocols: ["http", "https", "mailto"],
      }),
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
      noindex: normalized.noindex,
    });
    editor?.commands.setContent(normalized.contentJson, { emitUpdate: false });
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
      setDraft((current) => ({ ...current, id: saved.id, slug: saved.slug, status: saved.status }));
      setArticles((current) => [saved, ...current.filter((article) => article.id !== saved.id)]);
      if (editRevision.current === savingRevision) setDirty(false);
      setNotice(status === "published" ? "文章已發布並建立版本紀錄" : "草稿已儲存並建立版本紀錄");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章儲存失敗");
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

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("請輸入完整網址", previous || "https://");
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
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

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span>泰</span>
          <div>
            <b>泰聚達內容中樞</b>
            <small>SHARED CONTENT CORE · TAIJUDA</small>
          </div>
        </div>
        <div className={styles.topbarActions}>
          <NextLink href="/admin/products/">商品與庫存</NextLink>
          <NextLink href="/admin/orders/">訂單</NextLink>
          <a href="/" target="_blank" rel="noreferrer">查看前台 ↗</a>
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm("目前文章還有未儲存變更，確定要重新整理嗎？")) return;
              void loadArticles(draft.id || undefined);
            }}
            disabled={loading}
          >
            重新整理
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <div>
              <small>CONTENT</small>
              <h1>文章管理</h1>
            </div>
            <button type="button" onClick={createArticle} aria-label="新增文章">＋</button>
          </div>
          <nav className={styles.articleList} aria-label="文章清單">
            {loading && <p className={styles.muted}>正在讀取文章…</p>}
            {!loading && articles.length === 0 && (
              <div className={styles.emptyList}>
                <b>還沒有文章</b>
                <span>先建立第一篇草稿，確認編輯與 SEO 流程。</span>
              </div>
            )}
            {articles.map((article) => (
              <button
                type="button"
                key={article.id}
                className={draft.id === article.id ? styles.articleActive : ""}
                onClick={() => selectArticle(article)}
              >
                <span className={`${styles.statusDot} ${styles[`status_${article.status}`]}`} />
                <span>
                  <b>{article.title}</b>
                  <small>{article.status === "published" ? "已發布" : article.status === "archived" ? "已封存" : "草稿"} · {formatUpdatedAt(article.updatedAt)}</small>
                </span>
              </button>
            ))}
          </nav>
          <div className={styles.sidebarFoot}>
            <span>站台</span>
            <b>泰聚達</b>
            <small>site_id: {SITE_CODE}</small>
          </div>
        </aside>

        <section className={styles.editorPane}>
          <div className={styles.editorHeader}>
            <div>
              <span className={`${styles.statusPill} ${styles[`status_${draft.status}`]}`}>
                {draft.status === "published" ? "已發布" : draft.status === "archived" ? "已封存" : "草稿"}
              </span>
              <span className={styles.savedHint}>{draft.id ? "已建立內容版本" : "尚未儲存"}</span>
            </div>
            <div className={styles.primaryActions}>
              {draft.id && <button type="button" className={styles.archiveButton} onClick={() => void archiveCurrent()} disabled={saving}>封存</button>}
              <button type="button" onClick={() => void save("draft")} disabled={saving}>{saving ? "處理中…" : "儲存草稿"}</button>
              <button type="button" className={styles.publishButton} onClick={() => void save("published")} disabled={saving}>發布文章</button>
            </div>
          </div>

          {(error || notice) && (
            <div className={error ? styles.errorBanner : styles.noticeBanner} role="status">
              <span>{error || notice}</span>
              {authRequired && <a href="/signin-with-chatgpt?return_to=%2Fadmin">登入後台</a>}
            </div>
          )}

          <div className={styles.contentGrid}>
            <div className={styles.editColumn}>
              <label className={styles.field}>
                <span>文章標題</span>
                <input
                  className={styles.titleInput}
                  value={draft.title}
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      title: nextTitle,
                      slug: current.slug || slugify(nextTitle),
                    }));
                    markDirty();
                  }}
                  placeholder="輸入一個清楚、值得點開的標題"
                />
              </label>

              <label className={styles.field}>
                <span>摘要</span>
                <textarea
                  rows={3}
                  value={draft.excerpt}
                  onChange={(event) => updateDraft("excerpt", event.target.value)}
                  placeholder="用兩三句話說明這篇文章能幫讀者解決什麼問題"
                />
              </label>

              <div className={styles.editorCard}>
                <div className={styles.toolbar} role="toolbar" aria-label="文章格式工具">
                  <ToolbarButton label="H2" active={Boolean(editor?.isActive("heading", { level: 2 }))} disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
                  <ToolbarButton label="H3" active={Boolean(editor?.isActive("heading", { level: 3 }))} disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
                  <ToolbarButton label="粗體" active={Boolean(editor?.isActive("bold"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()} />
                  <ToolbarButton label="斜體" active={Boolean(editor?.isActive("italic"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()} />
                  <ToolbarButton label="項目" active={Boolean(editor?.isActive("bulletList"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
                  <ToolbarButton label="編號" active={Boolean(editor?.isActive("orderedList"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
                  <ToolbarButton label="引用" active={Boolean(editor?.isActive("blockquote"))} disabled={!editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
                  <ToolbarButton label="連結" active={Boolean(editor?.isActive("link"))} disabled={!editor} onClick={setLink} />
                  <ToolbarButton label="復原" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()} />
                  <ToolbarButton label="重做" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()} />
                </div>
                <EditorContent editor={editor} />
                <div className={styles.editorStats}><span>{wordCount} 字</span><span>內容以結構化 JSON 儲存</span></div>
              </div>
            </div>

            <aside className={styles.seoColumn}>
              <section className={styles.panel}>
                <div className={styles.panelTitle}>
                  <span>SEO 設定</span>
                  <small>{draft.noindex ? "不建立索引" : "可建立索引"}</small>
                </div>
                <label className={styles.field}>
                  <span>文章網址 Slug</span>
                  <div className={styles.slugField}><small>/articles/</small><input value={draft.slug} onChange={(event) => updateDraft("slug", slugify(event.target.value))} placeholder="article-slug" /></div>
                </label>
                <label className={styles.field}>
                  <span>SEO 標題 <small>{draft.seoTitle.length}/60</small></span>
                  <input value={draft.seoTitle} onChange={(event) => updateDraft("seoTitle", event.target.value)} placeholder="留白時使用文章標題" />
                </label>
                <label className={styles.field}>
                  <span>Meta 描述 <small>{draft.seoDescription.length}/160</small></span>
                  <textarea rows={4} value={draft.seoDescription} onChange={(event) => updateDraft("seoDescription", event.target.value)} placeholder="搜尋結果中顯示的文章摘要" />
                </label>
                <label className={styles.field}>
                  <span>Canonical URL</span>
                  <input type="url" value={draft.canonicalUrl} onChange={(event) => updateDraft("canonicalUrl", event.target.value)} placeholder="https://example.com/articles/..." />
                </label>
                <label className={styles.field}>
                  <span>社群分享圖 URL</span>
                  <input type="url" value={draft.ogImageUrl} onChange={(event) => updateDraft("ogImageUrl", event.target.value)} placeholder="https://example.com/og/article.jpg" />
                </label>
                <label className={styles.checkField}>
                  <input type="checkbox" checked={draft.noindex} onChange={(event) => updateDraft("noindex", event.target.checked)} />
                  <span><b>搜尋引擎不建立索引</b><small>適合尚未準備公開的特殊頁面</small></span>
                </label>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelTitle}><span>搜尋結果預覽</span><small>GOOGLE</small></div>
                <div className={styles.searchPreview}>
                  <span>泰聚達 · taijuda.tw{articlePath}</span>
                  <h2>{seoTitle.slice(0, 70)}</h2>
                  <p>{seoDescription.slice(0, 180)}</p>
                </div>
                <ul className={styles.seoChecks}>
                  <li className={draft.title ? styles.checkPass : ""}>文章標題已填寫</li>
                  <li className={draft.slug ? styles.checkPass : ""}>文章網址已設定</li>
                  <li className={draft.seoDescription.length >= 50 && draft.seoDescription.length <= 160 ? styles.checkPass : ""}>Meta 描述建議 50–160 字</li>
                  <li className={wordCount >= 300 ? styles.checkPass : ""}>內容建議至少 300 字</li>
                </ul>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
