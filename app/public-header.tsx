"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  publishedBrandMark,
  publishedBrandName,
  publishedBrandSubtitle,
  publishedSiteAppearance,
} from "../shared/published-site";
import { safeInternalNavigationHref } from "../shared/site-settings";
import DeviceCartLink from "./device-cart-link";
import styles from "./public-chrome.module.css";
import { useModalFocus } from "./use-modal-focus";

export type PublicHeaderLink = {
  href: string;
  label: string;
};

export type PublicSection = "home" | "collection" | "journal" | "account" | "info" | "page";

const FALLBACK_PRIMARY_LINKS: PublicHeaderLink[] = publishedSiteAppearance.settings.primaryNavigation;

function safePrimaryLinks(value: readonly PublicHeaderLink[] | undefined) {
  if (!value || value.length < 2 || value.length > 6) return FALLBACK_PRIMARY_LINKS;
  const links = value.flatMap((item) => {
    const href = safeInternalNavigationHref(item.href);
    const label = typeof item.label === "string" ? item.label.trim() : "";
    return href && label && label.length <= 30 ? [{ href, label }] : [];
  });
  const hasHome = links.some((link) => link.href === "/" || link.href === "/#hero" || link.href === "#hero");
  const hasProducts = links.some((link) => link.href === "/#products" || link.href === "#products");
  const uniqueHrefs = new Set(links.map((link) => link.href));
  return links.length === value.length && uniqueHrefs.size === links.length && hasHome && hasProducts
    ? links
    : FALLBACK_PRIMARY_LINKS;
}

function ariaCurrent(active: boolean) {
  return active ? "page" as const : undefined;
}

