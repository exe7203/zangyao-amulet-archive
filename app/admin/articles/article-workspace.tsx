"use client";

import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Archive, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PUBLIC_SITE_CODE } from "../../../shared/site-context";
import {
  adminArticlePath,
  adminArticleRevisionsPath,
  adminArticlesCollectionPath,
  adminArticlesPath,
} from "../../../shared/admin/api-paths";
import {
  ARTICLE_PUBLISH_ERROR_MESSAGE,
  evaluateArticlePublishReadiness,
  validateArticleDocument,
} from "../../../lib/article-content-contract";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "../admin-chrome";
import { adminFetch, AdminFetchError } from "../_lib/api-client";
import {
  validateHttpUrlField,
  validateImagePair,
} from "../image-field-contract";
import editorStyles from "../admin.module.css";
import { ArticleImage } from "./article-image-extension";
import { ArticleDocument } from "./article-document";
import { ArticleInspector } from "./article-inspector";
import { ArticleList } from "./article-list";
import { emptyDraft, formatUpdatedAt, normalizeArticle, slugify } from "./helpers";
import type {
  Article,
  ArticleDocument as ArticleDoc,
  ArticleFilter,
  ArticleListOptions,
  ArticleListPagination,
  ArticleRevision,
  ArticleStatus,
  Draft,
  InspectorTab,
} from "./types";
import {
  EMPTY_ARTICLE_PAGINATION,
  EMPTY_DOCUMENT,
} from "./types";
import styles from "./articles.module.css";

const SITE_CODE = PUBLIC_SITE_CODE;

function readArticleStatusFilter(params: { get(name: string): string | null }): ArticleFilter {
  const status = params.get("status");
  return status === "draft" || status === "published" || status === "archived" ? status : "all";
}

