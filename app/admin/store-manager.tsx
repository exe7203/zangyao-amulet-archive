"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { Product } from "../data";
import { formatPrice } from "../data";
import ProductArtwork from "../product-artwork";
import { PUBLIC_SITE_CODE } from "../../shared/site-context";
import styles from "./store-manager.module.css";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "./admin-chrome";
import {
  ADMIN_IMAGE_ALT_MAX_LENGTH,
  ADMIN_IMAGE_URL_MAX_LENGTH,
  validateImagePair,
} from "./image-field-contract";

const SITE_CODE = PUBLIC_SITE_CODE;
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
  shippingFee: number | null;
  carrier: string;
  trackingNumber: string;
  internalNote: string;
  createdAt: string;
  updatedAt: string;
  reservedUntil: string | null;
  expiredAt: string | null;
  items: OrderItem[];
};
type AdminProduct = Omit<Product, "category"> & {
  category: string;
  categoryId?: string;
  inventory?: { onHand: number; reserved: number; available: number; version: number };
};
type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  status: "active" | "archived";
  productCount: number;
  createdAt: string;
  updatedAt: string;
};
type CategoryDraft = Pick<AdminCategory, "id" | "slug" | "name" | "description" | "sortOrder" | "status" | "updatedAt">;
type AdminPagination = { page: number; limit: number; maxLimit: number; total: number; totalPages: number; returned: number };
type OrderEvent = { id: string; eventType: string; fromValue: string; toValue: string; note: string; actor: string; createdAt: string };
type InventoryMovement = { id: string; movementType: string; quantity: number; onHandAfter: number; reservedAfter: number; availableAfter: number; reason: string; actor: string; orderId: string | null; createdAt: string };
type FulfillmentDraft = { shippingFee: string; carrier: string; trackingNumber: string; internalNote: string };

const PRODUCT_LIST_LIMIT = 40;
const ORDER_LIST_LIMIT = 50;
const HISTORY_LIMIT = 20;
const MAX_SHIPPING_FEE = 1_000_000;
const MAX_CARRIER_LENGTH = 80;
const MAX_TRACKING_NUMBER_LENGTH = 120;
const MAX_INTERNAL_NOTE_LENGTH = 2_000;
const EMPTY_PAGINATION: AdminPagination = { page: 1, limit: HISTORY_LIMIT, maxLimit: 50, total: 0, totalPages: 1, returned: 0 };
const EMPTY_FULFILLMENT_DRAFT: FulfillmentDraft = { shippingFee: "", carrier: "", trackingNumber: "", internalNote: "" };

const ORDER_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  new: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["processing", "cancelled"]),
  processing: new Set(["shipped", "cancelled"]),
  shipped: new Set(["completed"]),
  completed: new Set(),
  cancelled: new Set(),
};
const PAYMENT_TRANSITIONS: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  uncollected: new Set(["uncollected", "pending", "paid", "failed"]),
  pending: new Set(["pending", "paid", "failed"]),
  failed: new Set(["failed", "pending", "paid"]),
  paid: new Set(["paid", "refunded"]),
  refunded: new Set(["refunded"]),
};
const PAYMENT_STATUS_OPTIONS: readonly PaymentStatus[] = ["uncollected", "pending", "paid", "failed", "refunded"];
const DELIVERY_METHOD_LABELS: Readonly<Record<string, string>> = {
  home_delivery: "台灣本島宅配",
  convenience_store: "超商取貨（門市稍後確認）",
  appointment: "預約面交",
};

