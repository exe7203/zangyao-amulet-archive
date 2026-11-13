import type { Product } from "../../data";
import type { OrderStatus, PaymentStatus } from "../../../shared/admin/order-transitions";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { HISTORY_LIMIT } from "../_lib/constants";

export type OrderItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type Order = {
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

export type AdminProduct = Omit<Product, "category"> & {
  category: string;
  categoryId?: string;
  inventory?: { onHand: number; reserved: number; available: number; version: number };
};

export type AdminCategory = {
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

export type CategoryDraft = Pick<AdminCategory, "id" | "slug" | "name" | "description" | "sortOrder" | "status" | "updatedAt">;

export type OrderEvent = {
  id: string;
  eventType: string;
  fromValue: string;
  toValue: string;
  note: string;
  actor: string;
  createdAt: string;
};

export type InventoryMovement = {
  id: string;
  movementType: string;
  quantity: number;
  onHandAfter: number;
  reservedAfter: number;
  availableAfter: number;
  reason: string;
  actor: string;
  orderId: string | null;
  createdAt: string;
};

export type FulfillmentDraft = {
  shippingFee: string;
  carrier: string;
  trackingNumber: string;
  internalNote: string;
};

export const EMPTY_PAGINATION: AdminPagination = {
  page: 1,
  limit: HISTORY_LIMIT,
  maxLimit: 50,
  total: 0,
  totalPages: 1,
  returned: 0,
};

export const EMPTY_FULFILLMENT_DRAFT: FulfillmentDraft = {
  shippingFee: "",
  carrier: "",
  trackingNumber: "",
  internalNote: "",
};
