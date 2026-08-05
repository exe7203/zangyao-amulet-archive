"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  publishedBrandMark,
  publishedBrandName,
  publishedBrandSubtitle,
} from "../shared/published-site";
import DeviceCartLink from "./device-cart-link";
import styles from "./public-chrome.module.css";
import { useModalFocus } from "./use-modal-focus";

export type PublicHeaderLink = {
  href: string;
  label: string;
};

export type PublicSection = "collection" | "journal" | "account" | "info" | "page";

const PRIMARY_LINKS: PublicHeaderLink[] = [
  { href: "/#new", label: "最新商品" },
  { href: "/#collections", label: "商品分類" },
  { href: "/articles/", label: "佛牌專欄" },
  { href: "/about/", label: "關於泰聚達" },
];

function ariaCurrent(active: boolean) {
  return active ? "page" as const : undefined;
}

export default function PublicHeader({
  section = "info",
  contextLinks = [],
  mainId = "main-content",
}: {
  section?: PublicSection;
  contextLinks?: PublicHeaderLink[];
  mainId?: string;
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

  return <>
    <a className={styles.skipLink} href={`#${mainId}`}>跳至主要內容</a>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label={`${publishedBrandName}首頁`}>
        <span className={styles.brandMark} aria-hidden="true">{publishedBrandMark}</span>
        <span className={styles.brandCopy}><b>{publishedBrandName}</b><small>{publishedBrandSubtitle}</small></span>
      </Link>

      <nav className={styles.primaryNavigation} aria-label="主要導覽">
        {PRIMARY_LINKS.map((link) => <Link
          key={link.href}
          href={link.href}
          aria-current={ariaCurrent(
            (section === "journal" && link.href === "/articles/") ||
            (section === "collection" && link.href === "/#new"),
          )}
        >{link.label}</Link>)}
      </nav>

      <div className={styles.utilities}>
        <div className={styles.contextLinks}>{contextLinks.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href}>{link.label}</Link>)}</div>
        <DeviceCartLink className={styles.cartLink} />
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
        {PRIMARY_LINKS.map((link, index) => <Link key={link.href} href={link.href} onClick={closeMenu}><small>0{index + 1}</small><span>{link.label}</span><i aria-hidden="true">→</i></Link>)}
      </nav>
      <div className={styles.drawerUtilities}>
        {contextLinks.map((link) => <Link key={`${link.href}-${link.label}`} href={link.href} onClick={closeMenu}>{link.label}</Link>)}
        <DeviceCartLink />
        {memberSurfaceEnabled && <Link href="/account/" onClick={closeMenu}>會員中心</Link>}
        <Link href="/service/contact/" onClick={closeMenu}>聯絡客服</Link>
      </div>
    </aside>

    <nav className={styles.mobileNavigation} aria-label="手機快速導覽">
      <Link href="/"><i aria-hidden="true">⌂</i><span>首頁</span></Link>
      <Link href="/#new" aria-current={ariaCurrent(section === "collection")}><i aria-hidden="true">▦</i><span>商品</span></Link>
      <Link href="/articles/" aria-current={ariaCurrent(section === "journal")}><i aria-hidden="true">▤</i><span>專欄</span></Link>
      {memberSurfaceEnabled && <Link href="/account/" aria-current={ariaCurrent(section === "account")}><i aria-hidden="true">○</i><span>會員</span></Link>}
      <DeviceCartLink className={styles.mobileCart} />
    </nav>
  </>;
}
