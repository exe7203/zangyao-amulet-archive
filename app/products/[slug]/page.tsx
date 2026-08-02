import type { Metadata } from "next";
import Link from "next/link";
import { products } from "../../data";
import ProductLiveView from "./product-live-view";
import styles from "./page.module.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000/");
const catalogVerified = process.env.NEXT_PUBLIC_CATALOG_VERIFIED === "1";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = products.find((candidate) => candidate.slug === slug);
  if (!product) return { title: { absolute: "藏品資料｜泰聚達" }, robots: { index: false, follow: true } };
  const canonical = new URL(`products/${product.slug}/`, siteUrl).toString();
  return {
    title: { absolute: product.seoTitle || `${product.name}｜泰聚達` },
    description: product.seoDescription || product.description,
    alternates: { canonical },
    robots: { index: catalogVerified, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title: product.seoTitle || product.name,
      description: product.seoDescription || product.description,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products.find((candidate) => candidate.slug === slug);
  const canonical = new URL(`products/${product?.slug || slug}/`, siteUrl).toString();
  const structuredData = catalogVerified && product ? {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: siteUrl.toString() },
        { "@type": "ListItem", position: 2, name: product.name, item: canonical },
      ] },
      { "@type": "Product", name: product.name, sku: product.sku, description: product.description, material: product.material, category: product.category, offers: { "@type": "Offer", priceCurrency: "TWD", price: product.price, availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: canonical } },
    ],
  } : null;

  return <main className={styles.page}>
    {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />}
    <header className={styles.header}><Link className={styles.brand} href="/"><span>泰</span><b>泰聚達</b></Link><Link href="/#new">返回本週新藏 →</Link></header>
    <ProductLiveView slug={slug} initialProduct={product || null} />
    <footer className={styles.footer}><span>© 2026 泰聚達</span><Link href="/service/shipping/">配送與付款</Link></footer>
  </main>;
}
