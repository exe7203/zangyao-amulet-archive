"use client";

import { RefreshCw } from "lucide-react";
import { formatPrice } from "../../data";
import type { PaymentStatus } from "../../../shared/admin/order-transitions";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { AdminButton, AdminStatus } from "../admin-chrome";
import {
  MAX_CARRIER_LENGTH,
  MAX_INTERNAL_NOTE_LENGTH,
  MAX_SHIPPING_FEE,
  MAX_TRACKING_NUMBER_LENGTH,
} from "../_lib/constants";
import {
  actorLabel,
  dateTime,
  deliveryMethodLabel,
  eventTypeLabel,
  orderTotal,
  statusLabel,
} from "../commerce/helpers";
import type { FulfillmentDraft, Order, OrderEvent } from "../commerce/types";
import { HistoryPager } from "../commerce/ui";
import styles from "./orders.module.css";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

type OrderDetailProps = {
  selected: Order;
  fulfillmentDraft: FulfillmentDraft;
  fulfillmentDirty: boolean;
  availablePaymentOptions: PaymentStatus[];
  updating: boolean;
  loading: boolean;
  events: OrderEvent[];
  eventPagination: AdminPagination;
  eventsLoading: boolean;
  eventError: string;
  onFulfillmentChange: (patch: Partial<FulfillmentDraft>) => void;
  onPaymentChange: (paymentStatus: PaymentStatus) => void;
  onSaveFulfillment: () => void;
  onReloadEvents: () => void;
  onEventsPage: (page: number) => void;
};

