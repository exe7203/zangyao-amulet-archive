import {
  ADMIN_ORDER_TRANSITIONS,
  DELIVERY_METHOD_LABELS,
  PAYMENT_TRANSITIONS,
  type OrderStatus,
  type PaymentStatus,
} from "../../../shared/admin/order-transitions";
import type { AdminCategory, AdminProduct, FulfillmentDraft, Order } from "./types";
import { EMPTY_FULFILLMENT_DRAFT } from "./types";

export const ORDER_TRANSITIONS = ADMIN_ORDER_TRANSITIONS;

export function emptyProduct(category?: AdminCategory): AdminProduct {
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

export function emptyCategory(): Pick<AdminCategory, "id" | "slug" | "name" | "description" | "sortOrder" | "status" | "updatedAt"> {
  return { id: "", slug: "", name: "", description: "", sortOrder: 0, status: "active", updatedAt: "" };
}

export function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function statusLabel(status: string) {
  return ({
    new: "待確認",
    confirmed: "已確認",
    processing: "處理中",
    shipped: "已出貨",
    completed: "已完成",
    cancelled: "已取消",
    uncollected: "尚未收款",
    pending: "付款確認中",
    paid: "已收款",
    failed: "付款未完成",
    refunded: "已退款",
    active: "上架中",
    draft: "草稿",
    sold_out: "售罄",
    archived: "已封存",
  } as Record<string, string>)[status] || status;
}

export function inventoryBreakdown(product: AdminProduct) {
  const onHand = product.stock;
  const reserved = product.inventory?.reserved ?? 0;
  return { onHand, reserved, available: Math.max(0, onHand - reserved) };
}

export function deliveryMethodLabel(method: string) {
  return DELIVERY_METHOD_LABELS[method] || `未辨識的配送方式（${method}）`;
}

export function eventTypeLabel(eventType: string) {
  return ({
    order_created: "建立訂單",
    order_status_changed: "訂單狀態更新",
    payment_status_changed: "付款狀態更新",
    fulfillment_updated: "履約資料更新",
    reservation_expired: "保留逾期",
  } as Record<string, string>)[eventType] || eventType;
}

export function fulfillmentDraftFromOrder(order: Order | null): FulfillmentDraft {
  return order ? {
    shippingFee: order.shippingFee === null ? "" : String(order.shippingFee),
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    internalNote: order.internalNote,
  } : { ...EMPTY_FULFILLMENT_DRAFT };
}

export function orderTotal(order: Order) {
  return order.shippingFee === null ? null : order.subtotal + order.shippingFee;
}

export function movementTypeLabel(movementType: string) {
  return ({
    seed: "初始庫存",
    adjustment: "手動調整",
    reservation: "訂單保留",
    release: "釋放保留",
    sale: "完成扣庫",
  } as Record<string, string>)[movementType] || movementType;
}

export function actorLabel(actor: string) {
  return ({
    system: "系統",
    "system-expiry": "逾期處理",
    "store-api": "前台訂單",
    "local-preview": "本機後台",
    "catalog-seed": "初始資料",
  } as Record<string, string>)[actor] || actor;
}

export function paymentChangeAllowed(order: Order, paymentStatus: PaymentStatus) {
  if (!PAYMENT_TRANSITIONS[order.paymentStatus].has(paymentStatus)) return false;
  const projectedOrderStatus = paymentStatus === "refunded" && order.orderStatus !== "completed"
    ? "cancelled"
    : order.orderStatus;
  if (projectedOrderStatus === "cancelled" && paymentStatus === "paid") return false;
  return projectedOrderStatus === order.orderStatus || ORDER_TRANSITIONS[order.orderStatus].has(projectedOrderStatus);
}
