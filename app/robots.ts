import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "../shared/site-url";

export const dynamic = "force-static";

export function buildRobots(siteUrlInput?: string | URL): MetadataRoute.Robots {
  const site = resolveSiteUrl(siteUrlInput?.toString());
  const siteUrl = site.url;
  const basePath = siteUrl.pathname === "/" ? "" : siteUrl.pathname.replace(/\/$/, "");
  if (!site.indexable) {
    return { rules: [{ userAgent: "*", disallow: `${basePath}/` }] };
  }
  return {
    rules: [{
      userAgent: "*",
      allow: `${basePath}/`,
      disallow: [`${basePath}/admin/`, `${basePath}/api/`],
    }],
    sitemap: new URL("sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