export default function OrderDetail({
  selected,
  fulfillmentDraft,
  fulfillmentDirty,
  availablePaymentOptions,
  updating,
  loading,
  events,
  eventPagination,
  eventsLoading,
  eventError,
  onFulfillmentChange,
  onPaymentChange,
  onSaveFulfillment,
  onReloadEvents,
  onEventsPage,
}: OrderDetailProps) {
  return (
    <div className={styles.orderGrid}>
      <section className={styles.panel}>
        <div className={styles.summaryTitle}>
          <div>
            <small>ORDER</small>
            <h2>{selected.orderNumber}</h2>
          </div>
          <b>
            {orderTotal(selected) === null
              ? `${formatPrice(selected.subtotal)} 小計`
              : formatPrice(orderTotal(selected) as number)}
          </b>
        </div>

        <div className={styles.orderItems}>
          {selected.items.map((item) => (
            <div key={item.id}>
              <span>
                <b>{item.name}</b>
                <small>
                  {item.sku} · {formatPrice(item.unitPrice)} × {item.quantity}
                </small>
              </span>
              <b>{formatPrice(item.lineTotal)}</b>
            </div>
          ))}
        </div>

        <dl className={styles.totals}>
          <div>
            <dt>商品小計</dt>
            <dd>{formatPrice(selected.subtotal)}</dd>
          </div>
          <div>
            <dt>運費</dt>
            <dd>{selected.shippingFee === null ? "待確認" : formatPrice(selected.shippingFee)}</dd>
          </div>
          <div>
            <dt>訂單合計</dt>
            <dd>
              {orderTotal(selected) === null
                ? "待運費確認"
                : formatPrice(orderTotal(selected) as number)}
            </dd>
          </div>
          <div>
            <dt>付款狀態</dt>
            <dd>{statusLabel(selected.paymentStatus)}</dd>
          </div>
          <div>
            <dt>保留期限</dt>
            <dd>{selected.reservedUntil ? dateTime(selected.reservedUntil) : "不適用"}</dd>
          </div>
          {selected.expiredAt && (
            <div>
              <dt>逾期取消</dt>
              <dd>{dateTime(selected.expiredAt)}</dd>
            </div>
          )}
        </dl>

        <Field label="手動付款狀態">
          <select
            value={selected.paymentStatus}
            onChange={(event) => void onPaymentChange(event.target.value as PaymentStatus)}
            disabled={updating || loading || fulfillmentDirty || availablePaymentOptions.length <= 1}
          >
            {availablePaymentOptions.map((paymentStatus) => (
              <option value={paymentStatus} key={paymentStatus}>
                {statusLabel(paymentStatus)}
              </option>
            ))}
          </select>
        </Field>
        <p className={styles.helperText}>
          只列出目前訂單與付款狀態允許的下一步；已取消、已完成或已退款後不會提供不可逆的回復操作。
        </p>
      </section>

      <aside className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <small>CUSTOMER</small>
            <h2>顧客與配送</h2>
          </div>
        </div>
        <dl className={styles.details}>
          <div>
            <dt>姓名</dt>
            <dd>{selected.customer.name}</dd>
          </div>
          <div>
            <dt>電話</dt>
            <dd>{selected.customer.phone}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{selected.customer.email || "未提供"}</dd>
          </div>
          <div>
            <dt>LINE ID</dt>
            <dd>{selected.customer.lineId || "未提供"}</dd>
          </div>
          <div>
            <dt>配送方式</dt>
            <dd>{deliveryMethodLabel(selected.deliveryMethod)}</dd>
          </div>
          <div>
            <dt>地址／偏好</dt>
            <dd>{selected.address || "未提供"}</dd>
          </div>
          <div>
            <dt>客戶備註</dt>
            <dd>{selected.note || "無"}</dd>
          </div>
        </dl>
      </aside>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <small>FULFILLMENT</small>
            <h2>履約資料</h2>
          </div>
          <AdminStatus tone={fulfillmentDirty ? "warning" : "neutral"}>
            {fulfillmentDirty ? "尚未儲存" : "已儲存"}
          </AdminStatus>
        </div>
        <div className={styles.fulfillmentGrid}>
          <Field label="運費（元）">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SHIPPING_FEE}
              step={1}
              value={fulfillmentDraft.shippingFee}
              onChange={(event) => onFulfillmentChange({ shippingFee: event.target.value })}
              placeholder="留白表示尚未確認"
              disabled={updating}
            />
          </Field>
          <Field label="承運商">
            <input
              type="text"
              value={fulfillmentDraft.carrier}
              onChange={(event) => onFulfillmentChange({ carrier: event.target.value })}
              maxLength={MAX_CARRIER_LENGTH}
              placeholder="例如：中華郵政"
              disabled={updating}
            />
          </Field>
          <Field label="追蹤編號">
            <input
              type="text"
              value={fulfillmentDraft.trackingNumber}
              onChange={(event) => onFulfillmentChange({ trackingNumber: event.target.value })}
              maxLength={MAX_TRACKING_NUMBER_LENGTH}
              autoComplete="off"
              placeholder="尚未取得可留白"
              disabled={updating}
            />
          </Field>
          <Field label="內部備註">
            <textarea
              rows={5}
              value={fulfillmentDraft.internalNote}
              onChange={(event) => onFulfillmentChange({ internalNote: event.target.value })}
              maxLength={MAX_INTERNAL_NOTE_LENGTH}
              placeholder="交接、包裝或聯絡紀錄"
              disabled={updating}
            />
          </Field>
        </div>
        <div className={styles.fulfillmentActions}>
          <p>內部備註只顯示於後台，不會出現在前台訂單建立回應；此處也不會修改上方的客戶備註。</p>
          <AdminButton
            type="button"
            variant="primary"
            onClick={() => void onSaveFulfillment()}
            disabled={updating || loading || !fulfillmentDirty}
          >
            {updating ? "儲存中…" : "儲存履約資料"}
          </AdminButton>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.historyPanel}`}>
        <div className={styles.panelHead}>
          <div>
            <small>ORDER TIMELINE</small>
            <h2>訂單時間軸</h2>
          </div>
          <button type="button" onClick={onReloadEvents} disabled={eventsLoading || updating}>
            <RefreshCw size={13} />
            重新整理
          </button>
        </div>
        {eventError ? (
          <p className={styles.historyError} role="status">
            {eventError}
          </p>
        ) : eventsLoading && events.length === 0 ? (
          <p className={styles.historyEmpty}>讀取訂單時間軸…</p>
        ) : events.length === 0 ? (
          <p className={styles.historyEmpty}>這張訂單目前沒有事件紀錄。</p>
        ) : (
          <div className={styles.timeline}>
            {events.map((event) => (
              <article key={event.id}>
                <span className={styles.timelineDot} />
                <div>
                  <div className={styles.timelineTitle}>
                    <b>{eventTypeLabel(event.eventType)}</b>
                    <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
                  </div>
                  <p>{event.note || "未填寫說明"}</p>
                  {event.toValue && (
                    <small>
                      {event.fromValue ? `${statusLabel(event.fromValue)} → ` : ""}
                      {statusLabel(event.toValue)}
                    </small>
                  )}
                  <small>{actorLabel(event.actor)}</small>
                </div>
              </article>
            ))}
          </div>
        )}
        {!eventsLoading && (
          <HistoryPager pagination={eventPagination} loading={updating} onPage={onEventsPage} />
        )}
      </section>
    </div>
  );
}
