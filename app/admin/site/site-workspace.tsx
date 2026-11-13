"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  editorPreviewMetadata,
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
  normalizePageSlug,
  PAGE_SEO_PUBLISH_REQUIREMENTS,
  validatePageData,
} from "../../site-builder/validation";
import styles from "./site-editor.module.css";
import { PUBLIC_SITE_CODE } from "../../../shared/site-context";
import {
  adminPagePath,
  adminPageRevisionsPath,
  adminPagesCollectionPath,
  adminPagesPath,
  adminSiteSettingsCollectionPath,
  adminSiteSettingsPath,
  adminSiteSettingsRevisionsCollectionPath,
  adminSiteSettingsRevisionsPath,
  publicContentArticlesPath,
  publicStoreProductsPath,
} from "../../../shared/admin/api-paths";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "../admin-chrome";
import { adminFetch, AdminFetchError } from "../_lib/api-client";
import {
  DEFAULT_SITE_APPEARANCE,
  evaluateSiteThemeContrast,
  MIN_SITE_THEME_CONTRAST,
  normalizeSiteAppearance,
  validateSiteSettingsStructure,
  type HomeSectionId,
  type SiteAppearance,
} from "../../../shared/site-settings";
import { validateHttpUrlField } from "../image-field-contract";
import {
  EMPTY_PAGE_PAGINATION,
  formatUpdatedAt,
  isRecord,
  normalizePage,
  statusLabel,
  text,
  type PageFilter,
  type PageListOptions,
  type PageListPagination,
  type PageRevision,
  type SiteSettingsRevision,
} from "./helpers";
import PageCanvas from "./page-canvas";
import { PageList } from "./page-list";
import { PageSettings } from "./page-settings";
import SiteSettingsPanel from "./settings-panel";

const SITE_CODE = PUBLIC_SITE_CODE;

function readPageFilter(params: { get(name: string): string | null }): PageFilter {
  const status = params.get("status");
  return status === "draft" || status === "published" || status === "archived" ? status : "all";
}

