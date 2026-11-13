import { adminApiBase } from "../../../shared/admin/api-paths";

const API_BASE = adminApiBase(process.env.NEXT_PUBLIC_CONTENT_API_URL || "");

export type AdminFetchInit = RequestInit & {
  /** When true, skip JSON parsing and return the raw Response. */
  raw?: boolean;
};

export class AdminFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown = null,
  ) {
    super(message);
    this.name = "AdminFetchError";
  }
}

export function adminApiBaseUrl() {
  return API_BASE;
}

export async function adminFetch<T = unknown>(path: string, init: AdminFetchInit = {}): Promise<T> {
  const { raw, headers, ...rest } = init;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      accept: "application/json",
      ...headers,
    },
    cache: "no-store",
  });

  if (raw) {
    return response as T;
  }

  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload && payload.error
      ? String(payload.error)
      : "後台 API 請求失敗";
    throw new AdminFetchError(message, response.status, payload);
  }

  return payload;
}
