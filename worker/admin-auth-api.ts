import { cleanText, isLocalRequest, json, readJsonObject, validateWriteRequest } from "./api-utils";
import {
  adminSessionCookie,
  authenticateLocalAdminLogin,
  clearAdminSessionCookie,
  readAdminSession,
  resolveSessionAdminIdentity,
  sessionAdminAuthReady,
} from "./admin-auth";
import type { DatabaseEnv } from "./api-utils";

function adminLoginPath(returnTo = "/admin/") {
  const safeReturnTo = returnTo.startsWith("/admin") && !returnTo.startsWith("//")
    ? returnTo
    : "/admin/";
  return `/admin/login/?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function resolveAccessEmail(request: Request, env: DatabaseEnv) {
  const email = cleanText(request.headers.get("oai-authenticated-user-email"), 320).toLowerCase();
  const configuredAllowlist = cleanText(env.ADMIN_EMAIL_ALLOWLIST, 4000);
  if (!email || !configuredAllowlist) return null;

  const allowedEmails = new Set(configuredAllowlist
    .split(/[\s,;]+/)
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean));
  return allowedEmails.has(email) ? email : null;
}

async function readCloudAdminSession(request: Request, env: DatabaseEnv) {
  const accessEmail = resolveAccessEmail(request, env);
  if (accessEmail) {
    return { authenticated: true, username: accessEmail, mode: "access" as const };
  }

  if (sessionAdminAuthReady(env)) {
    const identity = await resolveSessionAdminIdentity(request, env);
    if (identity) {
      return { authenticated: true, username: identity, mode: "cloud-login" as const };
    }
  }

  return { authenticated: false, username: null, mode: "cloud" as const };
}

export async function handleAdminAuthApi(request: Request, env: DatabaseEnv) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/auth/")) return null;

  const cloudPasswordAuth = sessionAdminAuthReady(env);

  if (url.pathname === "/api/admin/auth/session" && request.method === "GET") {
    if (isLocalRequest(request)) {
      return json(await readAdminSession(request, env));
    }
    return json(await readCloudAdminSession(request, env));
  }

  if (url.pathname === "/api/admin/auth/login" && request.method === "POST") {
    if (!isLocalRequest(request) && !cloudPasswordAuth) {
      return json({ error: "雲端後台需先設定 Cloudflare Access，或部署時同步後台帳密。" }, { status: 404 });
    }

    const invalidWrite = validateWriteRequest(request);
    if (invalidWrite) return invalidWrite;

    const parsed = await readJsonObject(request, 8_192);
    if ("response" in parsed) return parsed.response;
    const result = await authenticateLocalAdminLogin(env, parsed.value);
    if ("response" in result) {
      return json(result.response, { status: result.status });
    }

    return json(
      {
        authenticated: true,
        username: result.username,
        mode: isLocalRequest(request) ? "local-login" : "cloud-login",
      },
      { headers: { "set-cookie": adminSessionCookie(result.token, request) } },
    );
  }

  if (url.pathname === "/api/admin/auth/logout" && request.method === "POST") {
    if (!isLocalRequest(request) && !cloudPasswordAuth) {
      return json({ error: "不支援的操作" }, { status: 404 });
    }

    const invalidWrite = validateWriteRequest(request);
    if (invalidWrite) return invalidWrite;
    return json(
      { authenticated: false },
      { headers: { "set-cookie": clearAdminSessionCookie(request) } },
    );
  }

  if (!isLocalRequest(request)) {
    return json({ error: "不支援的操作" }, { status: 404 });
  }

  return json({ error: "不支援的操作" }, { status: 405 });
}

export function adminLoginDenied(request: Request, returnTo = "/admin/") {
  return json(
    { error: "請先登入後台再繼續", signInUrl: adminLoginPath(returnTo) },
    { status: 401 },
  );
}
