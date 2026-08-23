import { cleanText } from "./api-utils";

export const ADMIN_SESSION_COOKIE = "taijuda_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type LocalAdminAccount = {
  username: string;
  passwordHash: string;
};

export type AdminAuthEnv = {
  ADMIN_LOCAL_AUTH_REQUIRED?: string;
  ADMIN_LOCAL_SESSION_SECRET?: string;
  ADMIN_LOCAL_ACCOUNTS?: string;
};

function parseCookies(header: string | null) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

async function hmacSign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function normalizeAdminUsername(value: unknown) {
  const username = cleanText(value, 32);
  if (username.length < 3 || username.length > 32) return "";
  return /^[\p{Letter}\p{Number}_-]+$/u.test(username) ? username : "";
}

export async function hashAdminPassword(username: string, password: string, secret: string) {
  return hmacSign(`${username}\n${password}`, secret);
}

export function parseLocalAdminAccounts(raw: unknown): LocalAdminAccount[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const candidate = entry as Record<string, unknown>;
      const username = normalizeAdminUsername(candidate.username);
      const passwordHash = cleanText(candidate.passwordHash, 128);
      if (!username || !/^[a-f0-9]{64}$/.test(passwordHash)) return [];
      return [{ username, passwordHash }];
    });
  } catch {
    return [];
  }
}

function localAdminAccountMap(env: AdminAuthEnv) {
  const accounts = parseLocalAdminAccounts(env.ADMIN_LOCAL_ACCOUNTS);
  return new Map(accounts.map((account) => [account.username, account.passwordHash]));
}

export function localAdminAuthRequired(env: AdminAuthEnv) {
  return cleanText(env.ADMIN_LOCAL_AUTH_REQUIRED, 8) === "1";
}

function sessionSecret(env: AdminAuthEnv) {
  return cleanText(env.ADMIN_LOCAL_SESSION_SECRET, 256);
}

export async function createAdminSessionToken(username: string, secret: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${username}|${expiresAt}`;
  const signature = await hmacSign(payload, secret);
  return `${payload}|${signature}`;
}

export async function verifyAdminSessionToken(token: string, secret: string) {
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [username, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!normalizeAdminUsername(username) || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const payload = `${username}|${expiresAtRaw}`;
  const expected = await hmacSign(payload, secret);
  if (!timingSafeEqual(signature, expected)) return null;
  return username;
}

export async function resolveLocalAdminIdentity(request: Request, env: AdminAuthEnv) {
  if (!localAdminAuthRequired(env)) return "local-preview";

  const secret = sessionSecret(env);
  if (!secret || localAdminAccountMap(env).size === 0) return null;

  const token = parseCookies(request.headers.get("cookie"))[ADMIN_SESSION_COOKIE];
  if (!token) return null;

  const username = await verifyAdminSessionToken(token, secret);
  if (!username || !localAdminAccountMap(env).has(username)) return null;
  return username;
}

export function adminSessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAdminSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function authenticateLocalAdminLogin(
  env: AdminAuthEnv,
  body: Record<string, unknown>,
) {
  const secret = sessionSecret(env);
  const accounts = localAdminAccountMap(env);
  if (!secret || accounts.size === 0) {
    return { response: { error: "本機後台帳號尚未設定，請重新啟動本機版。" }, status: 503 as const };
  }

  const username = normalizeAdminUsername(body.username);
  const password = cleanText(body.password, 256);
  if (!username) return { response: { error: "請填寫有效的後台帳號。" }, status: 400 as const };
  if (!password) return { response: { error: "請填寫密碼。" }, status: 400 as const };

  const expectedHash = accounts.get(username);
  if (!expectedHash) {
    return { response: { error: "帳號或密碼不正確。" }, status: 401 as const };
  }

  const actualHash = await hashAdminPassword(username, password, secret);
  if (!timingSafeEqual(actualHash, expectedHash)) {
    return { response: { error: "帳號或密碼不正確。" }, status: 401 as const };
  }

  const token = await createAdminSessionToken(username, secret);
  return { username, token };
}

export async function readAdminSession(request: Request, env: AdminAuthEnv) {
  if (!localAdminAuthRequired(env)) {
    return { authenticated: true, username: "local-preview", mode: "local-open" as const };
  }

  const identity = await resolveLocalAdminIdentity(request, env);
  if (!identity) {
    return { authenticated: false, username: null, mode: "local-login" as const };
  }

  return { authenticated: true, username: identity, mode: "local-login" as const };
}
