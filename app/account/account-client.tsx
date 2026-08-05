"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CART_STORAGE_KEY, parseCartStorage } from "../cart";
import { formatPrice, products } from "../data";
import {
  DEVICE_ORDER_STORAGE_KEY,
  DEVICE_PROFILE_STORAGE_KEY,
  clearDeviceOrders,
  clearDeviceProfile,
  normalizeDeviceProfile,
  readDeviceOrders,
  readDeviceProfile,
  saveDeviceProfile,
} from "../member/device-storage";
import { memberGateway } from "../member/member-gateway";
import type {
  DeliveryMethod,
  DeviceCheckoutProfile,
  DeviceOrderReference,
  MemberSessionState,
} from "../../shared/member-contract";
import styles from "./account.module.css";

const EMPTY_PROFILE: DeviceCheckoutProfile = {
  contactName: "",
  phone: "",
  email: "",
  lineId: "",
  deliveryMethod: "home_delivery",
  address: "",
};

const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  home_delivery: "台灣本島宅配",
  convenience_store: "超商取貨",
  appointment: "預約面交",
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_confirmation: "待店家確認",
  new: "待店家確認",
  awaiting_payment: "待付款",
  paid: "已付款",
  preparing: "準備中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  expired: "已逾期",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fieldError(profile: DeviceCheckoutProfile) {
  if (profile.contactName.trim().length < 2) return "請填寫至少 2 個字的收件人姓名。";
  if (!/^[0-9+()\-\s]{8,20}$/.test(profile.phone.trim())) return "請填寫可聯絡的電話號碼。";
  if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) return "電子郵件格式不正確。";
  if (profile.deliveryMethod === "home_delivery" && profile.address.trim().length < 8) return "宅配請填寫完整地址。";
  return "";
}

