import { buildRobots } from "../app/robots";
import { buildSitemap } from "../app/sitemap";

function xmlEscape(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function values(value: string | string[] | undefined) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function robotsText(siteUrlInput?: string | URL) {
  const robots = buildRobots(siteUrlInput);
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
  const lines: string[] = [];

  for (const rule of rules) {
    for (const userAgent of values(rule.userAgent)) lines.push(`User-Agent: ${userAgent}`);
    for (const allow of values(rule.allow)) lines.push(`Allow: ${allow}`);
    for (const disallow of values(rule.disallow)) lines.push(`Disallow: ${disallow}`);
    if (rule.crawlDelay !== undefined) lines.push(`Crawl-delay: ${rule.crawlDelay}`);
    lines.push("");
  }
  for (const sitemap of values(robots.sitemap)) lines.push(`Sitemap: ${sitemap}`);
  if (robots.host) lines.push(`Host: ${robots.host}`);
  return `${lines.join("\n").trim()}\n`;
}

function sitemapXml(siteUrlInput?: string | URL) {
  const entries = buildSitemap(siteUrlInput).map((entry) => {
    const fields = [`<loc>${xmlEscape(entry.url)}</loc>`];
    if (entry.lastModified) {
      const lastModified = entry.lastModified instanceof Date
        ? entry.lastModified.toISOString()
        : entry.lastModified;
      fields.push(`<lastmod>${xmlEscape(lastModified)}</lastmod>`);
    }
    if (entry.changeFrequency) fields.push(`<changefreq>${xmlEscape(entry.changeFrequency)}</changefreq>`);
    if (entry.priority !== undefined) fields.push(`<priority>${entry.priority}</priority>`);
    return `  <url>\n    ${fields.join("\n    ")}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

export function handleSeoMetadata(request: Request, configuredSiteUrl?: string) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname === "/robots.txt/" || url.pathname === "/sitemap.xml/") {
    return Response.redirect(new URL(url.pathname.slice(0, -1), url).toString(), 308);
  }
  if (url.pathname === "/robots.txt") {
    return new Response(request.method === "HEAD" ? null : robotsText(configuredSiteUrl), {
      headers: {
        "cache-control": "public, max-age=300",
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  }
  if (url.pathname === "/sitemap.xml") {
    return new Response(request.method === "HEAD" ? null : sitemapXml(configuredSiteUrl), {
      headers: {
        "cache-control": "public, max-age=300",
        "content-type": "application/xml; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  }
  return null;
}
