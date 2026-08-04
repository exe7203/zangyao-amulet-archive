"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck } from "@puckeditor/core";
import {
  editorPreviewMetadata,
  pageBuilderConfig,
} from "../../site-builder/puck-config";
import {
  createEmptyPageRecord,
  type PageData,
  type PageRecord,
  type PageStatus,
} from "../../site-builder/types";
import {
  isReservedPageSlug,
  normalizePageData,
  normalizePageSlug,
  validatePageData,
} from "../../site-builder/validation";
import styles from "./site-editor.module.css";

const SITE_CODE = "taijuda";
const API_BASE = (process.env.NEXT_PUBLIC_CONTENT_API_URL || "").replace(/\/$/, "");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function normalizePage(value: unknown): PageRecord | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const title = text(value.title);
  const slug = text(value.slug);
  const status = value.status;
  if (!id || !title || !slug || (status !== "draft" && status !== "published" && status !== "archived")) return null;

  return {
    id,
    title,
    slug,
    data: normalizePageData(value.data),
    status,
    seoTitle: text(value.seoTitle),
    seoDescription: text(value.seoDescription),
    canonicalUrl: text(value.canonicalUrl),
    ogImageUrl: text(value.ogImageUrl),
    noindex: value.noindex === true,
    version: Number.isSafeInteger(value.version) ? Number(value.version) : 0,
    publishedAt: nullableText(value.publishedAt),
    createdAt: nullableText(value.createdAt),
    updatedAt: nullableText(value.updatedAt),
  };
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "尚未儲存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: PageStatus) {
  if (status === "published") return "已發布";
  if (status === "archived") return "已封存";
  return "草稿";
}

