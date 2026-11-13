import {
  PAYMENT_TRANSITIONS,
  SERVER_ORDER_TRANSITIONS,
  paymentTransitionAllowed,
} from "../../shared/admin/order-transitions";

export const RESERVATION_HOLD_HOURS = 72;
export const ORDER_CONSENT_VERSION = "local-reservation-v1";
export const MAX_ORDER_DISTINCT_ITEMS = 10;

export { PAYMENT_TRANSITIONS, paymentTransitionAllowed };

/** Server-side order transitions (string-keyed for handler compatibility). */
export const ORDER_TRANSITIONS: Readonly<Record<string, ReadonlySet<string>>> = SERVER_ORDER_TRANSITIONS;

type FingerprintItem = { productId: string; quantity: number };
export type OrderFingerprintInput = {
  siteId: string;
  customer: { name: string; phone: string; email: string; lineId: string };
  deliveryMethod: string;
  address: string;
  note: string;
  items: readonly FingerprintItem[];
};

export function reservationDeadline(from: Date | string | number = new Date()) {
  const startedAt = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(startedAt.getTime())) throw new Error("保留起始時間不正確");
  return new Date(startedAt.getTime() + RESERVATION_HOLD_HOURS * 60 * 60 * 1000).toISOString();
}

export function canonicalOrderFingerprint(input: OrderFingerprintInput) {
  const items = [...input.items].sort((left, right) => left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0);
  return JSON.stringify({
    version: 2,
    consentVersion: ORDER_CONSENT_VERSION,
    siteId: input.siteId,
    customer: input.customer,
    deliveryMethod: input.deliveryMethod,
    address: input.address,
    note: input.note,
    items,
  });
}

export async function orderRequestFingerprint(input: OrderFingerprintInput) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalOrderFingerprint(input)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function idempotencyReplayDecision(existingFingerprint: unknown, requestFingerprint: string) {
  return typeof existingFingerprint === "string" && existingFingerprint === requestFingerprint
    ? "replay" as const
    : "conflict" as const;
}
