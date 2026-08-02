import type { Product } from "./data";

export const CART_STORAGE_KEY = "taijuda-amulet-archive:cart:v1";
const DEFAULT_PURCHASE_LIMIT = 10;

export type CartItem = {
  productId: number;
  quantity: number;
};

export type CartLine = CartItem & {
  product: Product;
};

export function getPurchaseLimit(product: Pick<Product, "purchaseLimit">) {
  return product.purchaseLimit ?? DEFAULT_PURCHASE_LIMIT;
}

export function normalizeCartItems(
  value: unknown,
  catalog: readonly Product[],
): CartItem[] {
  if (!Array.isArray(value)) return [];

  const productsById = new Map(catalog.map((product) => [product.id, product]));
  const quantities = new Map<number, number>();
  const order: number[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;

    const { productId, quantity } = candidate as Partial<CartItem>;
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity! <= 0) continue;

    const product = productsById.get(productId!);
    if (!product) continue;

    if (!quantities.has(productId!)) order.push(productId!);
    const nextQuantity = (quantities.get(productId!) ?? 0) + quantity!;
    quantities.set(productId!, Math.min(nextQuantity, getPurchaseLimit(product)));
  }

  return order.map((productId) => ({ productId, quantity: quantities.get(productId)! }));
}

export function parseCartStorage(
  value: string | null,
  catalog: readonly Product[],
): CartItem[] {
  if (!value) return [];

  try {
    return normalizeCartItems(JSON.parse(value), catalog);
  } catch {
    return [];
  }
}

export function serializeCartItems(items: readonly CartItem[]) {
  return JSON.stringify(items.map(({ productId, quantity }) => ({ productId, quantity })));
}

export function addCartItem(
  items: readonly CartItem[],
  product: Product,
): CartItem[] {
  const existing = items.find((item) => item.productId === product.id);
  if (!existing) return [...items, { productId: product.id, quantity: 1 }];

  const limit = getPurchaseLimit(product);
  return items.map((item) => item.productId === product.id
    ? { ...item, quantity: Math.min(item.quantity + 1, limit) }
    : item);
}

export function changeCartItemQuantity(
  items: readonly CartItem[],
  productId: number,
  amount: number,
  catalog: readonly Product[],
): CartItem[] {
  const product = catalog.find((candidate) => candidate.id === productId);
  if (!product) return items.filter((item) => item.productId !== productId);

  return items
    .map((item) => item.productId === productId
      ? { ...item, quantity: Math.min(item.quantity + amount, getPurchaseLimit(product)) }
      : item)
    .filter((item) => item.quantity > 0);
}

export function removeCartItem(items: readonly CartItem[], productId: number) {
  return items.filter((item) => item.productId !== productId);
}

export function resolveCartLines(
  items: readonly CartItem[],
  catalog: readonly Product[],
): CartLine[] {
  const productsById = new Map(catalog.map((product) => [product.id, product]));
  return items.flatMap((item) => {
    const product = productsById.get(item.productId);
    return product ? [{ ...item, product }] : [];
  });
}