function isHttpUrlOrEmpty(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function SiteEditor() {
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [draft, setDraft] = useState<PageRecord>(() => createEmptyPageRecord());
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [showSeo, setShowSeo] = useState(true);
  const editRevision = useRef(0);
  const initialLoadStarted = useRef(false);

  const markDirty = useCallback(() => {
    editRevision.current += 1;
    setDirty(true);
    setNotice("");
  }, []);

  const installDraft = useCallback((page: PageRecord) => {
    setDraft(page);
    setEditorKey((value) => value + 1);
    setDirty(false);
    setError("");
    setNotice("");
  }, []);

  const createPage = useCallback(() => {
    if (dirty && !window.confirm("目前頁面還有未儲存變更，確定要新增另一頁嗎？")) return;
    installDraft(createEmptyPageRecord());
  }, [dirty, installDraft]);

  const selectPage = useCallback((page: PageRecord) => {
    if (dirty && draft.id !== page.id && !window.confirm("目前頁面還有未儲存變更，確定要切換嗎？")) return;
    installDraft(page);
  }, [dirty, draft.id, installDraft]);

  const loadPages = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/pages?site=${SITE_CODE}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { pages?: unknown[]; error?: string };
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok) throw new Error(payload.error || "頁面資料讀取失敗");

      const normalized = (payload.pages || []).map(normalizePage).filter((page): page is PageRecord => Boolean(page));
      setPages(normalized);
      setAuthRequired(false);
      const selected = normalized.find((page) => page.id === preferredId) || normalized[0];
      installDraft(selected || createEmptyPageRecord());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "頁面資料讀取失敗");
    } finally {
      setLoading(false);
    }
  }, [installDraft]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const updateDraft = <Key extends keyof PageRecord>(key: Key, value: PageRecord[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    markDirty();
  };

  const updatePageData = (data: PageData) => {
    setDraft((current) => ({ ...current, data }));
    markDirty();
  };

  const save = async (status: Exclude<PageStatus, "archived">, nextData = draft.data) => {
    const title = draft.title.trim();
    const slug = normalizePageSlug(draft.slug || title);
    const validation = validatePageData(nextData);
    if (!title) return setError("請先填寫頁面名稱");
    if (!slug) return setError("請先填寫可用的頁面網址");
    if (isReservedPageSlug(slug)) return setError("這個網址是系統保留路徑，請改用其他網址");
    if (!validation.ok) return setError(`頁面區塊尚未通過安全檢查：${validation.issues[0]}`);
    if (!isHttpUrlOrEmpty(draft.canonicalUrl)) return setError("Canonical URL 必須是完整的 http(s) 網址");
    if (!isHttpUrlOrEmpty(draft.ogImageUrl)) return setError("社群圖片 URL 必須是完整的 http(s) 網址");

    setSaving(true);
    setError("");
    setNotice("");
    const savingRevision = editRevision.current;
    try {
      const response = await fetch(`${API_BASE}/api/admin/pages`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...draft, data: validation.data, slug, status, siteCode: SITE_CODE }),
      });
      const payload = await response.json().catch(() => ({})) as { page?: unknown; error?: string };
      if (response.status === 401) setAuthRequired(true);
      if (response.status === 409) throw new Error(payload.error || "這個頁面已被其他版本更新，請重新整理後再編輯");
      if (!response.ok) throw new Error(payload.error || "頁面儲存失敗");
      const saved = normalizePage(payload.page);
      if (!saved) throw new Error("伺服器沒有回傳有效的頁面資料");

      setDraft((current) => editRevision.current === savingRevision ? saved : {
        ...current,
        id: saved.id,
        slug: saved.slug,
        status: saved.status,
        version: saved.version,
        publishedAt: saved.publishedAt,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      });
      setPages((current) => [saved, ...current.filter((page) => page.id !== saved.id)]);
      if (editRevision.current === savingRevision) setDirty(false);
      setAuthRequired(false);
      setNotice(status === "published"
        ? "頁面已發布至內容資料庫；公開 SEO 版仍須同步快照並重新建置。"
        : "草稿已儲存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "頁面儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const archiveCurrent = async () => {
    if (!draft.id || !window.confirm("確定要封存這個頁面嗎？公開頁將不再列出它。")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/pages/${encodeURIComponent(draft.id)}?site=${SITE_CODE}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "頁面封存失敗");
      setNotice("頁面已封存。");
      await loadPages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "頁面封存失敗");
    } finally {
      setSaving(false);
    }
  };

  const pageValidation = useMemo(() => validatePageData(draft.data), [draft.data]);
  const heroCount = useMemo(() => draft.data.content.filter((block) => block.type === "Hero").length, [draft.data]);
  const seoChecks = [
    { label: "頁面名稱已填寫", pass: Boolean(draft.title.trim()) },
    { label: "網址可用且非系統保留路徑", pass: Boolean(normalizePageSlug(draft.slug || draft.title)) && !isReservedPageSlug(draft.slug || draft.title) },
    { label: "頁面恰好有一個 H1 主視覺", pass: heroCount === 1 },
    { label: "SEO 標題建議 10–60 字", pass: draft.seoTitle.trim().length >= 10 && draft.seoTitle.trim().length <= 60 },
    { label: "Meta 描述建議 50–160 字", pass: draft.seoDescription.trim().length >= 50 && draft.seoDescription.trim().length <= 160 },
    { label: "Canonical URL 格式正確", pass: isHttpUrlOrEmpty(draft.canonicalUrl) },
    { label: "所有區塊通過安全檢查", pass: pageValidation.ok },
  ];
  const seoPassCount = seoChecks.filter((check) => check.pass).length;
  const previewSlug = normalizePageSlug(draft.slug || draft.title) || "page-slug";
  const previewHref = `/pages/${encodeURIComponent(previewSlug)}/`;

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span>泰</span><div><b>泰聚達網站編輯</b><small>STRUCTURED PAGE BUILDER</small></div></div>
      <nav aria-label="後台功能"><Link href="/admin/">文章</Link><Link href="/admin/products/">商品與庫存</Link><Link href="/admin/orders/">訂單</Link><Link className={styles.active} href="/admin/site/">網站編輯</Link></nav>
      <a className={styles.frontLink} href={previewHref} target="_blank" rel="noreferrer">查看公開頁 ↗</a>
    </header>

    <div className={styles.workspace}>
      <aside className={styles.pageSidebar}>
        <div className={styles.sidebarHead}><div><small>PAGES</small><h1>網站頁面</h1></div><button type="button" onClick={createPage} aria-label="新增頁面">＋</button></div>
        <div className={styles.pageList}>
          {loading && <p className={styles.muted}>正在讀取頁面…</p>}
          {!loading && pages.length === 0 && <div className={styles.emptyList}><b>還沒有自訂頁面</b><span>按右上角的＋建立第一頁。</span></div>}
          {pages.map((page) => <button type="button" key={page.id} className={page.id === draft.id ? styles.selectedPage : ""} onClick={() => selectPage(page)}>
            <span className={`${styles.statusDot} ${styles[`status_${page.status}`]}`} />
            <span><b>{page.title}</b><small>/{page.slug}/ · {statusLabel(page.status)}</small></span>
          </button>)}
        </div>
        <div className={styles.sidebarFoot}><span>最後更新</span><b>{formatUpdatedAt(draft.updatedAt)}</b><small>版本 {draft.version}</small></div>
      </aside>

      <section className={styles.editorPane}>
        <div className={styles.editorHeader}>
          <div><span className={`${styles.statusPill} ${styles[`status_${draft.status}`]}`}>{statusLabel(draft.status)}</span><span className={styles.dirtyState}>{dirty ? "尚有未儲存變更" : draft.id ? "內容已儲存" : "新頁面"}</span></div>
          <div className={styles.actions}>
            <button type="button" onClick={() => setShowSeo((value) => !value)}>{showSeo ? "收合設定" : "展開設定"}</button>
            {draft.id && <button type="button" className={styles.archiveButton} onClick={() => void archiveCurrent()} disabled={saving}>封存</button>}
            <button type="button" onClick={() => void save("draft")} disabled={saving}>{saving ? "儲存中…" : "儲存草稿"}</button>
            <button type="button" className={styles.publishButton} onClick={() => void save("published")} disabled={saving}>發布頁面</button>
          </div>
        </div>

        {(error || notice) && <div className={error ? styles.errorBanner : styles.noticeBanner} role="status"><span>{error || notice}</span>{authRequired && <a href="/signin-with-chatgpt?return_to=%2Fadmin%2Fsite%2F">登入後台</a>}</div>}

        {showSeo && <div className={styles.settingsPanel}>
          <div className={styles.basicFields}>
            <label><span>頁面名稱</span><input value={draft.title} onChange={(event) => {
              const title = event.target.value;
              setDraft((current) => ({ ...current, title, slug: current.slug || normalizePageSlug(title) }));
              markDirty();
            }} placeholder="系列或專題名稱" /></label>
            <label><span>頁面網址</span><div className={styles.slugField}><small>/pages/</small><input value={draft.slug} onChange={(event) => updateDraft("slug", normalizePageSlug(event.target.value))} placeholder="page-slug" /><small>/</small></div></label>
            <label><span>SEO 標題 <small>{draft.seoTitle.length}/60</small></span><input value={draft.seoTitle} onChange={(event) => updateDraft("seoTitle", event.target.value)} placeholder="搜尋結果顯示的標題" /></label>
            <label><span>Meta 描述 <small>{draft.seoDescription.length}/160</small></span><textarea rows={3} value={draft.seoDescription} onChange={(event) => updateDraft("seoDescription", event.target.value)} placeholder="用一段話說明這頁能解決什麼問題" /></label>
            <label><span>Canonical URL</span><input type="url" value={draft.canonicalUrl} onChange={(event) => updateDraft("canonicalUrl", event.target.value)} placeholder="https://example.com/pages/.../" /></label>
            <label><span>社群圖片 URL</span><input type="url" value={draft.ogImageUrl} onChange={(event) => updateDraft("ogImageUrl", event.target.value)} placeholder="https://example.com/og/page.jpg" /></label>
            <label className={styles.checkbox}><input type="checkbox" checked={draft.noindex} onChange={(event) => updateDraft("noindex", event.target.checked)} /><span><b>禁止搜尋引擎收錄</b><small>測試頁、短期活動或未完成內容可暫時開啟。</small></span></label>
          </div>
          <aside className={styles.seoReadiness}>
            <div><span>SEO READINESS</span><b>{seoPassCount}/{seoChecks.length}</b></div>
            <ul>{seoChecks.map((check) => <li className={check.pass ? styles.checkPass : ""} key={check.label}><i>{check.pass ? "✓" : "○"}</i>{check.label}</li>)}</ul>
            {draft.noindex && <p>目前已設定 noindex，這一頁不會進入 sitemap。</p>}
          </aside>
        </div>}

        <div className={styles.builderFrame}>
          <Puck
            key={editorKey}
            config={pageBuilderConfig}
            data={draft.data}
            metadata={editorPreviewMetadata}
            headerTitle={draft.title || "新網站頁面"}
            headerPath={previewHref}
            height="calc(100vh - 238px)"
            viewports={[
              { width: 1440, height: "auto", label: "桌面" },
              { width: 768, height: "auto", label: "平板" },
              { width: 390, height: "auto", label: "手機" },
            ]}
            onChange={updatePageData}
            onPublish={(data) => void save("published", data)}
          />
        </div>
      </section>
    </div>
  </main>;
}
