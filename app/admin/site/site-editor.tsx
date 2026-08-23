"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck, type Overrides } from "@puckeditor/core";
import { Plus, Search } from "lucide-react";
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
  evaluatePageSeoPublishReadiness,
  isReservedPageSlug,
  normalizePageData,
  normalizePageSlug,
  PAGE_SEO_PUBLISH_REQUIREMENTS,
  validatePageData,
} from "../../site-builder/validation";
import styles from "./site-editor.module.css";
import { PUBLIC_SITE_CODE } from "../../../shared/site-context";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "../admin-chrome";
import {
  DEFAULT_SITE_APPEARANCE,
  evaluateSiteThemeContrast,
  HOME_SECTION_IDS,
  MIN_SITE_THEME_CONTRAST,
  normalizeSiteAppearance,
  validateSiteSettingsStructure,
  type HomeSectionId,
  type SiteAppearance,
} from "../../../shared/site-settings";
import { SafePublicImage } from "../../product-artwork";
import { ADMIN_IMAGE_URL_MAX_LENGTH, validateHttpUrlField } from "../image-field-contract";

const SITE_CODE = PUBLIC_SITE_CODE;
const API_BASE = (process.env.NEXT_PUBLIC_CONTENT_API_URL || "").replace(/\/$/, "");
const puckOverrides = {
  headerActions: () => <></>,
} satisfies Partial<Overrides<typeof pageBuilderConfig>>;

type PageRevision = {
  revisionId: string;
  pageId: string;
  title: string;
  status: PageStatus;
  version: number;
  createdAt: string;
};

type PageFilter = "all" | PageStatus;

type PageListPagination = {
  page: number;
  limit: number;
  maxLimit: number;
  total: number;
  totalPages: number;
  returned: number;
};

type PageListSelection = "initial" | "preserve" | "force";

type PageListOptions = {
  query?: string;
  status?: PageFilter;
  page?: number;
  preferredId?: string;
  selection?: PageListSelection;
};

const EMPTY_PAGE_PAGINATION: PageListPagination = {
  page: 1,
  limit: 40,
  maxLimit: 100,
  total: 0,
  totalPages: 0,
  returned: 0,
};

const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  hero: "主視覺與服務特色",
  collections: "商品分類",
  products: "最新商品",
  themes: "活動聚會",
  archive: "商品資訊說明",
  journal: "文章專欄",
};

