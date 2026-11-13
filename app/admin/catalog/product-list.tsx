"use client";

import { Plus } from "lucide-react";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { inventoryBreakdown, statusLabel } from "../commerce/helpers";
import type { AdminCategory, AdminProduct } from "../commerce/types";
import styles from "./catalog.module.css";

export function ProductList({
  products,
  categories,
  selectedId,
  loading,
  dirty,
  saving,
  query,
  statusFilter,
  categoryFilter,
  pagination,
  onQuery,
  onStatusFilter,
  onCategoryFilter,
  onSelect,
  onCreate,
  onOpenCategories,
  onPage,
}: {
  products: AdminProduct[];
  categories: AdminCategory[];
  selectedId: string;
  loading: boolean;
  dirty: boolean;
  saving: boolean;
  query: string;
  statusFilter: string;
  categoryFilter: string;
  pagination: AdminPagination;
  onQuery: (value: string) => void;
  onStatusFilter: (value: string) => void;
  onCategoryFilter: (value: string) => void;
  onSelect: (product: AdminProduct) => void;
  onCreate: () => void;
  onOpenCategories: () => void;
  onPage: (page: number) => void;
}) {
  return (
    <aside className={styles.listPane}>
      <div className={styles.listHead}>
        <div>
          <small>商品目錄</small>
          <h1>商品與庫存</h1>
        </div>
        <button type="button" className={styles.addButton} onClick={onCreate}>
          <Plus size={15} />
          新增
        </button>
      </div>

      <div className={styles.filters}>
        <label>
          <span>搜尋商品</span>
          <input
            value={query}
            maxLength={100}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="名稱、SKU 或網址"
            disabled={dirty}
          />
        </label>
        <div className={styles.filtersRow}>
          <label>
            <span>狀態</span>
            <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)} disabled={dirty}>
              <option value="">全部</option>
              <option value="active">上架中</option>
              <option value="draft">草稿</option>
              <option value="sold_out">售罄</option>
              <option value="archived">已封存</option>
            </select>
          </label>
          <label>
            <span>分類</span>
            <select value={categoryFilter} onChange={(event) => onCategoryFilter(event.target.value)} disabled={dirty}>
              <option value="">全部</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.status === "archived" ? "（已封存）" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className={styles.categoryButton}
          onClick={onOpenCategories}
          disabled={dirty || saving}
        >
          管理商品分類
        </button>
      </div>

      <div className={styles.list}>
        {loading && <p className={styles.listMuted}>讀取中…</p>}
        {!loading && products.length === 0 && <p className={styles.listMuted}>沒有符合條件的商品。</p>}
        {products.map((product) => {
          const inventory = inventoryBreakdown(product);
          return (
            <button
              type="button"
              key={product.id}
              className={`${styles.productRow} ${product.id === selectedId ? styles.productRowSelected : ""}`}
              onClick={() => onSelect(product)}
            >
              <span className={`${styles.dot} ${styles[`dot_${product.status}`]}`} />
              <span>
                <b>{product.shortName || product.name}</b>
                <div className={styles.productMeta}>
                  <span>{product.sku}</span>
                  <span>·</span>
                  <span>{statusLabel(product.status)}</span>
                </div>
                <div className={styles.productMeta}>
                  <span className={styles.chip}>{product.category || "未分類"}</span>
                  <span className={`${styles.chip} ${styles.chipStock}`}>可用 {inventory.available}</span>
                  <span className={`${styles.chip} ${styles.chipPrice}`}>NT$ {product.price}</span>
                </div>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.listFoot}>
        <span>
          顯示 {pagination.returned} / {pagination.total} 件 · 每頁 {pagination.limit}
        </span>
        <div className={styles.pager}>
          <button type="button" onClick={() => onPage(pagination.page - 1)} disabled={loading || dirty || pagination.page <= 1}>
            上一頁
          </button>
          <span>
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPage(pagination.page + 1)}
            disabled={loading || dirty || pagination.page >= pagination.totalPages}
          >
            下一頁
          </button>
        </div>
      </div>
    </aside>
  );
}
