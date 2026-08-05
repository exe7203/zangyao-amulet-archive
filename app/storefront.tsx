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

const filters = ["全部新藏", "佛牌", "神尊", "符印"] as const;
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
  reason: "公開接單尚未啟用。",
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
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("全部新藏");
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
    const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.hostname === "::1";
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
        ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
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
        // GitHub Pages 沒有動態 API，保留建置時商品快照且不啟用下單。
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
      const filterMatch = activeFilter === "全部新藏" || product.category === activeFilter;
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
  const checkoutReady = orderApiEnabled && catalogLive && cartProductsOrderable;
  const demoCatalog = orderReadiness.localDemo || !orderApiEnabled;
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
      showNotice("收藏袋與即時庫存仍在同步，請稍候再試。");
      return;
    }
    if (!orderApiEnabled || !catalogLive || !orderableProductIds.has(product.id)) {
      showNotice("此商品仍是版型示範或待覆核資料，目前不可加入接單流程。");
      return;
    }
    const existing = cartItems.find((item) => item.productId === product.id);
    const limit = getPurchaseLimit(product);
    if (product.status !== "active" || limit < 1) {
      showNotice(`${product.shortName}目前暫不可訂購`);
      return;
    }
    if (!existing && cartItems.length >= MAX_CART_DISTINCT_ITEMS) {
      showNotice(`收藏袋最多可放 ${MAX_CART_DISTINCT_ITEMS} 種商品，請先移除一件再加入`);
      return;
    }
    setCartItems((current) => addCartItem(current, product));
    showNotice(existing && existing.quantity >= limit
      ? limit === 1
        ? `${product.shortName}為一物一拍商品，每件限購 1 件`
        : `${product.shortName}已達可訂數量上限`
      : `${product.shortName}已加入收藏袋`);
  };

  const openCheckout = () => {
    if (!orderApiEnabled) {
      showNotice("目前為展示版，商品、價格、視覺與來源皆為版型示範／待覆核，不收集訂單資料。");
      return;
    }
    if (!catalogLive) {
      showNotice("接單資料服務尚未就緒，現在不會收集個人資料。");
      return;
    }
    if (!cartProductsOrderable) {
      showNotice("收藏袋內含尚未完成商品、圖片或 SEO 覆核的項目，目前不可送出。");
      return;
    }
    if (cartItems.length > MAX_CART_DISTINCT_ITEMS) {
      showNotice(`每張訂單最多 ${MAX_CART_DISTINCT_ITEMS} 種商品，請先調整收藏袋`);
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
      <div className={`announcement ${catalogLoadFailed ? "announcement--warning" : ""}`}><p>{orderReadiness.localDemo ? "本機營運測試版｜商品、價格、視覺與來源皆為版型示範／待覆核，不可對外接單" : orderApiEnabled && catalogLive ? "接單已開放｜僅已完成商品、圖片與 SEO 覆核的項目可建立保留單" : catalogLoadFailed ? "商品服務未連線｜商品、價格、視覺與來源皆為版型示範／待覆核" : "公開展示版｜商品、價格、視覺與來源皆為版型示範／待覆核，暫不收集訂單資料"}</p>{catalogLoadFailed ? <button type="button" onClick={() => setCatalogReloadToken((value) => value + 1)}>重新連線</button> : <span>{orderApiEnabled && catalogLive && !orderReadiness.localDemo ? orderReadiness.reason : "展示資料不可作為現貨、實物影像或來源證明"}</span>}</div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label={`${appearance.settings.brandName}首頁`}><span className="brand-mark">{brandMark}</span><span><b>{appearance.settings.brandName}</b><small>{appearance.settings.brandSubtitle}</small></span></a>
        <nav className="desktop-nav" aria-label="主要導覽"><a href="#new">本週新藏</a><a href="#collections">佛牌與聖物</a><a href="#themes">依祈願主題</a><a href="#archive">來源履歷</a><a href="#journal">收藏誌</a></nav>
        <div className="header-actions">
          <button className="icon-button desktop-search" onClick={() => setSearchOpen((value) => !value)} aria-label="搜尋商品" aria-expanded={searchOpen} aria-controls="site-search-panel">⌕</button>
          {memberSurfaceEnabled && <Link className="account-link" href="/account/" aria-label="此裝置資料"><i aria-hidden="true">○</i><span>我的資料</span></Link>}
          <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={cartReady ? `收藏袋，共 ${itemCount} 件商品` : "收藏袋"}><i className="bag-glyph" aria-hidden="true">◇</i><span>收藏袋</span>{cartReady && itemCount > 0 && <b>{itemCount}</b>}</button>
          <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="開啟選單">☰</button>
        </div>
        {searchOpen && <div className="search-panel" id="site-search-panel"><label htmlFor="site-search">搜尋</label><input ref={searchInputRef} id="site-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋佛牌、材質、地區或祈願主題" /><a href="#new" onClick={() => setSearchOpen(false)}>查看結果 →</a></div>}
      </header>

      <main id="main-content">

      <section className="hero" id="top">
        <div className="hero-copy"><p className="eyebrow">{appearance.settings.homeHeroEyebrow}</p><h1><span>{appearance.settings.homeHeroTitlePrimary}</span><span>{appearance.settings.homeHeroTitleSecondary}</span></h1><p className="hero-lead">{demoCatalog ? "目前為商品與內容版型示範；正式上架前將逐件完成實拍、來源與價格覆核。" : appearance.settings.homeHeroLead}</p><div className="hero-actions"><a className="button button--gold" href="#new">{appearance.settings.homePrimaryCtaLabel} <span>→</span></a><a className="text-link" href="#journal">{appearance.settings.homeSecondaryCtaLabel} ↗</a></div><div className="hero-note"><span>01</span><p>不以神奇功效作銷售話術<small>從文化、來源與工藝開始認識</small></p></div></div>
        <div className="hero-art" aria-label="佛牌視覺概念示意"><div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" /><div className="hero-card hero-card--back"><span>2566</span></div><div className="hero-amulet"><span className="hero-loop" /><span className="hero-halo" /><span className="hero-figure"><i /><b /></span><span className="hero-inscription">泰 聚 達</span></div><div className="hero-caption"><small>COLLECTION 001</small><b>典藏系列</b></div></div>
      </section>

      <section className="trust-strip" aria-label="服務特色">{(demoCatalog ? [["01", "資料欄位示範", "年份、材質與來源待逐件覆核"], ["02", "視覺版型示範", "尚未提供可驗證的實物影像"], ["03", "接單流程示範", "公開展示版不收集訂單資料"], ["04", "尊重信仰", "文化導讀，不保證功效"]] : [["01", "資料透明", "年份、材質與來源欄位"], ["02", "一物一拍", "正反面與細節如實留存"], ["03", "保留訂單", "先確認庫存，再通知付款配送"], ["04", "尊重信仰", "文化導讀，不保證功效"]]).map(([number, title, text]) => <div key={number}><span>{number}</span><p><b>{title}</b><small>{text}</small></p></div>)}</section>

      <section className="collection-nav" id="collections"><div className="section-heading"><div><p className="eyebrow eyebrow--dark">FIND YOUR COLLECTION</p><h2>{appearance.settings.homeCollectionsTitle}</h2></div><p>{appearance.settings.homeCollectionsIntro}</p></div><div className="category-grid">{[["佛牌", "崇迪・必打・坤平・龍婆托", "arch"], ["神尊", "四面神・象神・招財女神", "statue"], ["符印", "哈奴曼・符管・紀念章", "round"]].map(([name, detail, shape], index) => <a href="#new" className="category-card" key={name} onClick={() => setActiveFilter(name as "佛牌" | "神尊" | "符印")}><span className={`category-symbol category-symbol--${shape}`}><i /></span><span className="category-index">0{index + 1}</span><h3>{name}</h3><p>{detail}</p><b>查看系列 →</b></a>)}</div></section>

      <section className="products-section" id="new">
        <div className="section-heading section-heading--products"><div><p className="eyebrow eyebrow--dark">NEW ARRIVALS</p><h2>{appearance.settings.homeArrivalsTitle}</h2></div><div className="filters" role="group" aria-label="商品分類">{filters.map((filter) => <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => setActiveFilter(filter)}>{filter}</button>)}</div></div>
        {query && <p className="search-result-copy" role="status" aria-live="polite">搜尋「{query}」— 找到 {visibleProducts.length} 件商品</p>}
        <div className="product-grid">{visibleProducts.map((product) => {
          const canOrder = cartReady && catalogLive && orderApiEnabled && orderableProductIds.has(product.id) && product.status === "active" && product.stock > 0;
          return <article className="product-card" key={product.id}>
            <button className="product-visual" onClick={() => setSelected(product)} aria-label={`快速查看${product.name}`}><span className="product-badge">{product.badge}</span><ProductArtwork product={product} /><span className="quick-view">快速查看藏品履歷</span></button>
            <div className="product-info"><p>{product.origin} · {product.buddhistYear}</p><h3>{publishedProductSlugs.has(product.slug) ? <Link href={`/products/${product.slug}/`}>{product.name}</Link> : product.name}</h3><small className={canOrder && !catalogLoadFailed ? "stock-state" : "stock-state stock-state--empty"}>{catalogLoadFailed ? "快照資料・即時庫存待確認" : canOrder ? `現貨 ${product.stock} 件` : "目前不可訂購"}</small><div><b>{formatPrice(product.price)}</b><button className="add-button" onClick={() => addToCart(product)} aria-label={`將${product.shortName}加入收藏袋`} disabled={!canOrder || catalogLoadFailed}>＋</button></div></div>
          </article>;
        })}</div>
        {visibleProducts.length === 0 && <div className="empty-products"><p>{catalogLive ? "目前尚無符合條件的可訂商品。" : "目前沒有符合的展示商品。"}</p><button onClick={() => { setQuery(""); setActiveFilter("全部新藏"); }}>清除搜尋</button></div>}
        <div className="section-footer"><a href="#collections">查看全部典藏 →</a></div>
      </section>

      <section className="theme-section" id="themes"><div className="theme-intro"><p className="eyebrow">CULTURAL CONTEXT</p><h2>想找的，不只是<br />一個「功效」標籤。</h2><p>我們以常見的信仰脈絡整理主題，保留每個人理解與感受的空間。</p><small>祈願主題為文化脈絡與民間信仰整理，不代表效果承諾。</small></div><div className="theme-list">{["守護與安心", "事業與行動", "財運與商務", "人緣與溝通", "學業與專注"].map((theme, index) => <a key={theme} href="#new" onClick={() => { setQuery(theme); setActiveFilter("全部新藏"); }}><span>0{index + 1}</span><b>{theme}</b><i>→</i></a>)}</div></section>

      <section className="archive-section" id="archive"><div className="archive-visual"><div className="document-card document-card--back"><span>TJD</span></div><div className="document-card document-card--front"><p>OBJECT RECORD</p><h3>藏品履歷卡</h3><dl><div><dt>編號</dt><dd>TJD-2566-001</dd></div><div><dt>年份</dt><dd>佛曆 2566</dd></div><div><dt>材質</dt><dd>Sacred powder</dd></div><div><dt>狀態</dt><dd>待逐件覆核</dd></div></dl><span className="record-seal">泰聚<br />達</span></div></div><div className="archive-copy"><p className="eyebrow eyebrow--dark">PROVENANCE MATTERS</p><h2>一件聖物，<br />應該有看得懂的履歷。</h2><p>商品頁不只放名稱與價格，也整理寺廟或來源、師父或法會、佛曆年份、材質尺寸、取得方式、保存狀況與實拍日期。</p><ul><li><span>01</span>來源與法會資訊</li><li><span>02</span>尺寸、材質與保存狀況</li><li><span>03</span>正反面及細節實拍</li><li><span>04</span>單件庫存與典藏編號</li></ul><a className="button button--dark" href="#journal">了解我們的紀錄方式 →</a></div></section>

      <JournalSection onOpenChange={setJournalOpen} />

      <section className="newsletter"><div><p className="eyebrow">ARCHIVE LETTER</p><h2>新藏與文化筆記，<br />一個月寄一封就好。</h2></div><aside className="newsletter-status"><small>NEWSLETTER</small><b>電子報尚未開放</b><p>正式寄送與退訂服務設定完成後才會開放；目前不顯示無法送出的信箱表單，也不會收集你的資料。</p></aside></section>
      </main>

      <footer className="site-footer"><div className="footer-brand"><a className="brand brand--footer" href="#top"><span className="brand-mark">{brandMark}</span><span><b>{appearance.settings.brandName}</b><small>{appearance.settings.brandSubtitle}</small></span></a><p>來源可讀，收藏可久。<br />從文化與工藝開始認識泰國佛牌。</p></div><div className="footer-links"><div><b>典藏</b><a href="#new">本週新藏</a><a href="#collections">佛牌與聖物</a><a href="#themes">依祈願主題</a></div><div><b>認識</b><Link href="/about/">{`關於${appearance.settings.brandName}`}</Link><Link href="/pages/brand-story/">品牌故事</Link><Link href="/articles/">收藏誌</Link><a href="#archive">來源履歷</a></div><div><b>服務</b><Link href="/service/shipping/">配送與付款</Link><Link href="/service/returns/">退換貨說明</Link><Link href="/service/privacy/">隱私說明</Link><Link href="/service/contact/">聯絡我們</Link></div></div><div className="footer-bottom" id="footer-note"><span>© 2026 {appearance.settings.brandName}</span><span>{appearance.settings.footerNote}</span></div></footer>

      <aside ref={menuPanelRef} className={`mobile-menu ${menuOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="網站選單" aria-hidden={!menuOpen} inert={!menuOpen} tabIndex={-1}><div className="drawer-head"><span>選單</span><button ref={menuCloseRef} className="icon-button" onClick={() => setMenuOpen(false)} aria-label="關閉選單">×</button></div><nav><button type="button" onClick={() => { setMenuOpen(false); setSearchOpen(true); }} aria-controls="site-search-panel">搜尋收藏<span>⌕</span></button>{[["本週新藏", "#new"], ["佛牌與聖物", "#collections"], ["依祈願主題", "#themes"], ["來源履歷", "#archive"], ["收藏誌", "#journal"]].map(([label, href]) => <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}<span>→</span></a>)}{memberSurfaceEnabled && <Link href="/account/" onClick={() => setMenuOpen(false)}>此裝置資料<span>→</span></Link>}</nav></aside>

      <aside ref={cartPanelRef} className={`cart-drawer ${cartOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="收藏袋" aria-hidden={!cartOpen} inert={!cartOpen} tabIndex={-1}>
        <div className="drawer-head"><span>收藏袋 <small aria-live="polite">{cartReady ? `${itemCount} 件` : "讀取中"}</small></span><button ref={cartCloseRef} className="icon-button" onClick={() => setCartOpen(false)} aria-label="關閉收藏袋">×</button></div>
        <div className="cart-lines">{cart.length === 0 ? <div className="empty-cart"><span>◇</span><h3>{cartReady ? "收藏袋還是空的" : "正在讀取收藏袋"}</h3><p>{cartReady ? "從本週新藏挑一件喜歡的作品看看。" : "請稍候片刻。"}</p>{cartReady && <button className="button button--dark" onClick={() => setCartOpen(false)}>繼續逛逛</button>}</div> : cart.map((line) => {
          const purchaseLimit = getPurchaseLimit(line.product);
          const reachedLimit = line.quantity >= purchaseLimit;
          return <div className="cart-line" key={line.product.id}><div className="cart-thumb"><ProductArtwork product={line.product} /></div><div className="cart-line-info"><p>{line.product.buddhistYear}</p><h3>{line.product.shortName}</h3><b>{formatPrice(line.product.price)}</b>{purchaseLimit === 1 && <small className="cart-limit">一物一拍・每件限購 1 件</small>}<div className="cart-line-controls"><div className="quantity"><button onClick={() => setCartItems((current) => changeCartItemQuantity(current, line.product.id, -1, catalog))} aria-label={`減少${line.product.shortName}數量`}>−</button><span>{line.quantity}</span><button onClick={() => setCartItems((current) => changeCartItemQuantity(current, line.product.id, 1, catalog))} aria-label={`增加${line.product.shortName}數量`} disabled={reachedLimit}>＋</button></div><button className="remove-cart-line" onClick={() => setCartItems((current) => removeCartItem(current, line.product.id))} aria-label={`從收藏袋移除${line.product.shortName}`}>移除</button></div></div></div>;
        })}</div>
        {cart.length > 0 && <div className="cart-summary"><div><span>商品小計</span><b>{formatPrice(subtotal)}</b></div><p>{checkoutReady ? "送出後由店家確認運費與付款方式。" : "商品、圖片與 SEO 覆核完成且接單服務開放前，不會收集姓名、電話或地址。"}</p><div className="cart-summary-actions"><button className="clear-cart" onClick={() => setCartItems([])}>清空收藏袋</button><button className="button button--gold" onClick={openCheckout} disabled={!checkoutReady}>{checkoutReady ? "建立保留單 →" : "目前暫不接單"}</button></div></div>}
      </aside>

      <ProductDialog product={selected} onClose={() => setSelected(null)} onAdd={(product) => { addToCart(product); setSelected(null); setCartOpen(true); }} />
      <CheckoutDialog lines={cart} open={checkoutOpen} subtotal={subtotal} initialProfile={deviceProfile} onClose={() => setCheckoutOpen(false)} onCompleted={completeCheckout} />

      {orderConfirmation && <div className="order-success-modal" role="dialog" aria-modal="true" aria-labelledby="order-success-title"><button className="checkout-backdrop" onClick={() => setOrderConfirmation(null)} aria-label="關閉訂單結果" tabIndex={-1} /><div className="order-success-card" ref={orderPanelRef} tabIndex={-1}><button ref={orderCloseRef} className="order-success-close" onClick={() => setOrderConfirmation(null)} aria-label="關閉訂單結果">×</button><span>✓</span><p>RESERVATION RECEIVED</p><h2 id="order-success-title">訂單資料已收到</h2><b>{orderConfirmation.orderNumber}</b><p>商品已進入待確認狀態。付款尚未完成，店家確認來源、庫存與配送後才會通知下一步。</p>{formatReservationDeadline(orderConfirmation.reservedUntil) && <small>保留期限：{formatReservationDeadline(orderConfirmation.reservedUntil)}</small>}<div className="order-success-actions">{memberSurfaceEnabled && <Link className="button button--gold" href="/account/" onClick={() => setOrderConfirmation(null)}>查看本機紀錄</Link>}<button className="button button--dark" onClick={() => setOrderConfirmation(null)}>繼續瀏覽</button></div></div></div>}

      {(cartOpen || menuOpen) && <button className="drawer-backdrop" onClick={() => { setCartOpen(false); setMenuOpen(false); }} aria-label="關閉側邊欄" />}
      {notice && <div className="toast" role="status">{notice}</div>}
      <nav className="mobile-bottom-nav" aria-label="手機快速導覽"><a href="#top"><b>⌂</b><span>首頁</span></a><a href="#collections"><b>▦</b><span>分類</span></a><a href="#journal"><b>▤</b><span>收藏誌</span></a>{memberSurfaceEnabled && <Link href="/account/"><b>○</b><span>資料</span></Link>}<button onClick={() => setCartOpen(true)}><b>◇</b><span>收藏袋</span>{cartReady && itemCount > 0 && <i>{itemCount}</i>}</button></nav>
    </div>
  );
}
