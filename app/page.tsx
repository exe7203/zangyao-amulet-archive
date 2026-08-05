import type { Metadata } from "next";
import Storefront from "./storefront";
import { products } from "./data";
import { publishedBrandName } from "../shared/published-site";
import { serializeJsonLd } from "../shared/json-ld";

export const metadata: Metadata = {
  title: "泰國佛牌與聖物收藏",
  description: `${publishedBrandName}以來源紀錄、實物影像與文化導讀為核心，精選泰國佛牌與聖物。`,
  robots: {
    index: true,
    follow: true,
  },
};

export default function Home() {
  const siteUrl = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/",
  );
  const catalogVerified = process.env.NEXT_PUBLIC_CATALOG_VERIFIED === "1";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": new URL("#store", siteUrl).toString(),
        name: publishedBrandName,
        description: "以來源紀錄與文化導讀為核心的泰國佛牌與聖物選物。",
        areaServed: "TW",
      },
      ...(catalogVerified ? [{
        "@type": "ItemList",
        name: "本週新藏",
        itemListElement: products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: product.name,
            category: product.category,
            material: product.material,
            offers: {
              "@type": "Offer",
              priceCurrency: "TWD",
              price: product.price,
              availability: "https://schema.org/InStock",
            },
          },
        })),
      }] : []),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <Storefront />
    </>
  );
}
