"use client";

import type { ButtonHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  ClipboardList,
  ExternalLink,
  FileText,
  Globe2,
  ImageIcon,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { publishedBrandMark, publishedBrandName } from "../../shared/published-site";
import styles from "./admin-chrome.module.css";

export type AdminArea = "dashboard" | "articles" | "site" | "products" | "orders" | "media";
export type AdminStatusTone = "neutral" | "success" | "warning" | "danger";

const adminAreas: ReadonlyArray<{
  key: AdminArea;
  href: string;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "dashboard", href: "/admin/", label: "總覽", hint: "營運狀態與待辦", icon: LayoutDashboard },
  { key: "products", href: "/admin/products/", label: "商品與庫存", hint: "佛牌／聖物、分類、庫存", icon: Package },
  { key: "orders", href: "/admin/orders/", label: "訂單", hint: "接單、付款、出貨", icon: ClipboardList },
  { key: "articles", href: "/admin/articles/", label: "文章", hint: "專欄、SEO、版本", icon: FileText },
  { key: "site", href: "/admin/site/", label: "網站", hint: "首頁文案、頁面、主題", icon: Globe2 },
  { key: "media", href: "/admin/media/", label: "媒體", hint: "貼公開圖片網址", icon: ImageIcon },
];

const areaTitles: Record<AdminArea, { title: string; detail: string }> = {
  dashboard: { title: "營運總覽", detail: "內容、商品、訂單與系統狀態" },
  products: { title: "商品與庫存", detail: "管理佛牌／聖物、分類與庫存異動" },
  orders: { title: "訂單管理", detail: "確認付款、安排出貨與客服備註" },
  articles: { title: "文章管理", detail: "專欄草稿、發布與 SEO" },
  site: { title: "網站設定", detail: "全站文案、導覽、頁面與主題" },
  media: { title: "媒體資源", detail: "暫用公開圖片 URL；上傳功能未啟用" },
};

export function AdminTopbar({
  active,
  previewHref = "/",
  onRefresh,
  refreshing = false,
  hasUnsavedChanges = false,
  children,
}: {
  active: AdminArea;
  previewHref?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  hasUnsavedChanges?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const page = areaTitles[active];

  const confirmDiscard = () => !hasUnsavedChanges || window.confirm("目前有未儲存變更，確定要離開這個後台模組嗎？");
  const confirmNavigation = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!confirmDiscard()) event.preventDefault();
  };
  const refresh = () => {
    if (!confirmDiscard()) return;
    if (onRefresh) {
      onRefresh();
      return;
    }
    window.location.reload();
  };

  useEffect(() => {
    void fetch("/api/admin/auth/session", { headers: { accept: "application/json" }, cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { username?: string | null; authenticated?: boolean }) => {
        if (payload.authenticated && payload.username) setAdminUsername(payload.username);
      })
      .catch(() => undefined);
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
      });
      router.replace("/admin/login/?return_to=%2Fadmin%2F");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }, [router, signingOut]);

  return (
    <div className={styles.app}>
      <aside className={styles.globalSidebar} data-admin-sidebar>
        <Link className={styles.sidebarBrand} href="/admin/" aria-label={`${publishedBrandName}後台總覽`} onClick={active === "dashboard" ? undefined : confirmNavigation}>
          <span>{publishedBrandMark}</span>
          <div className={styles.sidebarBrandMeta}>
            <b>{publishedBrandName}</b>
            <small>ADMIN CONSOLE</small>
          </div>
        </Link>
        <nav className={styles.sidebarNav} aria-label="後台功能">
          {adminAreas.map((area) => {
            const Icon = area.icon;
            return (
              <Link
                key={area.key}
                className={area.key === active ? styles.sidebarNavActive : undefined}
                href={area.href}
                aria-current={area.key === active ? "page" : undefined}
                title={area.hint}
                onClick={area.key === active ? undefined : confirmNavigation}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{area.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFoot}>
          {adminUsername && adminUsername !== "local-preview" && (
            <div className={styles.sidebarUser}>
              <b>{adminUsername}</b>
              <small>已登入</small>
            </div>
          )}
          <a href={previewHref} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" />
            <span>查看前台</span>
          </a>
        </div>
      </aside>

      <div className={styles.appMain}>
        <header className={styles.appHeader} data-admin-topbar>
          <div className={styles.headerCopy}>
            <b>{page.title}</b>
            <small>{page.detail}</small>
          </div>
          <div className={styles.headerActions}>
            <a href={previewHref} target="_blank" rel="noreferrer">
              <span>前台預覽</span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
            <button type="button" className={styles.iconOnly} onClick={refresh} disabled={refreshing} aria-label="重新整理目前資料" title="重新整理目前資料">
              <RefreshCw size={15} aria-hidden="true" />
            </button>
            <button type="button" className={styles.iconOnly} onClick={() => void signOut()} disabled={signingOut} aria-label="登出後台" title="登出後台">
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={styles.appContent}>{children}</div>
      </div>
    </div>
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
