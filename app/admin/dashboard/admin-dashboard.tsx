"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  FilePlus2,
  FileText,
  Globe2,
  ImageIcon,
  Package,
  PackagePlus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PUBLIC_SITE_CODE } from "../../../shared/site-context";
import { adminSystemStatusPath } from "../../../shared/admin/api-paths";
import { AdminButton, AdminTopbar } from "../admin-chrome";
import { adminFetch } from "../_lib/api-client";
import styles from "./dashboard.module.css";

type CountGroup = {
  total: number;
  draft: number;
  published: number;
  archived: number;
  seoGaps?: number;
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
    mediaStorage: "connected" | "missing";
    storeOrders?: "enabled" | "disabled";
  };
  settings: { version: number; updatedAt: string | null; hasGlobalSeo?: boolean };
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
  media: {
    total: number;
    ready: number;
    pending: number;
    updatedAt: string | null;
  };
  commerce: {
    products: {
      total: number;
      draft: number;
      active: number;
      soldOut: number;
      archived: number;
      seoReady: number;
      publicSeoGaps?: number;
      updatedAt: string | null;
    };
    inventory: {
      trackedProducts: number;
      onHand: number;
      reserved: number;
      available: number;
      lowStock: number;
      updatedAt: string | null;
      samples?: Array<{ title: string; available: number }>;
    };
    orders: {
      total: number;
      new: number;
      inProgress: number;
      completed: number;
      cancelled: number;
      paid: number;
      awaitingPayment?: number;
      updatedAt: string | null;
    };
  };
};

type AttentionItem = {
  id: string;
  priority: "urgent" | "warn" | "info";
  title: string;
  detail: string;
  href: string;
  action: string;
};

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

function buildAttentions(status: SystemStatus): AttentionItem[] {
  const items: AttentionItem[] = [];
  const openOrders = status.commerce.orders.new + status.commerce.orders.inProgress;
  const articleDrafts = status.content.articles.draft;
  const pageDrafts = status.content.pages.draft;
  const productDrafts = status.commerce.products.draft;
  const publicSeoGaps = status.commerce.products.publicSeoGaps ?? Math.max(
    0,
    status.commerce.products.active + status.commerce.products.soldOut - status.commerce.products.seoReady,
  );
  const articleSeoGaps = status.content.articles.seoGaps ?? 0;
  const pageSeoGaps = status.content.pages.seoGaps ?? 0;

  if (status.commerce.orders.new > 0) {
    items.push({
      id: "new-orders",
      priority: "urgent",
      title: `${status.commerce.orders.new} 筆新訂單待確認`,
      detail: status.commerce.orders.awaitingPayment
        ? `其中 ${status.commerce.orders.awaitingPayment} 筆尚未標為已付款`
        : "請盡快確認付款與出貨狀態",
      href: "/admin/orders/?orderStatus=new",
      action: "處理訂單",
    });
  } else if (status.commerce.orders.inProgress > 0) {
    items.push({
      id: "open-orders",
      priority: "warn",
      title: `${status.commerce.orders.inProgress} 筆訂單處理中`,
      detail: "確認是否已出貨、完成或需要跟客戶聯繫",
      href: "/admin/orders/",
      action: "查看訂單",
    });
  }

  if (status.commerce.inventory.lowStock > 0) {
    const sample = status.commerce.inventory.samples?.[0];
    items.push({
      id: "low-stock",
      priority: "urgent",
      title: `${status.commerce.inventory.lowStock} 件商品庫存偏低`,
      detail: sample
        ? `例如「${sample.title}」可售 ${sample.available}`
        : "可售數量 ≤ 1，建議補貨或改為售完",
      href: "/admin/products/?focus=stock",
      action: "調整庫存",
    });
  }

  if (status.commerce.products.soldOut > 0) {
    items.push({
      id: "sold-out",
      priority: "warn",
      title: `${status.commerce.products.soldOut} 件商品標示售完`,
      detail: "確認是否要補貨上架，或維持售完狀態",
      href: "/admin/products/?status=sold_out",
      action: "查看商品",
    });
  }

  if (!status.publishing.inSync) {
    items.push({
      id: "sync",
      priority: "warn",
      title: "SEO 靜態快照尚未同步",
      detail: "Worker 公開站已即時讀 D1；GitHub Pages／sitemap 仍需本機「同步並建立公開版」",
      href: "/admin/site/?panel=settings",
      action: "檢查網站",
    });
  }

  if (publicSeoGaps > 0) {
    items.push({
      id: "product-seo",
      priority: "warn",
      title: `${publicSeoGaps} 件上架商品 SEO 未就緒`,
      detail: "補齊標題、描述與封面後，才容易被搜尋收錄",
      href: "/admin/products/?focus=seo&status=active",
      action: "補商品 SEO",
    });
  }

  if (articleSeoGaps > 0) {
    items.push({
      id: "article-seo",
      priority: "info",
      title: `${articleSeoGaps} 篇已發布文章缺 SEO`,
      detail: "建議補 seo 標題與描述，提升搜尋點擊率",
      href: "/admin/articles/?status=published&focus=seo",
      action: "補文章 SEO",
    });
  }

  if (pageSeoGaps > 0) {
    items.push({
      id: "page-seo",
      priority: "info",
      title: `${pageSeoGaps} 個已發布頁面缺 SEO`,
      detail: "自訂頁同樣需要標題與描述",
      href: "/admin/site/?status=published&focus=seo",
      action: "補頁面 SEO",
    });
  }

  if (status.settings.hasGlobalSeo === false) {
    items.push({
      id: "global-seo",
      priority: "warn",
      title: "全站預設 SEO 尚未設定",
      detail: "首頁與未自訂頁會缺少預設標題／描述",
      href: "/admin/site/?panel=settings&focus=seo",
      action: "設定全站 SEO",
    });
  }

  if (articleDrafts + pageDrafts + productDrafts > 0) {
    items.push({
      id: "drafts",
      priority: "info",
      title: `尚有 ${articleDrafts + pageDrafts + productDrafts} 份草稿`,
      detail: `文章 ${articleDrafts}・頁面 ${pageDrafts}・商品 ${productDrafts}`,
      href: articleDrafts
        ? "/admin/articles/?status=draft"
        : productDrafts
          ? "/admin/products/?status=draft"
          : "/admin/site/?status=draft",
      action: "繼續編輯",
    });
  }

  if (status.runtime.mediaStorage === "missing") {
    items.push({
      id: "media",
      priority: "info",
      title: "媒體庫上傳暫未啟用",
      detail: "可直接貼公開圖片網址；之後再接 R2",
      href: "/admin/media/",
      action: "查看媒體",
    });
  }

  if (items.length === 0 && openOrders === 0) {
    items.push({
      id: "all-clear",
      priority: "info",
      title: "目前沒有急件",
      detail: "可以新增商品、寫文章，或檢查全站設定",
      href: "/admin/products/?new=1",
      action: "新增商品",
    });
  }

  const rank = { urgent: 0, warn: 1, info: 2 } as const;
  return items.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 8);
}

