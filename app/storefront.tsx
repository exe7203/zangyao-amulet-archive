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
import { formatPrice, products, type Product } from "./data";
import JournalSection from "./journal-section";
import ProductArtwork from "./product-artwork";
import ProductDialog from "./product-dialog";
import { useModalFocus } from "./use-modal-focus";
import { publishedSnapshot } from "../shared/published-content";
import { normalizeSiteAppearance } from "../shared/site-settings";
import type { DeviceCheckoutProfile } from "../shared/member-contract";
import {
  DEVICE_PROFILE_STORAGE_KEY,
  clearDeviceProfile,
  readDeviceProfile,
  rememberDeviceOrder,
  saveDeviceProfile,
} from "./member/device-storage";

const filters = ["全部商品", "佛牌", "神尊", "符印"] as const;
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
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("全部商品");
  const [catalog, setCatalog] = useState<Product[]>(products);
  const [catalogLive, setCatalogLive] = useState(false);
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [catalogReloadToken, setCatalogReloadToken] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const menuPanelRef = useRef<HTMLElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const orderPanelRef = useRef<HTMLDivElement>(null);
  const orderCloseRef = useRef<HTMLButtonElement>(null);

  useModalFocus(cartOpen, cartPanelRef, cartCloseRef, () => setCartOpen(false));
  useModalFocus(menuOpen, menuPanelRef, menuCloseRef, () => setMenuOpen(false));
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
      cartOpen || menuOpen || selected !== null || journalOpen || checkoutOpen || orderConfirmation !== null,
    );
    return () => document.body.classList.remove("no-scroll");
  }, [cartOpen, checkoutOpen, journalOpen, menuOpen, orderConfirmation, selected]);

  useEffect(() => {
    if (!searchOpen || menuOpen) return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [menuOpen, searchOpen]);

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
        const response = await fetch("/api/store/products?site=taijuda", {
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
            // A successful live response is authoritative. Reusing snapshot-only
            // products would keep archived records visible, while overlaying only
            // snapshot IDs would hide newly-created products.
            nextCatalog = liveProducts;
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

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((product) => {
      const filterMatch = activeFilter === "全部商品" || product.category === activeFilter;
      const queryMatch = !normalized || [product.name, product.theme, product.origin, product.material]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
      return filterMatch && queryMatch;
    });
  }, [activeFilter, catalog, query]);

  const cart = useMemo(() => resolveCartLines(cartItems, catalog), [cartItems, catalog]);
  const orderableProductIds = useMemo(
    () => new Set(orderReadiness.orderableProductIds),
    [orderReadiness.orderableProductIds],
  );
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const cartProductsOrderable = cart.length > 0 && cart.every((line) => orderableProductIds.has(line.product.id));
  const cartProductsConfirmed = cart.length > 0 && cart.every((line) => line.product.seoReady === true);
  const checkoutReady = orderApiEnabled && catalogLive && cartProductsConfirmed && cartProductsOrderable;
  const demoCatalog = orderReadiness.localDemo || !orderApiEnabled || !catalog.some((product) => product.seoReady === true);
  const brandMark = appearance.settings.brandName.slice(0, 1) || "泰";
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
    if (!orderApiEnabled || !catalogLive || product.seoReady !== true || !orderableProductIds.has(product.id)) {
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

  return (
    <div style={themeStyle}>
      <a className="skip-link" href="#main-content">跳至主要內容</a>
      <div className={`announcement ${catalogLoadFailed ? "announcement--warning" : ""}`}><p>{orderReadiness.localDemo ? "內部測試模式｜商品與訂單資料僅供流程測試" : orderApiEnabled && catalogLive ? appearance.settings.announcement : catalogLoadFailed ? "商品資訊暫時無法載入，請稍後再試" : "商品資料整理中，暫不開放訂購"}</p>{catalogLoadFailed ? <button type="button" onClick={() => setCatalogReloadToken((value) => value + 1)}>重新整理</button> : <span>{orderApiEnabled && catalogLive && !orderReadiness.localDemo ? "訂單送出後，客服將確認庫存、運費與付款方式" : "商品照片、價格與來源資料確認後才會開放訂購"}</span>}</div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label={`${appearance.settings.brandName}首頁`}><span className="brand-mark">{brandMark}</span><span><b>{appearance.settings.brandName}</b><small>{appearance.settings.brandSubtitle}</small></span></a>
        <nav className="desktop-nav" aria-label="主要導覽"><a href="#new">最新商品</a><a href="#collections">商品分類</a><a href="#themes">文化主題</a><a href="#archive">商品資訊</a><a href="#journal">佛牌專欄</a></nav>
        <div className="header-actions">
          <button className="icon-button desktop-search" onClick={() => setSearchOpen((value) => !value)} aria-label="搜尋商品" aria-expanded={searchOpen} aria-controls="site-search-panel">⌕</button>
          {memberSurfaceEnabled && <Link className="account-link" href="/account/" aria-label="會員中心"><i aria-hidden="true">○</i><span>會員中心</span></Link>}
          <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={cartReady ? `購物車，共 ${itemCount} 件商品` : "購物車"}><i className="bag-glyph" aria-hidden="true">◇</i><span>購物車</span>{cartReady && itemCount > 0 && <b>{itemCount}</b>}</button>
          <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="開啟選單">☰</button>
        </div>
        {searchOpen && <div className="search-panel" id="site-search-panel"><label htmlFor="site-search">搜尋</label><input ref={searchInputRef} id="site-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋佛牌、材質、地區或祈願主題" /><a href="#new" onClick={() => setSearchOpen(false)}>查看結果 →</a></div>}
      </header>

      <main id="main-content">

      <section className="hero" id="top">
        <div className="hero-copy"><p className="eyebrow">{appearance.settings.homeHeroEyebrow}</p><h1><span>{appearance.settings.homeHeroTitlePrimary}</span><span>{appearance.settings.homeHeroTitleSecondary}</span></h1><p className="hero-lead">{demoCatalog ? "商品資料陸續整理中，照片、價格與來源確認後才會開放訂購。" : appearance.settings.homeHeroLead}</p><div className="hero-actions"><a className="button button--gold" href="#new">{appearance.settings.homePrimaryCtaLabel} <span>→</span></a><a className="text-link" href="#journal">{appearance.settings.homeSecondaryCtaLabel} ↗</a></div><div className="hero-note"><span>01</span><p>提供清楚的商品與文化資訊<small>不宣稱或保證特定宗教效果</small></p></div></div>
        <div className="hero-art" aria-label="佛牌視覺概念示意"><div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" /><div className="hero-card hero-card--back"><span>2566</span></div><div className="hero-amulet"><span className="hero-loop" /><span className="hero-halo" /><span className="hero-figure"><i /><b /></span><span className="hero-inscription">泰 聚 達</span></div><div className="hero-caption"><small>TAIJUDA</small><b>商品系列</b></div></div>
      </section>

      <section className="trust-strip" aria-label="服務特色">{[["01", "商品資料", "標示年份、材質、尺寸與來源"], ["02", "商品圖片", "正式商品會提供正反面與細節照片"], ["03", "訂單確認", "確認庫存後再通知付款與配送"], ["04", "文化尊重", "提供文化資訊，不保證特定效果"]].map(([number, title, text]) => <div key={number}><span>{number}</span><p><b>{title}</b><small>{text}</small></p></div>)}</section>

      <section className="collection-nav" id="collections"><div className="section-heading"><div><p className="eyebrow eyebrow--dark">商品分類</p><h2>{appearance.settings.homeCollectionsTitle}</h2></div><p>{appearance.settings.homeCollectionsIntro}</p></div><div className="category-grid">{[["佛牌", "崇迪・必打・坤平・龍婆托", "arch"], ["神尊", "四面神・象神・招財女神", "statue"], ["符印", "哈奴曼・符管・紀念章", "round"]].map(([name, detail, shape], index) => <a href="#new" className="category-card" key={name} onClick={() => setActiveFilter(name as "佛牌" | "神尊" | "符印")}><span className={`category-symbol category-symbol--${shape}`}><i /></span><span className="category-index">0{index + 1}</span><h3>{name}</h3><p>{detail}</p><b>查看商品 →</b></a>)}</div></section>

      <section className="products-section" id="new">
        <div className="section-heading section-heading--products"><div><p className="eyebrow eyebrow--dark">最新上架</p><h2>{appearance.settings.homeArrivalsTitle}</h2></div><div className="filters" role="group" aria-label="商品分類">{filters.map((filter) => <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => setActiveFilter(filter)}>{filter}</button>)}</div></div>
        {query && <p className="search-result-copy" role="status" aria-live="polite">搜尋「{query}」— 找到 {visibleProducts.length} 件商品</p>}
        <div className="product-grid">{visibleProducts.map((product) => {
          const detailsConfirmed = catalogLive && product.seoReady === true;
          const canOrder = cartReady && detailsConfirmed && orderApiEnabled && orderableProductIds.has(product.id) && product.status === "active" && product.stock > 0;
          return <article className="product-card" key={product.id}>
            <button className="product-visual" onClick={() => setSelected(product)} aria-label={`快速查看${product.name}`}>{detailsConfirmed && product.badge && <span className="product-badge">{product.badge}</span>}<ProductArtwork product={product} /><span className="quick-view">快速查看商品</span></button>
            <div className="product-info"><p>{detailsConfirmed ? `${product.origin} · ${product.buddhistYear}` : "商品資料整理中"}</p><h3>{publishedProductSlugs.has(product.slug) ? <Link href={`/products/${product.slug}/`}>{product.name}</Link> : product.name}</h3><small className={canOrder && !catalogLoadFailed ? "stock-state" : "stock-state stock-state--empty"}>{catalogLoadFailed ? "商品資訊暫時無法更新" : canOrder ? `現貨 ${product.stock} 件` : "目前不可訂購"}</small><div><b>{detailsConfirmed ? formatPrice(product.price) : "價格確認中"}</b><button className="add-button" onClick={() => addToCart(product)} aria-label={`將${product.shortName}加入購物車`} disabled={!canOrder || catalogLoadFailed}>＋</button></div></div>
          </article>;
        })}</div>
        {visibleProducts.length === 0 && <div className="empty-products"><p>找不到符合條件的商品，請調整搜尋或分類。</p><button onClick={() => { setQuery(""); setActiveFilter("全部商品"); }}>清除搜尋</button></div>}
        <div className="section-footer"><a href="#collections">查看全部商品 →</a></div>
      </section>

      <section className="theme-section" id="themes"><div className="theme-intro"><p className="eyebrow">文化主題</p><h2>依文化寓意與<br />收藏偏好瀏覽</h2><p>以下分類整理常見的民俗文化寓意，方便瀏覽相關商品。</p><small>文化分類僅供參考，不代表效果承諾。</small></div><div className="theme-list">{["守護與安心", "事業與行動", "財運與商務", "人緣與溝通", "學業與專注"].map((theme, index) => <a key={theme} href="#new" onClick={() => { setQuery(theme); setActiveFilter("全部商品"); }}><span>0{index + 1}</span><b>{theme}</b><i>→</i></a>)}</div></section>

      <section className="archive-section" id="archive"><div className="archive-visual"><div className="document-card document-card--back"><span>TJD</span></div><div className="document-card document-card--front"><p>商品資訊</p><h3>商品資料卡</h3><dl><div><dt>編號</dt><dd>TJD-2566-001</dd></div><div><dt>年份</dt><dd>佛曆 2566</dd></div><div><dt>材質</dt><dd>粉質</dd></div><div><dt>狀態</dt><dd>資料確認中</dd></div></dl><span className="record-seal">泰聚<br />達</span></div></div><div className="archive-copy"><p className="eyebrow eyebrow--dark">商品資訊</p><h2>商品資訊怎麼看</h2><p>每件商品會整理名稱、來源說明、年份、材質、尺寸、保存狀況與實物照片，方便選購前查閱。</p><ul><li><span>01</span>來源與發行資訊</li><li><span>02</span>尺寸、材質與保存狀況</li><li><span>03</span>正反面及細節照片</li><li><span>04</span>商品編號與庫存狀態</li></ul><a className="button button--dark" href="#journal">閱讀相關文章 →</a></div></section>

      <JournalSection onOpenChange={setJournalOpen} />

      </main>

      <footer className="site-footer"><div className="footer-brand"><a className="brand brand--footer" href="#top"><span className="brand-mark">{brandMark}</span><span><b>{appearance.settings.brandName}</b><small>{appearance.settings.brandSubtitle}</small></span></a><p>泰國佛牌與相關收藏品。<br />提供商品資訊、文化文章與選購說明。</p></div><div className="footer-links"><div><b>商品</b><a href="#new">最新商品</a><a href="#collections">商品分類</a><a href="#themes">文化主題</a></div><div><b>關於</b><Link href="/about/">{`關於${appearance.settings.brandName}`}</Link><Link href="/articles/">佛牌專欄</Link><a href="#archive">商品資訊說明</a></div><div><b>服務</b><Link href="/service/shipping/">配送與付款</Link><Link href="/service/returns/">退換貨說明</Link><Link href="/service/privacy/">隱私權政策</Link></div></div><div className="footer-bottom" id="footer-note"><span>© 2026 {appearance.settings.brandName}</span><span>{appearance.settings.footerNote}</span></div></footer>

      <aside ref={menuPanelRef} className={`mobile-menu ${menuOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="網站選單" aria-hidden={!menuOpen} inert={!menuOpen} tabIndex={-1}><div className="drawer-head"><span>選單</span><button ref={menuCloseRef} className="icon-button" onClick={() => setMenuOpen(false)} aria-label="關閉選單">×</button></div><nav><button type="button" onClick={() => { setMenuOpen(false); setSearchOpen(true); }} aria-controls="site-search-panel">搜尋商品<span>⌕</span></button>{[["最新商品", "#new"], ["商品分類", "#collections"], ["文化主題", "#themes"], ["商品資訊", "#archive"], ["佛牌專欄", "#journal"]].map(([label, href]) => <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}<span>→</span></a>)}{memberSurfaceEnabled && <Link href="/account/" onClick={() => setMenuOpen(false)}>會員中心<span>→</span></Link>}</nav></aside>

      <aside ref={cartPanelRef} className={`cart-drawer ${cartOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="購物車" aria-hidden={!cartOpen} inert={!cartOpen} tabIndex={-1}>
        <div className="drawer-head"><span>購物車 <small aria-live="polite">{cartReady ? `${itemCount} 件` : "讀取中"}</small></span><button ref={cartCloseRef} className="icon-button" onClick={() => setCartOpen(false)} aria-label="關閉購物車">×</button></div>
        <div className="cart-lines">{cart.length === 0 ? <div className="empty-cart"><span>◇</span><h3>{cartReady ? "購物車目前沒有商品" : "正在讀取購物車"}</h3><p>{cartReady ? "可從最新商品選擇想購買的品項。" : "請稍候片刻。"}</p>{cartReady && <button className="button button--dark" onClick={() => setCartOpen(false)}>繼續購物</button>}</div> : cart.map((line) => {
          const purchaseLimit = getPurchaseLimit(line.product);
          const reachedLimit = line.quantity >= purchaseLimit;
          return <div className="cart-line" key={line.product.id}><div className="cart-thumb"><ProductArtwork product={line.product} /></div><div className="cart-line-info"><p>{line.product.buddhistYear}</p><h3>{line.product.shortName}</h3><b>{formatPrice(line.product.price)}</b>{purchaseLimit === 1 && <small className="cart-limit">單件商品・每筆限購 1 件</small>}<div className="cart-line-controls"><div className="quantity"><button onClick={() => setCartItems((current) => changeCartItemQuantity(current, line.product.id, -1, catalog))} aria-label={`減少${line.product.shortName}數量`}>−</button><span>{line.quantity}</span><button onClick={() => setCartItems((current) => changeCartItemQuantity(current, line.product.id, 1, catalog))} aria-label={`增加${line.product.shortName}數量`} disabled={reachedLimit}>＋</button></div><button className="remove-cart-line" onClick={() => setCartItems((current) => removeCartItem(current, line.product.id))} aria-label={`從購物車移除${line.product.shortName}`}>移除</button></div></div></div>;
        })}</div>
        {cart.length > 0 && <div className="cart-summary"><div><span>商品小計</span><b>{formatPrice(subtotal)}</b></div><p>{checkoutReady ? "送出後由客服確認庫存、運費與付款方式。" : "部分商品目前暫不開放訂購。"}</p><div className="cart-summary-actions"><button className="clear-cart" onClick={() => setCartItems([])}>清空購物車</button><button className="button button--gold" onClick={openCheckout} disabled={!checkoutReady}>{checkoutReady ? "前往結帳 →" : "暫未開放訂購"}</button></div></div>}
      </aside>

      <ProductDialog product={selected} canOrder={Boolean(selected && cartReady && catalogLive && selected.seoReady === true && orderApiEnabled && orderableProductIds.has(selected.id))} detailsConfirmed={Boolean(selected && catalogLive && !catalogLoadFailed && selected.seoReady === true)} onClose={() => setSelected(null)} onAdd={(product) => { addToCart(product); setSelected(null); setCartOpen(true); }} />
      <CheckoutDialog lines={cart} open={checkoutOpen} subtotal={subtotal} initialProfile={deviceProfile} onClose={() => setCheckoutOpen(false)} onCompleted={completeCheckout} />

      {orderConfirmation && <div className="order-success-modal" role="dialog" aria-modal="true" aria-labelledby="order-success-title"><button className="checkout-backdrop" onClick={() => setOrderConfirmation(null)} aria-label="關閉訂單結果" tabIndex={-1} /><div className="order-success-card" ref={orderPanelRef} tabIndex={-1}><button ref={orderCloseRef} className="order-success-close" onClick={() => setOrderConfirmation(null)} aria-label="關閉訂單結果">×</button><span>✓</span><p>訂單已送出</p><h2 id="order-success-title">我們已收到你的訂單</h2><b>{orderConfirmation.orderNumber}</b><p>客服將確認庫存、運費與付款方式，並依你留下的聯絡資料通知。</p>{formatReservationDeadline(orderConfirmation.reservedUntil) && <small>訂單保留期限：{formatReservationDeadline(orderConfirmation.reservedUntil)}</small>}<div className="order-success-actions">{memberSurfaceEnabled && <Link className="button button--gold" href="/account/" onClick={() => setOrderConfirmation(null)}>查看訂單</Link>}<button className="button button--dark" onClick={() => setOrderConfirmation(null)}>繼續瀏覽</button></div></div></div>}

      {(cartOpen || menuOpen) && <button className="drawer-backdrop" onClick={() => { setCartOpen(false); setMenuOpen(false); }} aria-label="關閉側邊欄" />}
      {notice && <div className="toast" role="status">{notice}</div>}
      <nav className="mobile-bottom-nav" aria-label="手機快速導覽"><a href="#top"><b>⌂</b><span>首頁</span></a><a href="#collections"><b>▦</b><span>分類</span></a><a href="#journal"><b>▤</b><span>專欄</span></a>{memberSurfaceEnabled && <Link href="/account/"><b>○</b><span>會員</span></Link>}<button onClick={() => setCartOpen(true)}><b>◇</b><span>購物車</span>{cartReady && itemCount > 0 && <i>{itemCount}</i>}</button></nav>
    </div>
  );
}
