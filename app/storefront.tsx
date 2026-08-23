"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CART_STORAGE_KEY,
  MAX_CART_DISTINCT_ITEMS,
  addCartItem,
  changeCartItemQuantity,
  getPurchaseLimit,
  parseCartStorage,
  removeCartItem,
  resolveCartLines,
  serializeCartItems,
  type CartItem,
} from "./cart";
import CheckoutDialog, { type CheckoutResult } from "./checkout-dialog";
import { catalogCategories, formatPrice, products, type Product } from "./data";
import JournalSection from "./journal-section";
import ProductArtwork from "./product-artwork";
import ProductDialog from "./product-dialog";
import PublicFooter from "./public-footer";
import PublicHeader from "./public-header";
import { useModalFocus } from "./use-modal-focus";
import { publishedSnapshot } from "../shared/published-content";
import { PUBLIC_SITE_CODE } from "../shared/site-context";
import { publicAssetPath } from "../shared/site-url";
import { normalizeSiteAppearance } from "../shared/site-settings";
import type { DeviceCheckoutProfile } from "../shared/member-contract";
import {
  DEVICE_PROFILE_STORAGE_KEY,
  clearDeviceProfile,
  readDeviceProfile,
  rememberDeviceOrder,
  saveDeviceProfile,
} from "./member/device-storage";

const ALL_PRODUCTS_FILTER = "全部商品";
const CATEGORY_SHAPE_FALLBACKS = ["arch", "statue", "round", "oval"] as const;
const publishedCategoryDescriptions = new Map(
  catalogCategories.map((category) => [category.name, category.description]),
);
const productShapes = new Set(["arch", "oval", "round", "statue"]);
const publishedProductSlugs = new Set(products.map((product) => product.slug));
const snapshotAppearance = normalizeSiteAppearance(
  publishedSnapshot.siteSettings.settings,
  publishedSnapshot.siteSettings.theme,
);

type OrderConfirmation = CheckoutResult;

type PublicOrderReadiness = {
  mode: "local_demo" | "enabled" | "disabled";
  localDemo: boolean;
  orderableProductIds: string[];
  reason: string;
};

const disabledOrderReadiness: PublicOrderReadiness = {
  mode: "disabled",
  localDemo: false,
  orderableProductIds: [],
  reason: "目前未開放線上訂購。",
};

function formatReservationDeadline(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizePublicProduct(value: unknown): Product | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<Product>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.slug !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.shortName !== "string" ||
    typeof candidate.price !== "number" ||
    !Number.isSafeInteger(candidate.price) ||
    typeof candidate.stock !== "number" ||
    !Number.isSafeInteger(candidate.stock)
  ) return null;
  if (!productShapes.has(String(candidate.shape))) return null;
  return candidate as Product;
}

function normalizePublicOrderReadiness(value: unknown): PublicOrderReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) return disabledOrderReadiness;
  const candidate = value as Partial<PublicOrderReadiness>;
  if (!(["local_demo", "enabled", "disabled"] as const).includes(candidate.mode as PublicOrderReadiness["mode"])) {
    return disabledOrderReadiness;
  }
  return {
    mode: candidate.mode as PublicOrderReadiness["mode"],
    localDemo: candidate.localDemo === true,
    orderableProductIds: Array.isArray(candidate.orderableProductIds)
      ? candidate.orderableProductIds.filter((id): id is string => typeof id === "string")
      : [],
    reason: typeof candidate.reason === "string" ? candidate.reason : disabledOrderReadiness.reason,
  };
}