type SiteSettingsRevision = {
  revisionId: string;
  version: number;
  savedBy: string;
  createdAt: string;
  settings: unknown;
  theme: unknown;
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

function formatContrastRatio(value: number) {
  return `${value.toFixed(2)}:1`;
}

function settingsRevisionActor(value: string) {
  if (value === "local-preview") return "本機管理員";
  if (value === "catalog-seed" || value === "system") return "系統初始值";
  return value || "系統";
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
  const [showSiteSettingsHistory, setShowSiteSettingsHistory] = useState(false);
  const [siteSettingsRevisions, setSiteSettingsRevisions] = useState<SiteSettingsRevision[]>([]);
  const [siteSettingsRevisionsLoading, setSiteSettingsRevisionsLoading] = useState(false);
  const [siteSettingsRevisionsHasMore, setSiteSettingsRevisionsHasMore] = useState(false);
  const [previewMetadata, setPreviewMetadata] = useState<PageRenderMetadata>(editorPreviewMetadata);
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const [pageFilter, setPageFilter] = useState<PageFilter>("all");
  const [pageAppliedQuery, setPageAppliedQuery] = useState("");
  const [pageAppliedFilter, setPageAppliedFilter] = useState<PageFilter>("all");
  const [pagePagination, setPagePagination] = useState<PageListPagination>(EMPTY_PAGE_PAGINATION);
  const editRevision = useRef(0);
  const siteSettingsEditRevision = useRef(0);
  const initialLoadStarted = useRef(false);
  const pageListRequestId = useRef(0);
  const siteThemeContrast = useMemo(
    () => evaluateSiteThemeContrast(siteAppearance.theme),
    [siteAppearance.theme],
  );
  const siteStructureError = useMemo(
    () => validateSiteSettingsStructure(siteAppearance.settings),
    [siteAppearance.settings],
  );
  const pageCanonicalError = validateHttpUrlField(draft.canonicalUrl, "Canonical URL");
  const pageOgImageError = validateHttpUrlField(draft.ogImageUrl, "社群圖片 URL");

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

  const createPage = useCallback((force = false) => {
    if (!force && dirty && !window.confirm("目前頁面還有未儲存變更，確定要新增另一頁嗎？")) return;
    installDraft(createEmptyPageRecord());
  }, [dirty, installDraft]);

  const selectPage = useCallback((page: PageRecord, force = false) => {
    if (!force && dirty && draft.id !== page.id && !window.confirm("目前頁面還有未儲存變更，確定要切換嗎？")) return;
    installDraft(page);
  }, [dirty, draft.id, installDraft]);

  const loadPages = useCallback(async (options: PageListOptions = {}) => {
    const requestId = pageListRequestId.current + 1;
    pageListRequestId.current = requestId;
    const page = Math.max(1, Math.trunc(options.page || 1));
    const status = options.status || "all";
    const query = options.query?.trim() || "";
    const params = new URLSearchParams({
      site: SITE_CODE,
      page: String(page),
      limit: String(pagePagination.limit),
    });
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/pages?${params.toString()}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        pages?: unknown[];
        pagination?: Partial<PageListPagination>;
        error?: string;
      };
      if (requestId !== pageListRequestId.current) return;
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok) throw new Error(payload.error || "頁面資料讀取失敗");

      const normalized = (payload.pages || []).map(normalizePage).filter((page): page is PageRecord => Boolean(page));
      const total = Number.isSafeInteger(payload.pagination?.total)
        ? Number(payload.pagination?.total)
        : normalized.length;
      const limit = Number.isSafeInteger(payload.pagination?.limit)
        ? Math.max(1, Number(payload.pagination?.limit))
        : pagePagination.limit;
      const nextPagination: PageListPagination = {
        page: Number.isSafeInteger(payload.pagination?.page) ? Math.max(1, Number(payload.pagination?.page)) : page,
        limit,
        maxLimit: Number.isSafeInteger(payload.pagination?.maxLimit)
          ? Math.max(limit, Number(payload.pagination?.maxLimit))
          : EMPTY_PAGE_PAGINATION.maxLimit,
        total,
        totalPages: Number.isSafeInteger(payload.pagination?.totalPages)
          ? Math.max(0, Number(payload.pagination?.totalPages))
          : Math.ceil(total / limit),
        returned: Number.isSafeInteger(payload.pagination?.returned)
          ? Math.max(0, Number(payload.pagination?.returned))
          : normalized.length,
      };
      setPages(normalized);
      setPagePagination(nextPagination);
      setAuthRequired(false);
      if (options.selection !== "preserve") {
        const selected = normalized.find((item) => item.id === options.preferredId) || normalized[0];
        const force = options.selection === "force";
        if (selected) selectPage(selected, force);
        else createPage(force);
      }
    } catch (cause) {
      if (requestId !== pageListRequestId.current) return;
      setError(cause instanceof Error ? cause.message : "頁面資料讀取失敗");
    } finally {
      if (requestId === pageListRequestId.current) setLoading(false);
    }
  }, [createPage, pagePagination.limit, selectPage]);

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

  const loadSiteSettingsRevisions = useCallback(async (offset = 0, append = false) => {
    setSiteSettingsRevisionsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/site-settings/revisions?site=${SITE_CODE}&limit=10&offset=${offset}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        revisions?: unknown[];
        pagination?: { hasMore?: boolean };
        error?: string;
      };
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok) throw new Error(payload.error || "全站設定版本讀取失敗");
      const normalized = (payload.revisions || []).flatMap((value) => {
        if (!isRecord(value) || typeof value.revisionId !== "string" || !Number.isSafeInteger(value.version)) return [];
        return [{
          revisionId: value.revisionId,
          version: Number(value.version),
          savedBy: text(value.savedBy),
          createdAt: text(value.createdAt),
          settings: value.settings,
          theme: value.theme,
        } satisfies SiteSettingsRevision];
      });
      setSiteSettingsRevisions((current) => {
        if (!append) return normalized;
        const seen = new Set(current.map((revision) => revision.revisionId));
        return [...current, ...normalized.filter((revision) => !seen.has(revision.revisionId))];
      });
      setSiteSettingsRevisionsHasMore(payload.pagination?.hasMore === true);
      setAuthRequired(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "全站設定版本讀取失敗");
      if (!append) setSiteSettingsRevisions([]);
    } finally {
      setSiteSettingsRevisionsLoading(false);
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

  const updateIdentitySetting = <Key extends keyof SiteAppearance["settings"]>(key: Key, value: SiteAppearance["settings"][Key]) => {
    siteSettingsEditRevision.current += 1;
    setSiteAppearance((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
    setSiteSettingsDirty(true);
    setNotice("");
  };

  const updateNavigationItem = (index: number, field: "label" | "href", value: string) => {
    const next = siteAppearance.settings.primaryNavigation.map((item, itemIndex) => itemIndex === index
      ? { ...item, [field]: value }
      : item);
    updateIdentitySetting("primaryNavigation", next);
  };

  const moveNavigationItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= siteAppearance.settings.primaryNavigation.length) return;
    const next = [...siteAppearance.settings.primaryNavigation];
    [next[index], next[target]] = [next[target], next[index]];
    updateIdentitySetting("primaryNavigation", next);
  };

  const removeNavigationItem = (index: number) => {
    if (siteAppearance.settings.primaryNavigation.length <= 2) return;
    updateIdentitySetting("primaryNavigation", siteAppearance.settings.primaryNavigation.filter((_, itemIndex) => itemIndex !== index));
  };

  const addNavigationItem = () => {
    if (siteAppearance.settings.primaryNavigation.length >= 6) return;
    const used = new Set(siteAppearance.settings.primaryNavigation.map((item) => item.href));
    const href = ["/service/contact/", "/#archive", "/#themes", "/service/shipping/", "/service/returns/", "/service/privacy/"]
      .find((candidate) => !used.has(candidate)) || "/about/";
    updateIdentitySetting("primaryNavigation", [
      ...siteAppearance.settings.primaryNavigation,
      { label: "新連結", href },
    ]);
  };

  const moveHomeSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= siteAppearance.settings.homeSectionOrder.length) return;
    const next = [...siteAppearance.settings.homeSectionOrder];
    [next[index], next[target]] = [next[target], next[index]];
    updateIdentitySetting("homeSectionOrder", next);
  };

  const setHomeSectionVisibility = (id: HomeSectionId, visible: boolean) => {
    if (id === "hero" || id === "products") return;
    updateIdentitySetting("homeSectionOrder", siteAppearance.settings.homeSectionOrder.map((section) => section.id === id
      ? { ...section, visible }
      : section));
  };

  const updateThemeSetting = (key: keyof SiteAppearance["theme"], value: string) => {
    siteSettingsEditRevision.current += 1;
    setSiteAppearance((current) => ({
      ...current,
      theme: { ...current.theme, [key]: value },
    }));
    setSiteSettingsDirty(true);
    setNotice("");
  };

  const saveSiteSettings = async () => {
    if (siteStructureError) {
      setError(siteStructureError);
      setNotice("");
      return;
    }
    const normalized = normalizeSiteAppearance(siteAppearance.settings, siteAppearance.theme);
    const contrast = evaluateSiteThemeContrast(normalized.theme);
    if (!contrast.ok) {
      setError(contrast.passesArchivePalette
        ? `配色對比不足。主要文字與頁面底色、品牌重點色都必須至少 ${MIN_SITE_THEME_CONTRAST}:1。`
        : "目前固定版型只支援淺色頁面底與深色主要文字，請調整後再儲存。");
      setNotice("");
      return;
    }
    setSiteSettingsSaving(true);
    setError("");
    setNotice("");
    const savingRevision = siteSettingsEditRevision.current;
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
      const savedAppearance = normalizeSiteAppearance(payload.siteSettings.settings, payload.siteSettings.theme);
      setSiteSettingsVersion(Number(payload.siteSettings.version || siteSettingsVersion + 1));
      if (siteSettingsEditRevision.current === savingRevision) {
        setSiteAppearance(savedAppearance);
        setSiteSettingsDirty(false);
        setNotice("全站品牌、導覽、首頁編排與配色已儲存為待發布設定。同步建置後才會套用前台與 SEO，避免兩者不一致。");
      } else {
        setSiteSettingsDirty(true);
        setNotice("送出時的版本已儲存；等待期間新增的修改仍保留，請再按一次儲存。");
      }
      if (showSiteSettingsHistory) await loadSiteSettingsRevisions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "全站設定儲存失敗");
    } finally {
      setSiteSettingsSaving(false);
    }
  };

  const restoreSiteSettingsRevision = async (revision: SiteSettingsRevision) => {
    if (siteSettingsSaving) return;
    if (siteSettingsDirty && !window.confirm("全站設定還有未儲存變更。繼續還原會捨棄這些變更，確定要繼續嗎？")) return;
    if (!window.confirm(`確定要還原第 ${revision.version} 版嗎？系統會保留現況，並建立新的版本。`)) return;
    setSiteSettingsSaving(true);
    setError("");
    setNotice("");
    const restoringEditRevision = siteSettingsEditRevision.current;
    try {
      const response = await fetch(`${API_BASE}/api/admin/site-settings/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          revisionId: revision.revisionId,
          expectedVersion: siteSettingsVersion,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        siteSettings?: { settings?: unknown; theme?: unknown; version?: number };
        error?: string;
      };
      if (response.status === 401) setAuthRequired(true);
      if (!response.ok || !payload.siteSettings) throw new Error(payload.error || "全站設定還原失敗");
      const restoredAppearance = normalizeSiteAppearance(payload.siteSettings.settings, payload.siteSettings.theme);
      setSiteSettingsVersion(Number(payload.siteSettings.version || siteSettingsVersion + 1));
      if (siteSettingsEditRevision.current === restoringEditRevision) {
        setSiteAppearance(restoredAppearance);
        setSiteSettingsDirty(false);
        setNotice(`已依第 ${revision.version} 版建立新的全站設定版本。同步建置後才會套用前台。`);
      } else {
        setSiteSettingsDirty(true);
        setNotice("伺服器已完成還原；等待期間新增的修改仍保留，請確認後再儲存。");
      }
      setAuthRequired(false);
      await loadSiteSettingsRevisions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "全站設定還原失敗");
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
    if (pageCanonicalError) return setError(pageCanonicalError);
    if (pageOgImageError) return setError(pageOgImageError);
    const seoReadiness = evaluatePageSeoPublishReadiness(draft);
    if (status === "published" && !seoReadiness.ok) {
      setShowSeo(true);
      return setError(
        `發布前請完成 SEO 標題（至少 ${PAGE_SEO_PUBLISH_REQUIREMENTS.seoTitleLength} 字）與 Meta 描述（至少 ${PAGE_SEO_PUBLISH_REQUIREMENTS.seoDescriptionLength} 字）`,
      );
    }

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
        ? "頁面已發布至內容資料庫；請同步公開內容並重新建置網站。"
        : "草稿已儲存。");
      await Promise.all([
        loadPageRevisions(saved.id),
        loadPages({
          query: pageAppliedQuery,
          status: pageAppliedFilter,
          page: pagePagination.page,
          preferredId: saved.id,
          selection: "preserve",
        }),
      ]);
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
      await Promise.all([
        loadPageRevisions(restored.id),
        loadPages({
          query: pageAppliedQuery,
          status: pageAppliedFilter,
          page: pagePagination.page,
          preferredId: restored.id,
          selection: "preserve",
        }),
      ]);
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
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ expectedVersion: draft.version }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "頁面封存失敗");
      await loadPages({
        query: pageAppliedQuery,
        status: pageAppliedFilter,
        page: 1,
        preferredId: draft.id,
        selection: "force",
      });
      setNotice("頁面已封存。");
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
    { label: `SEO 標題至少 ${PAGE_SEO_PUBLISH_REQUIREMENTS.seoTitleLength} 字（建議不超過 60 字）`, pass: draft.seoTitle.trim().length >= PAGE_SEO_PUBLISH_REQUIREMENTS.seoTitleLength && draft.seoTitle.trim().length <= 60 },
    { label: `Meta 描述至少 ${PAGE_SEO_PUBLISH_REQUIREMENTS.seoDescriptionLength} 字（建議不超過 160 字）`, pass: draft.seoDescription.trim().length >= PAGE_SEO_PUBLISH_REQUIREMENTS.seoDescriptionLength && draft.seoDescription.trim().length <= 160 },
    { label: "Canonical URL 格式正確", pass: !pageCanonicalError },
    { label: "社群圖片 URL 格式正確", pass: !pageOgImageError },
    { label: "所有區塊通過安全檢查", pass: pageValidation.ok },
  ];
  const seoPassCount = seoChecks.filter((check) => check.pass).length;
  const previewSlug = normalizePageSlug(draft.slug || draft.title) || "page-slug";
  const previewHref = `/pages/${encodeURIComponent(previewSlug)}/`;
  const pageListIsFiltered = Boolean(pageAppliedQuery) || pageAppliedFilter !== "all";
  const selectedPageIsListed = pages.some((page) => page.id === draft.id);

  return <main className={styles.shell}>
    <AdminTopbar active="site" previewHref={previewHref} hasUnsavedChanges={dirty || siteSettingsDirty} />

    <div className={styles.workspace}>
      <aside className={styles.pageSidebar}>
        <div className={styles.sidebarHead}><div><small>PAGES · {pagePagination.total}</small><h1>網站頁面</h1></div><button type="button" onClick={() => createPage()}><Plus size={14} />新增</button></div>
        <form
          className={styles.pageFilters}
          onSubmit={(event) => {
            event.preventDefault();
            const query = pageQuery.trim();
            setPageAppliedQuery(query);
            setPageAppliedFilter(pageFilter);
            void loadPages({ query, status: pageFilter, page: 1, selection: "preserve" });
          }}
        >
          <label className={styles.pageSearchField}>
            <Search size={14} aria-hidden="true" />
            <span className={styles.srOnly}>搜尋網站頁面</span>
            <input value={pageQuery} onChange={(event) => setPageQuery(event.target.value)} placeholder="搜尋名稱或網址" />
          </label>
          <label>
            <span className={styles.srOnly}>依狀態篩選頁面</span>
            <select
              value={pageFilter}
              onChange={(event) => {
                const status = event.target.value as PageFilter;
                setPageFilter(status);
                const query = pageQuery.trim();
                setPageAppliedQuery(query);
                setPageAppliedFilter(status);
                void loadPages({ query, status, page: 1, selection: "preserve" });
              }}
            >
              <option value="all">全部狀態</option>
              <option value="draft">草稿</option>
              <option value="published">已發布</option>
              <option value="archived">已封存</option>
            </select>
          </label>
          <button type="submit" disabled={loading}>搜尋</button>
        </form>
        <div className={styles.pageList}>
          {loading && <p className={styles.muted}>正在讀取頁面…</p>}
          {!loading && pages.length === 0 && <div className={styles.emptyList}>
            <b>{pageListIsFiltered ? "沒有符合條件的頁面" : pagePagination.total > 0 ? "此頁沒有內容" : "還沒有自訂頁面"}</b>
            <span>{pageListIsFiltered ? "請調整搜尋文字或狀態。" : pagePagination.total > 0 ? "請返回上一頁查看內容。" : "按右上角的＋建立第一頁。"}</span>
          </div>}
          {pages.map((page) => <button type="button" key={page.id} className={page.id === draft.id ? styles.selectedPage : ""} onClick={() => selectPage(page)}>
            <span className={`${styles.statusDot} ${styles[`status_${page.status}`]}`} />
            <span><b>{page.title}</b><small>/{page.slug}/ · {statusLabel(page.status)}</small></span>
          </button>)}
        </div>
        <div className={styles.sidebarFoot}>
          <div className={styles.pageCount}><span>共 {pagePagination.total} 頁</span><span>第 {pagePagination.page} / {Math.max(1, pagePagination.totalPages)} 頁</span></div>
          <div className={styles.sidebarPager}>
            <button
              type="button"
              onClick={() => void loadPages({
                query: pageAppliedQuery,
                status: pageAppliedFilter,
                page: pagePagination.page - 1,
                selection: "preserve",
              })}
              disabled={loading || pagePagination.page <= 1}
            >上一頁</button>
            <button
              type="button"
              onClick={() => void loadPages({
                query: pageAppliedQuery,
                status: pageAppliedFilter,
                page: pagePagination.page + 1,
                selection: "preserve",
              })}
              disabled={loading || pagePagination.totalPages === 0 || pagePagination.page >= pagePagination.totalPages}
            >下一頁</button>
          </div>
          <span>目前頁面最後更新</span><b>{formatUpdatedAt(draft.updatedAt)}</b><small>版本 {draft.version}</small>
        </div>
      </aside>

      <section className={styles.editorPane}>
        <AdminActionBar
          status={<AdminStatus tone={draft.status === "published" ? "success" : draft.status === "draft" ? "warning" : "neutral"}>{statusLabel(draft.status)}</AdminStatus>}
          title={draft.title || "新網站頁面"}
          detail={dirty ? "尚有未儲存變更" : draft.id ? selectedPageIsListed ? "內容已儲存" : "目前頁面不在此頁清單" : "新頁面"}
        >
          <AdminButton type="button" variant="ghost" onClick={() => setShowSiteSettings((value) => !value)}>{showSiteSettings ? "收合全站" : "全站設定"}</AdminButton>
          <AdminButton type="button" variant="ghost" onClick={() => setShowHistory((value) => !value)} disabled={!draft.id}>{showHistory ? "收合版本" : "版本紀錄"}</AdminButton>
          <AdminButton type="button" variant="ghost" onClick={() => setShowSeo((value) => !value)}>{showSeo ? "收合設定" : "頁面設定"}</AdminButton>
          {draft.id && <AdminButton type="button" variant="danger" onClick={() => void archiveCurrent()} disabled={saving}>封存</AdminButton>}
          <AdminButton type="button" onClick={() => void save("draft")} disabled={saving}>{saving ? "儲存中…" : "儲存草稿"}</AdminButton>
          <AdminButton type="button" variant="primary" onClick={() => void save("published")} disabled={saving}>發布頁面</AdminButton>
        </AdminActionBar>

        {(error || notice) && <div className={error ? styles.errorBanner : styles.noticeBanner} role="status"><span>{error || notice}</span>{authRequired && <a href="/admin/login/?return_to=%2Fadmin%2Fsite%2F">登入後台</a>}</div>}

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

        {showSiteSettings && <section className={`${styles.settingsPanel} ${styles.siteSettingsPanel}`} aria-label="全站品牌、配色與首頁內容">
          <div>
            <div className={styles.settingsTitle}>
              <div><small>SITE IDENTITY</small><h2>全站品牌、配色與首頁內容</h2></div>
              <div className={styles.siteSettingsTitleActions}>
                <span>{siteSettingsDirty ? "尚未儲存" : `版本 ${siteSettingsVersion}`}</span>
                <button type="button" onClick={() => {
                  const next = !showSiteSettingsHistory;
                  setShowSiteSettingsHistory(next);
                  if (next) void loadSiteSettingsRevisions();
                }}>{showSiteSettingsHistory ? "收合版本紀錄" : "版本紀錄"}</button>
              </div>
            </div>
            <div className={styles.basicFields}>
              <label><span>品牌名稱</span><input value={siteAppearance.settings.brandName} maxLength={80} onChange={(event) => updateIdentitySetting("brandName", event.target.value)} /></label>
              <label><span>英文副標</span><input value={siteAppearance.settings.brandSubtitle} maxLength={120} onChange={(event) => updateIdentitySetting("brandSubtitle", event.target.value)} /></label>
              <label><span>公告短句</span><input value={siteAppearance.settings.announcement} maxLength={120} onChange={(event) => updateIdentitySetting("announcement", event.target.value)} /></label>
              <label className={styles.wideField}><span>頁尾提醒</span><textarea rows={2} value={siteAppearance.settings.footerNote} maxLength={300} onChange={(event) => updateIdentitySetting("footerNote", event.target.value)} /></label>
              <div className={styles.settingsGroupTitle}><b>企業與客服資訊</b><small>填寫後會顯示於頁尾與客服頁；空白則前台顯示「尚未公布」，避免虛構聯絡資料。</small></div>
              <label><span>法定商號／公司名</span><input value={siteAppearance.settings.businessLegalName} maxLength={120} placeholder="例如：泰聚達行銷有限公司" onChange={(event) => updateIdentitySetting("businessLegalName", event.target.value)} /></label>
              <label><span>客服電話</span><input value={siteAppearance.settings.contactPhone} maxLength={40} placeholder="例如：09xx-xxx-xxx" onChange={(event) => updateIdentitySetting("contactPhone", event.target.value)} /></label>
              <label><span>客服 Email</span><input value={siteAppearance.settings.contactEmail} maxLength={120} placeholder="例如：service@example.com" onChange={(event) => updateIdentitySetting("contactEmail", event.target.value)} /></label>
              <label><span>客服時間</span><input value={siteAppearance.settings.contactHours} maxLength={120} placeholder="例如：週一至週五 10:00–18:00" onChange={(event) => updateIdentitySetting("contactHours", event.target.value)} /></label>
              <label className={styles.wideField}><span>營業／聯絡地址</span><input value={siteAppearance.settings.businessAddress} maxLength={200} placeholder="公開聯絡地址（可與退貨地址不同）" onChange={(event) => updateIdentitySetting("businessAddress", event.target.value)} /></label>
              <label className={styles.wideField}><span>LINE 官方連結</span><input value={siteAppearance.settings.lineOfficialUrl} maxLength={300} placeholder="https://line.me/..." onChange={(event) => updateIdentitySetting("lineOfficialUrl", event.target.value)} /></label>
              <div className={styles.settingsGroupTitle}><b>交易政策摘要</b><small>會顯示於配送／退貨／結帳說明；正式數字與地址請寫清楚。</small></div>
              <label className={styles.wideField}><span>配送與運費摘要</span><textarea rows={3} value={siteAppearance.settings.shippingPolicySummary} maxLength={500} onChange={(event) => updateIdentitySetting("shippingPolicySummary", event.target.value)} /></label>
              <label className={styles.wideField}><span>付款方式摘要</span><textarea rows={3} value={siteAppearance.settings.paymentPolicySummary} maxLength={500} onChange={(event) => updateIdentitySetting("paymentPolicySummary", event.target.value)} /></label>
              <label className={styles.wideField}><span>退換貨摘要</span><textarea rows={3} value={siteAppearance.settings.returnsPolicySummary} maxLength={500} onChange={(event) => updateIdentitySetting("returnsPolicySummary", event.target.value)} /></label>
              <label className={styles.colorField}><span>品牌金色</span><div><input type="color" value={siteAppearance.theme.accent} onChange={(event) => updateThemeSetting("accent", event.target.value)} /><code>{siteAppearance.theme.accent}</code></div></label>
              <label className={styles.colorField}><span>頁面底色</span><div><input type="color" value={siteAppearance.theme.surface} onChange={(event) => updateThemeSetting("surface", event.target.value)} /><code>{siteAppearance.theme.surface}</code></div></label>
              <label className={styles.colorField}><span>主要文字</span><div><input type="color" value={siteAppearance.theme.ink} onChange={(event) => updateThemeSetting("ink", event.target.value)} /><code>{siteAppearance.theme.ink}</code></div></label>
              <div className={styles.settingsGroupTitle}><b>全站主要導覽</b><small>桌機、手機抽屜與頁尾共用；最多 6 個，只接受站內路徑或 #錨點。</small></div>
              <div className={styles.navigationEditor}>
                {siteAppearance.settings.primaryNavigation.map((item, index) => {
                  const required = item.href === "/" || item.href === "/#hero" || item.href === "#hero" || item.href === "/#products" || item.href === "#products";
                  return <article key={index}>
                    <span className={styles.itemIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <label><span>顯示文字</span><input value={item.label} maxLength={30} onChange={(event) => updateNavigationItem(index, "label", event.target.value)} /></label>
                    <label><span>站內連結</span><input value={item.href} maxLength={200} aria-invalid={!item.href.startsWith("/") && !item.href.startsWith("#")} onChange={(event) => updateNavigationItem(index, "href", event.target.value)} /></label>
                    <div className={styles.rowActions}><button type="button" onClick={() => moveNavigationItem(index, -1)} disabled={index === 0} aria-label={`將${item.label || "連結"}上移`}>↑</button><button type="button" onClick={() => moveNavigationItem(index, 1)} disabled={index === siteAppearance.settings.primaryNavigation.length - 1} aria-label={`將${item.label || "連結"}下移`}>↓</button><button type="button" onClick={() => removeNavigationItem(index)} disabled={required || siteAppearance.settings.primaryNavigation.length <= 2}>刪除</button></div>
                    {required && <small className={styles.requiredTag}>必備</small>}
                  </article>;
                })}
                <div className={styles.editorFooter}><span>至少保留首頁與商品連結；服務、隱私與客服安全連結會另外固定保留。</span><button type="button" onClick={addNavigationItem} disabled={siteAppearance.settings.primaryNavigation.length >= 6}><Plus size={12} />新增導覽</button></div>
              </div>
              <div className={styles.settingsGroupTitle}><b>首頁區塊順序</b><small>共 {HOME_SECTION_IDS.length} 個區塊；主視覺與最新商品為商店必備，不能隱藏。</small></div>
              <div className={styles.sectionOrderEditor}>
                {siteAppearance.settings.homeSectionOrder.map((section, index) => {
                  const required = section.id === "hero" || section.id === "products";
                  return <article key={section.id}>
                    <span className={styles.itemIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <div><b>{HOME_SECTION_LABELS[section.id]}</b><small>{section.id}</small></div>
                    <label className={styles.visibilityControl}><input type="checkbox" checked={required || section.visible} disabled={required} onChange={(event) => setHomeSectionVisibility(section.id, event.target.checked)} /><span>{required ? "必備顯示" : section.visible ? "顯示" : "隱藏"}</span></label>
                    <div className={styles.rowActions}><button type="button" onClick={() => moveHomeSection(index, -1)} disabled={index === 0} aria-label={`將${HOME_SECTION_LABELS[section.id]}上移`}>↑</button><button type="button" onClick={() => moveHomeSection(index, 1)} disabled={index === siteAppearance.settings.homeSectionOrder.length - 1} aria-label={`將${HOME_SECTION_LABELS[section.id]}下移`}>↓</button></div>
                  </article>;
                })}
              </div>
              <div className={styles.settingsGroupTitle}><b>首頁固定版型文案</b><small>以下欄位只修改文字；導覽與區塊順序請使用上方設定。</small></div>
              <label><span>首頁眉題 <small>{siteAppearance.settings.homeHeroEyebrow.length}/80</small></span><input value={siteAppearance.settings.homeHeroEyebrow} maxLength={80} onChange={(event) => updateIdentitySetting("homeHeroEyebrow", event.target.value)} /></label>
              <label><span>主標第一行 <small>{siteAppearance.settings.homeHeroTitlePrimary.length}/80</small></span><input value={siteAppearance.settings.homeHeroTitlePrimary} maxLength={80} onChange={(event) => updateIdentitySetting("homeHeroTitlePrimary", event.target.value)} /></label>
              <label><span>主標第二行 <small>{siteAppearance.settings.homeHeroTitleSecondary.length}/80</small></span><input value={siteAppearance.settings.homeHeroTitleSecondary} maxLength={80} onChange={(event) => updateIdentitySetting("homeHeroTitleSecondary", event.target.value)} /></label>
              <label className={styles.wideField}><span>首頁引言 <small>{siteAppearance.settings.homeHeroLead.length}/300</small></span><textarea rows={3} value={siteAppearance.settings.homeHeroLead} maxLength={300} onChange={(event) => updateIdentitySetting("homeHeroLead", event.target.value)} /></label>
              <label><span>主要按鈕文字 <small>{siteAppearance.settings.homePrimaryCtaLabel.length}/40</small></span><input value={siteAppearance.settings.homePrimaryCtaLabel} maxLength={40} onChange={(event) => updateIdentitySetting("homePrimaryCtaLabel", event.target.value)} /></label>
              <label><span>次要按鈕文字 <small>{siteAppearance.settings.homeSecondaryCtaLabel.length}/40</small></span><input value={siteAppearance.settings.homeSecondaryCtaLabel} maxLength={40} onChange={(event) => updateIdentitySetting("homeSecondaryCtaLabel", event.target.value)} /></label>
              <label><span>典藏導覽標題 <small>{siteAppearance.settings.homeCollectionsTitle.length}/80</small></span><input value={siteAppearance.settings.homeCollectionsTitle} maxLength={80} onChange={(event) => updateIdentitySetting("homeCollectionsTitle", event.target.value)} /></label>
              <label className={styles.wideField}><span>典藏導覽說明 <small>{siteAppearance.settings.homeCollectionsIntro.length}/300</small></span><textarea rows={3} value={siteAppearance.settings.homeCollectionsIntro} maxLength={300} onChange={(event) => updateIdentitySetting("homeCollectionsIntro", event.target.value)} /></label>
              <label><span>商品區標題 <small>{siteAppearance.settings.homeArrivalsTitle.length}/80</small></span><input value={siteAppearance.settings.homeArrivalsTitle} maxLength={80} onChange={(event) => updateIdentitySetting("homeArrivalsTitle", event.target.value)} /></label>
            </div>
          </div>
          <aside className={styles.siteSettingsSummary}>
            <span>SAFE TEMPLATE</span>
            <h3>保留商店骨架，只開放安全欄位</h3>
            <p>品牌、主要導覽、首頁編排、頁尾與配色會套用到全站前台；商品流程、SEO 結構與行動版版型不會被任意拖曳破壞。</p>
            <div className={styles.colorPreview} style={{ background: siteAppearance.theme.surface, color: siteAppearance.theme.ink, borderColor: siteAppearance.theme.accent }}><i style={{ background: siteAppearance.theme.accent }} />{siteAppearance.settings.brandName || "品牌預覽"}</div>
            <div className={`${styles.contrastStatus} ${siteThemeContrast.ok ? styles.contrastPass : styles.contrastFail}`} role="status" aria-live="polite">
              <b>{siteThemeContrast.ok ? "主要配色對比檢查通過" : "主要配色對比不足，暫時不能儲存"}</b>
              <span data-pass={siteThemeContrast.passesInkSurface}>文字／底色 <strong>{formatContrastRatio(siteThemeContrast.inkSurface)}</strong></span>
              <span data-pass={siteThemeContrast.passesInkAccent}>文字／重點色 <strong>{formatContrastRatio(siteThemeContrast.inkAccent)}</strong></span>
              <span data-pass={siteThemeContrast.passesArchivePalette}>固定版型明暗 <strong>{siteThemeContrast.passesArchivePalette ? "適用" : "不適用"}</strong></span>
              <small>兩組對比都必須至少 {MIN_SITE_THEME_CONTRAST}:1，並維持淺底深字。</small>
            </div>
            {siteStructureError && <p className={styles.structureError} role="status">{siteStructureError}</p>}
            <button type="button" onClick={() => void saveSiteSettings()} disabled={siteSettingsSaving || !siteSettingsDirty || !siteThemeContrast.ok || Boolean(siteStructureError)}>{siteSettingsSaving ? "儲存中…" : "儲存全站設定"}</button>
            {showSiteSettingsHistory && <div className={styles.siteSettingsHistory} aria-label="全站設定版本紀錄">
              <div><b>版本紀錄</b><small>還原會建立新版本，不會覆寫或刪除舊紀錄。</small></div>
              {siteSettingsRevisions.map((revision) => <article key={revision.revisionId}>
                <div>
                  <b>第 {revision.version} 版{revision.version === siteSettingsVersion ? "・目前版本" : ""}</b>
                  <small>{formatUpdatedAt(revision.createdAt)}・{settingsRevisionActor(revision.savedBy)}</small>
                </div>
                <button type="button" onClick={() => void restoreSiteSettingsRevision(revision)} disabled={siteSettingsSaving || revision.version === siteSettingsVersion}>{revision.version === siteSettingsVersion ? "目前版本" : "還原"}</button>
              </article>)}
              {!siteSettingsRevisionsLoading && siteSettingsRevisions.length === 0 && <p>目前沒有可顯示的版本紀錄。</p>}
              {siteSettingsRevisionsLoading && <p>正在讀取版本紀錄…</p>}
              {siteSettingsRevisionsHasMore && !siteSettingsRevisionsLoading && <button type="button" className={styles.loadMoreButton} onClick={() => void loadSiteSettingsRevisions(siteSettingsRevisions.length, true)}>載入更多版本</button>}
            </div>}
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
            <label><span>Canonical URL <small>{draft.canonicalUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small></span><input type="url" value={draft.canonicalUrl} maxLength={ADMIN_IMAGE_URL_MAX_LENGTH} aria-invalid={Boolean(pageCanonicalError)} onChange={(event) => updateDraft("canonicalUrl", event.target.value)} placeholder="https://example.com/pages/.../" />{pageCanonicalError && <small className={styles.fieldError} role="status">{pageCanonicalError}</small>}</label>
            <label><span>社群圖片 URL <small>{draft.ogImageUrl.length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small></span><input type="url" value={draft.ogImageUrl} maxLength={ADMIN_IMAGE_URL_MAX_LENGTH} aria-invalid={Boolean(pageOgImageError)} onChange={(event) => updateDraft("ogImageUrl", event.target.value)} placeholder="https://example.com/og/page.jpg" />{pageOgImageError && <small className={styles.fieldError} role="status">{pageOgImageError}</small>}</label>
            <div className={styles.ogImagePreview}>
              <SafePublicImage src={draft.ogImageUrl} alt={`${draft.title || "自訂頁面"}社群圖片預覽`} fallback={<span role="img" aria-label="社群圖片尚未設定或無法載入">社群圖片尚未設定或無法載入</span>} />
            </div>
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
            overrides={puckOverrides}
            headerTitle={draft.title || "新網站頁面"}
            headerPath={previewHref}
            height="max(640px, calc(100vh - 136px))"
            viewports={[
              { width: 1440, height: "auto", label: "桌面 1440" },
              { width: 1024, height: "auto", label: "小桌面 1024" },
              { width: 768, height: "auto", label: "平板 768" },
              { width: 375, height: "auto", label: "手機 375" },
              { width: 320, height: "auto", label: "窄手機 320" },
            ]}
            onChange={updatePageData}
            onPublish={(data) => void save("published", data)}
          />
        </div>
      </section>
    </div>
  </main>;
}
