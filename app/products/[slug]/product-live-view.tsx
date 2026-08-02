"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice, type Product } from "../../data";
import ProductArtwork from "../../product-artwork";
import ProductActions from "./product-actions";
import styles from "./page.module.css";

function validProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<Product>;
  return typeof candidate.id === "string" && typeof candidate.slug === "string" &&
    typeof candidate.name === "string" && typeof candidate.price === "number" &&
    typeof candidate.stock === "number";
}

export default function ProductLiveView({ slug, initialProduct }: { slug: string; initialProduct: Product | null }) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(initialProduct ? "ready" : "loading");

  useEffect(() => {
    const controller = new AbortController();
    const localHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.hostname === "::1";
    async function load() {
      try {
        const response = await fetch(`/api/store/products/${encodeURIComponent(slug)}?site=taijuda`, { headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal });
        if (response.status === 404 && localHost) { setProduct(null); setState("unavailable"); return; }
        if (!response.ok) { setState(initialProduct ? "ready" : "unavailable"); return; }
        const payload = await response.json() as { product?: unknown };
        if (!validProduct(payload.product)) { setState(initialProduct ? "ready" : "unavailable"); return; }
        setProduct(payload.product);
        setState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState(initialProduct ? "ready" : "unavailable");
      }
    }
    void load();
    return () => controller.abort();
  }, [initialProduct, slug]);

  if (state === "loading") return <section className={styles.state}><p>正在讀取藏品資料…</p></section>;
  if (!product) return <section className={styles.state}><h1>這件藏品目前未公開</h1><p>可能已售罄、封存或網址尚未完成發布。</p><Link href="/#new">返回本週新藏 →</Link></section>;

  return <>
    <nav className={styles.breadcrumb} aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><Link href="/#new">本週新藏</Link><span>/</span><span>{product.shortName}</span></nav>
    <article className={styles.product}>
      <div className={styles.visual}><ProductArtwork product={product} large /></div>
      <div className={styles.copy}><p>OBJECT RECORD · {product.sku}</p><h1>{product.name}</h1><p className={styles.price}>{formatPrice(product.price)}</p><p className={styles.description}>{product.description}</p><dl><div><dt>地區／來源</dt><dd>{product.origin}・{product.temple}</dd></div><div><dt>年份</dt><dd>{product.buddhistYear}（{product.westernYear}）</dd></div><div><dt>材質</dt><dd>{product.material}</dd></div><div><dt>尺寸</dt><dd>{product.dimensions}</dd></div><div><dt>可訂庫存</dt><dd>{product.stock > 0 ? `${product.stock} 件` : "目前無庫存"}</dd></div></dl><ProductActions product={product} /><small className={styles.faith}>商品資料與來源仍須在正式上架前逐件覆核。本頁不作任何宗教功效或結果保證。</small></div>
    </article>
  </>;
}
