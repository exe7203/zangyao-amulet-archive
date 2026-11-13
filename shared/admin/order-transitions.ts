export type OrderStatus =
  | "new"
  | "confirmed"
  | "processing"
  | "shipped"
  | "completed"
  | "cancelled";

export type PaymentStatus =
  | "uncollected"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

/** Server-side order status machine (allows staying on current status). */
export const SERVER_ORDER_TRANSITIONS: Readonly<Record<OrderStatus, ReadonlySet<OrderStatus>>> = {
  new: new Set(["new", "confirmed", "cancelled"]),
  confirmed: new Set(["confirmed", "processing", "cancelled"]),
  processing: new Set(["processing", "shipped", "cancelled"]),
  shipped: new Set(["shipped", "completed"]),
  completed: new Set(["completed"]),
  cancelled: new Set(["cancelled"]),
};

/** Admin UI order status options (only forward transitions). */
export const ADMIN_ORDER_TRANSITIONS: Readonly<Record<OrderStatus, ReadonlySet<OrderStatus>>> = {
  new: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["processing", "cancelled"]),
  processing: new Set(["shipped", "cancelled"]),
  shipped: new Set(["completed"]),
  completed: new Set(),
  cancelled: new Set(),
};

/** Shared payment status machine for server and admin UI. */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, ReadonlySet<PaymentStatus>>> = {
  uncollected: new Set(["uncollected", "pending", "paid", "failed"]),
  pending: new Set(["pending", "paid", "failed"]),
  failed: new Set(["failed", "pending", "paid"]),
  paid: new Set(["paid", "refunded"]),
  refunded: new Set(["refunded"]),
};

export const PAYMENT_STATUS_OPTIONS: readonly PaymentStatus[] = [
  "uncollected",
  "pending",
  "paid",
  "failed",
  "refunded",
];

export const DELIVERY_METHOD_LABELS: Readonly<Record<string, string>> = {
  home_delivery: "台灣本島宅配",
  convenience_store: "超商取貨（門市稍後確認）",
  appointment: "預約面交",
};

export function paymentTransitionAllowed(currentStatus: string, nextStatus: string) {
  return Boolean(PAYMENT_TRANSITIONS[currentStatus as PaymentStatus]?.has(nextStatus as PaymentStatus));
}
