export type DatabaseEnv = {
  DB?: D1Database;
  ADMIN_EMAIL_ALLOWLIST?: string;
};

export function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function publicJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
  return json(body, { ...init, headers });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function cleanSlug(value: unknown) {
  return cleanText(value, 120)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function cleanUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";
  if (candidate.length > 1000) return "";
  try {
    const url = new URL(candidate);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function adminIdentity(request: Request, env: DatabaseEnv) {
  if (isLocalRequest(request)) return "local-preview";

  const email = cleanText(request.headers.get("oai-authenticated-user-email"), 320).toLowerCase();
  const configuredAllowlist = cleanText(env.ADMIN_EMAIL_ALLOWLIST, 4000);
  if (!email || !configuredAllowlist) return null;

  const allowedEmails = new Set(configuredAllowlist
    .split(/[\s,;]+/)
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean));
  return allowedEmails.has(email) ? email : null;
}

export function validateWriteRequest(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return null;

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestUrl.origin) {
    return json({ error: "拒絕跨來源的寫入請求" }, { status: 403 });
  }

  if (["POST", "PUT", "PATCH"].includes(request.method) &&
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "寫入操作只接受 application/json" }, { status: 415 });
  }

  return null;
}

type JsonObjectResult =
  | { value: Record<string, unknown>; response?: never }
  | { value?: never; response: Response };

export async function readJsonObject(request: Request, maxBytes = 128_000): Promise<JsonObjectResult> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { response: json({ error: "請求內容過大" }, { status: 413 }) };
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    return { response: json({ error: "請求內容過大" }, { status: 413 }) };
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(parsed)
      ? { value: parsed }
      : { response: json({ error: "JSON 最外層必須是物件" }, { status: 400 }) };
  } catch {
    return { response: json({ error: "請提供有效的 JSON 資料" }, { status: 400 }) };
  }
}
