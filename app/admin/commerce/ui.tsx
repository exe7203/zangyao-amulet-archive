import type { AdminPagination } from "../../../shared/admin/pagination";
import styles from "../_ui/workspace.module.css";
import { inventoryBreakdown } from "./helpers";
import type { AdminProduct } from "./types";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

export function InventorySummary({ product }: { product: AdminProduct }) {
  const inventory = inventoryBreakdown(product);
  return <section className={styles.inventorySummary} aria-label="庫存拆分">
    <div><span>實有 onHand</span><b>{inventory.onHand}</b></div>
    <div><span>訂單保留 reserved</span><b>{inventory.reserved}</b></div>
    <div><span>可用 available</span><b>{inventory.available}</b></div>
    <p>可用數量＝實有總數－訂單保留；商品同時為「上架中」時，才會成為前台可售上限。已保留數量由訂單流程管理，不能在商品欄位直接改動。</p>
  </section>;
}

export function HistoryPager({ pagination, loading, onPage }: { pagination: AdminPagination; loading: boolean; onPage: (page: number) => void }) {
  return <div className={styles.historyPager}>
    <span>顯示 {pagination.returned} / {pagination.total} 筆 · 每頁上限 {pagination.limit}</span>
    <div><button type="button" onClick={() => onPage(pagination.page - 1)} disabled={loading || pagination.page <= 1}>上一頁</button><span>{pagination.page} / {pagination.totalPages}</span><button type="button" onClick={() => onPage(pagination.page + 1)} disabled={loading || pagination.page >= pagination.totalPages}>下一頁</button></div>
  </div>;
}
