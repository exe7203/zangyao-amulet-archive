"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CART_STORAGE_KEY,
  CART_CHANGE_EVENT,
  MAX_CART_DISTINCT_ITEMS,
  addCartItem,
  parseCartStorage,
  serializeCartItems,
} from "../../cart";
import { products, type Product } from "../../data";

export default function ProductActions({
  product,
  availabilityConfirmed = false,
  orderReady = false,
}: {
  product: Product;
  availabilityConfirmed?: boolean;
  orderReady?: boolean;
}) {
  const [message, setMessage] = useState("");
  const canOrder = availabilityConfirmed && orderReady && product.status === "active" && product.stock > 0;

  const add = () => {
    if (!canOrder) {
      setMessage("商品或接單狀態尚未完成覆核，目前不可加入收藏袋。");
      return;
    }
    try {
      const catalog = products.some((candidate) => candidate.id === product.id)
        ? products
        : [...products, product];
      const current = parseCartStorage(
        window.localStorage.getItem(CART_STORAGE_KEY),
        catalog,
        { preserveUnknown: true },
      );
      const alreadyInCart = current.some((item) => item.productId === product.id);
      if (!alreadyInCart && current.length >= MAX_CART_DISTINCT_ITEMS) {
        setMessage(`收藏袋最多可放 ${MAX_CART_DISTINCT_ITEMS} 種商品，請先回首頁移除一件。`);
        return;
      }
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCartItems(addCartItem(current, product)));
      window.dispatchEvent(new Event(CART_CHANGE_EVENT));
      setMessage("已加入收藏袋。");
    } catch {
      setMessage("收藏袋目前無法更新，請稍後再試。");
    }
  };

  return <div>
    <button type="button" onClick={add} disabled={!canOrder}>{!availabilityConfirmed ? "庫存待確認" : !orderReady ? "目前未開放接單" : canOrder ? "加入收藏袋" : "目前不可訂購"}</button>
    {message && <p role="status">{message} <Link href="/#new">返回首頁查看收藏袋 →</Link></p>}
  </div>;
}
