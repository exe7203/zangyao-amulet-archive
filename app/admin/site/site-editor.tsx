"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck } from "@puckeditor/core";
import { publishedBrandMark, publishedBrandName } from "../../../shared/published-site";
import {
  editorPreviewMetadata,
  pageBuilderConfig,
} from "../../site-builder/puck-config";
import {
  createEmptyPageRecord,
  type PageData,
  type PageRenderMetadata,
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
import AdminNavigation from "../admin-navigation";
import {
  DEFAULT_SITE_APPEARANCE,
  normalizeSiteAppearance,
  type SiteAppearance,
} from "../../../shared/site-settings";

const SITE_CODE = "taijuda";
const API_BASE = (process.env.NEXT_PUBLIC_CONTENT_API_URL || "").replace(/\/$/, "");

type PageRevision = {
  revisionId: string;
  pageId: string;
  title: string;
  status: PageStatus;
  version: number;
  createdAt: string;
};

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
  const [showSiteSettings, setShowSiteSettings] = useState(false);
  const [siteAppearance, setSiteAppearance] = useState<SiteAppearance>(DEFAULT_SITE_APPEARANCE);
  const [siteSettingsVersion, setSiteSettingsVersion] = useState(1);
  const [siteSettingsDirty, setSiteSettingsDirty] = useState(false);
  const [siteSettingsSaving, setSiteSettingsSaving] = useState(false);
  const [previewMetadata, setPreviewMetadata] = useState<PageRenderMetadata>(editorPreviewMetadata);
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
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
    setRevisions([]);
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

  const loadPageRevisions = useCallback(async (pageId: string) => {
    setRevisionsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/pages/${encodeURIComponent(pageId)}/revisions?site=${SITE_CODE}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { revisions?: PageRevision[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "頁面版本讀取失敗");
      setRevisions(Array.isArray(payload.revisions) ? payload.revisions : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "頁面版本讀取失敗");
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  const loadSiteSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/site-settings?site=${SITE_CODE}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        siteSettings?: { settings?: unknown; theme?: unknown; version?: number };
        error?: string;
      };
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok || !payload.siteSettings) throw new Error(payload.error || "全站設定讀取失敗");
      setSiteAppearance(normalizeSiteAppearance(payload.siteSettings.settings, payload.siteSettings.theme));
      setSiteSettingsVersion(Number.isSafeInteger(payload.siteSettings.version) ? Number(payload.siteSettings.version) : 1);
      setSiteSettingsDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "全站設定讀取失敗");
    }
  }, []);

  const loadPreviewMetadata = useCallback(async () => {
    try {
      const [productsResponse, articlesResponse] = await Promise.all([
        fetch(`${API_BASE}/api/store/products?site=${SITE_CODE}`, { headers: { accept: "application/json" }, cache: "no-store" }),
        fetch(`${API_BASE}/api/content/articles?site=${SITE_CODE}`, { headers: { accept: "application/json" }, cache: "no-store" }),
      ]);
      if (!productsResponse.ok || !articlesResponse.ok) return;
      const productsPayload = await productsResponse.json() as { products?: unknown[] };
      const articlesPayload = await articlesResponse.json() as { articles?: unknown[] };
      const previewProducts = (productsPayload.products || []).flatMap((value) => {
        if (!isRecord(value) || typeof value.id !== "string" || typeof value.slug !== "string" || typeof value.name !== "string") return [];
        return [{
          id: value.id,
          slug: value.slug,
          name: value.name,
          category: text(value.category),
          origin: text(value.origin),
          material: text(value.material),
          price: Number(value.price || 0),
          stock: Number(value.stock || 0),
          status: text(value.status),
        }];
      });
      const previewArticles = (articlesPayload.articles || []).flatMap((value) => {
        if (!isRecord(value) || typeof value.id !== "string" || typeof value.slug !== "string" || typeof value.title !== "string") return [];
        return [{
          id: value.id,
          slug: value.slug,
          title: value.title,
          excerpt: text(value.excerpt),
          tag: text(value.tag),
          status: text(value.status),
        }];
      });
      setPreviewMetadata({ preview: true, products: previewProducts, articles: previewArticles });
    } catch {
      // Keep the clearly-labelled sample preview when local public APIs are unavailable.
    }
  }, []);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void Promise.all([loadPages(), loadSiteSettings(), loadPreviewMetadata()]);
  }, [loadPages, loadPreviewMetadata, loadSiteSettings]);

  useEffect(() => {
    if (!draft.id) return;
    const pageId = draft.id;
    const timer = window.setTimeout(() => void loadPageRevisions(pageId), 0);
    return () => window.clearTimeout(timer);
  }, [draft.id, loadPageRevisions]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !siteSettingsDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty, siteSettingsDirty]);

  const updateIdentitySetting = (key: keyof SiteAppearance["settings"], value: string) => {
    setSiteAppearance((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
    setSiteSettingsDirty(true);
    setNotice("");
  };

  const updateThemeSetting = (key: keyof SiteAppearance["theme"], value: string) => {
    setSiteAppearance((current) => ({
      ...current,
      theme: { ...current.theme, [key]: value },
    }));
    setSiteSettingsDirty(true);
    setNotice("");
  };

  const saveSiteSettings = async () => {
    const normalized = normalizeSiteAppearance(siteAppearance.settings, siteAppearance.theme);
    setSiteSettingsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/site-settings`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          version: siteSettingsVersion,
          settings: normalized.settings,
          theme: normalized.theme,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        siteSettings?: { settings?: unknown; theme?: unknown; version?: number };
        error?: string;
      };
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok || !payload.siteSettings) throw new Error(payload.error || "全站設定儲存失敗");
      setSiteAppearance(normalizeSiteAppearance(payload.siteSettings.settings, payload.siteSettings.theme));
      setSiteSettingsVersion(Number(payload.siteSettings.version || siteSettingsVersion + 1));
      setSiteSettingsDirty(false);
      setNotice("全站品牌與配色已儲存為待發布設定；編輯器預覽已更新。同步建置後才會套用前台與 SEO，避免兩者不一致。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "全站設定儲存失敗");
    } finally {
      setSiteSettingsSaving(false);
    }
  };

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
      await loadPageRevisions(saved.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "頁面儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const restoreRevision = async (revision: PageRevision) => {
    if (!draft.id || saving) return;
    if (dirty && !window.confirm("目前頁面有未儲存變更。還原版本會以所選版本建立一份新草稿，確定繼續嗎？")) return;
    if (!window.confirm(`確定要把頁面還原到第 ${revision.version} 版嗎？原有版本紀錄不會被刪除。`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/pages/${encodeURIComponent(draft.id)}/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ siteCode: SITE_CODE, revisionId: revision.revisionId, version: draft.version }),
      });
      const payload = await response.json().catch(() => ({})) as { page?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error || "頁面版本還原失敗");
      const restored = normalizePage(payload.page);
      if (!restored) throw new Error("伺服器沒有回傳有效的頁面資料");
      installDraft(restored);
      setPages((current) => [restored, ...current.filter((page) => page.id !== restored.id)]);
      setNotice(`已還原第 ${revision.version} 版並建立新的草稿版本；尚未重新發布。`);
      await loadPageRevisions(restored.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "頁面版本還原失敗");
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
      <div className={styles.brand}><span>{publishedBrandMark}</span><div><b>{publishedBrandName}網站編輯</b><small>STRUCTURED PAGE BUILDER</small></div></div>
      <AdminNavigation active="site" activeClassName={styles.active} />
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
            <button type="button" onClick={() => setShowSiteSettings((value) => !value)}>{showSiteSettings ? "收合全站" : "全站設定"}</button>
            <button type="button" onClick={() => setShowHistory((value) => !value)} disabled={!draft.id}>{showHistory ? "收合版本" : "版本紀錄"}</button>
            <button type="button" onClick={() => setShowSeo((value) => !value)}>{showSeo ? "收合設定" : "展開設定"}</button>
            {draft.id && <button type="button" className={styles.archiveButton} onClick={() => void archiveCurrent()} disabled={saving}>封存</button>}
            <button type="button" onClick={() => void save("draft")} disabled={saving}>{saving ? "儲存中…" : "儲存草稿"}</button>
            <button type="button" className={styles.publishButton} onClick={() => void save("published")} disabled={saving}>發布頁面</button>
          </div>
        </div>

        {(error || notice) && <div className={error ? styles.errorBanner : styles.noticeBanner} role="status"><span>{error || notice}</span>{authRequired && <a href="/signin-with-chatgpt?return_to=%2Fadmin%2Fsite%2F">登入後台</a>}</div>}

        {showHistory && draft.id && <section className={styles.historyPanel} aria-label="頁面版本紀錄">
          <div><small>PAGE HISTORY</small><h2>版本紀錄</h2><p>還原會建立新的草稿版本，不會刪除或覆蓋舊紀錄。</p></div>
          <div className={styles.historyList}>
            {revisionsLoading && <span>正在讀取版本…</span>}
            {!revisionsLoading && revisions.length === 0 && <span>目前沒有版本紀錄。</span>}
            {revisions.map((revision) => <article key={revision.revisionId}>
              <div><b>第 {revision.version} 版・{statusLabel(revision.status)}</b><small>{formatUpdatedAt(revision.createdAt)}</small></div>
              <button type="button" onClick={() => void restoreRevision(revision)} disabled={saving || revision.version === draft.version}>{revision.version === draft.version ? "目前版本" : "還原為草稿"}</button>
            </article>)}
          </div>
        </section>}

        {showSiteSettings && <section className={`${styles.settingsPanel} ${styles.siteSettingsPanel}`} aria-label="全站品牌與配色">
          <div>
            <div className={styles.settingsTitle}><div><small>SITE IDENTITY</small><h2>全站品牌與配色</h2></div><span>{siteSettingsDirty ? "尚未儲存" : `版本 ${siteSettingsVersion}`}</span></div>
            <div className={styles.basicFields}>
              <label><span>品牌名稱</span><input value={siteAppearance.settings.brandName} maxLength={80} onChange={(event) => updateIdentitySetting("brandName", event.target.value)} /></label>
              <label><span>英文副標</span><input value={siteAppearance.settings.brandSubtitle} maxLength={120} onChange={(event) => updateIdentitySetting("brandSubtitle", event.target.value)} /></label>
              <label><span>公告短句</span><input value={siteAppearance.settings.announcement} maxLength={120} onChange={(event) => updateIdentitySetting("announcement", event.target.value)} /></label>
              <label className={styles.wideField}><span>頁尾提醒</span><textarea rows={2} value={siteAppearance.settings.footerNote} maxLength={300} onChange={(event) => updateIdentitySetting("footerNote", event.target.value)} /></label>
              <label className={styles.colorField}><span>品牌金色</span><div><input type="color" value={siteAppearance.theme.accent} onChange={(event) => updateThemeSetting("accent", event.target.value)} /><code>{siteAppearance.theme.accent}</code></div></label>
              <label className={styles.colorField}><span>頁面底色</span><div><input type="color" value={siteAppearance.theme.surface} onChange={(event) => updateThemeSetting("surface", event.target.value)} /><code>{siteAppearance.theme.surface}</code></div></label>
              <label className={styles.colorField}><span>主要文字</span><div><input type="color" value={siteAppearance.theme.ink} onChange={(event) => updateThemeSetting("ink", event.target.value)} /><code>{siteAppearance.theme.ink}</code></div></label>
            </div>
          </div>
          <aside className={styles.siteSettingsSummary}>
            <span>SAFE TEMPLATE</span>
            <h3>保留商店骨架，只開放安全欄位</h3>
            <p>品牌、公告、頁尾與配色會套用到首頁；商品流程、SEO 結構與行動版版型不會被任意拖曳破壞。</p>
            <div className={styles.colorPreview} style={{ background: siteAppearance.theme.surface, color: siteAppearance.theme.ink, borderColor: siteAppearance.theme.accent }}><i style={{ background: siteAppearance.theme.accent }} />{siteAppearance.settings.brandName || "品牌預覽"}</div>
            <button type="button" onClick={() => void saveSiteSettings()} disabled={siteSettingsSaving || !siteSettingsDirty}>{siteSettingsSaving ? "儲存中…" : "儲存全站設定"}</button>
          </aside>
        </section>}

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
            metadata={previewMetadata}
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
