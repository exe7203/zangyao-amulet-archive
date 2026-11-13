export function adminApiBase(baseUrl = "") {
  return baseUrl.replace(/\/$/, "");
}

export function adminSystemStatusPath(site: string) {
  return `/api/admin/system-status?site=${encodeURIComponent(site)}`;
}

export function adminProductsPath(site: string, params?: URLSearchParams) {
  const query = params?.toString();
  return query
    ? `/api/admin/products?${query}`
    : `/api/admin/products?site=${encodeURIComponent(site)}`;
}

export function adminProductPath(productId: string) {
  return `/api/admin/products/${encodeURIComponent(productId)}`;
}

export function adminProductMovementsPath(productId: string, params?: URLSearchParams) {
  const query = params?.toString();
  const base = `/api/admin/products/${encodeURIComponent(productId)}/movements`;
  return query ? `${base}?${query}` : base;
}

export function adminCategoriesPath(site: string, status: "active" | "archived" | "all" = "all") {
  return `/api/admin/categories?site=${encodeURIComponent(site)}&status=${status}`;
}

export function adminCategoriesCollectionPath() {
  return "/api/admin/categories";
}

export function adminCategoryPath(categoryId: string) {
  return `/api/admin/categories/${encodeURIComponent(categoryId)}`;
}

export function adminOrdersPath(site: string, params?: URLSearchParams) {
  const query = params?.toString();
  return query
    ? `/api/admin/orders?${query}`
    : `/api/admin/orders?site=${encodeURIComponent(site)}`;
}

export function adminOrderPath(orderId: string) {
  return `/api/admin/orders/${encodeURIComponent(orderId)}`;
}

export function adminOrderEventsPath(orderId: string, params?: URLSearchParams) {
  const query = params?.toString();
  const base = `/api/admin/orders/${encodeURIComponent(orderId)}/events`;
  return query ? `${base}?${query}` : base;
}

export function adminArticlesPath(site: string, params?: URLSearchParams) {
  const query = params?.toString();
  return query
    ? `/api/admin/articles?${query}`
    : `/api/admin/articles?site=${encodeURIComponent(site)}`;
}

export function adminArticlePath(articleId: string, site: string) {
  return `/api/admin/articles/${encodeURIComponent(articleId)}?site=${encodeURIComponent(site)}`;
}

export function adminArticleRevisionsPath(articleId: string, site: string) {
  return `/api/admin/articles/${encodeURIComponent(articleId)}/revisions?site=${encodeURIComponent(site)}`;
}

export function adminArticlesCollectionPath() {
  return "/api/admin/articles";
}

export function adminPagesPath(site: string, params?: URLSearchParams) {
  const query = params?.toString();
  return query
    ? `/api/admin/pages?${query}`
    : `/api/admin/pages?site=${encodeURIComponent(site)}`;
}

export function adminPagePath(pageId: string, site: string) {
  return `/api/admin/pages/${encodeURIComponent(pageId)}?site=${encodeURIComponent(site)}`;
}

export function adminPageRevisionsPath(pageId: string, site: string) {
  return `/api/admin/pages/${encodeURIComponent(pageId)}/revisions?site=${encodeURIComponent(site)}`;
}

export function adminPagesCollectionPath() {
  return "/api/admin/pages";
}

export function adminSiteSettingsPath(site: string) {
  return `/api/admin/site-settings?site=${encodeURIComponent(site)}`;
}

export function adminSiteSettingsCollectionPath() {
  return "/api/admin/site-settings";
}

export function adminSiteSettingsRevisionsPath(site: string, params?: URLSearchParams) {
  const query = params?.toString();
  const base = `/api/admin/site-settings/revisions?site=${encodeURIComponent(site)}`;
  return query ? `${base}&${query}` : base;
}

export function adminSiteSettingsRevisionsCollectionPath() {
  return "/api/admin/site-settings/revisions";
}

export function adminMediaPath(site: string, params?: URLSearchParams) {
  const query = params?.toString();
  return query
    ? `/api/admin/media?${query}`
    : `/api/admin/media?site=${encodeURIComponent(site)}`;
}

export function adminMediaAssetPath(assetId: string, site: string) {
  return `/api/admin/media/${encodeURIComponent(assetId)}?site=${encodeURIComponent(site)}`;
}

export function publicMediaPath(assetId: string) {
  return `/api/media/${encodeURIComponent(assetId)}`;
}

export function publicStoreProductsPath(site: string) {
  return `/api/store/products?site=${encodeURIComponent(site)}`;
}

export function publicContentArticlesPath(site: string) {
  return `/api/content/articles?site=${encodeURIComponent(site)}`;
}

export function publicContentArticlePath(site: string, slug: string) {
  return `/api/content/articles/${encodeURIComponent(slug)}?site=${encodeURIComponent(site)}`;
}

export function publicContentPagePath(site: string, slug: string) {
  return `/api/content/pages/${encodeURIComponent(slug)}?site=${encodeURIComponent(site)}`;
}

export function publicContentSiteSettingsPath(site: string) {
  return `/api/content/site-settings?site=${encodeURIComponent(site)}`;
}
