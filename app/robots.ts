import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
  const basePath = siteUrl.pathname === "/" ? "" : siteUrl.pathname.replace(/\/$/, "");
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
