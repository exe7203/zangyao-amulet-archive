export type AdminPagination = {
  page: number;
  limit: number;
  maxLimit: number;
  total: number;
  totalPages: number;
  returned: number;
};

export const ADMIN_PRODUCT_LIST_DEFAULT_LIMIT = 40;
export const ADMIN_PRODUCT_LIST_MAX_LIMIT = 100;
export const ADMIN_CATEGORY_LIST_LIMIT = 200;
export const ADMIN_ORDER_LIST_DEFAULT_LIMIT = 50;
export const ADMIN_ORDER_LIST_MAX_LIMIT = 50;
export const ADMIN_HISTORY_DEFAULT_LIMIT = 20;
export const ADMIN_HISTORY_MAX_LIMIT = 50;

export function adminPageRequest(url: URL, defaultLimit: number, maxLimit: number) {
  const requestedPage = Number(url.searchParams.get("page") || 1);
  const requestedLimit = Number(url.searchParams.get("limit") || defaultLimit);
  return {
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1,
    limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxLimit)
      : defaultLimit,
    maxLimit,
  };
}

export function resolvedAdminPage(requestedPage: number, limit: number, total: number, maxLimit: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);
  return {
    page,
    limit,
    maxLimit,
    total,
    totalPages,
    offset: (page - 1) * limit,
  };
}

export function adminPaginationPayload(
  page: ReturnType<typeof resolvedAdminPage>,
  returned: number,
): AdminPagination {
  return {
    page: page.page,
    limit: page.limit,
    maxLimit: page.maxLimit,
    total: page.total,
    totalPages: page.totalPages,
    returned,
  };
}
