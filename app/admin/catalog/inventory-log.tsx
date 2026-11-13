"use client";

import { RefreshCw } from "lucide-react";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { HistoryPager } from "../commerce/ui";
import { actorLabel, dateTime, movementTypeLabel } from "../commerce/helpers";
import type { InventoryMovement } from "../commerce/types";
import styles from "./catalog.module.css";

export function InventoryLog({
  productId,
  movements,
  pagination,
  loading,
  error,
  onRefresh,
  onPage,
}: {
  productId: string;
  movements: InventoryMovement[];
  pagination: AdminPagination;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onPage: (page: number) => void;
}) {
  return (
    <div className={styles.editorBody}>
      <section className={styles.panel}>
        <div className={styles.historyHead}>
          <div>
            <h2>庫存流水</h2>
            <p className={styles.panelLead}>記錄初始入庫、手動調整、訂單保留、釋放與完成扣庫。</p>
          </div>
          {productId && (
            <button type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} />
              重新整理
            </button>
          )}
        </div>

        {!productId ? (
          <p className={styles.historyEmpty}>商品儲存後，這裡會顯示初始入庫、調整、訂單保留、釋放與完成扣庫紀錄。</p>
        ) : error ? (
          <p className={styles.historyError} role="status">
            {error}
          </p>
        ) : loading && movements.length === 0 ? (
          <p className={styles.historyEmpty}>讀取庫存流水…</p>
        ) : movements.length === 0 ? (
          <p className={styles.historyEmpty}>這項商品目前沒有庫存流水。</p>
        ) : (
          <div className={styles.timeline}>
            {movements.map((movement) => (
              <article key={movement.id}>
                <span className={styles.timelineDot} />
                <div>
                  <div className={styles.timelineTitle}>
                    <b>{movementTypeLabel(movement.movementType)}</b>
                    <time dateTime={movement.createdAt}>{dateTime(movement.createdAt)}</time>
                  </div>
                  <p>{movement.reason || "未填寫原因"}</p>
                  <small>
                    異動 {movement.quantity > 0 ? "+" : ""}
                    {movement.quantity} · 實有 {movement.onHandAfter} · 保留 {movement.reservedAfter} · 可用{" "}
                    {movement.availableAfter}
                  </small>
                  <small>
                    {actorLabel(movement.actor)}
                    {movement.orderId ? ` · 訂單 ${movement.orderId}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}

        {productId && !loading && (
          <HistoryPager pagination={pagination} loading={false} onPage={onPage} />
        )}
      </section>
    </div>
  );
}
