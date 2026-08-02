"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Product } from "./data";
import { formatPrice } from "./data";
import ProductArtwork from "./product-artwork";
import { useModalFocus } from "./use-modal-focus";

export default function ProductDialog({
  product,
  onClose,
  onAdd,
}: {
  product: Product | null;
  onClose(): void;
  onAdd(product: Product): void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus(Boolean(product), panelRef, closeRef, onClose);

  if (!product) return null;
  const canOrder = product.status === "active" && product.stock > 0;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="關閉商品詳情" tabIndex={-1} />
      <div className="product-modal" ref={panelRef} tabIndex={-1}>
        <button ref={closeRef} className="modal-close icon-button" onClick={onClose} aria-label="關閉商品詳情">×</button>
        <div className="modal-visual"><ProductArtwork product={product} large /></div>
        <div className="modal-copy">
          <p className="eyebrow eyebrow--dark">OBJECT RECORD · {product.badge}</p>
          <h2 id="product-modal-title">{product.name}</h2>
          <p className="modal-price">{formatPrice(product.price)}</p>
          <p className="modal-description">{product.description}</p>
          <dl>
            <div><dt>典藏編號</dt><dd>{product.sku}</dd></div>
            <div><dt>地區／來源</dt><dd>{product.origin}・{product.temple}</dd></div>
            <div><dt>年份</dt><dd>{product.buddhistYear}（{product.westernYear}）</dd></div>
            <div><dt>材質</dt><dd>{product.material}</dd></div>
            <div><dt>尺寸</dt><dd>{product.dimensions}</dd></div>
            <div><dt>可訂狀態</dt><dd>{canOrder ? `現貨 ${product.stock} 件` : "目前不可訂購"}</dd></div>
          </dl>
          <div className="modal-actions">
            <button className="button button--dark" onClick={() => onAdd(product)} disabled={!canOrder}>{canOrder ? "加入收藏袋" : "暫無庫存"}</button>
            <Link className="text-link" href={`/products/${product.slug}/`}>查看完整藏品頁 ↗</Link>
          </div>
          <small className="faith-note">佛牌與聖物屬宗教文化及收藏商品，其意涵與感受因個人信仰而異，本店不作功效或結果保證。</small>
        </div>
      </div>
    </div>
  );
}
