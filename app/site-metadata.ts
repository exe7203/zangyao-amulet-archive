import type { Metadata } from "next";
import { publishedBrandName, publishedSiteAppearance } from "../shared/published-site";
import { isStaticPathIndexable, staticPathIndexOptionsFromSettings } from "../shared/seo-indexing";
import { resolveSiteUrl } from "../shared/site-url";

export function infoPageMetadata(
  title: string,
  description: string,
  path: string,
  siteUrlInput?: string | URL,
): Metadata {
  const site = resolveSiteUrl(siteUrlInput?.toString());
  const canonical = site.publicUrl
    ? new URL(path.replace(/^\/+/, ""), site.publicUrl).toString()
    : null;
  const indexOptions = staticPathIndexOptionsFromSettings(publishedSiteAppearance.settings);
  const indexable = site.indexable && isStaticPathIndexable(path, indexOptions);
  const fullTitle = title.includes(publishedBrandName) ? title : `${title}｜${publishedBrandName}`;
  return {
    title: title.includes(publishedBrandName) ? { absolute: fullTitle } : title,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: { index: indexable, follow: site.indexable },
    openGraph: {
      type: "website",
      ...(canonical ? { url: canonical } : {}),
      title: fullTitle,
      description,
    },
  };
}