export default function AdminDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await adminFetch<SystemStatus>(adminSystemStatusPath(PUBLIC_SITE_CODE));
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

  const attentions = useMemo(() => (status ? buildAttentions(status) : []), [status]);
  const urgentCount = attentions.filter((item) => item.priority === "urgent").length;

  const cards = status
    ? [
        {
          href: "/admin/articles/",
          icon: FileText,
          eyebrow: "CONTENT",
          title: "文章",
          value: status.content.articles.total,
          detail: `已發布 ${status.content.articles.published}・草稿 ${status.content.articles.draft}`,
          badge: status.content.articles.draft
            ? `${status.content.articles.draft} 草稿`
            : status.content.articles.seoGaps
              ? `${status.content.articles.seoGaps} SEO`
              : null,
          tone: status.content.articles.draft || status.content.articles.seoGaps ? "warn" : "ok",
          updatedAt: status.content.articles.updatedAt,
        },
        {
          href: "/admin/site/",
          icon: Globe2,
          eyebrow: "PAGES",
          title: "網站頁面",
          value: status.content.pages.total,
          detail: `已發布 ${status.content.pages.published}・草稿 ${status.content.pages.draft}`,
          badge: !status.publishing.inSync
            ? "待同步"
            : status.content.pages.draft
              ? `${status.content.pages.draft} 草稿`
              : null,
          tone: !status.publishing.inSync || status.content.pages.draft ? "warn" : "ok",
          updatedAt: status.content.pages.updatedAt,
        },
        {
          href: "/admin/products/",
          icon: Package,
          eyebrow: "CATALOG",
          title: "商品與庫存",
          value: status.commerce.products.total,
          detail: `上架 ${status.commerce.products.active}・可售 ${status.commerce.inventory.available}`,
          badge: status.commerce.inventory.lowStock
            ? `低庫存 ${status.commerce.inventory.lowStock}`
            : status.commerce.products.publicSeoGaps
              ? `SEO ${status.commerce.products.publicSeoGaps}`
              : null,
          tone: status.commerce.inventory.lowStock
            ? "urgent"
            : status.commerce.products.publicSeoGaps
              ? "warn"
              : "ok",
          updatedAt: status.commerce.products.updatedAt,
        },
        {
          href: "/admin/orders/",
          icon: ClipboardList,
          eyebrow: "ORDERS",
          title: "訂單",
          value: status.commerce.orders.total,
          detail: `待確認 ${status.commerce.orders.new}・處理中 ${status.commerce.orders.inProgress}`,
          badge: status.commerce.orders.new
            ? `新單 ${status.commerce.orders.new}`
            : status.commerce.orders.inProgress
              ? `處理中 ${status.commerce.orders.inProgress}`
              : null,
          tone: status.commerce.orders.new ? "urgent" : status.commerce.orders.inProgress ? "warn" : "ok",
          updatedAt: status.commerce.orders.updatedAt,
        },
      ]
    : [];

  const readiness = status
    ? [
        {
          ok: status.publishing.inSync,
          label: "SEO 靜態快照已同步",
          hint: status.publishing.inSync ? dateTime(status.publishing.exportedAt) : "本機同步公開版",
        },
        {
          ok: status.settings.hasGlobalSeo !== false,
          label: "全站預設 SEO",
          hint: status.settings.hasGlobalSeo === false ? "到網站設定補標題／描述" : "已設定",
        },
        {
          ok: (status.commerce.products.publicSeoGaps ?? 0) === 0,
          label: "上架商品 SEO 就緒",
          hint: `${status.commerce.products.seoReady}/${(status.commerce.products.active + status.commerce.products.soldOut) || status.commerce.products.total}`,
        },
        {
          ok: status.commerce.inventory.lowStock === 0,
          label: "庫存健康",
          hint: status.commerce.inventory.lowStock
            ? `${status.commerce.inventory.lowStock} 件偏低`
            : `可售 ${status.commerce.inventory.available}`,
        },
        {
          ok: status.commerce.orders.new === 0,
          label: "無待確認新單",
          hint: status.commerce.orders.new ? `${status.commerce.orders.new} 筆待處理` : "訂單佇列清空",
        },
        {
          ok: status.runtime.storeOrders === "enabled",
          label: "線上接單",
          hint: status.runtime.storeOrders === "enabled" ? "已開放前台送單" : "雲端旗標關閉（本機可測）",
        },
        {
          ok: status.runtime.mediaStorage === "connected",
          label: "媒體上傳（R2）",
          hint: status.runtime.mediaStorage === "connected" ? "已接通" : "暫用圖片網址即可",
        },
      ]
    : [];

  return (
    <AdminTopbar active="dashboard" onRefresh={() => void load()} refreshing={loading}>
      <div className={styles.content}>
        <section className={styles.intro}>
          <div>
            <p>TAIJUDA OPERATIONS</p>
            <h1>今天要處理什麼？</h1>
            <span>
              {status
                ? urgentCount > 0
                  ? `有 ${urgentCount} 件急件需要先處理。`
                  : attentions.some((item) => item.priority === "warn")
                    ? "沒有急件，但仍有幾項建議盡快處理。"
                    : "營運狀態穩定，可以安心編輯內容或補商品。"
                : "內容、商品、訂單與庫存共用同一份站台資料。"}
            </span>
          </div>
          <div className={styles.runtimeState}>
            <span className={error ? styles.stateError : styles.stateOk} />
            <div>
              <b>
                {error
                  ? "系統狀態無法讀取"
                  : loading
                    ? "正在檢查系統"
                    : status?.runtime.mode === "cloud"
                      ? "雲端資料核心正常"
                      : "本機資料核心正常"}
              </b>
              <small>
                {status
                  ? `資料庫 Schema v${status.runtime.schemaVersion}・${dateTime(status.generatedAt)}`
                  : error || "請稍候"}
              </small>
            </div>
            <AdminButton
              type="button"
              variant="ghost"
              iconOnly
              onClick={() => void load()}
              disabled={loading}
              aria-label="更新系統狀態"
              title="更新系統狀態"
            >
              <RefreshCw size={15} />
            </AdminButton>
          </div>
        </section>

        {error && (
          <div className={styles.error} role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>再試一次</button>
          </div>
        )}

        {status && !status.publishing.inSync && (
          <div className={styles.syncBanner} role="status">
            <AlertCircle size={17} />
            <div>
              <b>後台內容尚未同步到 SEO 靜態快照</b>
              <p>
                Worker 公開站的商品、文章、自訂頁與首頁文案會跟 D1 即時更新；GitHub Pages 與 SEO 靜態快照仍需本機「同步並建立公開版」。確認內容無誤後，雙擊「同步並建立泰聚達公開版.cmd」。
              </p>
              <small>快照時間：{dateTime(status.publishing.exportedAt)}</small>
            </div>
          </div>
        )}

        {status && (
          <section className={styles.kpiStrip} aria-label="今日關鍵指標">
            <div>
              <span>待處理訂單</span>
              <strong className={status.commerce.orders.new ? styles.kpiUrgent : undefined}>
                {status.commerce.orders.new + status.commerce.orders.inProgress}
              </strong>
              <small>新單 {status.commerce.orders.new}・處理中 {status.commerce.orders.inProgress}</small>
            </div>
            <div>
              <span>低庫存</span>
              <strong className={status.commerce.inventory.lowStock ? styles.kpiUrgent : undefined}>
                {status.commerce.inventory.lowStock}
              </strong>
              <small>可售總量 {status.commerce.inventory.available}</small>
            </div>
            <div>
              <span>草稿待發</span>
              <strong>
                {status.content.articles.draft + status.content.pages.draft + status.commerce.products.draft}
              </strong>
              <small>
                文 {status.content.articles.draft}・頁 {status.content.pages.draft}・品 {status.commerce.products.draft}
              </small>
            </div>
            <div>
              <span>SEO 缺口</span>
              <strong className={(status.commerce.products.publicSeoGaps || 0) > 0 ? styles.kpiWarn : undefined}>
                {(status.commerce.products.publicSeoGaps || 0)
                  + (status.content.articles.seoGaps || 0)
                  + (status.content.pages.seoGaps || 0)
                  + (status.settings.hasGlobalSeo === false ? 1 : 0)}
              </strong>
              <small>商品／文章／頁面／全站</small>
            </div>
            <div>
              <span>公開快照</span>
              <strong className={status.publishing.inSync ? styles.kpiOk : styles.kpiWarn}>
                {status.publishing.inSync ? "已同步" : "待同步"}
              </strong>
              <small>{dateTime(status.publishing.exportedAt)}</small>
            </div>
          </section>
        )}

        {status && (
          <section className={styles.quickActions} aria-label="快捷操作">
            <Link href="/admin/products/?new=1" className={styles.quickAction}>
              <PackagePlus size={16} /> 新增商品
            </Link>
            <Link href="/admin/articles/?new=1" className={styles.quickAction}>
              <FilePlus2 size={16} /> 寫新文章
            </Link>
            <Link href="/admin/orders/?orderStatus=new" className={styles.quickAction}>
              <ShoppingBag size={16} /> 處理訂單
            </Link>
            <Link href="/admin/site/?panel=settings" className={styles.quickAction}>
              <Settings2 size={16} /> 網站／SEO 設定
            </Link>
            <Link href="/admin/media/" className={styles.quickAction}>
              <ImageIcon size={16} /> 媒體庫
            </Link>
            <Link href="/admin/products/?focus=seo&status=active" className={styles.quickAction}>
              <Search size={16} /> 檢查商品 SEO
            </Link>
          </section>
        )}

        <div className={styles.mainGrid}>
          <section className={styles.attentionPanel} aria-label="今日待辦">
            <div className={styles.panelHead}>
              <div>
                <p>ATTENTION</p>
                <h2>今天先做這些</h2>
              </div>
              {urgentCount > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            </div>
            {loading && !status && (
              <div className={styles.attentionSkeleton}>
                {[0, 1, 2].map((key) => <div key={key} />)}
              </div>
            )}
            {status && (
              <ul className={styles.attentionList}>
                {attentions.map((item) => (
                  <li key={item.id} data-priority={item.priority}>
                    <div>
                      <b>{item.title}</b>
                      <p>{item.detail}</p>
                    </div>
                    <Link href={item.href}>{item.action}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.cards} aria-label="營運模組">
            {loading && !status && [0, 1, 2, 3].map((key) => <div className={styles.cardSkeleton} key={key} />)}
            {cards.map(({ href, icon: Icon, eyebrow, title, value, detail, badge, tone, updatedAt }) => (
              <Link className={styles.moduleCard} href={href} key={href} data-tone={tone}>
                <div>
                  <Icon size={18} />
                  <span>{eyebrow}</span>
                  {badge && <em data-tone={tone}>{badge}</em>}
                </div>
                <strong>{value}</strong>
                <h2>{title}</h2>
                <p>{detail}</p>
                <small>最後異動 {dateTime(updatedAt)}</small>
              </Link>
            ))}
          </section>
        </div>

        {status && (
          <div className={styles.lowerGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <p>READINESS</p>
                  <h2>上線就緒檢查</h2>
                </div>
                <ShieldCheck size={20} />
              </div>
              <ul className={styles.readinessList}>
                {readiness.map((item) => (
                  <li key={item.label}>
                    <span className={item.ok ? styles.good : styles.waiting}>
                      {item.ok ? "完成" : "待補"}
                    </span>
                    <div>
                      <b>{item.label}</b>
                      <small>{item.hint}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <p>INVENTORY</p>
                  <h2>庫存與 SEO</h2>
                </div>
                <Database size={20} />
              </div>
              <dl className={styles.statsList}>
                <div><dt>現有數量</dt><dd>{status.commerce.inventory.onHand}</dd></div>
                <div><dt>訂單保留</dt><dd>{status.commerce.inventory.reserved}</dd></div>
                <div><dt>目前可售</dt><dd>{status.commerce.inventory.available}</dd></div>
                <div><dt>低庫存商品</dt><dd>{status.commerce.inventory.lowStock}</dd></div>
                <div><dt>售完商品</dt><dd>{status.commerce.products.soldOut}</dd></div>
                <div>
                  <dt>商品 SEO 就緒</dt>
                  <dd>{status.commerce.products.seoReady}/{status.commerce.products.total}</dd>
                </div>
              </dl>
              {status.commerce.inventory.samples && status.commerce.inventory.samples.length > 0 && (
                <div className={styles.sampleBlock}>
                  <b>低庫存樣本</b>
                  <ul>
                    {status.commerce.inventory.samples.map((sample) => (
                      <li key={sample.title}>
                        <span>{sample.title}</span>
                        <em>可售 {sample.available}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Link href="/admin/media/" className={styles.mediaLink}>
                <ImageIcon size={14} /> 開啟媒體庫
              </Link>
            </section>

            <section className={`${styles.panel} ${styles.maintenance}`}>
              <div className={styles.panelHead}>
                <div>
                  <p>INTEGRATION</p>
                  <h2>整合與維運</h2>
                </div>
                <CheckCircle2 size={20} />
              </div>
              <ul className={styles.integrationList}>
                <li>
                  <span className={status.publishing.inSync ? styles.good : styles.waiting}>
                    {status.publishing.inSync ? "已同步" : "待同步"}
                  </span>
                  <div>
                    <b>文章、頁面與商品快照</b>
                    <small>Worker 即時；Pages／sitemap 靠本機同步・{dateTime(status.publishing.exportedAt)}</small>
                  </div>
                </li>
                <li>
                  <span className={status.runtime.storeOrders === "enabled" ? styles.good : styles.waiting}>
                    {status.runtime.storeOrders === "enabled" ? "已開放" : "雲端關閉"}
                  </span>
                  <div>
                    <b>公開接單</b>
                    <small>
                      {status.runtime.storeOrders === "enabled"
                        ? "前台可送單；庫存保留與訂單狀態由後台處理"
                        : "庫存與後台訂單管理可用；線上接單旗標仍關閉（本機可測）"}
                    </small>
                  </div>
                </li>
                <li>
                  <span className={styles.good}>已接通</span>
                  <div>
                    <b>購物車與庫存核算</b>
                    <small>即時價格、保留庫存、重複送單防護（有訂單時）</small>
                  </div>
                </li>
                <li>
                  <span className={status.settings.hasGlobalSeo === false ? styles.waiting : styles.good}>
                    {status.settings.hasGlobalSeo === false ? "待設定" : "已設定"}
                  </span>
                  <div>
                    <b>全站 SEO 預設</b>
                    <small>標題、描述與 OG；影響首頁與未自訂頁</small>
                  </div>
                </li>
                <li>
                  <span className={styles.waiting}>暫不啟用</span>
                  <div>
                    <b>媒體上傳（R2）／金流</b>
                    <small>圖片貼網址即可；接單旗標預設關閉，之後再開</small>
                  </div>
                </li>
              </ul>
              <div className={styles.maintenanceItems}>
                <div>
                  <b>備份資料</b>
                  <p>雙擊「備份泰聚達本機資料.cmd」，備份會放進 .local-backups。</p>
                </div>
                <div>
                  <b>更新公開站 SEO</b>
                  <p>內容確認後雙擊「同步並建立泰聚達公開版.cmd」；後台儲存與靜態上線是兩步。</p>
                </div>
                <div>
                  <b>正式上線前</b>
                  <p>加 Cloudflare Access、自有網域與備份排程；金流與 R2 可之後再接。</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </AdminTopbar>
  );
}
