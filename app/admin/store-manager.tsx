"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "../data";
import { formatPrice } from "../data";
import styles from "./store-manager.module.css";

const SITE_CODE = "taijuda";
const API_BASE = (process.env.NEXT_PUBLIC_CONTENT_API_URL || "").replace(/\/$/, "");

type OrderStatus = "new" | "confirmed" | "processing" | "shipped" | "completed" | "cancelled";
type PaymentStatus = "uncollected" | "pending" | "paid" | "failed" | "refunded";
type OrderItem = { id: string; productId: string; sku: string; name: string; unitPrice: number; quantity: number; lineTotal: number };
type Order = {
  id: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  customer: { name: string; phone: string; email: string; lineId: string };
  deliveryMethod: string;
  address: string;
  note: string;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
  reservedUntil: string | null;
  expiredAt: string | null;
  items: OrderItem[];
};
type AdminProduct = Product & { inventory?: { onHand: number; reserved: number; available: number; version: number } };

const ORDER_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  new: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["processing", "cancelled"]),
  processing: new Set(["shipped", "cancelled"]),
  shipped: new Set(["completed"]),
  completed: new Set(),
  cancelled: new Set(),
};

function emptyProduct(): AdminProduct {
  return {
    id: "",
    sku: "",
    slug: "",
    name: "",
    shortName: "",
    description: "",
    category: "佛牌",
    origin: "",
    temple: "",
    buddhistYear: "",
    westernYear: "",
    material: "",
    dimensions: "",
    price: 0,
    stock: 1,
    status: "draft",
    badge: "本週新藏",
    tone: "sand",
    shape: "arch",
    theme: "守護與安心",
    purchaseLimit: 1,
    seoTitle: "",
    seoDescription: "",
    imageUrl: "",
    imageAlt: "",
    seoReady: false,
  };
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function statusLabel(status: string) {
  return ({ new: "待確認", confirmed: "已確認", processing: "處理中", shipped: "已出貨", completed: "已完成", cancelled: "已取消", uncollected: "尚未收款", pending: "付款確認中", paid: "已收款", failed: "付款未完成", refunded: "已退款", active: "上架中", draft: "草稿", sold_out: "售罄", archived: "已封存" } as Record<string, string>)[status] || status;
}

function AdminHeader({ active }: { active: "products" | "orders" }) {
  return <header className={styles.topbar}>
    <div className={styles.brand}><span>泰</span><div><b>泰聚達營運中樞</b><small>LOCAL COMMERCE CORE</small></div></div>
    <nav aria-label="後台功能"><Link href="/admin/">文章</Link><Link href="/admin/site/">網站編輯</Link><Link className={active === "products" ? styles.active : ""} href="/admin/products/">商品與庫存</Link><Link className={active === "orders" ? styles.active : ""} href="/admin/orders/">訂單</Link></nav>
    <a className={styles.frontLink} href="/" target="_blank" rel="noreferrer">查看前台 ↗</a>
  </header>;
}

export default function StoreManager({ mode }: { mode: "products" | "orders" }) {
  return <main className={styles.shell}><AdminHeader active={mode} />{mode === "products" ? <ProductManager /> : <OrderManager />}</main>;
}

function ProductManager() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [draft, setDraft] = useState<AdminProduct>(emptyProduct);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editRevision = useRef(0);

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/products?site=${SITE_CODE}`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { products?: AdminProduct[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "商品資料讀取失敗");
      const next = (payload.products || []).map((product) => ({
        ...product,
        stock: product.inventory?.onHand ?? product.stock,
      }));
      setProducts(next);
      const selected = next.find((product) => product.id === preferredId) || next[0];
      setDraft(selected || emptyProduct());
      setDirty(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "商品資料讀取失敗"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = <Key extends keyof Product>(key: Key, value: Product[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    editRevision.current += 1;
    setDirty(true);
  };
  const selectProduct = (product: AdminProduct) => {
    if (saving) return;
    if (dirty && product.id !== draft.id && !window.confirm("目前商品還有未儲存變更，確定要切換嗎？")) return;
    setDraft(product); setDirty(false); setError(""); setNotice("");
  };
  const createProduct = () => {
    if (saving) return;
    if (dirty && !window.confirm("目前商品還有未儲存變更，確定要建立新商品嗎？")) return;
    setDraft(emptyProduct()); setDirty(false); setError(""); setNotice("");
  };
  const save = async () => {
    if (!draft.name.trim() || !draft.slug.trim() || !draft.sku.trim()) { setError("商品名稱、網址 Slug 與典藏編號不可留白"); return; }
    if (!Number.isSafeInteger(draft.price) || draft.price < 0 || !Number.isSafeInteger(draft.stock) || draft.stock < 0) { setError("價格與庫存必須是大於或等於 0 的整數"); return; }
    setSaving(true); setError(""); setNotice("");
    const savingRevision = editRevision.current;
    try {
      const { inventory, ...productFields } = draft;
      const response = await fetch(`${API_BASE}/api/admin/products`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ ...productFields, inventoryVersion: inventory?.version, siteCode: SITE_CODE }) });
      const payload = await response.json().catch(() => ({})) as { product?: AdminProduct; error?: string };
      if (!response.ok || !payload.product) throw new Error(payload.error || "商品儲存失敗");
      const saved = payload.product as AdminProduct;
      const normalizedSaved = { ...saved, stock: saved.inventory?.onHand ?? saved.stock };
      setProducts((current) => [normalizedSaved, ...current.filter((product) => product.id !== normalizedSaved.id)]);
      if (editRevision.current === savingRevision) {
        setDraft(normalizedSaved);
        setDirty(false);
        setNotice("商品與庫存資料已儲存");
      } else {
        setDraft((current) => ({
          ...current,
          id: normalizedSaved.id,
          inventory: normalizedSaved.inventory,
        }));
        setNotice("已儲存送出時的版本；你後續輸入的內容仍保留，請再次儲存。");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "商品儲存失敗"); }
    finally { setSaving(false); }
  };
  const archive = async () => {
    if (!draft.id || !window.confirm(`確定封存「${draft.name}」嗎？`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${encodeURIComponent(draft.id)}?site=${SITE_CODE}`, { method: "DELETE", headers: { accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "商品封存失敗");
      setNotice("商品已封存，不再顯示於前台");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "商品封存失敗"); }
    finally { setSaving(false); }
  };

  return <div className={styles.workspace}>
    <aside className={styles.listPane}><div className={styles.listHead}><div><small>CATALOG</small><h1>商品與庫存</h1></div><button onClick={createProduct} aria-label="新增商品">＋</button></div><div className={styles.list}>{loading && <p>讀取中…</p>}{products.map((product) => <button className={product.id === draft.id ? styles.selected : ""} key={product.id} onClick={() => selectProduct(product)}><span className={`${styles.dot} ${styles[`dot_${product.status}`]}`} /><span><b>{product.shortName}</b><small>{product.sku} · {statusLabel(product.status)} · 庫存 {product.stock}</small></span></button>)}</div><div className={styles.listFoot}>共 {products.length} 件商品</div></aside>
    <section className={styles.mainPane}><div className={styles.actionbar}><div><span className={styles.pill}>{statusLabel(draft.status)}</span><small>{draft.id ? "已建立商品資料" : "尚未儲存的新商品"}</small></div><div>{draft.id && <button className={styles.archive} onClick={() => void archive()} disabled={saving}>封存</button>}<button className={styles.primary} onClick={() => void save()} disabled={saving}>{saving ? "處理中…" : "儲存商品"}</button></div></div>{(error || notice) && <div className={error ? styles.error : styles.notice} role="status">{error || notice}</div>}
      <div className={styles.formGrid}><section className={styles.card}><h2>基本資料</h2><div className={styles.twoColumns}><Field label="商品全名"><input value={draft.name} onChange={(event) => update("name", event.target.value)} /></Field><Field label="前台短名"><input value={draft.shortName} onChange={(event) => update("shortName", event.target.value)} /></Field><Field label="典藏編號／SKU"><input value={draft.sku} onChange={(event) => update("sku", event.target.value.toUpperCase())} /></Field><Field label="網址 Slug"><input value={draft.slug} onChange={(event) => update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></Field><Field label="分類"><select value={draft.category} onChange={(event) => update("category", event.target.value as Product["category"])}><option>佛牌</option><option>神尊</option><option>符印</option></select></Field><Field label="狀態"><select value={draft.status} onChange={(event) => update("status", event.target.value as Product["status"])}><option value="draft">草稿</option><option value="active">上架中</option><option value="sold_out">售罄</option><option value="archived">封存</option></select></Field><Field label="售價（TWD）"><input type="number" min="0" step="1" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} /></Field><Field label="現有庫存"><input type="number" min="0" step="1" value={draft.stock} onChange={(event) => update("stock", Number(event.target.value))} /></Field><Field label="每筆限購"><input type="number" min="1" step="1" value={draft.purchaseLimit || 1} onChange={(event) => update("purchaseLimit", Number(event.target.value))} /></Field><Field label="前台標籤"><input value={draft.badge} onChange={(event) => update("badge", event.target.value)} /></Field></div><Field label="商品說明"><textarea rows={5} value={draft.description} onChange={(event) => update("description", event.target.value)} /></Field></section>
        <section className={styles.card}><h2>藏品履歷</h2><div className={styles.twoColumns}><Field label="來源地區"><input value={draft.origin} onChange={(event) => update("origin", event.target.value)} /></Field><Field label="寺院／來源"><input value={draft.temple} onChange={(event) => update("temple", event.target.value)} /></Field><Field label="佛曆年份"><input value={draft.buddhistYear} onChange={(event) => update("buddhistYear", event.target.value)} /></Field><Field label="西元年份"><input value={draft.westernYear} onChange={(event) => update("westernYear", event.target.value)} /></Field><Field label="材質"><input value={draft.material} onChange={(event) => update("material", event.target.value)} /></Field><Field label="尺寸"><input value={draft.dimensions} onChange={(event) => update("dimensions", event.target.value)} /></Field><Field label="祈願文化主題"><input value={draft.theme} onChange={(event) => update("theme", event.target.value)} /></Field><Field label="視覺形制"><select value={draft.shape} onChange={(event) => update("shape", event.target.value as Product["shape"])}><option value="arch">拱形</option><option value="oval">橢圓</option><option value="round">圓形</option><option value="statue">神尊</option></select></Field></div></section>
        <section className={styles.card}><h2>圖片與 SEO</h2><Field label="商品主圖 URL"><input type="url" value={draft.imageUrl || ""} onChange={(event) => update("imageUrl", event.target.value)} placeholder="https://..." /></Field><Field label="主圖替代文字"><input value={draft.imageAlt || ""} onChange={(event) => update("imageAlt", event.target.value)} placeholder="清楚描述實拍商品與角度" /></Field><Field label="SEO 標題"><input value={draft.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} /></Field><Field label="Meta 描述"><textarea rows={4} value={draft.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} /></Field><label className={styles.field}><span>搜尋收錄狀態</span><span><input type="checkbox" checked={draft.seoReady === true} onChange={(event) => update("seoReady", event.target.checked)} /> 已逐件覆核商品、圖片與 SEO，可以同步到可索引公開版</span></label><small>勾選前必須有公開主圖與替代文字、至少 8 字 SEO 標題及 50 字 Meta 描述；公開建置仍需設定商品覆核閘門。</small></section>
      </div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={styles.field}><span>{label}</span>{children}</label>; }

function OrderManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = orders.find((order) => order.id === selectedId) || orders[0] || null;
  const canChangeTo = (status: OrderStatus) => Boolean(selected && ORDER_TRANSITIONS[selected.orderStatus].has(status));

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders?site=${SITE_CODE}`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { orders?: Order[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "訂單讀取失敗");
      const next = payload.orders || [];
      setOrders(next);
      setSelectedId(preferredId && next.some((order) => order.id === preferredId) ? preferredId : next[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "訂單讀取失敗"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changeStatus = async (status: OrderStatus) => {
    if (!selected) return;
    if (status === "completed" && !window.confirm("標記完成會正式扣除這張訂單保留的庫存，確定繼續嗎？")) return;
    if (status === "cancelled" && !window.confirm("取消訂單會釋放這張訂單保留的庫存，而且取消後不可重新開啟，確定繼續嗎？")) return;
    setUpdating(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ siteCode: SITE_CODE, orderStatus: status, ...(status === "cancelled" && selected.paymentStatus === "paid" ? { paymentStatus: "refunded" } : {}) }) });
      const payload = await response.json().catch(() => ({})) as { order?: Order; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "訂單狀態更新失敗");
      setNotice(`訂單已更新為「${statusLabel(status)}」`);
      await load(selected.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "訂單狀態更新失敗"); }
    finally { setUpdating(false); }
  };

  const changePayment = async (paymentStatus: PaymentStatus) => {
    if (!selected || paymentStatus === selected.paymentStatus) return;
    if ((paymentStatus === "paid" || paymentStatus === "refunded") && !window.confirm(`確定要把付款狀態改為「${statusLabel(paymentStatus)}」嗎？`)) return;
    setUpdating(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          paymentStatus,
          ...(paymentStatus === "refunded" && selected.orderStatus !== "completed" ? { orderStatus: "cancelled" } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { order?: Order; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "付款狀態更新失敗");
      setNotice(`付款狀態已更新為「${statusLabel(paymentStatus)}」`);
      await load(selected.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "付款狀態更新失敗"); }
    finally { setUpdating(false); }
  };

  return <div className={styles.workspace}>
    <aside className={styles.listPane}><div className={styles.listHead}><div><small>ORDERS</small><h1>訂單管理</h1></div><button onClick={() => void load(selected?.id)} aria-label="重新整理訂單">↻</button></div><div className={styles.list}>{loading && <p>讀取中…</p>}{orders.map((order) => <button className={order.id === selected?.id ? styles.selected : ""} key={order.id} onClick={() => setSelectedId(order.id)}><span className={`${styles.dot} ${styles[`order_${order.orderStatus}`]}`} /><span><b>{order.orderNumber}</b><small>{order.customer.name} · {statusLabel(order.orderStatus)} · {formatPrice(order.subtotal)}</small></span></button>)}</div><div className={styles.listFoot}>共 {orders.length} 筆保留單</div></aside>
    <section className={styles.mainPane}><div className={styles.actionbar}><div><span className={styles.pill}>{selected ? statusLabel(selected.orderStatus) : "尚無訂單"}</span><small>{selected ? dateTime(selected.createdAt) : "完成第一筆本機測試訂單後會顯示於此"}</small></div>{selected && <div><button onClick={() => void changeStatus("confirmed")} disabled={updating || !canChangeTo("confirmed")}>確認訂單</button><button onClick={() => void changeStatus("processing")} disabled={updating || !canChangeTo("processing")}>開始處理</button><button onClick={() => void changeStatus("shipped")} disabled={updating || !canChangeTo("shipped")}>標記出貨</button><button className={styles.primary} onClick={() => void changeStatus("completed")} disabled={updating || !canChangeTo("completed")}>標記完成</button><button className={styles.archive} onClick={() => void changeStatus("cancelled")} disabled={updating || !canChangeTo("cancelled")}>取消</button></div>}</div>{(error || notice) && <div className={error ? styles.error : styles.notice} role="status">{error || notice}</div>}
      {!selected ? <div className={styles.emptyState}><span>◇</span><h2>目前還沒有訂單</h2><p>前台送出的商品保留單會保存在本機資料庫。</p></div> : <div className={styles.orderGrid}><section className={styles.card}><div className={styles.orderTitle}><div><small>ORDER</small><h2>{selected.orderNumber}</h2></div><b>{formatPrice(selected.subtotal)}</b></div><div className={styles.orderItems}>{selected.items.map((item) => <div key={item.id}><span><b>{item.name}</b><small>{item.sku} · {formatPrice(item.unitPrice)} × {item.quantity}</small></span><b>{formatPrice(item.lineTotal)}</b></div>)}</div><dl className={styles.totals}><div><dt>商品小計</dt><dd>{formatPrice(selected.subtotal)}</dd></div><div><dt>運費</dt><dd>待確認</dd></div><div><dt>目前金額</dt><dd>{formatPrice(selected.subtotal)}</dd></div><div><dt>付款狀態</dt><dd>{statusLabel(selected.paymentStatus)}</dd></div><div><dt>保留期限</dt><dd>{selected.reservedUntil ? dateTime(selected.reservedUntil) : "不適用"}</dd></div>{selected.expiredAt && <div><dt>逾期取消</dt><dd>{dateTime(selected.expiredAt)}</dd></div>}</dl><Field label="手動付款狀態"><select value={selected.paymentStatus} onChange={(event) => void changePayment(event.target.value as PaymentStatus)} disabled={updating}><option value="uncollected">尚未收款</option><option value="pending">付款確認中</option><option value="paid">已收款</option><option value="failed">付款未完成</option><option value="refunded">已退款</option></select></Field></section><aside className={styles.card}><h2>顧客與配送</h2><dl className={styles.details}><div><dt>姓名</dt><dd>{selected.customer.name}</dd></div><div><dt>電話</dt><dd>{selected.customer.phone}</dd></div><div><dt>Email</dt><dd>{selected.customer.email || "未提供"}</dd></div><div><dt>LINE ID</dt><dd>{selected.customer.lineId || "未提供"}</dd></div><div><dt>配送</dt><dd>{selected.deliveryMethod}</dd></div><div><dt>地址／偏好</dt><dd>{selected.address || "未提供"}</dd></div><div><dt>備註</dt><dd>{selected.note || "無"}</dd></div></dl></aside></div>}
    </section>
  </div>;
}
