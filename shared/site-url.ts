const LOCAL_SITE_FALLBACK = "http://127.0.0.1:3000/";

function isPrivateOrReservedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid") ||
    host === "example" ||
    host.endsWith(".example") ||
    host === "example.com" ||
    host.endsWith(".example.com") ||
    host === "example.net" ||
    host.endsWith(".example.net") ||
    host === "example.org" ||
    host.endsWith(".example.org") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]:/.test(host) ||
    host.startsWith("ff") ||
    host.startsWith("2001:db8:") ||
    host.startsWith("::ffff:")
  ) return true;

  // A production SEO origin should be a reviewed hostname. Raw IP literals
  // are intentionally rejected, including otherwise public IPv4/IPv6 ranges.
  if (host.includes(":")) return true;

  const octets = host.split(".").map((part) => Number(part));
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return true;
  }

  // Single-label hosts resolve only inside a local network and must never be
  // advertised as a canonical public origin.
  return !host.includes(".");
}

export function resolveSiteUrl(value = process.env.NEXT_PUBLIC_SITE_URL) {
  let url: URL;
  try {
    url = new URL(value || LOCAL_SITE_FALLBACK);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error("Unsupported public site URL");
    }
  } catch {
    url = new URL(LOCAL_SITE_FALLBACK);
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";

  const indexable = url.protocol === "https:" && !isPrivateOrReservedHostname(url.hostname);
  return { url, publicUrl: indexable ? url : null, indexable } as const;
}

/** Prefix a root-relative public asset path for GitHub Pages basePath deployments. */
export function publicAssetPath(path: string, basePath = process.env.PAGES_BASE_PATH || "") {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const normalizedBasePath = basePath.trim().replace(/^\/+|\/+$/g, "");
  return normalizedBasePath ? `/${normalizedBasePath}${path}` : path;
}
