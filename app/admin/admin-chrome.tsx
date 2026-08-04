"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { publishedBrandMark, publishedBrandName } from "../../shared/published-site";
import styles from "./admin-chrome.module.css";

export type AdminArea = "dashboard" | "articles" | "site" | "products" | "orders";
export type AdminStatusTone = "neutral" | "success" | "warning" | "danger";

const adminAreas: ReadonlyArray<{ key: AdminArea; href: string; label: string }> = [
  { key: "dashboard", href: "/admin/", label: "總覽" },
  { key: "articles", href: "/admin/articles/", label: "文章" },
  { key: "site", href: "/admin/site/", label: "網站" },
  { key: "products", href: "/admin/products/", label: "商品與庫存" },
  { key: "orders", href: "/admin/orders/", label: "訂單" },
];

export function AdminTopbar({
  active,
  previewHref = "/",
  onRefresh,
  refreshing = false,
}: {
  active: AdminArea;
  previewHref?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const refresh = () => {
    if (onRefresh) {
      onRefresh();
      return;
    }
    window.location.reload();
  };

  return (
    <header className={styles.topbar} data-admin-topbar>
      <Link className={styles.brand} href="/admin/" aria-label={`${publishedBrandName}後台總覽`}>
        <span>{publishedBrandMark}</span>
        <span>
          <b>{publishedBrandName}營運中樞</b>
          <small>CONTENT &amp; COMMERCE</small>
        </span>
      </Link>
      <nav className={styles.navigation} aria-label="後台功能">
        {adminAreas.map((area) => (
          <Link
            key={area.key}
            className={area.key === active ? styles.navigationActive : undefined}
            href={area.href}
            aria-current={area.key === active ? "page" : undefined}
          >
            {area.label}
          </Link>
        ))}
      </nav>
      <div className={styles.utilities}>
        <a href={previewHref} target="_blank" rel="noreferrer">
          <span>查看前台</span>
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <button type="button" onClick={refresh} disabled={refreshing} aria-label="重新整理目前資料" title="重新整理目前資料">
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export function AdminActionBar({
  status,
  title,
  detail,
  children,
  className = "",
}: {
  status?: ReactNode;
  title: string;
  detail?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.actionbar} ${className}`.trim()} data-admin-actionbar>
      <div className={styles.actionContext}>
        {status}
        <span className={styles.actionCopy}>
          <b>{title}</b>
          {detail && <small>{detail}</small>}
        </span>
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </section>
  );
}

export function AdminStatus({
  tone = "neutral",
  children,
}: {
  tone?: AdminStatusTone;
  children: ReactNode;
}) {
  return <span className={`${styles.status} ${styles[`status_${tone}`]}`}>{children}</span>;
}

export function AdminButton({
  variant = "secondary",
  iconOnly = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  iconOnly?: boolean;
}) {
  return (
    <button
      {...props}
      className={`${styles.control} ${styles[`control_${variant}`]} ${iconOnly ? styles.controlIcon : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
