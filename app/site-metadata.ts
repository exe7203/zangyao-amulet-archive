import type { Metadata } from "next";
import { publishedBrandName } from "../shared/published-site";
import { isStaticPathIndexable } from "../shared/seo-indexing";

function siteUrl(): URL {
  try {
    const value = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
    if (value.protocol !== "http:" && value.protocol !== "https:") throw new Error("Unsupported URL");
    value.search = "";
    value.hash = "";
    if (!value.pathname.endsWith("/")) value.pathname += "/";
    return value;
  } catch {
    return new URL("http://127.0.0.1:3000/");
  }
}

export function infoPageMetadata(title: string, description: string, path: string): Metadata {
  const canonical = new URL(path.replace(/^\/+/, ""), siteUrl()).toString();
  const indexable = isStaticPathIndexable(path);
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title: `${title}｜${publishedBrandName}`,
      description,
    },
  };
}
