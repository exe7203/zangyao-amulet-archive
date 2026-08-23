const PRIVATE_APP_PATHS = [
  "/admin",
  "/account",
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
] as const;

function isPrivateAppPath(pathname: string) {
  return PRIVATE_APP_PATHS.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * Adds a conservative baseline that is compatible with vinext/React inline
 * bootstrap scripts. A stricter nonce-based script/style policy belongs in the
 * production deployment once the final analytics, media, auth, and payment
 * origins are known.
 */
export function withSecurityHeaders(request: Request, response: Response) {
  const requestUrl = new URL(request.url);
  const headers = new Headers(response.headers);

  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set(
    "permissions-policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  );
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set(
    "content-security-policy",
    "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
  );

  if (requestUrl.protocol === "https:" && !isLoopback(requestUrl.hostname)) {
    headers.set("strict-transport-security", "max-age=31536000");
  }

  if (isPrivateAppPath(requestUrl.pathname)) {
    headers.set("cache-control", "private, no-store, max-age=0");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
