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
  const [state, setState] = useState<"loading" | "ready" | "stale" | "unavailable">(initialProduct ? "ready" : "loading");
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [ordersEnabled, setOrdersEnabled] = useState(false);
  const [localDemo, setLocalDemo] = useState(false);
  const [orderReady, setOrderReady] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLiveConfirmed(false);
      setOrdersEnabled(false);
      setLocalDemo(false);
      setOrderReady(false);
      const expectsLive = process.env.NEXT_PUBLIC_STORE_MODE === "live" ||
        ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
      try {
        const response = await fetch(`/api/store/products/${encodeURIComponent(slug)}?site=taijuda`, { headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal });
        const isJsonApiResponse = response.headers.get("content-type")?.toLowerCase().includes("application/json");
        if (response.status === 404 && isJsonApiResponse) { setProduct(null); setState("unavailable"); return; }
        if (!response.ok) { setState(initialProduct ? (expectsLive ? "stale" : "ready") : "unavailable"); return; }
        const payload = await response.json() as {
          product?: unknown;
          ordersEnabled?: unknown;
          readiness?: {
            localDemo?: unknown;
            orderableProductIds?: unknown;
          };
        };
        if (!validProduct(payload.product)) { setState(initialProduct ? (expectsLive ? "stale" : "ready") : "unavailable"); return; }
        const liveProduct = payload.product;
        // The live API returns the complete product record and is authoritative
        // for every customer-visible field, not only price and stock.
        setProduct(liveProduct);
        setLiveConfirmed(true);
        setOrdersEnabled(payload.ordersEnabled === true);
        setLocalDemo(payload.readiness?.localDemo === true);
        setOrderReady(
          payload.ordersEnabled === true &&
          Array.isArray(payload.readiness?.orderableProductIds) &&
          payload.readiness.orderableProductIds.includes(liveProduct.id),
        );
        setState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState(initialProduct ? (expectsLive ? "stale" : "ready") : "unavailable");
      }
    }
    void load();
    return () => controller.abort();
  }, [initialProduct, reloadToken, slug]);

  if (state === "loading") return <section className={styles.state}><p>正在讀取藏品資料…</p></section>;
  if (!product) return <section className={styles.state}><h1>這件藏品目前未公開</h1><p>可能已售罄、封存或網址尚未完成發布。</p><Link href="/#new">返回本週新藏 →</Link></section>;

  const readinessNotice = !liveConfirmed
    ? "目前顯示建置時的商品快照，商品、價格、視覺與來源皆為版型示範／待覆核。"
    : localDemo
      ? "本機營運測試版：資料只供流程驗證，不可視為可對外銷售資訊。"
      : !ordersEnabled
        ? "公開展示版：商品、價格、視覺與來源皆為版型示範／待覆核，暫不接單。"
        : !orderReady
          ? "此商品尚未完成商品、圖片與 SEO 覆核，目前未開放接單。"
          : "";

  return <>
    {readinessNotice && <section className={styles.liveWarning} role="alert"><span>{readinessNotice}</span>{!liveConfirmed && <button type="button" onClick={() => setReloadToken((value) => value + 1)}>重新連線</button>}</section>}
    <nav className={styles.breadcrumb} aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><Link href="/#new">本週新藏</Link><span>/</span><span>{product.shortName}</span></nav>
    <article className={styles.product}>
      <div className={styles.visual}><ProductArtwork product={product} large /></div>
      <div className={styles.copy}><p>OBJECT RECORD · {product.sku}</p><h1>{product.name}</h1><p className={styles.price}>{formatPrice(product.price)}</p><p className={styles.description}>{product.description}</p><dl><div><dt>地區／來源</dt><dd>{product.origin}・{product.temple}</dd></div><div><dt>年份</dt><dd>{product.buddhistYear}（{product.westernYear}）</dd></div><div><dt>材質</dt><dd>{product.material}</dd></div><div><dt>尺寸</dt><dd>{product.dimensions}</dd></div><div><dt>可訂庫存</dt><dd>{!liveConfirmed ? "尚未確認" : orderReady && product.stock > 0 ? `${product.stock} 件` : product.stock > 0 ? "有庫存，尚未開放接單" : "目前無庫存"}</dd></div></dl><ProductActions product={product} availabilityConfirmed={liveConfirmed} orderReady={orderReady} /><small className={styles.faith}>商品資料與來源仍須在正式上架前逐件覆核。本頁不作任何宗教功效或結果保證。</small></div>
    </article>
  </>;
}
