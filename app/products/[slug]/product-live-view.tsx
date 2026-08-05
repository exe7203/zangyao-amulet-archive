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
        ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
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

  if (state === "loading") return <section className={styles.state}><p>正在載入商品資料…</p></section>;
  if (!product) return <section className={styles.state}><h1>找不到這項商品</h1><p>商品可能已下架或售完。</p><Link href="/#new">返回最新商品 →</Link></section>;

  const detailsConfirmed = liveConfirmed && product.seoReady === true;
  const readinessNotice = state === "stale"
    ? "商品資訊暫時無法更新，請稍後再試。"
    : localDemo
      ? "內部測試模式：商品與訂單資料僅供流程測試。"
      : !detailsConfirmed || !ordersEnabled
        ? "商品資料整理中，暫不開放訂購。"
        : !orderReady
          ? "這項商品目前暫不開放訂購。"
          : "";

  return <>
    {readinessNotice && <section className={styles.liveWarning} role="alert"><span>{readinessNotice}</span>{state === "stale" && <button type="button" onClick={() => setReloadToken((value) => value + 1)}>重新整理</button>}</section>}
    <nav className={styles.breadcrumb} aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><Link href="/#new">最新商品</Link><span>/</span><span>{product.shortName}</span></nav>
    <article className={styles.product}>
      <div className={styles.visual}><ProductArtwork product={product} large /></div>
      <div className={styles.copy}><p>商品編號 · {product.sku}</p><h1>{product.name}</h1><p className={styles.price}>{detailsConfirmed ? formatPrice(product.price) : "價格確認中"}</p><p className={styles.description}>{detailsConfirmed ? product.description : "商品資料整理中，完成確認後會更新照片、規格與來源說明。"}</p><dl>{detailsConfirmed ? <><div><dt>來源地區</dt><dd>{product.origin}</dd></div><div><dt>寺院／發行單位</dt><dd>{product.temple}</dd></div><div><dt>年份</dt><dd>{product.buddhistYear}（{product.westernYear}）</dd></div><div><dt>材質</dt><dd>{product.material}</dd></div><div><dt>尺寸</dt><dd>{product.dimensions}</dd></div><div><dt>庫存狀態</dt><dd>{orderReady && product.stock > 0 ? `${product.stock} 件` : product.stock > 0 ? "暫未開放訂購" : "目前無庫存"}</dd></div></> : <div><dt>資料狀態</dt><dd>確認中</dd></div>}</dl><ProductActions product={product} availabilityConfirmed={detailsConfirmed} orderReady={detailsConfirmed && orderReady} /><small className={styles.faith}>佛牌與相關收藏品具有宗教與文化背景，本店不宣稱或保證特定效果。</small></div>
    </article>
  </>;
}