function emptyProduct(category?: AdminCategory): AdminProduct {
  return {
    id: "",
    sku: "",
    slug: "",
    name: "",
    shortName: "",
    description: "",
    category: category?.name || "",
    categoryId: category?.id,
    origin: "",
    temple: "",
    buddhistYear: "",
    westernYear: "",
    material: "",
    dimensions: "",
    price: 0,
    stock: 1,
    status: "draft",
    badge: "新品",
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

function emptyCategory(): CategoryDraft {
  return { id: "", slug: "", name: "", description: "", sortOrder: 0, status: "active", updatedAt: "" };
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function statusLabel(status: string) {
  return ({ new: "待確認", confirmed: "已確認", processing: "處理中", shipped: "已出貨", completed: "已完成", cancelled: "已取消", uncollected: "尚未收款", pending: "付款確認中", paid: "已收款", failed: "付款未完成", refunded: "已退款", active: "上架中", draft: "草稿", sold_out: "售罄", archived: "已封存" } as Record<string, string>)[status] || status;
}

function inventoryBreakdown(product: AdminProduct) {
  const onHand = product.stock;
  const reserved = product.inventory?.reserved ?? 0;
  return { onHand, reserved, available: Math.max(0, onHand - reserved) };
}

function deliveryMethodLabel(method: string) {
  return DELIVERY_METHOD_LABELS[method] || `未辨識的配送方式（${method}）`;
}

function eventTypeLabel(eventType: string) {
  return ({
    order_created: "建立訂單",
    order_status_changed: "訂單狀態更新",
    payment_status_changed: "付款狀態更新",
    fulfillment_updated: "履約資料更新",
    reservation_expired: "保留逾期",
  } as Record<string, string>)[eventType] || eventType;
}

function fulfillmentDraftFromOrder(order: Order | null): FulfillmentDraft {
  return order ? {
    shippingFee: order.shippingFee === null ? "" : String(order.shippingFee),
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    internalNote: order.internalNote,
  } : { ...EMPTY_FULFILLMENT_DRAFT };
}

function orderTotal(order: Order) {
  return order.shippingFee === null ? null : order.subtotal + order.shippingFee;
}

function movementTypeLabel(movementType: string) {
  return ({
    seed: "初始庫存",
    adjustment: "手動調整",
    reservation: "訂單保留",
    release: "釋放保留",
    sale: "完成扣庫",
  } as Record<string, string>)[movementType] || movementType;
}

function actorLabel(actor: string) {
  return ({
    system: "系統",
    "system-expiry": "逾期處理",
    "store-api": "前台訂單",
    "local-preview": "本機後台",
    "catalog-seed": "初始資料",
  } as Record<string, string>)[actor] || actor;
}

function paymentChangeAllowed(order: Order, paymentStatus: PaymentStatus) {
  if (!PAYMENT_TRANSITIONS[order.paymentStatus].has(paymentStatus)) return false;
  const projectedOrderStatus = paymentStatus === "refunded" && order.orderStatus !== "completed"
    ? "cancelled"
    : order.orderStatus;
  if (projectedOrderStatus === "cancelled" && paymentStatus === "paid") return false;
  return projectedOrderStatus === order.orderStatus || ORDER_TRANSITIONS[order.orderStatus].has(projectedOrderStatus);
}

export default function StoreManager({ mode }: { mode: "products" | "orders" }) {
  return <main className={styles.shell}>{mode === "products" ? <ProductManager /> : <><AdminTopbar active="orders" /><OrderManager /></>}</main>;
}

function ProductManager() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [draft, setDraft] = useState<AdminProduct>(emptyProduct);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productPagination, setProductPagination] = useState<AdminPagination>({ ...EMPTY_PAGINATION, limit: PRODUCT_LIST_LIMIT, maxLimit: 100 });
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementPagination, setMovementPagination] = useState<AdminPagination>(EMPTY_PAGINATION);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementError, setMovementError] = useState("");
  const editRevision = useRef(0);
  const productRequestRevision = useRef(0);
  const movementRequestRevision = useRef(0);

  const loadMovements = useCallback(async (productId: string, page = 1) => {
    if (!productId) {
      movementRequestRevision.current += 1;
      setMovements([]);
      setMovementPagination(EMPTY_PAGINATION);
      setMovementError("");
      setMovementsLoading(false);
      return;
    }
    const requestRevision = ++movementRequestRevision.current;
    setMovements([]);
    setMovementPagination({ ...EMPTY_PAGINATION, page });
    setMovementsLoading(true); setMovementError("");
    try {
      const params = new URLSearchParams({ site: SITE_CODE, page: String(page), limit: String(HISTORY_LIMIT) });
      const response = await fetch(`${API_BASE}/api/admin/products/${encodeURIComponent(productId)}/movements?${params}`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { movements?: InventoryMovement[]; pagination?: AdminPagination; error?: string };
      if (!response.ok) throw new Error(payload.error || "庫存流水讀取失敗");
      if (movementRequestRevision.current !== requestRevision) return;
      setMovements(payload.movements || []);
      setMovementPagination(payload.pagination || EMPTY_PAGINATION);
    } catch (cause) {
      if (movementRequestRevision.current === requestRevision) setMovementError(cause instanceof Error ? cause.message : "庫存流水讀取失敗");
    } finally {
      if (movementRequestRevision.current === requestRevision) setMovementsLoading(false);
    }
  }, []);
  const productImageError = validateImagePair({
    url: draft.imageUrl || "",
    alt: draft.imageAlt || "",
    urlLabel: "商品主圖 URL",
    altLabel: "主圖替代文字",
  });

  const loadCategories = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/categories?site=${SITE_CODE}&status=all`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { categories?: AdminCategory[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "分類資料讀取失敗");
      setCategories(payload.categories || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分類資料讀取失敗");
    }
  }, []);

  const load = useCallback(async (page = 1, preferredId?: string) => {
    const requestRevision = ++productRequestRevision.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ site: SITE_CODE, page: String(page), limit: String(PRODUCT_LIST_LIMIT) });
      if (productQuery.trim()) params.set("q", productQuery.trim());
      if (productStatusFilter) params.set("status", productStatusFilter);
      if (productCategoryFilter) params.set("category", productCategoryFilter);
      const response = await fetch(`${API_BASE}/api/admin/products?${params}`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { products?: AdminProduct[]; pagination?: AdminPagination; error?: string };
      if (!response.ok) throw new Error(payload.error || "商品資料讀取失敗");
      if (productRequestRevision.current !== requestRevision) return;
      const next = (payload.products || []).map((product) => ({
        ...product,
        stock: product.inventory?.onHand ?? product.stock,
      }));
      setProducts(next);
      setProductPagination(payload.pagination || { ...EMPTY_PAGINATION, page, limit: PRODUCT_LIST_LIMIT, maxLimit: 100 });
      setDraft((current) => next.find((product) => product.id === preferredId) || next.find((product) => product.id === current.id) || next[0] || emptyProduct());
      setAdjustmentReason("");
      setDirty(false);
    } catch (cause) { if (productRequestRevision.current === requestRevision) setError(cause instanceof Error ? cause.message : "商品資料讀取失敗"); }
    finally { if (productRequestRevision.current === requestRevision) setLoading(false); }
  }, [productCategoryFilter, productQuery, productStatusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCategories(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMovements(draft.id, 1), 0);
    return () => window.clearTimeout(timer);
  }, [draft.id, loadMovements]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = <Key extends keyof AdminProduct>(key: Key, value: AdminProduct[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    editRevision.current += 1;
    setDirty(true);
  };
  const selectProduct = (product: AdminProduct) => {
    if (saving) return;
    if (dirty && product.id !== draft.id && !window.confirm("目前商品還有未儲存變更，確定要切換嗎？")) return;
    setDraft(product); setAdjustmentReason(""); setDirty(false); setError(""); setNotice("");
  };
  const createProduct = () => {
    if (saving) return;
    if (dirty && !window.confirm("目前商品還有未儲存變更，確定要建立新商品嗎？")) return;
    setDraft(emptyProduct(categories.find((category) => category.status === "active")));
    setAdjustmentReason(""); setDirty(false); setError(""); setNotice("");
  };
  const save = async () => {
    if (!draft.name.trim() || !draft.slug.trim() || !draft.sku.trim() || !draft.categoryId) { setError("商品名稱、網址 Slug、商品編號與分類不可留白"); return; }
    if (!Number.isSafeInteger(draft.price) || draft.price < 0 || !Number.isSafeInteger(draft.stock) || draft.stock < 0) { setError("價格與庫存必須是大於或等於 0 的整數"); return; }
    if (draft.stock < (draft.inventory?.reserved ?? 0)) { setError(`實有總數不可低於目前已保留的 ${draft.inventory?.reserved ?? 0} 件`); return; }
    const stockChanged = Boolean(draft.id && draft.inventory && draft.stock !== draft.inventory.onHand);
    if (stockChanged && adjustmentReason.trim().length < 4) { setError("調整實有庫存時，請填寫至少 4 個字的調整原因"); return; }
    if (productImageError) { setError(productImageError); return; }
    setSaving(true); setError(""); setNotice("");
    const savingRevision = editRevision.current;
    try {
      const { inventory, ...productFields } = draft;
      const response = await fetch(`${API_BASE}/api/admin/products`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ ...productFields, adjustmentReason: adjustmentReason.trim(), productVersion: draft.version, inventoryVersion: inventory?.version, siteCode: SITE_CODE }) });
      const payload = await response.json().catch(() => ({})) as { product?: AdminProduct; error?: string };
      if (!response.ok || !payload.product) throw new Error(payload.error || "商品儲存失敗");
      const saved = payload.product as AdminProduct;
      const normalizedSaved = { ...saved, stock: saved.inventory?.onHand ?? saved.stock };
      setProducts((current) => [normalizedSaved, ...current.filter((product) => product.id !== normalizedSaved.id)]);
      if (editRevision.current === savingRevision) {
        setDraft(normalizedSaved);
        setAdjustmentReason("");
        setDirty(false);
        setNotice("商品與庫存資料已儲存");
      } else {
        setDraft((current) => ({
          ...current,
          id: normalizedSaved.id,
          version: normalizedSaved.version,
          inventory: normalizedSaved.inventory,
        }));
        setNotice("已儲存送出時的版本；你後續輸入的內容仍保留，請再次儲存。");
      }
      await loadMovements(normalizedSaved.id, 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "商品儲存失敗"); }
    finally { setSaving(false); }
  };
  const archive = async () => {
    if (!draft.id || !window.confirm(`確定封存「${draft.name}」嗎？`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${encodeURIComponent(draft.id)}?site=${SITE_CODE}&version=${draft.version}`, { method: "DELETE", headers: { accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "商品封存失敗");
      setNotice("商品已封存，不再顯示於前台");
      await load(productPagination.page);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "商品封存失敗"); }
    finally { setSaving(false); }
  };

  const openCategoryManager = (category?: AdminCategory) => {
    setCategoryDraft(category ? {
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      status: category.status,
      updatedAt: category.updatedAt,
    } : emptyCategory());
    setCategoryError("");
    setCategoryManagerOpen(true);
  };
  const saveCategory = async (nextStatus = categoryDraft.status) => {
    if (!categoryDraft.name.trim() || !categoryDraft.slug.trim()) { setCategoryError("分類名稱與網址 Slug 不可留白"); return; }
    if (!Number.isSafeInteger(categoryDraft.sortOrder) || categoryDraft.sortOrder < 0) { setCategoryError("排序必須是大於或等於 0 的整數"); return; }
    const currentCategory = categories.find((category) => category.id === categoryDraft.id);
    if (currentCategory?.status === "active" && nextStatus === "archived" && currentCategory.productCount > 0 &&
        !window.confirm(`封存後，此分類下的 ${currentCategory.productCount} 件商品會停止在前台顯示。確定繼續嗎？`)) return;
    setCategorySaving(true); setCategoryError("");
    try {
      const editing = Boolean(categoryDraft.id);
      const response = await fetch(editing
        ? `${API_BASE}/api/admin/categories/${encodeURIComponent(categoryDraft.id)}`
        : `${API_BASE}/api/admin/categories`, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          name: categoryDraft.name,
          slug: categoryDraft.slug,
          description: categoryDraft.description,
          sortOrder: categoryDraft.sortOrder,
          status: nextStatus,
          ...(editing ? { expectedUpdatedAt: categoryDraft.updatedAt } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { category?: AdminCategory; error?: string };
      if (!response.ok || !payload.category) throw new Error(payload.error || "分類儲存失敗");
      setCategoryDraft({
        id: payload.category.id,
        slug: payload.category.slug,
        name: payload.category.name,
        description: payload.category.description,
        sortOrder: payload.category.sortOrder,
        status: payload.category.status,
        updatedAt: payload.category.updatedAt,
      });
      await loadCategories();
      await load(productPagination.page, draft.id);
      setNotice(nextStatus === "archived" ? "分類已封存" : "分類資料已儲存");
    } catch (cause) {
      setCategoryError(cause instanceof Error ? cause.message : "分類儲存失敗");
    } finally { setCategorySaving(false); }
  };
  const deleteCategory = async () => {
    if (!categoryDraft.id || !window.confirm(`確定刪除分類「${categoryDraft.name}」嗎？仍有商品使用時系統會拒絕刪除。`)) return;
    setCategorySaving(true); setCategoryError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/categories/${encodeURIComponent(categoryDraft.id)}`, { method: "DELETE", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ siteCode: SITE_CODE, expectedUpdatedAt: categoryDraft.updatedAt }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "分類刪除失敗");
      const deletedId = categoryDraft.id;
      setCategoryDraft(emptyCategory());
      await loadCategories();
      if (productCategoryFilter === deletedId) setProductCategoryFilter("");
      setNotice("未被商品使用的分類已刪除");
    } catch (cause) {
      setCategoryError(cause instanceof Error ? cause.message : "分類刪除失敗");
    } finally { setCategorySaving(false); }
  };

  return <><AdminTopbar active="products" hasUnsavedChanges={dirty} /><div className={styles.workspace}>
    <aside className={styles.listPane}>
      <div className={styles.listHead}><div><small>CATALOG</small><h1>商品與庫存</h1></div><button type="button" onClick={createProduct}><Plus size={14} />新增</button></div>
      <div className={styles.productFilters}>
        <label><span>搜尋商品</span><input value={productQuery} maxLength={100} onChange={(event) => setProductQuery(event.target.value)} placeholder="名稱、SKU 或網址" disabled={dirty} /></label>
        <div>
          <label><span>狀態</span><select value={productStatusFilter} onChange={(event) => setProductStatusFilter(event.target.value)} disabled={dirty}><option value="">全部</option><option value="active">上架中</option><option value="draft">草稿</option><option value="sold_out">售罄</option><option value="archived">已封存</option></select></label>
          <label><span>分類</span><select value={productCategoryFilter} onChange={(event) => setProductCategoryFilter(event.target.value)} disabled={dirty}><option value="">全部</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.status === "archived" ? "（已封存）" : ""}</option>)}</select></label>
        </div>
        <button type="button" className={styles.manageCategoriesButton} onClick={() => openCategoryManager()} disabled={dirty || saving}>管理商品分類</button>
      </div>
      <div className={styles.list}>{loading && <p>讀取中…</p>}{!loading && products.length === 0 && <p>沒有符合條件的商品。</p>}{products.map((product) => {
        const inventory = inventoryBreakdown(product);
        return <button type="button" className={product.id === draft.id ? styles.selected : ""} key={product.id} onClick={() => selectProduct(product)}><span className={`${styles.dot} ${styles[`dot_${product.status}`]}`} /><span><b>{product.shortName || product.name}</b><small>{product.sku} · {statusLabel(product.status)}</small><small>{product.category} · 可用 {inventory.available} · 實有 {inventory.onHand} · 保留 {inventory.reserved}</small></span></button>;
      })}</div>
      <div className={`${styles.listFoot} ${styles.pagedListFoot}`}><span>顯示 {productPagination.returned} / {productPagination.total} 件 · 每頁 {productPagination.limit}</span><div><button type="button" onClick={() => void load(productPagination.page - 1)} disabled={loading || dirty || productPagination.page <= 1}>上一頁</button><span>{productPagination.page} / {productPagination.totalPages}</span><button type="button" onClick={() => void load(productPagination.page + 1)} disabled={loading || dirty || productPagination.page >= productPagination.totalPages}>下一頁</button></div></div>
    </aside>
    <section className={styles.mainPane}>
      <AdminActionBar
        status={<AdminStatus tone={draft.status === "active" ? "success" : draft.status === "sold_out" ? "danger" : draft.status === "draft" ? "warning" : "neutral"}>{statusLabel(draft.status)}</AdminStatus>}
        title={draft.shortName || draft.name || "新商品"}
        detail={dirty ? "尚有未儲存變更" : draft.id ? "商品與庫存資料已儲存" : "尚未儲存的新商品"}
      >
        {draft.id && <AdminButton type="button" variant="danger" onClick={() => void archive()} disabled={saving}>封存</AdminButton>}
        <AdminButton type="button" variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "處理中…" : "儲存商品"}</AdminButton>
      </AdminActionBar>
      {(error || notice) && <div className={error ? styles.error : styles.notice} role="status">{error || notice}</div>}
      <div className={styles.formGrid}><section className={styles.card}><h2>基本資料</h2><div className={styles.twoColumns}><Field label="商品全名"><input value={draft.name} onChange={(event) => update("name", event.target.value)} /></Field><Field label="前台短名"><input value={draft.shortName} onChange={(event) => update("shortName", event.target.value)} /></Field><Field label="商品編號／SKU"><input value={draft.sku} onChange={(event) => update("sku", event.target.value.toUpperCase())} /></Field><Field label="網址 Slug"><input value={draft.slug} onChange={(event) => update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></Field><Field label="分類"><select value={draft.categoryId || ""} onChange={(event) => { const category = categories.find((candidate) => candidate.id === event.target.value); update("categoryId", category?.id); update("category", category?.name || ""); }}><option value="">請選擇分類</option>{categories.filter((category) => category.status === "active" || category.id === draft.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}{category.status === "archived" ? "（已封存，請改選）" : ""}</option>)}</select></Field><Field label="狀態"><select value={draft.status} onChange={(event) => update("status", event.target.value as Product["status"])}><option value="draft">草稿</option><option value="active">上架中</option><option value="sold_out">售罄</option><option value="archived">封存</option></select></Field><Field label="售價（TWD）"><input type="number" min="0" step="1" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} /></Field><Field label="實有總數（含訂單保留）"><input type="number" min={draft.inventory?.reserved ?? 0} step="1" value={draft.stock} onChange={(event) => update("stock", Number(event.target.value))} /></Field><Field label="每筆限購"><input type="number" min="1" step="1" value={draft.purchaseLimit || 1} onChange={(event) => update("purchaseLimit", Number(event.target.value))} /></Field><Field label="前台標籤"><input value={draft.badge} onChange={(event) => update("badge", event.target.value)} /></Field></div>{draft.id && draft.inventory && draft.stock !== draft.inventory.onHand && <Field label="庫存調整原因"><input value={adjustmentReason} maxLength={300} onChange={(event) => { setAdjustmentReason(event.target.value); editRevision.current += 1; setDirty(true); }} placeholder="例如：盤點補入 2 件、瑕疵報廢 1 件" /><small className={styles.helperText}>庫存有異動時必填，至少 4 個字；原因會保存在庫存流水。</small></Field>}<InventorySummary product={draft} /><Field label="商品說明"><textarea rows={5} value={draft.description} onChange={(event) => update("description", event.target.value)} /></Field></section>
        <section className={styles.card}><h2>來源與規格</h2><div className={styles.twoColumns}><Field label="來源地區"><input value={draft.origin} onChange={(event) => update("origin", event.target.value)} /></Field><Field label="寺院／來源"><input value={draft.temple} onChange={(event) => update("temple", event.target.value)} /></Field><Field label="佛曆年份"><input value={draft.buddhistYear} onChange={(event) => update("buddhistYear", event.target.value)} /></Field><Field label="西元年份"><input value={draft.westernYear} onChange={(event) => update("westernYear", event.target.value)} /></Field><Field label="材質"><input value={draft.material} onChange={(event) => update("material", event.target.value)} /></Field><Field label="尺寸"><input value={draft.dimensions} onChange={(event) => update("dimensions", event.target.value)} /></Field><Field label="文化主題"><input value={draft.theme} onChange={(event) => update("theme", event.target.value)} /></Field><Field label="外觀形制"><select value={draft.shape} onChange={(event) => update("shape", event.target.value as Product["shape"])}><option value="arch">拱形</option><option value="oval">橢圓</option><option value="round">圓形</option><option value="statue">神尊</option></select></Field></div></section>
        <section className={styles.card}>
          <h2>圖片與 SEO</h2>
          <div className={styles.imagePreview}>
            <ProductArtwork key={`${draft.id || "new"}:${draft.imageUrl || ""}`} product={draft as Product} large />
          </div>
          <p className={styles.previewNote}>安全預覽會使用前台相同規則；網址無效或圖片載入失敗時顯示藏品示意圖。</p>
          <Field label="商品主圖 URL">
            <input
              type="url"
              value={draft.imageUrl || ""}
              maxLength={ADMIN_IMAGE_URL_MAX_LENGTH}
              aria-invalid={Boolean(productImageError)}
              onChange={(event) => update("imageUrl", event.target.value)}
              placeholder="https://..."
            />
            <small className={styles.fieldCounter}>{(draft.imageUrl || "").length}/{ADMIN_IMAGE_URL_MAX_LENGTH}</small>
          </Field>
          <Field label="主圖替代文字">
            <input
              value={draft.imageAlt || ""}
              maxLength={ADMIN_IMAGE_ALT_MAX_LENGTH}
              aria-invalid={Boolean(productImageError)}
              onChange={(event) => update("imageAlt", event.target.value)}
              placeholder="清楚描述實拍商品與角度"
            />
            <small className={styles.fieldCounter}>{(draft.imageAlt || "").length}/{ADMIN_IMAGE_ALT_MAX_LENGTH}</small>
          </Field>
          {productImageError && <p className={styles.fieldError} role="status">{productImageError}</p>}
          <Field label="SEO 標題"><input value={draft.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} /></Field>
          <Field label="Meta 描述"><textarea rows={4} value={draft.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} /></Field>
          <label className={styles.field}><span>搜尋收錄狀態</span><span><input type="checkbox" checked={draft.seoReady === true} onChange={(event) => update("seoReady", event.target.checked)} /> 商品、圖片與 SEO 資料已確認，可同步到公開索引</span></label>
          <small>勾選前必須有公開主圖與替代文字、至少 8 字 SEO 標題及 50 字 Meta 描述；公開建置仍需開啟商品收錄設定。</small>
        </section>
        <section className={`${styles.card} ${styles.historyCard}`}>
          <div className={styles.cardHeading}><div><small>INVENTORY LOG</small><h2>庫存流水</h2></div>{draft.id && <button type="button" onClick={() => void loadMovements(draft.id, movementPagination.page)} disabled={movementsLoading}><RefreshCw size={13} />重新整理</button>}</div>
          {!draft.id ? <p className={styles.historyEmpty}>商品儲存後，這裡會顯示初始入庫、調整、訂單保留、釋放與完成扣庫紀錄。</p> : movementError ? <p className={styles.historyError} role="status">{movementError}</p> : movementsLoading && movements.length === 0 ? <p className={styles.historyEmpty}>讀取庫存流水…</p> : movements.length === 0 ? <p className={styles.historyEmpty}>這項商品目前沒有庫存流水。</p> : <div className={styles.timeline}>{movements.map((movement) => <article key={movement.id}><span className={styles.timelineDot} /><div><div className={styles.timelineTitle}><b>{movementTypeLabel(movement.movementType)}</b><time dateTime={movement.createdAt}>{dateTime(movement.createdAt)}</time></div><p>{movement.reason || "未填寫原因"}</p><small>異動 {movement.quantity > 0 ? "+" : ""}{movement.quantity} · 實有 {movement.onHandAfter} · 保留 {movement.reservedAfter} · 可用 {movement.availableAfter}</small><small>{actorLabel(movement.actor)}{movement.orderId ? ` · 訂單 ${movement.orderId}` : ""}</small></div></article>)}</div>}
          {draft.id && !movementsLoading && <HistoryPager pagination={movementPagination} loading={false} onPage={(page) => void loadMovements(draft.id, page)} />}
        </section>
      </div>
    </section>
  </div>
  {categoryManagerOpen && <div className={styles.categoryOverlay} role="presentation">
    <section className={styles.categoryDialog} role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <header><div><small>CATALOG TAXONOMY</small><h2 id="category-manager-title">商品分類管理</h2></div><button type="button" onClick={() => setCategoryManagerOpen(false)} aria-label="關閉分類管理">×</button></header>
      <div className={styles.categoryWorkspace}>
        <nav className={styles.categoryList} aria-label="商品分類清單">
          <button type="button" className={!categoryDraft.id ? styles.categorySelected : ""} onClick={() => { setCategoryDraft(emptyCategory()); setCategoryError(""); }}><Plus size={13} />新增分類</button>
          {categories.map((category) => <button type="button" className={category.id === categoryDraft.id ? styles.categorySelected : ""} key={category.id} onClick={() => openCategoryManager(category)}><b>{category.name}</b><small>{category.productCount} 件商品 · {category.status === "active" ? "啟用" : "已封存"}</small></button>)}
        </nav>
        <div className={styles.categoryForm}>
          <div className={styles.twoColumns}><Field label="分類名稱"><input maxLength={80} value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="網址 Slug"><input maxLength={120} value={categoryDraft.slug} onChange={(event) => setCategoryDraft((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} /></Field><Field label="排序"><input type="number" min="0" max="100000" step="1" value={categoryDraft.sortOrder} onChange={(event) => setCategoryDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></Field><Field label="狀態"><select value={categoryDraft.status} onChange={(event) => setCategoryDraft((current) => ({ ...current, status: event.target.value as AdminCategory["status"] }))}><option value="active">啟用</option><option value="archived">已封存</option></select></Field></div>
          <Field label="分類說明"><textarea rows={4} maxLength={500} value={categoryDraft.description} onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
          {categoryError && <p className={styles.categoryError} role="status">{categoryError}</p>}
          <div className={styles.categoryActions}>
            <span>{categoryDraft.id ? `目前有 ${categories.find((category) => category.id === categoryDraft.id)?.productCount || 0} 件商品` : "建立後即可指派給商品"}</span>
            <div>{categoryDraft.id && <button type="button" className={styles.deleteCategoryButton} onClick={() => void deleteCategory()} disabled={categorySaving}>刪除</button>}{categoryDraft.id && categoryDraft.status === "active" && <button type="button" onClick={() => void saveCategory("archived")} disabled={categorySaving}>封存</button>}<button type="button" className={styles.saveCategoryButton} onClick={() => void saveCategory()} disabled={categorySaving}>{categorySaving ? "處理中…" : "儲存分類"}</button></div>
          </div>
          <p className={styles.categoryHint}>仍被商品使用的分類不能刪除；可先移動商品，或將分類封存。每次更新都會核對你畫面上的版本，避免覆蓋他人的修改。</p>
        </div>
      </div>
    </section>
  </div>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={styles.field}><span>{label}</span>{children}</label>; }

function InventorySummary({ product }: { product: AdminProduct }) {
  const inventory = inventoryBreakdown(product);
  return <section className={styles.inventorySummary} aria-label="庫存拆分">
    <div><span>實有 onHand</span><b>{inventory.onHand}</b></div>
    <div><span>訂單保留 reserved</span><b>{inventory.reserved}</b></div>
    <div><span>可用 available</span><b>{inventory.available}</b></div>
    <p>可用數量＝實有總數－訂單保留；商品同時為「上架中」時，才會成為前台可售上限。已保留數量由訂單流程管理，不能在商品欄位直接改動。</p>
  </section>;
}

function HistoryPager({ pagination, loading, onPage }: { pagination: AdminPagination; loading: boolean; onPage: (page: number) => void }) {
  return <div className={styles.historyPager}>
    <span>顯示 {pagination.returned} / {pagination.total} 筆 · 每頁上限 {pagination.limit}</span>
    <div><button type="button" onClick={() => onPage(pagination.page - 1)} disabled={loading || pagination.page <= 1}>上一頁</button><span>{pagination.page} / {pagination.totalPages}</span><button type="button" onClick={() => onPage(pagination.page + 1)} disabled={loading || pagination.page >= pagination.totalPages}>下一頁</button></div>
  </div>;
}

function OrderManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [fulfillmentDraft, setFulfillmentDraft] = useState<FulfillmentDraft>(EMPTY_FULFILLMENT_DRAFT);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [orderPagination, setOrderPagination] = useState<AdminPagination>({ ...EMPTY_PAGINATION, limit: ORDER_LIST_LIMIT, maxLimit: ORDER_LIST_LIMIT });
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [eventPagination, setEventPagination] = useState<AdminPagination>(EMPTY_PAGINATION);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventError, setEventError] = useState("");
  const orderRequestRevision = useRef(0);
  const eventRequestRevision = useRef(0);
  const lastAutoLoadedFilterKey = useRef("");
  const selected = orders.find((order) => order.id === selectedId) || orders[0] || null;
  const orderFilterKey = JSON.stringify([searchQuery.trim(), orderStatusFilter, paymentStatusFilter]);
  const hasOrderFilters = Boolean(searchQuery.trim() || orderStatusFilter || paymentStatusFilter);
  const fulfillmentDirty = Boolean(selected && (
    fulfillmentDraft.shippingFee !== (selected.shippingFee === null ? "" : String(selected.shippingFee)) ||
    fulfillmentDraft.carrier !== selected.carrier ||
    fulfillmentDraft.trackingNumber !== selected.trackingNumber ||
    fulfillmentDraft.internalNote !== selected.internalNote
  ));
  const canChangeTo = (status: OrderStatus) => Boolean(selected && ORDER_TRANSITIONS[selected.orderStatus].has(status));
  const availablePaymentOptions = selected
    ? PAYMENT_STATUS_OPTIONS.filter((paymentStatus) => paymentChangeAllowed(selected, paymentStatus))
    : [];

  const loadEvents = useCallback(async (orderId: string, page = 1) => {
    if (!orderId) {
      eventRequestRevision.current += 1;
      setEvents([]);
      setEventPagination(EMPTY_PAGINATION);
      setEventError("");
      setEventsLoading(false);
      return;
    }
    const requestRevision = ++eventRequestRevision.current;
    setEvents([]);
    setEventPagination({ ...EMPTY_PAGINATION, page });
    setEventsLoading(true); setEventError("");
    try {
      const params = new URLSearchParams({ site: SITE_CODE, page: String(page), limit: String(HISTORY_LIMIT) });
      const response = await fetch(`${API_BASE}/api/admin/orders/${encodeURIComponent(orderId)}/events?${params}`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { events?: OrderEvent[]; pagination?: AdminPagination; error?: string };
      if (!response.ok) throw new Error(payload.error || "訂單時間軸讀取失敗");
      if (eventRequestRevision.current !== requestRevision) return;
      setEvents(payload.events || []);
      setEventPagination(payload.pagination || EMPTY_PAGINATION);
    } catch (cause) {
      if (eventRequestRevision.current === requestRevision) setEventError(cause instanceof Error ? cause.message : "訂單時間軸讀取失敗");
    } finally {
      if (eventRequestRevision.current === requestRevision) setEventsLoading(false);
    }
  }, []);

  const load = useCallback(async (preferredId?: string, requestedPage = 1) => {
    const requestRevision = ++orderRequestRevision.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ site: SITE_CODE, page: String(requestedPage), limit: String(ORDER_LIST_LIMIT) });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (orderStatusFilter) params.set("orderStatus", orderStatusFilter);
      if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
      const response = await fetch(`${API_BASE}/api/admin/orders?${params}`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { orders?: Order[]; pagination?: AdminPagination; error?: string };
      if (!response.ok) throw new Error(payload.error || "訂單讀取失敗");
      if (orderRequestRevision.current !== requestRevision) return;
      const next = payload.orders || [];
      setOrders(next);
      setOrderPagination(payload.pagination || { ...EMPTY_PAGINATION, limit: ORDER_LIST_LIMIT, maxLimit: ORDER_LIST_LIMIT });
      const nextSelectedId = preferredId && next.some((order) => order.id === preferredId) ? preferredId : next[0]?.id || "";
      setSelectedId(nextSelectedId);
      setFulfillmentDraft(fulfillmentDraftFromOrder(next.find((order) => order.id === nextSelectedId) || null));
    } catch (cause) { if (orderRequestRevision.current === requestRevision) setError(cause instanceof Error ? cause.message : "訂單讀取失敗"); }
    finally { if (orderRequestRevision.current === requestRevision) setLoading(false); }
  }, [orderStatusFilter, paymentStatusFilter, searchQuery]);
  useEffect(() => {
    if (lastAutoLoadedFilterKey.current === orderFilterKey) return;
    if (updating) return;
    const timer = window.setTimeout(() => {
      lastAutoLoadedFilterKey.current = orderFilterKey;
      void load(undefined, 1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, orderFilterKey, updating]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadEvents(selected?.id || "", 1), 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents, selected?.id]);

  const selectOrder = (orderId: string) => {
    if (orderId === selected?.id) return;
    if (fulfillmentDirty && !window.confirm("履約資料尚未儲存，切換訂單會放棄這些修改，確定繼續嗎？")) return;
    setFulfillmentDraft(fulfillmentDraftFromOrder(orders.find((order) => order.id === orderId) || null));
    setSelectedId(orderId);
  };

  const changeStatus = async (status: OrderStatus) => {
    if (!selected || fulfillmentDirty) return;
    if (status === "completed" && !window.confirm("標記完成會正式扣除這張訂單保留的庫存，確定繼續嗎？")) return;
    if (status === "cancelled" && !window.confirm("取消訂單會釋放這張訂單保留的庫存，而且取消後不可重新開啟，確定繼續嗎？")) return;
    setUpdating(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ siteCode: SITE_CODE, orderStatus: status, ...(status === "cancelled" && selected.paymentStatus === "paid" ? { paymentStatus: "refunded" } : {}) }) });
      const payload = await response.json().catch(() => ({})) as { order?: Order; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "訂單狀態更新失敗");
      setNotice(`訂單已更新為「${statusLabel(status)}」`);
      await Promise.all([load(selected.id, orderPagination.page), loadEvents(selected.id, 1)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "訂單狀態更新失敗"); }
    finally { setUpdating(false); }
  };

  const changePayment = async (paymentStatus: PaymentStatus) => {
    if (!selected || fulfillmentDirty || paymentStatus === selected.paymentStatus) return;
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
      await Promise.all([load(selected.id, orderPagination.page), loadEvents(selected.id, 1)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "付款狀態更新失敗"); }
    finally { setUpdating(false); }
  };

  const saveFulfillment = async () => {
    if (!selected) return;
    const shippingFeeText = fulfillmentDraft.shippingFee.trim();
    if (shippingFeeText && !/^\d+$/.test(shippingFeeText)) {
      setError("運費請輸入 0 以上的整數；尚未確認時請留白。");
      setNotice("");
      return;
    }
    const shippingFee = shippingFeeText ? Number(shippingFeeText) : null;
    if (shippingFee !== null && (!Number.isSafeInteger(shippingFee) || shippingFee > MAX_SHIPPING_FEE)) {
      setError(`運費不可超過 ${MAX_SHIPPING_FEE.toLocaleString("zh-TW")} 元。`);
      setNotice("");
      return;
    }
    if (fulfillmentDraft.carrier.length > MAX_CARRIER_LENGTH ||
        fulfillmentDraft.trackingNumber.length > MAX_TRACKING_NUMBER_LENGTH ||
        fulfillmentDraft.internalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
      setError("履約資料超過欄位字數限制，請縮短後再儲存。");
      setNotice("");
      return;
    }

    setUpdating(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          shippingFee,
          carrier: fulfillmentDraft.carrier,
          trackingNumber: fulfillmentDraft.trackingNumber,
          internalNote: fulfillmentDraft.internalNote,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { order?: Order; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "履約資料儲存失敗");
      setOrders((current) => current.map((order) => order.id === payload.order?.id ? payload.order : order));
      setFulfillmentDraft(fulfillmentDraftFromOrder(payload.order));
      setNotice("履約資料已儲存；客戶備註未變更。");
      await loadEvents(selected.id, 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "履約資料儲存失敗"); }
    finally { setUpdating(false); }
  };

  return <div className={styles.workspace}>
    <aside className={`${styles.listPane} ${styles.orderListPane}`}>
      <div className={styles.listHead}><div><small>ORDERS</small><h1>訂單管理</h1></div><button type="button" onClick={() => void load(selected?.id, orderPagination.page)} disabled={loading || updating || fulfillmentDirty}><RefreshCw size={14} />重新整理</button></div>
      <div className={styles.orderFilters}>
        <label><span>搜尋訂單</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={100} placeholder="訂單編號、姓名、電話、Email、LINE" disabled={updating || fulfillmentDirty} /></label>
        <div><label><span>訂單狀態</span><select value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)} disabled={updating || fulfillmentDirty}><option value="">全部</option><option value="new">待確認</option><option value="confirmed">已確認</option><option value="processing">處理中</option><option value="shipped">已出貨</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label><label><span>付款狀態</span><select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)} disabled={updating || fulfillmentDirty}><option value="">全部</option><option value="uncollected">尚未收款</option><option value="pending">付款確認中</option><option value="paid">已收款</option><option value="failed">付款未完成</option><option value="refunded">已退款</option></select></label></div>
      </div>
      <div className={styles.list}>{loading && <p>讀取中…</p>}{!loading && orders.length === 0 && <p>沒有符合搜尋或篩選條件的訂單。</p>}{orders.map((order) => <button type="button" className={order.id === selected?.id ? styles.selected : ""} key={order.id} onClick={() => selectOrder(order.id)} disabled={updating || loading}><span className={`${styles.dot} ${styles[`order_${order.orderStatus}`]}`} /><span><b>{order.orderNumber}</b><small>{order.customer.name} · {statusLabel(order.orderStatus)} · {statusLabel(order.paymentStatus)}</small><small>{orderTotal(order) === null ? `${formatPrice(order.subtotal)}（運費待確認）` : formatPrice(orderTotal(order) as number)} · {dateTime(order.createdAt)}</small></span></button>)}</div>
      <div className={`${styles.listFoot} ${styles.pagedListFoot}`}><span>顯示 {orderPagination.returned} / {orderPagination.total} 筆 · 每頁上限 {orderPagination.limit}</span><div><button type="button" onClick={() => void load(undefined, orderPagination.page - 1)} disabled={loading || updating || fulfillmentDirty || orderPagination.page <= 1}>上一頁</button><span>{orderPagination.page} / {orderPagination.totalPages}</span><button type="button" onClick={() => void load(undefined, orderPagination.page + 1)} disabled={loading || updating || fulfillmentDirty || orderPagination.page >= orderPagination.totalPages}>下一頁</button></div></div>
    </aside>
    <section className={styles.mainPane}>
      <AdminActionBar
        status={<AdminStatus tone={!selected ? "neutral" : selected.orderStatus === "completed" ? "success" : selected.orderStatus === "cancelled" ? "danger" : selected.orderStatus === "new" ? "warning" : "neutral"}>{selected ? statusLabel(selected.orderStatus) : "尚無訂單"}</AdminStatus>}
        title={selected?.orderNumber || "訂單管理"}
        detail={selected ? dateTime(selected.createdAt) : "完成第一筆本機測試訂單後會顯示於此"}
      >
        {selected && <>
          <AdminButton type="button" onClick={() => void changeStatus("confirmed")} disabled={updating || loading || fulfillmentDirty || !canChangeTo("confirmed")}>確認訂單</AdminButton>
          <AdminButton type="button" onClick={() => void changeStatus("processing")} disabled={updating || loading || fulfillmentDirty || !canChangeTo("processing")}>開始處理</AdminButton>
          <AdminButton type="button" onClick={() => void changeStatus("shipped")} disabled={updating || loading || fulfillmentDirty || !canChangeTo("shipped")}>標記出貨</AdminButton>
          <AdminButton type="button" variant="primary" onClick={() => void changeStatus("completed")} disabled={updating || loading || fulfillmentDirty || !canChangeTo("completed")}>標記完成</AdminButton>
          <AdminButton type="button" variant="danger" onClick={() => void changeStatus("cancelled")} disabled={updating || loading || fulfillmentDirty || !canChangeTo("cancelled")}>取消</AdminButton>
        </>}
      </AdminActionBar>
      {(error || notice) && <div className={error ? styles.error : styles.notice} role="status">{error || notice}</div>}
      {!selected ? <div className={styles.emptyState}><span>◇</span><h2>{hasOrderFilters ? "沒有符合條件的訂單" : "目前還沒有訂單"}</h2><p>{hasOrderFilters ? "請調整搜尋字詞或狀態篩選。" : "前台送出的訂單會保存在本機資料庫。"}</p></div> : <div className={styles.orderGrid}>
        <section className={`${styles.card} ${styles.orderSummary}`}>
          <div className={styles.orderTitle}><div><small>ORDER</small><h2>{selected.orderNumber}</h2></div><b>{orderTotal(selected) === null ? `${formatPrice(selected.subtotal)} 小計` : formatPrice(orderTotal(selected) as number)}</b></div>
          <div className={styles.orderItems}>{selected.items.map((item) => <div key={item.id}><span><b>{item.name}</b><small>{item.sku} · {formatPrice(item.unitPrice)} × {item.quantity}</small></span><b>{formatPrice(item.lineTotal)}</b></div>)}</div>
          <dl className={styles.totals}><div><dt>商品小計</dt><dd>{formatPrice(selected.subtotal)}</dd></div><div><dt>運費</dt><dd>{selected.shippingFee === null ? "待確認" : formatPrice(selected.shippingFee)}</dd></div><div><dt>訂單合計</dt><dd>{orderTotal(selected) === null ? "待運費確認" : formatPrice(orderTotal(selected) as number)}</dd></div><div><dt>付款狀態</dt><dd>{statusLabel(selected.paymentStatus)}</dd></div><div><dt>保留期限</dt><dd>{selected.reservedUntil ? dateTime(selected.reservedUntil) : "不適用"}</dd></div>{selected.expiredAt && <div><dt>逾期取消</dt><dd>{dateTime(selected.expiredAt)}</dd></div>}</dl>
          <Field label="手動付款狀態"><select value={selected.paymentStatus} onChange={(event) => void changePayment(event.target.value as PaymentStatus)} disabled={updating || loading || fulfillmentDirty || availablePaymentOptions.length <= 1}>{availablePaymentOptions.map((paymentStatus) => <option value={paymentStatus} key={paymentStatus}>{statusLabel(paymentStatus)}</option>)}</select></Field>
          <p className={styles.helperText}>只列出目前訂單與付款狀態允許的下一步；已取消、已完成或已退款後不會提供不可逆的回復操作。</p>
        </section>
        <aside className={`${styles.card} ${styles.customerCard}`}><h2>顧客與配送</h2><dl className={styles.details}><div><dt>姓名</dt><dd>{selected.customer.name}</dd></div><div><dt>電話</dt><dd>{selected.customer.phone}</dd></div><div><dt>Email</dt><dd>{selected.customer.email || "未提供"}</dd></div><div><dt>LINE ID</dt><dd>{selected.customer.lineId || "未提供"}</dd></div><div><dt>配送方式</dt><dd>{deliveryMethodLabel(selected.deliveryMethod)}</dd></div><div><dt>地址／偏好</dt><dd>{selected.address || "未提供"}</dd></div><div><dt>客戶備註</dt><dd>{selected.note || "無"}</dd></div></dl></aside>
        <section className={`${styles.card} ${styles.fulfillmentCard}`}>
          <div className={styles.cardHeading}><div><small>FULFILLMENT</small><h2>履約資料</h2></div><AdminStatus tone={fulfillmentDirty ? "warning" : "neutral"}>{fulfillmentDirty ? "尚未儲存" : "已儲存"}</AdminStatus></div>
          <div className={styles.fulfillmentGrid}>
            <Field label="運費（元）"><input type="number" inputMode="numeric" min={0} max={MAX_SHIPPING_FEE} step={1} value={fulfillmentDraft.shippingFee} onChange={(event) => setFulfillmentDraft((draft) => ({ ...draft, shippingFee: event.target.value }))} placeholder="留白表示尚未確認" disabled={updating} /></Field>
            <Field label="承運商"><input type="text" value={fulfillmentDraft.carrier} onChange={(event) => setFulfillmentDraft((draft) => ({ ...draft, carrier: event.target.value }))} maxLength={MAX_CARRIER_LENGTH} placeholder="例如：中華郵政" disabled={updating} /></Field>
            <Field label="追蹤編號"><input type="text" value={fulfillmentDraft.trackingNumber} onChange={(event) => setFulfillmentDraft((draft) => ({ ...draft, trackingNumber: event.target.value }))} maxLength={MAX_TRACKING_NUMBER_LENGTH} autoComplete="off" placeholder="尚未取得可留白" disabled={updating} /></Field>
            <Field label="內部備註"><textarea rows={5} value={fulfillmentDraft.internalNote} onChange={(event) => setFulfillmentDraft((draft) => ({ ...draft, internalNote: event.target.value }))} maxLength={MAX_INTERNAL_NOTE_LENGTH} placeholder="交接、包裝或聯絡紀錄" disabled={updating} /></Field>
          </div>
          <div className={styles.fulfillmentActions}><p>內部備註只顯示於後台，不會出現在前台訂單建立回應；此處也不會修改上方的客戶備註。</p><AdminButton type="button" variant="primary" onClick={() => void saveFulfillment()} disabled={updating || loading || !fulfillmentDirty}>{updating ? "儲存中…" : "儲存履約資料"}</AdminButton></div>
        </section>
        <section className={`${styles.card} ${styles.orderHistory}`}>
          <div className={styles.cardHeading}><div><small>ORDER TIMELINE</small><h2>訂單時間軸</h2></div><button type="button" onClick={() => void loadEvents(selected.id, eventPagination.page)} disabled={eventsLoading || updating}><RefreshCw size={13} />重新整理</button></div>
          {eventError ? <p className={styles.historyError} role="status">{eventError}</p> : eventsLoading && events.length === 0 ? <p className={styles.historyEmpty}>讀取訂單時間軸…</p> : events.length === 0 ? <p className={styles.historyEmpty}>這張訂單目前沒有事件紀錄。</p> : <div className={styles.timeline}>{events.map((event) => <article key={event.id}><span className={styles.timelineDot} /><div><div className={styles.timelineTitle}><b>{eventTypeLabel(event.eventType)}</b><time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time></div><p>{event.note || "未填寫說明"}</p>{event.toValue && <small>{event.fromValue ? `${statusLabel(event.fromValue)} → ` : ""}{statusLabel(event.toValue)}</small>}<small>{actorLabel(event.actor)}</small></div></article>)}</div>}
          {!eventsLoading && <HistoryPager pagination={eventPagination} loading={updating} onPage={(page) => void loadEvents(selected.id, page)} />}
        </section>
      </div>}
    </section>
  </div>;
}