export default function AccountClient() {
  const [profile, setProfile] = useState<DeviceCheckoutProfile>(EMPTY_PROFILE);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [orders, setOrders] = useState<DeviceOrderReference[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [session, setSession] = useState<MemberSessionState>({ status: "checking" });

  useEffect(() => {
    const loadDeviceData = () => {
      const storedProfile = readDeviceProfile(window.localStorage);
      setProfile(storedProfile ?? EMPTY_PROFILE);
      setHasSavedProfile(Boolean(storedProfile));
      setOrders(readDeviceOrders(window.localStorage));
      const cart = parseCartStorage(
        window.localStorage.getItem(CART_STORAGE_KEY),
        products,
        { preserveUnknown: true },
      );
      setCartCount(cart.reduce((sum, item) => sum + item.quantity, 0));
      setReady(true);
    };
    loadDeviceData();
    void memberGateway.getSession().then(setSession).catch(() => {
      setSession({ status: "unavailable", reason: "offline", providers: [] });
    });
    const sync = (event: StorageEvent) => {
      if ([DEVICE_PROFILE_STORAGE_KEY, DEVICE_ORDER_STORAGE_KEY, CART_STORAGE_KEY].includes(event.key ?? "")) {
        loadDeviceData();
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const orderItemCount = useMemo(
    () => orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
    [orders],
  );

  const updateField = <Key extends keyof DeviceCheckoutProfile>(key: Key, value: DeviceCheckoutProfile[Key]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    const error = fieldError(profile);
    if (error) {
      setFeedback(error);
      return;
    }
    const normalized = normalizeDeviceProfile(profile);
    if (!normalized || !saveDeviceProfile(window.localStorage, normalized, true)) {
      setFeedback("瀏覽器目前無法保存資料，請檢查隱私或儲存設定。");
      return;
    }
    setProfile(normalized);
    setHasSavedProfile(true);
    setFeedback("已保存於這台裝置；下次結帳可直接帶入。");
  };

  const removeProfile = () => {
    clearDeviceProfile(window.localStorage);
    setProfile(EMPTY_PROFILE);
    setHasSavedProfile(false);
    setFeedback("已清除這台裝置保存的聯絡與配送資料。");
  };

  const removeOrders = () => {
    clearDeviceOrders(window.localStorage);
    setOrders([]);
    setFeedback("已清除此裝置的送單索引；站主端訂單不受影響。");
  };

  return (
    <main className={styles.page} id="main-content">
      <section className={styles.hero}>
        <div><p>DEVICE CUSTOMER CENTRE</p><h1>你的收藏資料，<br />先留在這台裝置。</h1></div>
        <aside><b>此裝置預備版</b><p>這不是正式登入帳號。資料不會跨裝置同步，也沒有把密碼、OTP 或 LINE 登入憑證存進瀏覽器。</p></aside>
      </section>

      <section className={styles.summary} aria-label="此裝置摘要">
        <div><span>01</span><b>{ready ? (hasSavedProfile ? "已保存" : "未保存") : "讀取中"}</b><small>結帳資料</small></div>
        <div><span>02</span><b>{ready ? `${cartCount} 件` : "—"}</b><small>此裝置收藏袋</small></div>
        <div><span>03</span><b>{ready ? `${orders.length} 筆` : "—"}</b><small>送單紀錄・共 {orderItemCount} 件</small></div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><p>CHECKOUT PROFILE</p><h2>常用結帳資料</h2></div><span>只存在瀏覽器</span></div>
          <p className={styles.lead}>儲存後，這台裝置下次建立保留單時會自動帶入。共用電腦請不要保存，使用完也可隨時清除。</p>
          <form className={styles.form} onSubmit={saveProfile}>
            <label><span>收件人姓名 *</span><input autoComplete="name" value={profile.contactName} onChange={(event) => updateField("contactName", event.target.value)} maxLength={80} required /></label>
            <label><span>聯絡電話 *</span><input type="tel" inputMode="tel" autoComplete="tel" value={profile.phone} onChange={(event) => updateField("phone", event.target.value)} maxLength={20} required /></label>
            <label><span>電子郵件</span><input type="email" autoComplete="email" value={profile.email} onChange={(event) => updateField("email", event.target.value)} maxLength={254} /></label>
            <label><span>LINE 聯絡 ID</span><input value={profile.lineId} onChange={(event) => updateField("lineId", event.target.value)} maxLength={80} /><small>僅供店家聯絡，不是 LINE Login 身份。</small></label>
            <label className={styles.wide}><span>預設配送方式</span><select value={profile.deliveryMethod} onChange={(event) => updateField("deliveryMethod", event.target.value as DeliveryMethod)}>{Object.entries(DELIVERY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className={styles.wide}><span>{profile.deliveryMethod === "home_delivery" ? "收件地址 *" : "門市／面交偏好"}</span><input autoComplete="street-address" value={profile.address} onChange={(event) => updateField("address", event.target.value)} maxLength={300} required={profile.deliveryMethod === "home_delivery"} /></label>
            <div className={styles.actions}><button className={styles.primary} type="submit">保存於此裝置</button>{hasSavedProfile && <button className={styles.secondary} type="button" onClick={removeProfile}>清除已保存資料</button>}</div>
          </form>
        </section>

        <aside className={styles.sidePanel}>
          <p>MEMBER SIGN-IN</p><h2>正式會員登入</h2>
          <div className={styles.authState}><span aria-hidden="true">○</span><div><b>{session.status === "checking" ? "正在確認服務" : "尚未連接"}</b><small>LINE Login 與 Email 單次驗證碼需等正式驗證服務、資料庫與部署完成後啟用。</small></div></div>
          <ul><li>會員身份由伺服器驗證</li><li>跨裝置同步購物車</li><li>只查看自己的即時訂單</li></ul>
          <p className={styles.authNote}>目前不顯示不能運作的登入按鈕，也不以手動填寫的 LINE ID 冒充會員身份。</p>
        </aside>
      </div>

      <section className={styles.orders}>
        <div className={styles.panelHeading}><div><p>DEVICE ORDER INDEX</p><h2>此裝置送單紀錄</h2></div>{orders.length > 0 && <button type="button" onClick={removeOrders}>清除索引</button>}</div>
        <p className={styles.lead}>只保存訂單編號、金額與商品摘要，不保存地址或備註。這是送出當下的本機快照，不是即時物流或付款狀態。</p>
        {orders.length === 0 ? <div className={styles.empty}><span>◇</span><h3>還沒有本機送單紀錄</h3><p>成功建立保留單後，訂單索引會顯示在這裡。</p><Link href="/#new">瀏覽本週新藏 →</Link></div> : <div className={styles.orderList}>{orders.map((order) => <article key={order.orderNumber}><header><div><small>{formatDate(order.createdAt)}</small><h3>{order.orderNumber}</h3></div><span>{STATUS_LABELS[order.status] ?? order.status}</span></header><ul>{order.items.map((item, index) => <li key={`${order.orderNumber}-${index}`}><span>{item.name}</span><b>× {item.quantity}</b></li>)}</ul><footer><small>送出時小計</small><b>{formatPrice(order.total)}</b></footer></article>)}</div>}
      </section>

      {feedback && <div className={styles.toast} role="status">{feedback}</div>}
    </main>
  );
}