export default function ArticleWorkspace() {
  const searchParams = useSearchParams();
  const initialStatusFilter = readArticleStatusFilter(searchParams);
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
  const [articleFilter, setArticleFilter] = useState<ArticleFilter>(initialStatusFilter);
  const [articleAppliedQuery, setArticleAppliedQuery] = useState("");
  const [articleAppliedFilter, setArticleAppliedFilter] = useState<ArticleFilter>(initialStatusFilter);
  const [articlePagination, setArticlePagination] = useState<ArticleListPagination>(EMPTY_ARTICLE_PAGINATION);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(
    searchParams.get("focus") === "seo" ? "seo" : "publish",
  );
  const editRevision = useRef(0);
  const initialLoadStarted = useRef(false);
  const articleListRequestId = useRef(0);
  const queryActionsBootstrapped = useRef(false);

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
      ArticleImage.configure({
        inline: false,
        allowBase64: false,
        resize: false,
      }),
      TableKit.configure({
        table: {
          resizable: false,
          renderWrapper: true,
          HTMLAttributes: { "data-article-table": "true" },
        },
      }),
    ],
    content: EMPTY_DOCUMENT,
    editorProps: {
      attributes: {
        class: editorStyles.editorBody,
        "aria-label": "文章內容編輯區",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      setDraft((current) => ({
        ...current,
        contentJson: currentEditor.getJSON() as ArticleDoc,
      }));
      setEditorVersion((value) => value + 1);
      markDirty();
    },
  });

  const selectArticle = useCallback(
    (article: Article, force = false) => {
      if (!force && dirty && draft.id !== article.id && !window.confirm("目前文章還有未儲存變更，確定要切換嗎？")) {
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
        tag: normalized.tag || "佛牌知識",
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
    },
    [dirty, draft.id, editor],
  );

  const createArticle = useCallback(
    (force = false) => {
      if (!force && dirty && !window.confirm("目前文章還有未儲存變更，確定要建立新文章嗎？")) {
        return;
      }
      const next = emptyDraft();
      setDraft(next);
      editor?.commands.setContent(next.contentJson, { emitUpdate: false });
      setRevisions([]);
      setDirty(false);
      setError("");
      setNotice("");
    },
    [dirty, editor],
  );

  const loadArticles = useCallback(
    async (options: ArticleListOptions = {}) => {
      const requestId = articleListRequestId.current + 1;
      articleListRequestId.current = requestId;
      const page = Math.max(1, Math.trunc(options.page || 1));
      const status = options.status || "all";
      const query = options.query?.trim() || "";
      const params = new URLSearchParams({
        site: SITE_CODE,
        page: String(page),
        limit: String(articlePagination.limit),
      });
      if (query) params.set("q", query);
      if (status !== "all") params.set("status", status);

      setLoading(true);
      setError("");
      try {
        const payload = await adminFetch<{
          articles?: Article[];
          pagination?: Partial<ArticleListPagination>;
          error?: string;
        }>(adminArticlesPath(SITE_CODE, params));
        if (requestId !== articleListRequestId.current) return;

        const nextArticles = (payload.articles || []).map(normalizeArticle);
        const total = Number.isSafeInteger(payload.pagination?.total)
          ? Number(payload.pagination?.total)
          : nextArticles.length;
        const limit = Number.isSafeInteger(payload.pagination?.limit)
          ? Math.max(1, Number(payload.pagination?.limit))
          : articlePagination.limit;
        const nextPagination: ArticleListPagination = {
          page: Number.isSafeInteger(payload.pagination?.page) ? Math.max(1, Number(payload.pagination?.page)) : page,
          limit,
          maxLimit: Number.isSafeInteger(payload.pagination?.maxLimit)
            ? Math.max(limit, Number(payload.pagination?.maxLimit))
            : EMPTY_ARTICLE_PAGINATION.maxLimit,
          total,
          totalPages: Number.isSafeInteger(payload.pagination?.totalPages)
            ? Math.max(0, Number(payload.pagination?.totalPages))
            : Math.ceil(total / limit),
          returned: Number.isSafeInteger(payload.pagination?.returned)
            ? Math.max(0, Number(payload.pagination?.returned))
            : nextArticles.length,
        };
        setArticles(nextArticles);
        setArticlePagination(nextPagination);
        setAuthRequired(false);
        if (options.selection !== "preserve") {
          const selected = nextArticles.find((article) => article.id === options.preferredId) || nextArticles[0];
          const force = options.selection === "force";
          if (selected) selectArticle(selected, force);
          else createArticle(force);
        }
      } catch (cause) {
        if (requestId !== articleListRequestId.current) return;
        if (cause instanceof AdminFetchError && cause.status === 401) {
          setAuthRequired(true);
        }
        setError(cause instanceof Error ? cause.message : "文章清單讀取失敗");
      } finally {
        if (requestId === articleListRequestId.current) setLoading(false);
      }
    },
    [articlePagination.limit, createArticle, selectArticle],
  );

  useEffect(() => {
    if (!editor || initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadArticles({
      status: articleAppliedFilter,
      query: articleAppliedQuery,
      page: 1,
    });
  }, [articleAppliedFilter, articleAppliedQuery, editor, loadArticles]);

  useEffect(() => {
    if (!editor || queryActionsBootstrapped.current) return;
    queryActionsBootstrapped.current = true;
    const focus = searchParams.get("focus");
    const createNew = searchParams.get("new") === "1";
    if (focus === "seo") {
      setInspectorTab("seo");
      setNotice("請補齊 SEO 標題與描述後再檢查搜尋預覽。");
    }
    if (createNew) {
      const next = emptyDraft();
      setDraft(next);
      editor.commands.setContent(next.contentJson, { emitUpdate: false });
      setRevisions([]);
      setDirty(false);
      setError("");
      if (focus !== "seo") setNotice("已開啟空白文章，填寫後請儲存或發布。");
    }
  }, [editor, searchParams]);

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

  const updateDraft = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
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
      const payload = await adminFetch<{ revisions?: ArticleRevision[] }>(
        adminArticleRevisionsPath(articleId, SITE_CODE),
      );
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
    const contentJson = editor?.getJSON() || draft.contentJson;
    if (!validateArticleDocument(contentJson)) {
      setError("文章內文包含不安全或超出限制的圖片／表格內容，請檢查圖片網址、替代文字與表格大小");
      return;
    }
    if (
      status === "published" &&
      !evaluateArticlePublishReadiness({
        excerpt: draft.excerpt,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        contentJson,
      }).ok
    ) {
      setInspectorTab("seo");
      setError(ARTICLE_PUBLISH_ERROR_MESSAGE);
      return;
    }

    setSaving(true);
    const savingRevision = editRevision.current;
    setError("");
    setNotice("");
    try {
      const payload = await adminFetch<{ article?: Article }>(adminArticlesCollectionPath(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          siteCode: SITE_CODE,
          slug,
          status,
          contentJson,
        }),
      });
      if (!payload.article) throw new Error("文章儲存失敗");

      const saved = normalizeArticle(payload.article);
      setDraft((current) => ({ ...current, id: saved.id, slug: saved.slug, status: saved.status, version: saved.version }));
      setArticles((current) => [saved, ...current.filter((article) => article.id !== saved.id)]);
      if (editRevision.current === savingRevision) setDirty(false);
      setNotice(status === "published" ? "文章已發布並建立版本紀錄" : "草稿已儲存並建立版本紀錄");
      await Promise.all([
        loadRevisions(saved.id),
        loadArticles({
          query: articleAppliedQuery,
          status: articleAppliedFilter,
          page: articlePagination.page,
          preferredId: saved.id,
          selection: "preserve",
        }),
      ]);
    } catch (cause) {
      if (cause instanceof AdminFetchError && cause.status === 401) setAuthRequired(true);
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
      const payload = await adminFetch<{ article?: Article }>(adminArticleRevisionsPath(draft.id, SITE_CODE), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteCode: SITE_CODE, revisionId: revision.revisionId, version: draft.version }),
      });
      if (!payload.article) throw new Error("文章版本還原失敗");

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
      await Promise.all([
        loadRevisions(restored.id),
        loadArticles({
          query: articleAppliedQuery,
          status: articleAppliedFilter,
          page: articlePagination.page,
          preferredId: restored.id,
          selection: "preserve",
        }),
      ]);
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
      await adminFetch(adminArticlePath(draft.id, SITE_CODE), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: draft.version }),
      });
      await loadArticles({
        query: articleAppliedQuery,
        status: articleAppliedFilter,
        page: 1,
        preferredId: draft.id,
        selection: "force",
      });
      setNotice("文章已封存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文章封存失敗");
    } finally {
      setSaving(false);
    }
  };

  const publishReadiness = useMemo(
    () =>
      evaluateArticlePublishReadiness({
        excerpt: draft.excerpt,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        contentJson: draft.contentJson,
      }),
    // editorVersion intentionally refreshes the text-derived count after editor transactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.contentJson, draft.excerpt, draft.seoDescription, draft.seoTitle, editorVersion],
  );
  const wordCount = publishReadiness.bodyTextLength;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 500));
  const selectedArticle = articles.find((article) => article.id === draft.id);

  const refreshArticles = (force = false) => {
    if (!force && dirty && !window.confirm("目前文章還有未儲存變更，確定要重新整理嗎？")) return;
    void loadArticles({
      query: articleAppliedQuery,
      status: articleAppliedFilter,
      page: articlePagination.page,
      preferredId: draft.id || undefined,
      selection: "force",
    });
  };

  const handleSearch = (query: string, status: ArticleFilter) => {
    setArticleAppliedQuery(query);
    setArticleAppliedFilter(status);
    void loadArticles({ query, status, page: 1, selection: "preserve" });
  };

  return (
    <AdminTopbar active="articles" refreshing={loading} hasUnsavedChanges={dirty} onRefresh={() => refreshArticles()}>
      <div className={styles.workspace}>
        <ArticleList
          articles={articles}
          draftId={draft.id}
          loading={loading}
          dirty={dirty}
          saving={saving}
          articleQuery={articleQuery}
          articleFilter={articleFilter}
          articleAppliedQuery={articleAppliedQuery}
          articleAppliedFilter={articleAppliedFilter}
          pagination={articlePagination}
          onQueryChange={setArticleQuery}
          onFilterChange={setArticleFilter}
          onSearch={handleSearch}
          onSelect={selectArticle}
          onCreate={() => createArticle()}
          onPage={(page) =>
            void loadArticles({
              query: articleAppliedQuery,
              status: articleAppliedFilter,
              page,
              selection: "preserve",
            })
          }
        />

        <section className={styles.editorPane}>
          <AdminActionBar
            status={
              <AdminStatus tone={draft.status === "published" ? "success" : draft.status === "draft" ? "warning" : "neutral"}>
                {draft.status === "published" ? "已發布" : draft.status === "archived" ? "已封存" : "草稿"}
              </AdminStatus>
            }
            title={draft.title || "未命名文章"}
            detail={
              dirty
                ? "有未儲存變更"
                : selectedArticle
                  ? `最後儲存 ${formatUpdatedAt(selectedArticle.updatedAt)}`
                  : draft.id
                    ? "目前文章不在此頁清單"
                    : "尚未儲存"
            }
          >
            <AdminButton
              type="button"
              variant="ghost"
              iconOnly
              aria-label="重新整理文章"
              title="重新整理文章"
              onClick={() => refreshArticles()}
              disabled={loading || saving}
            >
              <RefreshCw size={15} />
            </AdminButton>
            {draft.id && (
              <AdminButton
                type="button"
                variant="danger"
                iconOnly
                aria-label="封存文章"
                title="封存文章"
                onClick={() => void archiveCurrent()}
                disabled={saving}
              >
                <Archive size={15} />
              </AdminButton>
            )}
            <AdminButton type="button" onClick={() => void save("draft")} disabled={saving}>
              {saving ? "處理中…" : "儲存草稿"}
            </AdminButton>
            <AdminButton type="button" variant="primary" onClick={() => void save("published")} disabled={saving}>
              發布
            </AdminButton>
          </AdminActionBar>

          {(error || notice) && (
            <div className={error ? editorStyles.errorBanner : editorStyles.noticeBanner} role="status">
              <span>{error || notice}</span>
              {authRequired && <a href="/admin/login/?return_to=%2Fadmin%2Farticles%2F">登入後台</a>}
            </div>
          )}

          <div className={editorStyles.contentGrid}>
            <div className={editorStyles.editColumn}>
              <ArticleDocument
                draft={draft}
                editor={editor}
                dirty={dirty}
                wordCount={wordCount}
                readingMinutes={readingMinutes}
                onTitleChange={(title) => {
                  setDraft((current) => ({ ...current, title, slug: current.slug || slugify(title) }));
                  markDirty();
                }}
                onExcerptChange={(excerpt) => updateDraft("excerpt", excerpt)}
              />
            </div>

            <ArticleInspector
              draft={draft}
              selectedArticle={selectedArticle}
              inspectorTab={inspectorTab}
              revisions={revisions}
              revisionsLoading={revisionsLoading}
              saving={saving}
              heroImageError={heroImageError}
              ogImageError={ogImageError}
              canonicalUrlError={canonicalUrlError}
              publishReadiness={publishReadiness}
              onTab={setInspectorTab}
              onUpdate={updateDraft}
              onLoadRevisions={() => draft.id && void loadRevisions(draft.id)}
              onRestoreRevision={(revision) => void restoreRevision(revision)}
            />
          </div>
        </section>
      </div>
    </AdminTopbar>
  );
}
