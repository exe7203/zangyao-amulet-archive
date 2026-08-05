import type {
  DeliveryMethod,
  DeviceCheckoutProfile,
  DeviceOrderItem,
  DeviceOrderReference,
  DeviceProfileEnvelope,
} from "../../shared/member-contract";

export const DEVICE_PROFILE_STORAGE_KEY = "taijuda:device-profile:v1";
export const DEVICE_ORDER_STORAGE_KEY = "taijuda:device-orders:v1";
export const DEVICE_PROFILE_TTL_DAYS = 180;
export const DEVICE_ORDER_HISTORY_LIMIT = 20;

const PROFILE_TTL_MS = DEVICE_PROFILE_TTL_DAYS * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const PHONE_PATTERN = /^[0-9+()\-\s]{8,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SAFE_STATUS = /^[a-z][a-z0-9_]{0,39}$/;
const DELIVERY_METHODS = new Set<DeliveryMethod>([
  "home_delivery",
  "convenience_store",
  "appointment",
]);

export type DeviceStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type DeviceOrderEnvelope = {
  version: 1;
  scope: "device-only";
  siteCode: "taijuda";
  updatedAt: string;
  items: DeviceOrderReference[];
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (cleaned.length > maxLength || CONTROL_CHARACTERS.test(cleaned)) return null;
  return cleaned;
}

function isoTimestamp(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function normalizeDeviceProfile(value: unknown): DeviceCheckoutProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const contactName = cleanText(candidate.contactName, 80);
  const phone = cleanText(candidate.phone, 20);
  const email = cleanText(candidate.email, 254);
  const lineId = cleanText(candidate.lineId, 80);
  const address = cleanText(candidate.address, 300);
  const deliveryMethod = candidate.deliveryMethod;

  if (
    contactName === null || contactName.length < 2 ||
    phone === null || !PHONE_PATTERN.test(phone) ||
    email === null || (email.length > 0 && !EMAIL_PATTERN.test(email)) ||
    lineId === null || address === null ||
    typeof deliveryMethod !== "string" || !DELIVERY_METHODS.has(deliveryMethod as DeliveryMethod) ||
    (deliveryMethod === "home_delivery" && address.length < 8)
  ) return null;

  return {
    contactName,
    phone,
    email,
    lineId,
    deliveryMethod: deliveryMethod as DeliveryMethod,
    address,
  };
}

export function createDeviceProfileEnvelope(
  profile: unknown,
  now = new Date(),
): DeviceProfileEnvelope | null {
  const normalized = normalizeDeviceProfile(profile);
  if (!normalized || Number.isNaN(now.getTime())) return null;
  return {
    version: 1,
    scope: "device-only",
    siteCode: "taijuda",
    consentVersion: "remember-checkout-v1",
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROFILE_TTL_MS).toISOString(),
    value: normalized,
  };
}

export function parseDeviceProfileStorage(
  raw: string | null,
  now = new Date(),
): DeviceProfileEnvelope | null {
  if (!raw || Number.isNaN(now.getTime())) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 || candidate.scope !== "device-only" ||
    candidate.siteCode !== "taijuda" || candidate.consentVersion !== "remember-checkout-v1"
  ) return null;

  const savedAt = isoTimestamp(candidate.savedAt);
  const expiresAt = isoTimestamp(candidate.expiresAt);
  const profile = normalizeDeviceProfile(candidate.value);
  if (!savedAt || !expiresAt || !profile) return null;
  const savedTime = Date.parse(savedAt);
  const expiresTime = Date.parse(expiresAt);
  if (
    savedTime > now.getTime() + CLOCK_SKEW_MS ||
    expiresTime <= now.getTime() ||
    expiresTime <= savedTime ||
    expiresTime - savedTime > PROFILE_TTL_MS + CLOCK_SKEW_MS
  ) return null;

  return {
    version: 1,
    scope: "device-only",
    siteCode: "taijuda",
    consentVersion: "remember-checkout-v1",
    savedAt,
    expiresAt,
    value: profile,
  };
}

function safeRemove(storage: DeviceStorage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // 瀏覽器禁用儲存時，不讓頁面崩潰。
  }
}

