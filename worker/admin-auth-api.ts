import { isLocalRequest, json, readJsonObject, validateWriteRequest } from "./api-utils";
import {
  adminSessionCookie,
  authenticateLocalAdminLogin,
  clearAdminSessionCookie,
  readAdminSession,
} from "./admin-auth";
import type { DatabaseEnv } from "./api-utils";

function adminLoginPath(returnTo = "/admin/") {
  const safeReturnTo = returnTo.startsWith("/admin") && !returnTo.startsWith("//")
    ? returnTo
    : "/admin/";
  return `/admin/login/?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export async function handleAdminAuthApi(request: Request, env: DatabaseEnv) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/auth/")) return null;

  if (url.pathname === "/api/admin/auth/session" && request.method === "GET") {
    if (!isLocalRequest(request)) {
      return json({ authenticated: false, mode: "cloud" }, { status: 200 });
    }
    return json(await readAdminSession(request, env));
  }

  if (!isLocalRequest(request)) {
    return json({ error: "此登入方式僅供本機後台使用。" }, { status: 404 });
  }

  if (url.pathname === "/api/admin/auth/login" && request.method === "POST") {
    const invalidWrite = validateWriteRequest(request);
    if (invalidWrite) return invalidWrite;

    const parsed = await readJsonObject(request, 8_192);
    if ("response" in parsed) return parsed.response;
    const result = await authenticateLocalAdminLogin(env, parsed.value);
    if ("response" in result) {
      return json(result.response, { status: result.status });
    }

    return json(
      { authenticated: true, username: result.username, mode: "local-login" },
      { headers: { "set-cookie": adminSessionCookie(result.token, request) } },
    );
  }

  if (url.pathname === "/api/admin/auth/logout" && request.method === "POST") {
    const invalidWrite = validateWriteRequest(request);
    if (invalidWrite) return invalidWrite;
    return json(
      { authenticated: false },
      { headers: { "set-cookie": clearAdminSessionCookie(request) } },
    );
  }

  return json({ error: "不支援的操作" }, { status: 405 });
}

export function adminLoginDenied(request: Request, returnTo = "/admin/") {
  return json(
    { error: "請先登入後台再繼續", signInUrl: adminLoginPath(returnTo) },
    { status: 401 },
  );
}
