"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  adminOrderEventsPath,
  adminOrderPath,
  adminOrdersPath,
} from "../../../shared/admin/api-paths";
import {
  PAYMENT_STATUS_OPTIONS,
  type OrderStatus,
  type PaymentStatus,
} from "../../../shared/admin/order-transitions";
import type { AdminPagination } from "../../../shared/admin/pagination";
import { AdminActionBar, AdminButton, AdminStatus, AdminTopbar } from "../admin-chrome";
import { adminFetch } from "../_lib/api-client";
import {
  HISTORY_LIMIT,
  MAX_CARRIER_LENGTH,
  MAX_INTERNAL_NOTE_LENGTH,
  MAX_SHIPPING_FEE,
  MAX_TRACKING_NUMBER_LENGTH,
  ORDER_LIST_LIMIT,
  SITE_CODE,
} from "../_lib/constants";
import {
  dateTime,
  fulfillmentDraftFromOrder,
  ORDER_TRANSITIONS,
  paymentChangeAllowed,
  statusLabel,
} from "../commerce/helpers";
import type { FulfillmentDraft, Order, OrderEvent } from "../commerce/types";
import { EMPTY_FULFILLMENT_DRAFT, EMPTY_PAGINATION } from "../commerce/types";
import OrderDetail from "./order-detail";
import OrderList from "./order-list";
import styles from "./orders.module.css";

function readOrderStatusFilter(params: { get(name: string): string | null }) {
  const status = params.get("orderStatus");
  return status === "new" ||
    status === "confirmed" ||
    status === "processing" ||
    status === "shipped" ||
    status === "completed" ||
    status === "cancelled"
    ? status
    : "";
}