export function readDeviceProfile(storage: DeviceStorage, now = new Date()) {
  let raw: string | null = null;
  try {
    raw = storage.getItem(DEVICE_PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
  const envelope = parseDeviceProfileStorage(raw, now);
  if (raw && !envelope) safeRemove(storage, DEVICE_PROFILE_STORAGE_KEY);
  return envelope?.value ?? null;
}

export function saveDeviceProfile(
  storage: DeviceStorage,
  profile: unknown,
  remember: boolean,
  now = new Date(),
) {
  if (!remember) {
    safeRemove(storage, DEVICE_PROFILE_STORAGE_KEY);
    return false;
  }
  const envelope = createDeviceProfileEnvelope(profile, now);
  if (!envelope) return false;
  try {
    storage.setItem(DEVICE_PROFILE_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceProfile(storage: DeviceStorage) {
  safeRemove(storage, DEVICE_PROFILE_STORAGE_KEY);
}

function normalizeOrderItem(value: unknown): DeviceOrderItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const name = cleanText(candidate.name, 120);
  const quantity = candidate.quantity;
  if (!name || !Number.isSafeInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 100) return null;
  return { name, quantity: Number(quantity) };
}

export function normalizeDeviceOrderReference(value: unknown): DeviceOrderReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const orderNumber = cleanText(candidate.orderNumber, 80);
  const status = cleanText(candidate.status, 40);
  const createdAt = isoTimestamp(candidate.createdAt);
  const reservedUntil = candidate.reservedUntil === null ? null : isoTimestamp(candidate.reservedUntil);
  const items = Array.isArray(candidate.items)
    ? candidate.items.slice(0, 20).map(normalizeOrderItem).filter((item): item is DeviceOrderItem => Boolean(item))
    : [];
  if (
    !orderNumber || !SAFE_REFERENCE.test(orderNumber) || !status || !SAFE_STATUS.test(status) ||
    !Number.isSafeInteger(candidate.total) || Number(candidate.total) < 0 ||
    candidate.currency !== "TWD" || !createdAt ||
    (candidate.reservedUntil !== null && !reservedUntil) || items.length === 0
  ) return null;
  return {
    orderNumber,
    status,
    total: Number(candidate.total),
    currency: "TWD",
    createdAt,
    reservedUntil,
    items,
  };
}

export function parseDeviceOrderStorage(raw: string | null): DeviceOrderReference[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 || candidate.scope !== "device-only" ||
    candidate.siteCode !== "taijuda" || !isoTimestamp(candidate.updatedAt) ||
    !Array.isArray(candidate.items)
  ) return [];
  const seen = new Set<string>();
  return candidate.items
    .map(normalizeDeviceOrderReference)
    .filter((item): item is DeviceOrderReference => Boolean(item))
    .filter((item) => {
      if (seen.has(item.orderNumber)) return false;
      seen.add(item.orderNumber);
      return true;
    })
    .slice(0, DEVICE_ORDER_HISTORY_LIMIT);
}

export function readDeviceOrders(storage: DeviceStorage) {
  let raw: string | null = null;
  try {
    raw = storage.getItem(DEVICE_ORDER_STORAGE_KEY);
  } catch {
    return [];
  }
  const items = parseDeviceOrderStorage(raw);
  if (raw && items.length === 0) safeRemove(storage, DEVICE_ORDER_STORAGE_KEY);
  return items;
}

export function rememberDeviceOrder(
  storage: DeviceStorage,
  order: unknown,
  now = new Date(),
) {
  const normalized = normalizeDeviceOrderReference(order);
  if (!normalized || Number.isNaN(now.getTime())) return false;
  const items = [normalized, ...readDeviceOrders(storage).filter((item) => item.orderNumber !== normalized.orderNumber)]
    .slice(0, DEVICE_ORDER_HISTORY_LIMIT);
  const envelope: DeviceOrderEnvelope = {
    version: 1,
    scope: "device-only",
    siteCode: "taijuda",
    updatedAt: now.toISOString(),
    items,
  };
  try {
    storage.setItem(DEVICE_ORDER_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceOrders(storage: DeviceStorage) {
  safeRemove(storage, DEVICE_ORDER_STORAGE_KEY);
}