export default function Storefront() {
  const [activeFilter, setActiveFilter] = useState(ALL_PRODUCTS_FILTER);
  const [catalog, setCatalog] = useState<Product[]>(products);
  const [catalogLive, setCatalogLive] = useState(false);
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [catalogReloadToken, setCatalogReloadToken] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderApiEnabled, setOrderApiEnabled] = useState(false);
  const [orderReadiness, setOrderReadiness] = useState<PublicOrderReadiness>(disabledOrderReadiness);
  const [memberSurfaceEnabled, setMemberSurfaceEnabled] = useState(process.env.NEXT_PUBLIC_STORE_MODE === "live");
  const [deviceProfile, setDeviceProfile] = useState<DeviceCheckoutProfile | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [notice, setNotice] = useState("");
  const appearance = snapshotAppearance;
  const cartPanelRef = useRef<HTMLElement>(null);
  const cartCloseRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const orderPanelRef = useRef<HTMLDivElement>(null);
  const orderCloseRef = useRef<HTMLButtonElement>(null);

  useModalFocus(cartOpen, cartPanelRef, cartCloseRef, () => setCartOpen(false));
  useModalFocus(Boolean(orderConfirmation), orderPanelRef, orderCloseRef, () => setOrderConfirmation(null));

  useEffect(() => {
    const isLocal = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
    if (!isLocal) return;
    const timer = window.setTimeout(() => {
      setMemberSurfaceEnabled(true);
      setDeviceProfile(readDeviceProfile(window.localStorage));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle(
      "no-scroll",
      cartOpen || selected !== null || journalOpen || checkoutOpen || orderConfirmation !== null,
    );
    return () => document.body.classList.remove("no-scroll");
  }, [cartOpen, checkoutOpen, journalOpen, orderConfirmation, selected]);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    const controller = new AbortController();
    async function initializeStore() {
      let nextCatalog = products;
      let usingLiveCatalog = false;
      let nextOrdersEnabled = false;
      let nextOrderReadiness = disabledOrderReadiness;
      const expectsLiveCatalog = process.env.NEXT_PUBLIC_STORE_MODE === "live" ||
        ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
      try {
        const response = await fetch(`/api/store/products?site=${encodeURIComponent(PUBLIC_SITE_CODE)}`, {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const payload = await response.json() as {
            products?: unknown[];
            ordersEnabled?: unknown;
            readiness?: unknown;
          };
          if (Array.isArray(payload.products)) {
            const liveProducts = payload.products
              .map(normalizePublicProduct)
              .filter((product): product is Product => Boolean(product));
            const snapshotImages = new Map(
              products
                .filter((product) => product.imageUrl?.trim())
                .map((product) => [product.id, { imageUrl: product.imageUrl, imageAlt: product.imageAlt }]),
            );
            // Live catalog is authoritative for stock/status; fill empty image
            // fields from the published snapshot so atmosphere placeholders show
            // until real product photos are uploaded in admin.
            nextCatalog = liveProducts.map((product) => {
              if (product.imageUrl?.trim()) return product;
              const snapshot = snapshotImages.get(product.id);
              return snapshot
                ? { ...product, imageUrl: snapshot.imageUrl, imageAlt: product.imageAlt?.trim() || snapshot.imageAlt }
                : product;
            });
            usingLiveCatalog = true;
            nextOrdersEnabled = payload.ordersEnabled === true;
            nextOrderReadiness = normalizePublicOrderReadiness(payload.readiness);
          }
        } else if (expectsLiveCatalog) {
          setCatalogLoadFailed(true);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 靜態公開版沒有動態 API，使用已發布商品資料且不啟用下單。
        if (expectsLiveCatalog) setCatalogLoadFailed(true);
      }
      if (controller.signal.aborted) return;
      if (usingLiveCatalog) setCatalogLoadFailed(false);
      setCatalog(nextCatalog);
      setCatalogLive(usingLiveCatalog);
      setOrderApiEnabled(usingLiveCatalog && nextOrdersEnabled);
      setOrderReadiness(usingLiveCatalog ? nextOrderReadiness : disabledOrderReadiness);
      try {
        setCartItems(parseCartStorage(
          window.localStorage.getItem(CART_STORAGE_KEY),
          nextCatalog,
          { preserveUnknown: !usingLiveCatalog },
        ));
      } catch {
        setCartItems([]);
      }
      setCartReady(true);
    }
    void initializeStore();
    return () => controller.abort();
  }, [catalogReloadToken]);

  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCartItems(cartItems));
    } catch {
      // 停用瀏覽器儲存時，購物車仍能在本次瀏覽使用。
    }
  }, [cartItems, cartReady]);

  useEffect(() => {
    const syncCart = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY) {
        setCartItems(parseCartStorage(event.newValue, catalog, { preserveUnknown: !catalogLive }));
      }
      if (event.key === DEVICE_PROFILE_STORAGE_KEY) {
        setDeviceProfile(readDeviceProfile(window.localStorage));
      }
    };
    window.addEventListener("storage", syncCart);
    return () => window.removeEventListener("storage", syncCart);
  }, [catalog, catalogLive]);

  useEffect(() => {
    const closeSearchOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", closeSearchOnEscape);
    return () => window.removeEventListener("keydown", closeSearchOnEscape);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("cart") !== "open") return;
    const timer = window.setTimeout(() => setCartOpen(true), 0);
    url.searchParams.delete("cart");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return () => window.clearTimeout(timer);
  }, []);

  const categorySummaries = useMemo(() => {
    const summaries = new Map<string, { count: number; shape: Product["shape"] }>();
    for (const product of catalog) {
      const name = product.category.trim();
      if (!name) continue;
      const current = summaries.get(name);
      summaries.set(name, {
        count: (current?.count ?? 0) + 1,
        shape: current?.shape ?? product.shape,
      });
    }
    return [...summaries.entries()].map(([name, summary], index) => ({
      name,
      count: summary.count,
      detail: publishedCategoryDescriptions.get(name) || `${summary.count} 件商品`,
      shape: productShapes.has(summary.shape)
        ? summary.shape
        : CATEGORY_SHAPE_FALLBACKS[index % CATEGORY_SHAPE_FALLBACKS.length],
    }));
  }, [catalog]);
  const filterOptions = useMemo(
    () => [ALL_PRODUCTS_FILTER, ...categorySummaries.map((category) => category.name)],
    [categorySummaries],
  );
  const resolvedActiveFilter = filterOptions.includes(activeFilter)
    ? activeFilter
    : ALL_PRODUCTS_FILTER;

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((product) => {
      const filterMatch = resolvedActiveFilter === ALL_PRODUCTS_FILTER || product.category === resolvedActiveFilter;
      const queryMatch = !normalized || [product.name, product.theme, product.origin, product.material]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
      return filterMatch && queryMatch;
    });
  }, [catalog, query, resolvedActiveFilter]);

  const cart = useMemo(() => resolveCartLines(cartItems, catalog), [cartItems, catalog]);
  const orderableProductIds = useMemo(
    () => new Set(orderReadiness.orderableProductIds),
    [orderReadiness.orderableProductIds],
  );
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const cartProductsOrderable = cart.length > 0 && cart.every((line) => orderableProductIds.has(line.product.id));
  const localCommerceDemo = orderReadiness.localDemo && catalogLive;
  const cartProductsConfirmed = cart.length > 0 && cart.every((line) => localCommerceDemo || line.product.seoReady === true);
  const checkoutReady = orderApiEnabled && catalogLive && cartProductsConfirmed && cartProductsOrderable;
  const demoCatalog = orderReadiness.localDemo || !orderApiEnabled || !catalog.some((product) => product.seoReady === true);
  const themeStyle = {
    "--gold": appearance.theme.accent,
    "--paper": appearance.theme.surface,
    "--ink": appearance.theme.ink,
  } as CSSProperties;

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  const addToCart = (product: Product) => {
    if (!cartReady) {
      showNotice("購物車與庫存資料仍在更新，請稍候再試。");
      return;
    }
    if (!orderApiEnabled || !catalogLive || (!localCommerceDemo && product.seoReady !== true) || !orderableProductIds.has(product.id)) {
      showNotice("這項商品目前暫不開放訂購。");
      return;
    }
    const existing = cartItems.find((item) => item.productId === product.id);
    const limit = getPurchaseLimit(product);
    if (product.status !== "active" || limit < 1) {
      showNotice(`${product.shortName}目前暫不可訂購`);
      return;
    }
    if (!existing && cartItems.length >= MAX_CART_DISTINCT_ITEMS) {
      showNotice(`購物車最多可放 ${MAX_CART_DISTINCT_ITEMS} 種商品，請先移除一項再加入`);
      return;
    }
    setCartItems((current) => addCartItem(current, product));
    showNotice(existing && existing.quantity >= limit
      ? limit === 1
        ? `${product.shortName}為一物一拍商品，每件限購 1 件`
        : `${product.shortName}已達可訂數量上限`
      : `${product.shortName}已加入購物車`);
  };

  const openCheckout = () => {
    if (!orderApiEnabled) {
      showNotice("商品資料尚未完成確認，暫不開放訂購。");
      return;
    }
    if (!catalogLive) {
      showNotice("目前無法開始結帳，請稍後再試。");
      return;
    }
    if (!cartProductsOrderable) {
      showNotice("部分商品目前無法訂購，請調整購物車內容。");
      return;
    }
    if (cartItems.length > MAX_CART_DISTINCT_ITEMS) {
      showNotice(`每張訂單最多 ${MAX_CART_DISTINCT_ITEMS} 種商品，請先調整購物車`);
      return;
    }
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const completeCheckout = (
    order: CheckoutResult,
    profile: DeviceCheckoutProfile,
    rememberProfile: boolean,
  ) => {
    if (rememberProfile) {
      if (saveDeviceProfile(window.localStorage, profile, true)) setDeviceProfile(profile);
    } else {
      clearDeviceProfile(window.localStorage);
      setDeviceProfile(null);
    }
    rememberDeviceOrder(window.localStorage, {
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      currency: "TWD",
      createdAt: order.createdAt ?? new Date().toISOString(),
      reservedUntil: order.reservedUntil ?? null,
      items: cart.map((line) => ({ name: line.product.shortName, quantity: line.quantity })),
    });
    setCheckoutOpen(false);
    setCartItems([]);
    setOrderConfirmation(order);
  };

  const homeSectionLayout = new Map(
    appearance.settings.homeSectionOrder.map((section, index) => [section.id, { ...section, order: index }]),
  );
  const homeSectionProps = (id: "hero" | "collections" | "products" | "themes" | "archive" | "journal") => {
    const section = homeSectionLayout.get(id);
    const required = id === "hero" || id === "products";
    return {
      "data-home-section": id,
      hidden: !required && section?.visible === false,
      style: { order: section?.order ?? 0 } as CSSProperties,
    };
  };
  const journalHref = homeSectionLayout.get("journal")?.visible === false ? "/articles/" : "#journal";

  return (
    <div style={themeStyle}>
      <PublicHeader
        section="home"
        onSearch={() => setSearchOpen((value) => !value)}
        searchExpanded={searchOpen}
        onCartOpen={() => setCartOpen(true)}
        cartCount={itemCount}
        cartReady={cartReady}
        brandName={appearance.settings.brandName}
        brandSubtitle={appearance.settings.brandSubtitle}
        brandMark={appearance.settings.brandName.slice(0, 1) || "泰"}
        primaryNavigation={appearance.settings.primaryNavigation}
      />
      {searchOpen && <div className="search-panel search-panel--shared" id="site-search-panel"><label htmlFor="site-search">搜尋</label><input ref={searchInputRef} id="site-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋佛牌、材質、地區或祈願主題" /><a href="#products" onClick={() => setSearchOpen(false)}>查看結果 →</a></div>}
      <div className={`announcement ${catalogLoadFailed ? "announcement--warning" : ""}`}><p>{orderReadiness.localDemo ? "內部測試模式｜商品與訂單資料僅供流程測試" : orderApiEnabled && catalogLive ? appearance.settings.announcement : catalogLoadFailed ? "商品資訊暫時無法載入，請稍後再試" : "商品資料整理中，暫不開放訂購"}</p>{catalogLoadFailed ? <button type="button" onClick={() => setCatalogReloadToken((value) => value + 1)}>重新整理</button> : <span>{orderReadiness.localDemo ? "可驗證購物車、測試訂單與庫存流程；請勿輸入真實個資" : orderApiEnabled && catalogLive ? "訂單送出後，客服將確認庫存、運費與付款方式" : "商品照片、價格與來源資料確認後才會開放訂購"}</span>}</div>

      <main id="main-content" className="home-section-layout">

      <div className="home-section-slot" {...homeSectionProps("hero")}>
      <section className="hero hero--photo" id="hero">
        <span className="legacy-home-anchor" id="top" aria-hidden="true" />
        <div className="hero-media" aria-hidden="true">
          <img src={publicAssetPath("/media/atmosphere/hero-temple.jpg")} alt="" />
          <div className="hero-media-shade" />
        </div>
        <div className="hero-copy">
          <p className="brand-lockup">{appearance.settings.brandName}</p>
          <p className="eyebrow">{appearance.settings.homeHeroEyebrow}</p>
          <h1>
            <span>{appearance.settings.homeHeroTitlePrimary}</span>
            <span>{appearance.settings.homeHeroTitleSecondary}</span>
          </h1>
          <p className="hero-lead">
            {demoCatalog
              ? "商品資料陸續整理中，照片、價格與來源確認後才會開放訂購。"
              : appearance.settings.homeHeroLead}
          </p>
          <div className="hero-actions">
            <a className="button button--gold" href="#products">
              {appearance.settings.homePrimaryCtaLabel} <span>→</span>
            </a>
            <a className="text-link" href="#themes">
              {appearance.settings.homeSecondaryCtaLabel} ↗
            </a>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="服務特色">
        {[
          ["典藏", "佛牌與聖物", "來源、年份、材質與保存說明"],
          ["活動", "講座與聚會", "參訪、開光相關活動與見面會"],
          ["確認", "半手工接單", "確認庫存後再通知付款配送"],
          ["尊重", "信仰與文化", "提供資訊，不保證特定效果"],
        ].map(([number, title, text]) => (
          <div key={title}>
            <span>{number}</span>
            <p>
              <b>{title}</b>
              <small>{text}</small>
            </p>
          </div>
        ))}
      </section>
      </div>

      <section className="collection-nav" id="collections" {...homeSectionProps("collections")}>
        <div className="section-heading">
          <div>
            <p className="eyebrow eyebrow--dark">商品分類</p>
            <h2>{appearance.settings.homeCollectionsTitle}</h2>
          </div>
          <p>{appearance.settings.homeCollectionsIntro}</p>
        </div>
        <div className="category-grid">
          {categorySummaries.map(({ name, detail, shape }, index) => {
            const covers = [
              publicAssetPath("/media/atmosphere/statue-close.jpg"),
              publicAssetPath("/media/atmosphere/temple-interior.jpg"),
              publicAssetPath("/media/atmosphere/pagoda.jpg"),
            ];
            return (
              <a
                href="#products"
                className="category-card category-card--photo"
                key={name}
                onClick={() => setActiveFilter(name)}
              >
                <img className="category-cover" src={covers[index % covers.length]} alt="" />
                <span className="category-index">{String(index + 1).padStart(2, "0")}</span>
                <h3>{name}</h3>
                <p>{detail}</p>
                <b>查看商品 →</b>
              </a>
            );
          })}
        </div>
      </section>

      <section className="products-section" id="products" {...homeSectionProps("products")}>
        <span className="legacy-home-anchor" id="new" aria-hidden="true" />
        <div className="section-heading section-heading--products"><div><p className="eyebrow eyebrow--dark">近期典藏</p><h2>{appearance.settings.homeArrivalsTitle}</h2></div><div className="filters" role="group" aria-label="商品分類">{filterOptions.map((filter) => <button key={filter} className={resolvedActiveFilter === filter ? "active" : ""} aria-pressed={resolvedActiveFilter === filter} onClick={() => setActiveFilter(filter)}>{filter}</button>)}</div></div>
        {query && <p className="search-result-copy" role="status" aria-live="polite">搜尋「{query}」— 找到 {visibleProducts.length} 件商品</p>}
        <div className="product-grid">{visibleProducts.map((product) => {
          const detailsConfirmed = catalogLive && product.seoReady === true;
          const testingMode = localCommerceDemo && !detailsConfirmed;
          const canOrder = cartReady && (detailsConfirmed || localCommerceDemo) && orderApiEnabled && orderableProductIds.has(product.id) && product.status === "active" && product.stock > 0;
          return <article className="product-card" key={product.id}>
            <button className="product-visual" onClick={() => setSelected(product)} aria-label={`快速查看${product.name}`}>{detailsConfirmed && product.badge ? <span className="product-badge">{product.badge}</span> : product.imageUrl?.includes("/media/atmosphere/") ? <span className="product-badge">氛圍示意</span> : null}<ProductArtwork product={product} /><span className="quick-view">快速查看商品</span></button>
            <div className="product-info"><p>{detailsConfirmed ? `${product.origin} · ${product.buddhistYear}` : testingMode ? "本機測試商品 · 資料未覆核" : "商品資料整理中"}</p><h3>{publishedProductSlugs.has(product.slug) ? <Link href={`/products/${product.slug}/`}>{product.name}</Link> : product.name}</h3><small className={canOrder && !catalogLoadFailed ? "stock-state" : "stock-state stock-state--empty"}>{catalogLoadFailed ? "商品資訊暫時無法更新" : canOrder ? `${testingMode ? "測試庫存" : "現貨"} ${product.stock} 件` : "目前不可訂購"}</small><div><b>{detailsConfirmed ? formatPrice(product.price) : testingMode ? `測試價 ${formatPrice(product.price)}` : "價格確認中"}</b><button className="add-button" onClick={() => addToCart(product)} aria-label={`將${product.shortName}加入購物車`} disabled={!canOrder || catalogLoadFailed}>＋</button></div></div>
          </article>;
        })}</div>
        {visibleProducts.length === 0 && <div className="empty-products"><p>找不到符合條件的商品，請調整搜尋或分類。</p><button onClick={() => { setQuery(""); setActiveFilter(ALL_PRODUCTS_FILTER); }}>清除搜尋</button></div>}
        <div className="section-footer"><a href="#products" onClick={() => { setQuery(""); setActiveFilter(ALL_PRODUCTS_FILTER); }}>查看全部商品 →</a></div>
      </section>

      <section className="events-section" id="themes" {...homeSectionProps("themes")}>
        <div className="section-heading">
          <div>
            <p className="eyebrow eyebrow--dark">活動聚會</p>
            <h2>不只選物，也走進現場</h2>
          </div>
          <p>
            泰聚達除了整理佛牌典藏，也會安排講座、寺院參訪與藏家見面會。以下為近期活動方向示意，正式檔期公布後可在此報名或留下聯絡。
          </p>
        </div>
        <div className="events-grid">
          {[
            {
              image: publicAssetPath("/media/atmosphere/ceremony.jpg"),
              tag: "講座",
              title: "第一次接觸佛牌：來源怎麼看",
              meta: "台北｜晚間場｜名額有限",
              blurb: "從年份、材質、寺院資訊開始，建立可查證的判斷方式。",
            },
            {
              image: publicAssetPath("/media/atmosphere/temple-interior.jpg"),
              tag: "參訪",
              title: "寺院參訪與開光相關活動",
              meta: "依檔期公告｜需事先報名",
              blurb: "以尊重信仰為前提，安排可核對行程與注意事項說明。",
            },
            {
              image: publicAssetPath("/media/atmosphere/monk-temple.jpg"),
              tag: "見面會",
              title: "藏家見面與實物說明會",
              meta: "小班制｜現場看件",
              blurb: "針對單件典藏做實物說明，協助比對照片與保存狀況。",
            },
          ].map((event) => (
            <article className="event-card" key={event.title}>
              <div className="event-visual">
                <img src={event.image} alt="" />
                <span>{event.tag}</span>
              </div>
              <div className="event-copy">
                <small>{event.meta}</small>
                <h3>{event.title}</h3>
                <p>{event.blurb}</p>
                <a href="/service/contact/">留下活動意向 →</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="archive-section archive-section--photo" id="archive" {...homeSectionProps("archive")}>
        <div className="archive-visual">
          <img src={publicAssetPath("/media/atmosphere/incense-mood.jpg")} alt="" />
        </div>
        <div className="archive-copy">
          <p className="eyebrow eyebrow--dark">典藏原則</p>
          <h2>商品資訊怎麼看</h2>
          <p>
            每件正式商品會整理名稱、來源說明、年份、材質、尺寸、保存狀況與實物照片。目前首頁圖片為氛圍示意，確認後會換成該件實拍。
          </p>
          <ul>
            <li><span>01</span>來源與發行資訊</li>
            <li><span>02</span>尺寸、材質與保存狀況</li>
            <li><span>03</span>正反面及細節照片</li>
            <li><span>04</span>活動與現場說明機會</li>
          </ul>
          <a className="button button--dark" href={journalHref}>閱讀相關文章 →</a>
        </div>
      </section>

      <div className="home-section-slot" {...homeSectionProps("journal")}><JournalSection onOpenChange={setJournalOpen} /></div>

      </main>

      <PublicFooter
        brandName={appearance.settings.brandName}
        brandSubtitle={appearance.settings.brandSubtitle}
        brandMark={appearance.settings.brandName.slice(0, 1) || "泰"}
        note={appearance.settings.footerNote}
        primaryNavigation={appearance.settings.primaryNavigation}
      />

      <aside ref={cartPanelRef} className={`cart-drawer ${cartOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="購物車" aria-hidden={!cartOpen} inert={!cartOpen} tabIndex={-1}>
        <div className="drawer-head"><span>購物車 <small aria-live="polite">{cartReady ? `${itemCount} 件` : "讀取中"}</small></span><button ref={cartCloseRef} className="icon-button" onClick={() => setCartOpen(false)} aria-label="關閉購物車">×</button></div>
        <div className="cart-lines">{cart.length === 0 ? <div className="empty-cart"><span>◇</span><h3>{cartReady ? "購物車目前沒有商品" : "正在讀取購物車"}</h3><p>{cartReady ? "可從最新商品選擇想購買的品項。" : "請稍候片刻。"}</p>{cartReady && <button className="button button--dark" onClick={() => setCartOpen(false)}>繼續購物</button>}</div> : cart.map((line) => {
          const purchaseLimit = getPurchaseLimit(line.product);
          const reachedLimit = line.quantity >= purchaseLimit;
          return <div className="cart-line" key={line.product.id}><div className="cart-thumb"><ProductArtwork product={line.product} /></div><div className="cart-line-info"><p>{line.product.buddhistYear}</p><h3>{line.product.shortName}</h3><b>{formatPrice(line.product.price)}</b>{purchaseLimit === 1 && <small className="cart-limit">單件商品・每筆限購 1 件</small>}<div className="cart-line-controls"><div className="quantity"><button onClick={() => setCartItems((current) => changeCartItemQuantity(current, line.product.id, -1, catalog))} aria-label={`減少${line.product.shortName}數量`}>−</button><span>{line.quantity}</span><button onClick={() => setCartItems((current) => changeCartItemQuantity(current, line.product.id, 1, catalog))} aria-label={`增加${line.product.shortName}數量`} disabled={reachedLimit}>＋</button></div><button className="remove-cart-line" onClick={() => setCartItems((current) => removeCartItem(current, line.product.id))} aria-label={`從購物車移除${line.product.shortName}`}>移除</button></div></div></div>;
        })}</div>
        {cart.length > 0 && <div className="cart-summary"><div><span>{localCommerceDemo ? "測試商品小計" : "商品小計"}</span><b>{formatPrice(subtotal)}</b></div><small className="cart-shipping-note">運費另計；下單後由客服確認最終金額。</small><p>{checkoutReady ? localCommerceDemo ? "本機流程測試；送出會建立測試訂單並保留測試庫存。" : "送出後由客服確認庫存、運費與付款方式。" : "部分商品目前暫不開放訂購。"}</p><div className="cart-summary-actions"><button className="clear-cart" onClick={() => setCartItems([])}>清空購物車</button><button className="button button--gold" onClick={openCheckout} disabled={!checkoutReady}>{checkoutReady ? localCommerceDemo ? "本機測試結帳 →" : "前往結帳 →" : "暫未開放訂購"}</button></div></div>}
      </aside>

      <ProductDialog product={selected} canOrder={Boolean(selected && cartReady && catalogLive && (localCommerceDemo || selected.seoReady === true) && orderApiEnabled && orderableProductIds.has(selected.id))} detailsConfirmed={Boolean(selected && catalogLive && !catalogLoadFailed && selected.seoReady === true)} testingMode={Boolean(selected && localCommerceDemo)} onClose={() => setSelected(null)} onAdd={(product) => { addToCart(product); setSelected(null); setCartOpen(true); }} />
      <CheckoutDialog lines={cart} open={checkoutOpen} subtotal={subtotal} testingMode={localCommerceDemo} initialProfile={deviceProfile} onClose={() => setCheckoutOpen(false)} onCompleted={completeCheckout} />

      {orderConfirmation && (
        <div className="order-success-modal" role="dialog" aria-modal="true" aria-labelledby="order-success-title">
          <button className="checkout-backdrop" onClick={() => setOrderConfirmation(null)} aria-label="關閉訂單結果" tabIndex={-1} />
          <div className="order-success-card" ref={orderPanelRef} tabIndex={-1}>
            <button ref={orderCloseRef} className="order-success-close" onClick={() => setOrderConfirmation(null)} aria-label="關閉訂單結果">×</button>
            <span>✓</span>
            <p>{localCommerceDemo ? "測試訂單已建立" : "訂單已送出"}</p>
            <h2 id="order-success-title">{localCommerceDemo ? "本機測試訂單已建立" : "我們已收到你的訂單"}</h2>
            <b>{orderConfirmation.orderNumber}</b>
            <p>
              {localCommerceDemo
                ? "這是這台電腦的測試流程，不會真的收款或出貨。你可以在後台訂單管理查看紀錄。"
                : "客服將確認庫存、運費與付款方式，並依你留下的聯絡資料通知。"}
            </p>
            <ul className="order-success-steps">
              <li>{localCommerceDemo ? "1. 到後台查看測試訂單" : "1. 客服確認商品與庫存"}</li>
              <li>{localCommerceDemo ? "2. 測試完成後可取消訂單" : "2. 告知運費與付款方式"}</li>
              <li>{localCommerceDemo ? "3. 請勿輸入真實個資" : "3. 付款完成後安排出貨"}</li>
            </ul>
            {formatReservationDeadline(orderConfirmation.reservedUntil) && (
              <small>訂單保留期限：{formatReservationDeadline(orderConfirmation.reservedUntil)}</small>
            )}
            <div className="order-success-actions">
              {memberSurfaceEnabled && (
                <Link className="button button--gold" href="/account/" onClick={() => setOrderConfirmation(null)}>
                  查看訂單
                </Link>
              )}
              <button className="button button--dark" onClick={() => setOrderConfirmation(null)}>繼續瀏覽</button>
            </div>
          </div>
        </div>
      )}

      {cartOpen && <button className="drawer-backdrop" onClick={() => setCartOpen(false)} aria-label="關閉購物車" />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
