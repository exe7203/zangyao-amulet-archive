"use client";

import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  Package,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { publishedBrandMark, publishedBrandName } from "../../shared/published-site";
import AdminNavigation from "./admin-navigation";
import styles from "./dashboard.module.css";

type CountGroup = {
  total: number;
  draft: number;
  published: number;
  archived: number;
  updatedAt: string | null;
};

type SystemStatus = {
  generatedAt: string;
  site: { code: string; name: string };
  runtime: {
    mode: "local" | "cloud";
    authentication: "local-only" | "email-allowlist";
    database: string;
    schemaVersion: number;
  };
  settings: { version: number; updatedAt: string | null };
  publishing: {
    inSync: boolean;
    exportedAt: string;
    snapshotHash: string;
    settingsVersion: number;
    pages: number;
    articles: number;
    products: number;
  };
  content: {
    articles: CountGroup;
    pages: CountGroup;
  };
  commerce: {
    products: {
      total: number;
      draft: number;
      active: number;
      soldOut: number;
      archived: number;
      seoReady: number;
      updatedAt: string | null;
    };
    inventory: {
      trackedProducts: number;
      onHand: number;
      reserved: number;
      available: number;
      lowStock: number;
      updatedAt: string | null;
    };
    orders: {
      total: number;
      new: number;
      inProgress: number;
      completed: number;
      cancelled: number;
      paid: number;
      updatedAt: string | null;
    };
  };
};

const API_BASE = (process.env.NEXT_PUBLIC_CONTENT_API_URL || "").replace(/\/$/, "");

function dateTime(value: string | null | undefined) {
  if (!value) return "尚無紀錄";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function AdminDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/system-status?site=taijuda`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as SystemStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error || "後台狀態讀取失敗");
      setStatus(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "後台狀態讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const cards = status ? [
    {
      href: "/admin/articles/",
      icon: FileText,
      eyebrow: "CONTENT",
      title: "文章",
      value: status.content.articles.total,
      detail: `已發布 ${status.content.articles.published}・草稿 ${status.content.articles.draft}`,
      updatedAt: status.content.articles.updatedAt,
    },
    {
      href: "/admin/site/",
      icon: Globe2,
      eyebrow: "PAGES",
      title: "網站頁面",
      value: status.content.pages.total,
      detail: `已發布 ${status.content.pages.published}・草稿 ${status.content.pages.draft}`,
      updatedAt: status.content.pages.updatedAt,
    },
    {
      href: "/admin/products/",
      icon: Package,
      eyebrow: "CATALOG",
      title: "商品與庫存",
      value: status.commerce.products.total,
      detail: `上架 ${status.commerce.products.active}・可售庫存 ${status.commerce.inventory.available}`,
      updatedAt: status.commerce.products.updatedAt,
    },
    {
      href: "/admin/orders/",
      icon: ClipboardList,
      eyebrow: "ORDERS",
      title: "訂單",
      value: status.commerce.orders.total,
      detail: `待確認 ${status.commerce.orders.new}・處理中 ${status.commerce.orders.inProgress}`,
      updatedAt: status.commerce.orders.updatedAt,
    },
  ] : [];

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}><span>{publishedBrandMark}</span><div><b>{publishedBrandName}營運中樞</b><small>LOCAL-FIRST ADMIN</small></div></div>
        <AdminNavigation active="dashboard" activeClassName={styles.active} />
        <div className={styles.topActions}>
          <a href="/" target="_blank" rel="noreferrer">查看前台 <ExternalLink size={14} /></a>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="重新整理後台狀態"><RefreshCw size={16} /></button>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.intro}>
          <div><p>TAIJUDA OPERATIONS</p><h1>今天要處理什麼？</h1><span>內容、商品、訂單與庫存共用同一份站台資料。</span></div>
          <div className={styles.runtimeState}>
            <span className={error ? styles.stateError : styles.stateOk} />
            <div><b>{error ? "系統狀態無法讀取" : loading ? "正在檢查系統" : "本機資料核心正常"}</b><small>{status ? `資料庫 Schema v${status.runtime.schemaVersion}・${dateTime(status.generatedAt)}` : error || "請稍候"}</small></div>
          </div>
        </section>

        {error && <div className={styles.error} role="alert"><AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => void load()}>再試一次</button></div>}

        <section className={styles.cards} aria-label="營運模組">
          {loading && !status && [0, 1, 2, 3].map((key) => <div className={styles.cardSkeleton} key={key} />)}
          {cards.map(({ href, icon: Icon, eyebrow, title, value, detail, updatedAt }) => (
            <Link className={styles.moduleCard} href={href} key={href}>
              <div><Icon size={18} /><span>{eyebrow}</span></div>
              <strong>{value}</strong>
              <h2>{title}</h2>
              <p>{detail}</p>
              <small>最後異動 {dateTime(updatedAt)}</small>
            </Link>
          ))}
        </section>

        {status && <div className={styles.lowerGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHead}><div><p>INTEGRATION</p><h2>目前整合狀態</h2></div><CheckCircle2 size={20} /></div>
            <ul className={styles.integrationList}>
              <li><span className={status.publishing.inSync ? styles.good : styles.waiting}>{status.publishing.inSync ? "公開版已同步" : "待同步公開版"}</span><div><b>文章與網站內容</b><small>Tiptap、Puck、版本還原與 SEO；快照 {dateTime(status.publishing.exportedAt)}</small></div></li>
              <li><span className={styles.good}>已接通</span><div><b>購物車與庫存</b><small>即時價格重算、保留庫存、重複送單防護</small></div></li>
              <li><span className={styles.good}>已接通</span><div><b>全站設定</b><small>品牌、公告、頁尾與配色共用同一份已發布快照</small></div></li>
              <li><span className={styles.waiting}>待正式站</span><div><b>媒體上傳與金流</b><small>目前使用圖片網址；付款仍由人工確認</small></div></li>
            </ul>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}><div><p>DATA CORE</p><h2>庫存與資料</h2></div><Database size={20} /></div>
            <dl className={styles.statsList}>
              <div><dt>現有數量</dt><dd>{status.commerce.inventory.onHand}</dd></div>
              <div><dt>訂單保留</dt><dd>{status.commerce.inventory.reserved}</dd></div>
              <div><dt>目前可售</dt><dd>{status.commerce.inventory.available}</dd></div>
              <div><dt>低庫存商品</dt><dd>{status.commerce.inventory.lowStock}</dd></div>
              <div><dt>SEO 已覆核商品</dt><dd>{status.commerce.products.seoReady}/{status.commerce.products.total}</dd></div>
            </dl>
          </section>

          <section className={`${styles.panel} ${styles.maintenance}`}>
            <div className={styles.panelHead}><div><p>MAINTENANCE</p><h2>不用找工程師也能做的事</h2></div><ShieldCheck size={20} /></div>
            <div className={styles.maintenanceItems}>
              <div><b>備份資料</b><p>雙擊專案根目錄的「備份泰聚達本機資料.cmd」。備份會放進 .local-backups。</p></div>
              <div><b>更新公開站</b><p>內容確認後，雙擊「同步並建立泰聚達公開版.cmd」；後台儲存與公開上線是兩個清楚步驟。</p></div>
              <div><b>正式上線前</b><p>需補雲端登入、R2 圖片媒體庫、備份排程與流量防護；金流可最後再接。</p></div>
            </div>
          </section>
        </div>}
      </div>
    </main>
  );
}