export default function SiteWorkspace() {
  const searchParams = useSearchParams();
  const initialPageFilter = readPageFilter(searchParams);
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
  const [showSiteSettings, setShowSiteSettings] = useState(
    () => searchParams.get("panel") === "settings" || searchParams.get("focus") === "seo",
  );
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
  const [pageFilter, setPageFilter] = useState<PageFilter>(initialPageFilter);
  const [pageAppliedQuery, setPageAppliedQuery] = useState("");
  const [pageAppliedFilter, setPageAppliedFilter] = useState<PageFilter>(initialPageFilter);
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
      const payload = await adminFetch<{
        pages?: unknown[];
        pagination?: Partial<PageListPagination>;
      }>(adminPagesPath(SITE_CODE, params));
      if (requestId !== pageListRequestId.current) return;

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
      if (cause instanceof AdminFetchError && cause.status === 401) setAuthRequired(true);
      setError(cause instanceof Error ? cause.message : "頁面資料讀取失敗");
    } finally {
      if (requestId === pageListRequestId.current) setLoading(false);
    }
  }, [createPage, pagePagination.limit, selectPage]);

  const loadPageRevisions = useCallback(async (pageId: string) => {
    setRevisionsLoading(true);
    try {
      const payload = await adminFetch<{ revisions?: PageRevision[] }>(
        adminPageRevisionsPath(pageId, SITE_CODE),
      );
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
      const payload = await adminFetch<{
        siteSettings?: { settings?: unknown; theme?: unknown; version?: number };
      }>(adminSiteSettingsPath(SITE_CODE));
      if (!payload.siteSettings) throw new Error("全站設定讀取失敗");
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
      const params = new URLSearchParams({ limit: "10", offset: String(offset) });
      const payload = await adminFetch<{
        revisions?: unknown[];
        pagination?: { hasMore?: boolean };
      }>(adminSiteSettingsRevisionsPath(SITE_CODE, params));
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
      const [productsPayload, articlesPayload] = await Promise.all([
        adminFetch<{ products?: unknown[] }>(publicStoreProductsPath(SITE_CODE)),
        adminFetch<{ articles?: unknown[] }>(publicContentArticlesPath(SITE_CODE)),
      ]);
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
    void Promise.all([
      loadPages({ status: pageAppliedFilter, query: pageAppliedQuery, page: 1 }),
      loadSiteSettings(),
      loadPreviewMetadata(),
    ]);
  }, [loadPages, loadPreviewMetadata, loadSiteSettings, pageAppliedFilter, pageAppliedQuery]);

  useEffect(() => {
    if (searchParams.get("focus") !== "seo") return;
    setShowSeo(true);
    setNotice("請檢查頁面 SEO 標題與描述；全站預設 SEO 在「全站設定」。");
  }, [searchParams]);

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
      const payload = await adminFetch<{
        siteSettings?: { settings?: unknown; theme?: unknown; version?: number };
      }>(adminSiteSettingsCollectionPath(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          version: siteSettingsVersion,
          settings: normalized.settings,
          theme: normalized.theme,
        }),
      });
      if (!payload.siteSettings) throw new Error("全站設定儲存失敗");
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
      const payload = await adminFetch<{
        siteSettings?: { settings?: unknown; theme?: unknown; version?: number };
      }>(adminSiteSettingsRevisionsCollectionPath(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          revisionId: revision.revisionId,
          expectedVersion: siteSettingsVersion,
        }),
      });
      if (!payload.siteSettings) throw new Error("全站設定還原失敗");
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
      const payload = await adminFetch<{ page?: unknown }>(adminPagesCollectionPath(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, data: validation.data, slug, status, siteCode: SITE_CODE }),
      });
      if (payload.page == null) throw new Error("頁面儲存失敗");
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
      if (cause instanceof AdminFetchError) {
        if (cause.status === 401) setAuthRequired(true);
        if (cause.status === 409) {
          setError(String(cause.message || "這個頁面已被其他版本更新，請重新整理後再編輯"));
          return;
        }
      }
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
      const payload = await adminFetch<{ page?: unknown }>(
        adminPageRevisionsPath(draft.id, SITE_CODE),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteCode: SITE_CODE, revisionId: revision.revisionId, version: draft.version }),
        },
      );
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
      await adminFetch(adminPagePath(draft.id, SITE_CODE), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: draft.version }),
      });
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
  const selectedPageIsListed = pages.some((page) => page.id === draft.id);

  const handleSearch = (query: string, status: PageFilter) => {
    setPageAppliedQuery(query);
    setPageAppliedFilter(status);
    void loadPages({ query, status, page: 1, selection: "preserve" });
  };

  return (
    <AdminTopbar active="site" previewHref={previewHref} hasUnsavedChanges={dirty || siteSettingsDirty}>
    <div className={styles.workspace}>
      <PageList
        pages={pages}
        draft={draft}
        loading={loading}
        pageQuery={pageQuery}
        pageFilter={pageFilter}
        pageAppliedQuery={pageAppliedQuery}
        pageAppliedFilter={pageAppliedFilter}
        pagination={pagePagination}
        onQueryChange={setPageQuery}
        onFilterChange={setPageFilter}
        onSearch={handleSearch}
        onSelect={selectPage}
        onCreate={() => createPage()}
        onPage={(page) =>
          void loadPages({
            query: pageAppliedQuery,
            status: pageAppliedFilter,
            page,
            selection: "preserve",
          })
        }
      />

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

        {showSiteSettings && <SiteSettingsPanel
          siteAppearance={siteAppearance}
          siteThemeContrast={siteThemeContrast}
          siteStructureError={siteStructureError}
          siteSettingsDirty={siteSettingsDirty}
          siteSettingsVersion={siteSettingsVersion}
          siteSettingsSaving={siteSettingsSaving}
          showSiteSettingsHistory={showSiteSettingsHistory}
          siteSettingsRevisions={siteSettingsRevisions}
          siteSettingsRevisionsLoading={siteSettingsRevisionsLoading}
          siteSettingsRevisionsHasMore={siteSettingsRevisionsHasMore}
          updateIdentitySetting={updateIdentitySetting}
          updateThemeSetting={updateThemeSetting}
          updateNavigationItem={updateNavigationItem}
          moveNavigationItem={moveNavigationItem}
          removeNavigationItem={removeNavigationItem}
          addNavigationItem={addNavigationItem}
          moveHomeSection={moveHomeSection}
          setHomeSectionVisibility={setHomeSectionVisibility}
          setShowSiteSettingsHistory={setShowSiteSettingsHistory}
          loadSiteSettingsRevisions={loadSiteSettingsRevisions}
          saveSiteSettings={saveSiteSettings}
          restoreSiteSettingsRevision={restoreSiteSettingsRevision}
        />}

        {showSeo && (
          <PageSettings
            draft={draft}
            pageCanonicalError={pageCanonicalError}
            pageOgImageError={pageOgImageError}
            seoChecks={seoChecks}
            seoPassCount={seoPassCount}
            onUpdate={updateDraft}
            onTitleChange={(title) => {
              setDraft((current) => ({ ...current, title, slug: current.slug || normalizePageSlug(title) }));
              markDirty();
            }}
          />
        )}

        <PageCanvas
            editorKey={editorKey}
            data={draft.data}
            metadata={previewMetadata}
            title={draft.title}
            previewHref={previewHref}
            onChange={updatePageData}
            onPublish={(data) => void save("published", data)}
          />
      </section>
    </div>
    </AdminTopbar>
  );
}