export default function OrderWorkspace() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [fulfillmentDraft, setFulfillmentDraft] = useState<FulfillmentDraft>(EMPTY_FULFILLMENT_DRAFT);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState(() => readOrderStatusFilter(searchParams));
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [orderPagination, setOrderPagination] = useState<AdminPagination>({
    ...EMPTY_PAGINATION,
    limit: ORDER_LIST_LIMIT,
    maxLimit: ORDER_LIST_LIMIT,
  });
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [eventPagination, setEventPagination] = useState<AdminPagination>(EMPTY_PAGINATION);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventError, setEventError] = useState("");
  const orderRequestRevision = useRef(0);
  const eventRequestRevision = useRef(0);
  const lastAutoLoadedFilterKey = useRef("");
  const selected = orders.find((order) => order.id === selectedId) || orders[0] || null;
  const orderFilterKey = JSON.stringify([searchQuery.trim(), orderStatusFilter, paymentStatusFilter]);
  const hasOrderFilters = Boolean(searchQuery.trim() || orderStatusFilter || paymentStatusFilter);
  const fulfillmentDirty = Boolean(
    selected &&
      (fulfillmentDraft.shippingFee !== (selected.shippingFee === null ? "" : String(selected.shippingFee)) ||
        fulfillmentDraft.carrier !== selected.carrier ||
        fulfillmentDraft.trackingNumber !== selected.trackingNumber ||
        fulfillmentDraft.internalNote !== selected.internalNote),
  );
  const canChangeTo = (status: OrderStatus) => Boolean(selected && ORDER_TRANSITIONS[selected.orderStatus].has(status));
  const availablePaymentOptions = selected
    ? PAYMENT_STATUS_OPTIONS.filter((paymentStatus) => paymentChangeAllowed(selected, paymentStatus))
    : [];

  const loadEvents = useCallback(async (orderId: string, page = 1) => {
    if (!orderId) {
      eventRequestRevision.current += 1;
      setEvents([]);
      setEventPagination(EMPTY_PAGINATION);
      setEventError("");
      setEventsLoading(false);
      return;
    }
    const requestRevision = ++eventRequestRevision.current;
    setEvents([]);
    setEventPagination({ ...EMPTY_PAGINATION, page });
    setEventsLoading(true);
    setEventError("");
    try {
      const params = new URLSearchParams({ site: SITE_CODE, page: String(page), limit: String(HISTORY_LIMIT) });
      const payload = await adminFetch<{ events?: OrderEvent[]; pagination?: AdminPagination }>(
        adminOrderEventsPath(orderId, params),
      );
      if (eventRequestRevision.current !== requestRevision) return;
      setEvents(payload.events || []);
      setEventPagination(payload.pagination || EMPTY_PAGINATION);
    } catch (cause) {
      if (eventRequestRevision.current === requestRevision) {
        setEventError(cause instanceof Error ? cause.message : "訂單時間軸讀取失敗");
      }
    } finally {
      if (eventRequestRevision.current === requestRevision) setEventsLoading(false);
    }
  }, []);

  const load = useCallback(
    async (preferredId?: string, requestedPage = 1) => {
      const requestRevision = ++orderRequestRevision.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          site: SITE_CODE,
          page: String(requestedPage),
          limit: String(ORDER_LIST_LIMIT),
        });
        if (searchQuery.trim()) params.set("q", searchQuery.trim());
        if (orderStatusFilter) params.set("orderStatus", orderStatusFilter);
        if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
        const payload = await adminFetch<{ orders?: Order[]; pagination?: AdminPagination }>(
          adminOrdersPath(SITE_CODE, params),
        );
        if (orderRequestRevision.current !== requestRevision) return;
        const next = payload.orders || [];
        setOrders(next);
        setOrderPagination(
          payload.pagination || { ...EMPTY_PAGINATION, limit: ORDER_LIST_LIMIT, maxLimit: ORDER_LIST_LIMIT },
        );
        const nextSelectedId =
          preferredId && next.some((order) => order.id === preferredId) ? preferredId : next[0]?.id || "";
        setSelectedId(nextSelectedId);
        setFulfillmentDraft(fulfillmentDraftFromOrder(next.find((order) => order.id === nextSelectedId) || null));
      } catch (cause) {
        if (orderRequestRevision.current === requestRevision) {
          setError(cause instanceof Error ? cause.message : "訂單讀取失敗");
        }
      } finally {
        if (orderRequestRevision.current === requestRevision) setLoading(false);
      }
    },
    [orderStatusFilter, paymentStatusFilter, searchQuery],
  );

  useEffect(() => {
    if (lastAutoLoadedFilterKey.current === orderFilterKey) return;
    if (updating) return;
    const timer = window.setTimeout(() => {
      lastAutoLoadedFilterKey.current = orderFilterKey;
      void load(undefined, 1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, orderFilterKey, updating]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadEvents(selected?.id || "", 1), 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents, selected?.id]);

  const selectOrder = (orderId: string) => {
    if (orderId === selected?.id) return;
    if (fulfillmentDirty && !window.confirm("履約資料尚未儲存，切換訂單會放棄這些修改，確定繼續嗎？")) return;
    setFulfillmentDraft(fulfillmentDraftFromOrder(orders.find((order) => order.id === orderId) || null));
    setSelectedId(orderId);
  };

  const changeStatus = async (status: OrderStatus) => {
    if (!selected || fulfillmentDirty) return;
    if (status === "completed" && !window.confirm("標記完成會正式扣除這張訂單保留的庫存，確定繼續嗎？")) return;
    if (
      status === "cancelled" &&
      !window.confirm("取消訂單會釋放這張訂單保留的庫存，而且取消後不可重新開啟，確定繼續嗎？")
    )
      return;
    setUpdating(true);
    setError("");
    setNotice("");
    try {
      const payload = await adminFetch<{ order?: Order }>(adminOrderPath(selected.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          orderStatus: status,
          ...(status === "cancelled" && selected.paymentStatus === "paid" ? { paymentStatus: "refunded" } : {}),
        }),
      });
      if (!payload.order) throw new Error("訂單狀態更新失敗");
      setNotice(`訂單已更新為「${statusLabel(status)}」`);
      await Promise.all([load(selected.id, orderPagination.page), loadEvents(selected.id, 1)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "訂單狀態更新失敗");
    } finally {
      setUpdating(false);
    }
  };

  const changePayment = async (paymentStatus: PaymentStatus) => {
    if (!selected || fulfillmentDirty || paymentStatus === selected.paymentStatus) return;
    if (
      (paymentStatus === "paid" || paymentStatus === "refunded") &&
      !window.confirm(`確定要把付款狀態改為「${statusLabel(paymentStatus)}」嗎？`)
    )
      return;
    setUpdating(true);
    setError("");
    setNotice("");
    try {
      const payload = await adminFetch<{ order?: Order }>(adminOrderPath(selected.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          paymentStatus,
          ...(paymentStatus === "refunded" && selected.orderStatus !== "completed"
            ? { orderStatus: "cancelled" }
            : {}),
        }),
      });
      if (!payload.order) throw new Error("付款狀態更新失敗");
      setNotice(`付款狀態已更新為「${statusLabel(paymentStatus)}」`);
      await Promise.all([load(selected.id, orderPagination.page), loadEvents(selected.id, 1)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "付款狀態更新失敗");
    } finally {
      setUpdating(false);
    }
  };

  const saveFulfillment = async () => {
    if (!selected) return;
    const shippingFeeText = fulfillmentDraft.shippingFee.trim();
    if (shippingFeeText && !/^\d+$/.test(shippingFeeText)) {
      setError("運費請輸入 0 以上的整數；尚未確認時請留白。");
      setNotice("");
      return;
    }
    const shippingFee = shippingFeeText ? Number(shippingFeeText) : null;
    if (shippingFee !== null && (!Number.isSafeInteger(shippingFee) || shippingFee > MAX_SHIPPING_FEE)) {
      setError(`運費不可超過 ${MAX_SHIPPING_FEE.toLocaleString("zh-TW")} 元。`);
      setNotice("");
      return;
    }
    if (
      fulfillmentDraft.carrier.length > MAX_CARRIER_LENGTH ||
      fulfillmentDraft.trackingNumber.length > MAX_TRACKING_NUMBER_LENGTH ||
      fulfillmentDraft.internalNote.length > MAX_INTERNAL_NOTE_LENGTH
    ) {
      setError("履約資料超過欄位字數限制，請縮短後再儲存。");
      setNotice("");
      return;
    }

    setUpdating(true);
    setError("");
    setNotice("");
    try {
      const payload = await adminFetch<{ order?: Order }>(adminOrderPath(selected.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteCode: SITE_CODE,
          shippingFee,
          carrier: fulfillmentDraft.carrier,
          trackingNumber: fulfillmentDraft.trackingNumber,
          internalNote: fulfillmentDraft.internalNote,
        }),
      });
      if (!payload.order) throw new Error("履約資料儲存失敗");
      setOrders((current) => current.map((order) => (order.id === payload.order?.id ? payload.order : order)));
      setFulfillmentDraft(fulfillmentDraftFromOrder(payload.order));
      setNotice("履約資料已儲存；客戶備註未變更。");
      await loadEvents(selected.id, 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "履約資料儲存失敗");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <AdminTopbar active="orders">
      <div className={styles.workspace}>
        <OrderList
          orders={orders}
          selectedId={selected?.id}
          loading={loading}
          updating={updating}
          fulfillmentDirty={fulfillmentDirty}
          searchQuery={searchQuery}
          orderStatusFilter={orderStatusFilter}
          paymentStatusFilter={paymentStatusFilter}
          orderPagination={orderPagination}
          onSearchChange={setSearchQuery}
          onOrderStatusFilterChange={setOrderStatusFilter}
          onPaymentStatusFilterChange={setPaymentStatusFilter}
          onSelect={selectOrder}
          onRefresh={() => void load(selected?.id, orderPagination.page)}
          onPage={(page) => void load(undefined, page)}
        />
        <section className={styles.mainPane}>
          <AdminActionBar
            status={
              <AdminStatus
                tone={
                  !selected
                    ? "neutral"
                    : selected.orderStatus === "completed"
                      ? "success"
                      : selected.orderStatus === "cancelled"
                        ? "danger"
                        : selected.orderStatus === "new"
                          ? "warning"
                          : "neutral"
                }
              >
                {selected ? statusLabel(selected.orderStatus) : "尚無訂單"}
              </AdminStatus>
            }
            title={selected?.orderNumber || "訂單管理"}
            detail={selected ? dateTime(selected.createdAt) : "完成第一筆本機測試訂單後會顯示於此"}
          >
            {selected && (
              <>
                <AdminButton
                  type="button"
                  onClick={() => void changeStatus("confirmed")}
                  disabled={updating || loading || fulfillmentDirty || !canChangeTo("confirmed")}
                >
                  確認訂單
                </AdminButton>
                <AdminButton
                  type="button"
                  onClick={() => void changeStatus("processing")}
                  disabled={updating || loading || fulfillmentDirty || !canChangeTo("processing")}
                >
                  開始處理
                </AdminButton>
                <AdminButton
                  type="button"
                  onClick={() => void changeStatus("shipped")}
                  disabled={updating || loading || fulfillmentDirty || !canChangeTo("shipped")}
                >
                  標記出貨
                </AdminButton>
                <AdminButton
                  type="button"
                  variant="primary"
                  onClick={() => void changeStatus("completed")}
                  disabled={updating || loading || fulfillmentDirty || !canChangeTo("completed")}
                >
                  標記完成
                </AdminButton>
                <AdminButton
                  type="button"
                  variant="danger"
                  onClick={() => void changeStatus("cancelled")}
                  disabled={updating || loading || fulfillmentDirty || !canChangeTo("cancelled")}
                >
                  取消
                </AdminButton>
              </>
            )}
          </AdminActionBar>
          {(error || notice) && (
            <div
              className={`${styles.banner} ${error ? styles.bannerError : styles.bannerNotice}`}
              role="status"
            >
              {error || notice}
            </div>
          )}
          {!selected ? (
            <div className={styles.emptyState}>
              <span>◇</span>
              <h2>{hasOrderFilters ? "沒有符合條件的訂單" : "目前還沒有訂單"}</h2>
              <p>
                {hasOrderFilters
                  ? "請調整搜尋字詞或狀態篩選。"
                  : "前台送出的訂單會保存在本機資料庫。"}
              </p>
            </div>
          ) : (
            <OrderDetail
              selected={selected}
              fulfillmentDraft={fulfillmentDraft}
              fulfillmentDirty={fulfillmentDirty}
              availablePaymentOptions={availablePaymentOptions}
              updating={updating}
              loading={loading}
              events={events}
              eventPagination={eventPagination}
              eventsLoading={eventsLoading}
              eventError={eventError}
              onFulfillmentChange={(patch) =>
                setFulfillmentDraft((draft) => ({ ...draft, ...patch }))
              }
              onPaymentChange={(paymentStatus) => void changePayment(paymentStatus)}
              onSaveFulfillment={() => void saveFulfillment()}
              onReloadEvents={() => void loadEvents(selected.id, eventPagination.page)}
              onEventsPage={(page) => void loadEvents(selected.id, page)}
            />
          )}
        </section>
      </div>
    </AdminTopbar>
  );
}
