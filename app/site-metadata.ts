import type { Metadata } from "next";
import { publishedBrandName } from "../shared/published-site";

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
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: `${title}｜${publishedBrandName}`,
      description,
    },
  };
}