export default function PublicHeader({
  section = "info",
  contextLinks = [],
  mainId = "main-content",
  onSearch,
  searchExpanded = false,
  searchControls = "site-search-panel",
  onCartOpen,
  cartCount = 0,
  cartReady = true,
  brandName = publishedBrandName,
  brandSubtitle = publishedBrandSubtitle,
  brandMark = publishedBrandMark,
  primaryNavigation,
}: {
  section?: PublicSection;
  contextLinks?: PublicHeaderLink[];
  mainId?: string;
  onSearch?: () => void;
  searchExpanded?: boolean;
  searchControls?: string;
  onCartOpen?: () => void;
  cartCount?: number;
  cartReady?: boolean;
  brandName?: string;
  brandSubtitle?: string;
  brandMark?: string;
  primaryNavigation?: readonly PublicHeaderLink[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [memberSurfaceEnabled, setMemberSurfaceEnabled] = useState(
    process.env.NEXT_PUBLIC_STORE_MODE === "live",
  );
  const menuRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useModalFocus(menuOpen, menuRef, closeRef, () => setMenuOpen(false));

  useEffect(() => {
    document.body.classList.toggle("no-scroll", menuOpen);
    return () => document.body.classList.remove("no-scroll");
  }, [menuOpen]);

  useEffect(() => {
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname)) return;
    const timer = window.setTimeout(() => setMemberSurfaceEnabled(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const closeMenu = () => setMenuOpen(false);
  const cartLabel = cartReady ? `購物車，共 ${cartCount} 件商品` : "購物車";
  const primaryLinks = safePrimaryLinks(primaryNavigation);
  const cartControl = onCartOpen ? (
    <button className={styles.cartLink} type="button" onClick={onCartOpen} aria-label={cartLabel}>
      購物車{cartReady && cartCount > 0 ? `（${cartCount}）` : ""}
    </button>
  ) : <DeviceCartLink className={styles.cartLink} />;

  return <>
    <a className={styles.skipLink} href={`#${mainId}`}>跳至主要內容</a>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label={`${brandName}首頁`}>
        <span className={styles.brandMark} aria-hidden="true">{brandMark}</span>
        <span className={styles.brandCopy}><b>{brandName}</b><small>{brandSubtitle}</small></span>
      </Link>

      <nav className={styles.primaryNavigation} aria-label="主要導覽">
        {primaryLinks.map((link) => <Link
          key={link.href}
          href={link.href}
          aria-current={ariaCurrent(
            (section === "journal" && link.href === "/articles/") ||
            (section === "collection" && (link.href === "/#products" || link.href === "#products")) ||
            (section === "home" && (link.href === "/" || link.href === "/#hero" || link.href === "#hero")),
          )}
        >{link.label}</Link>)}
      </nav>

      <div className={styles.utilities}>
        <div className={styles.contextLinks}>{contextLinks.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href}>{link.label}</Link>)}</div>
        {onSearch && <button
          className="public-search-action"
          type="button"
          onClick={onSearch}
          aria-label={searchExpanded ? "關閉商品搜尋" : "搜尋商品"}
          aria-expanded={searchExpanded}
          aria-controls={searchControls}
        ><span aria-hidden="true">⌕</span><b>搜尋</b></button>}
        {cartControl}
        {memberSurfaceEnabled && <Link className={styles.accountLink} href="/account/" aria-current={ariaCurrent(section === "account")}><span aria-hidden="true">○</span><b>會員中心</b></Link>}
        <button className={styles.menuButton} type="button" onClick={() => setMenuOpen(true)} aria-label="開啟網站選單" aria-expanded={menuOpen} aria-controls="public-navigation-drawer"><span aria-hidden="true">☰</span></button>
      </div>
    </header>

    <button className={`${styles.backdrop} ${menuOpen ? styles.backdropOpen : ""}`} type="button" aria-label="關閉網站選單" aria-hidden={!menuOpen} tabIndex={menuOpen ? 0 : -1} onClick={closeMenu} />
    <aside
      ref={menuRef}
      id="public-navigation-drawer"
      className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="網站選單"
      aria-hidden={!menuOpen}
      inert={!menuOpen}
      tabIndex={-1}
    >
      <div className={styles.drawerHeader}>
        <div><small>TAI JU DA</small><b>網站導覽</b></div>
        <button ref={closeRef} type="button" onClick={closeMenu} aria-label="關閉網站選單">×</button>
      </div>
      <nav className={styles.drawerNavigation} aria-label="手機主要導覽">
        {onSearch && <button
          className="public-drawer-action"
          type="button"
          onClick={() => { closeMenu(); onSearch(); }}
          aria-expanded={searchExpanded}
          aria-controls={searchControls}
        ><small>00</small><span>{searchExpanded ? "關閉商品搜尋" : "搜尋商品"}</span><i aria-hidden="true">⌕</i></button>}
        {primaryLinks.map((link, index) => <Link key={link.href} href={link.href} onClick={closeMenu}><small>0{index + 1}</small><span>{link.label}</span><i aria-hidden="true">→</i></Link>)}
      </nav>
      <div className={styles.drawerUtilities}>
        {contextLinks.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href} onClick={closeMenu}>{link.label}</Link>)}
        {onCartOpen
          ? <button className="public-drawer-utility" type="button" onClick={() => { closeMenu(); onCartOpen(); }}>{cartLabel}</button>
          : <DeviceCartLink />}
        {memberSurfaceEnabled && <Link href="/account/" onClick={closeMenu}>會員中心</Link>}
        <Link href="/service/contact/" onClick={closeMenu}>聯絡客服</Link>
      </div>
    </aside>

    <nav className={styles.mobileNavigation} aria-label="手機快速導覽">
      <Link href="/" aria-current={ariaCurrent(section === "home")}><i aria-hidden="true">⌂</i><span>首頁</span></Link>
      <Link href="/#products" aria-current={ariaCurrent(section === "collection")}><i aria-hidden="true">▦</i><span>商品</span></Link>
      <Link href="/articles/" aria-current={ariaCurrent(section === "journal")}><i aria-hidden="true">▤</i><span>專欄</span></Link>
      {memberSurfaceEnabled && <Link href="/account/" aria-current={ariaCurrent(section === "account")}><i aria-hidden="true">○</i><span>會員</span></Link>}
      {onCartOpen
        ? <button className="public-mobile-cart" type="button" onClick={onCartOpen} aria-label={cartLabel}><i aria-hidden="true">◇</i><span>購物車</span>{cartReady && cartCount > 0 && <b>{cartCount}</b>}</button>
        : <DeviceCartLink className={styles.mobileCart} />}
    </nav>
  </>;
}
