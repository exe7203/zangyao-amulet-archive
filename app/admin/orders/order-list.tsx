"use client";

import { RefreshCw } from "lucide-react";
import { formatPrice } from "../../data";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { dateTime, orderTotal, statusLabel } from "../commerce/helpers";
import type { Order } from "../commerce/types";
import styles from "./orders.module.css";

type OrderListProps = {
  orders: Order[];
  selectedId: string | undefined;
  loading: boolean;
  updating: boolean;
  fulfillmentDirty: boolean;
  searchQuery: string;
  orderStatusFilter: string;
  paymentStatusFilter: string;
  orderPagination: AdminPagination;
  onSearchChange: (value: string) => void;
  onOrderStatusFilterChange: (value: string) => void;
  onPaymentStatusFilterChange: (value: string) => void;
  onSelect: (orderId: string) => void;
  onRefresh: () => void;
  onPage: (page: number) => void;
};

function StatusChip({ status }: { status: string }) {
  const className = styles[`chip_${status}` as keyof typeof styles] || "";
  return <span className={`${styles.chip} ${className}`.trim()}>{statusLabel(status)}</span>;
}

export default function OrderList({
  orders,
  selectedId,
  loading,
  updating,
  fulfillmentDirty,
  searchQuery,
  orderStatusFilter,
  paymentStatusFilter,
  orderPagination,
  onSearchChange,
  onOrderStatusFilterChange,
  onPaymentStatusFilterChange,
  onSelect,
  onRefresh,
  onPage,
}: OrderListProps) {
  const locked = updating || fulfillmentDirty;

  return (
    <aside className={styles.listPane}>
      <div className={styles.listHead}>
        <div>
          <small>ORDERS</small>
          <h1>訂單管理</h1>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={onRefresh}
          disabled={loading || locked}
        >
          <RefreshCw size={14} />
          重新整理
        </button>
      </div>

      <div className={styles.filters}>
        <label>
          <span>搜尋訂單</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            maxLength={100}
            placeholder="訂單編號、姓名、電話、Email、LINE"
            disabled={locked}
          />
        </label>
        <div className={styles.filterRow}>
          <label>
            <span>訂單狀態</span>
            <select
              value={orderStatusFilter}
              onChange={(event) => onOrderStatusFilterChange(event.target.value)}
              disabled={locked}
            >
              <option value="">全部</option>
              <option value="new">待確認</option>
              <option value="confirmed">已確認</option>
              <option value="processing">處理中</option>
              <option value="shipped">已出貨</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </label>
          <label>
            <span>付款狀態</span>
            <select
              value={paymentStatusFilter}
              onChange={(event) => onPaymentStatusFilterChange(event.target.value)}
              disabled={locked}
            >
              <option value="">全部</option>
              <option value="uncollected">尚未收款</option>
              <option value="pending">付款確認中</option>
              <option value="paid">已收款</option>
              <option value="failed">付款未完成</option>
              <option value="refunded">已退款</option>
            </select>
          </label>
        </div>
      </div>

      <div className={styles.list}>
        {loading && <p>讀取中…</p>}
        {!loading && orders.length === 0 && <p>沒有符合搜尋或篩選條件的訂單。</p>}
        {orders.map((order) => (
          <button
            type="button"
            className={`${styles.orderRow} ${order.id === selectedId ? styles.selected : ""}`}
            key={order.id}
            onClick={() => onSelect(order.id)}
            disabled={updating || loading}
          >
            <div className={styles.orderRowTop}>
              <b>{order.orderNumber}</b>
              <div className={styles.chipRow}>
                <StatusChip status={order.orderStatus} />
                <StatusChip status={order.paymentStatus} />
              </div>
            </div>
            <div className={styles.orderMeta}>
              <small>{order.customer.name}</small>
              <small>
                {orderTotal(order) === null
                  ? `${formatPrice(order.subtotal)}（運費待確認）`
                  : formatPrice(orderTotal(order) as number)}
                {" · "}
                {dateTime(order.createdAt)}
              </small>
            </div>
          </button>
        ))}
      </div>

      <div className={styles.listFoot}>
        <span>
          顯示 {orderPagination.returned} / {orderPagination.total} 筆 · 每頁上限 {orderPagination.limit}
        </span>
        <div>
          <button
            type="button"
            onClick={() => onPage(orderPagination.page - 1)}
            disabled={loading || locked || orderPagination.page <= 1}
          >
            上一頁
          </button>
          <span>
            {orderPagination.page} / {orderPagination.totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPage(orderPagination.page + 1)}
            disabled={loading || locked || orderPagination.page >= orderPagination.totalPages}
          >
            下一頁
          </button>
        </div>
      </div>
    </aside>
  );
}
