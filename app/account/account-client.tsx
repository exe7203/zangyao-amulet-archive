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
import { LOCAL_DEMO_OTP_CODE } from "../member/local-demo-gateway";
import { memberGateway } from "../member/member-gateway";
import type {
  AuthCapabilities,
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

const DISABLED_CAPABILITIES: AuthCapabilities = {
  enabled: false,
  line: false,
  emailOtp: false,
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

type ProfileIssue = {
  field: "contactName" | "phone" | "email" | "address";
  message: string;
};

type EmailChallenge = {
  challengeId: string;
  maskedDestination: string;
  expiresAt: string;
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

function validateProfile(profile: DeviceCheckoutProfile): ProfileIssue | null {
  if (profile.contactName.trim().length < 2) return { field: "contactName", message: "請填寫至少 2 個字的姓名。" };
  if (!/^[0-9+()\-\s]{8,20}$/.test(profile.phone.trim())) return { field: "phone", message: "請填寫可聯絡的電話號碼。" };
  if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) return { field: "email", message: "電子郵件格式不正確。" };
  if (profile.deliveryMethod === "home_delivery" && profile.address.trim().length < 8) return { field: "address", message: "宅配請填寫完整地址。" };
  return null;
}

function isLocalHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}

export default function AccountClient() {
  const [profile, setProfile] = useState<DeviceCheckoutProfile>(EMPTY_PROFILE);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [orders, setOrders] = useState<DeviceOrderReference[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [profileIssue, setProfileIssue] = useState<ProfileIssue | null>(null);
  const [confirmProfileClear, setConfirmProfileClear] = useState(false);
  const [confirmOrderClear, setConfirmOrderClear] = useState(false);
  const [session, setSession] = useState<MemberSessionState>({ status: "checking" });
  const [capabilities, setCapabilities] = useState<AuthCapabilities>(DISABLED_CAPABILITIES);
  const [isLocalDemo, setIsLocalDemo] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challenge, setChallenge] = useState<EmailChallenge | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

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
    const sync = (event: StorageEvent) => {
      if ([DEVICE_PROFILE_STORAGE_KEY, DEVICE_ORDER_STORAGE_KEY, CART_STORAGE_KEY].includes(event.key ?? "")) {
        loadDeviceData();
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadMemberSession = async () => {
      try {
        const localDemo = isLocalHostname(window.location.hostname);
        const [nextCapabilities, nextSession] = await Promise.all([
          memberGateway.getCapabilities(controller.signal),
          memberGateway.getSession(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setIsLocalDemo(localDemo);
        setCapabilities(nextCapabilities);
        setSession(nextSession);
      } catch {
        if (!controller.signal.aborted) {
          setCapabilities(DISABLED_CAPABILITIES);
          setSession({ status: "unavailable", reason: "offline", providers: [] });
        }
      }
    };
    void loadMemberSession();
    return () => controller.abort();
  }, []);

  const orderItemCount = useMemo(
    () => orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
    [orders],
  );

  const memberName = session.status === "authenticated"
    ? session.member.displayName
    : "會員";
  const memberEmail = session.status === "authenticated"
    ? session.member.email
    : null;
  const signedIn = session.status === "authenticated";

  const updateField = <Key extends keyof DeviceCheckoutProfile>(key: Key, value: DeviceCheckoutProfile[Key]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    if (profileIssue?.field === key) setProfileIssue(null);
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    const issue = validateProfile(profile);
    if (issue) {
      setProfileIssue(issue);
      window.setTimeout(() => document.getElementById(`member-${issue.field}`)?.focus(), 0);
      return;
    }
    const normalized = normalizeDeviceProfile(profile);
    if (!normalized || !saveDeviceProfile(window.localStorage, normalized, true)) {
      setFeedback("目前無法儲存資料，請檢查瀏覽器的隱私或儲存設定。");
      return;
    }
    setProfile(normalized);
    setHasSavedProfile(true);
    setProfileIssue(null);
    setFeedback("資料已儲存，下次結帳會自動帶入。");
  };

  const removeProfile = () => {
    clearDeviceProfile(window.localStorage);
    setProfile(EMPTY_PROFILE);
    setHasSavedProfile(false);
    setConfirmProfileClear(false);
    setFeedback("常用收件資料已清除。");
  };

  const removeOrders = () => {
    clearDeviceOrders(window.localStorage);
    setOrders([]);
    setConfirmOrderClear(false);
    setFeedback("本機測試訂單紀錄已清除。");
  };

  const requestEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthMessage("");
    const email = authEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthMessage("請輸入正確的電子郵件格式。");
      return;
    }
    if (!capabilities.emailOtp) {
      setAuthMessage("電子郵件登入目前尚未開放。");
      return;
    }
    setAuthBusy(true);
    try {
      const result = await memberGateway.requestEmailOtp(email);
      setChallenge({
        challengeId: result.challengeId,
        maskedDestination: result.maskedDestination,
        expiresAt: result.expiresAt,
      });
      setOtpCode("");
      setAuthMessage(isLocalDemo
        ? `本機測試驗證碼為 ${LOCAL_DEMO_OTP_CODE}，有效時間 10 分鐘。`
        : `驗證碼已寄送至 ${result.maskedDestination}。`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "目前無法寄送驗證碼，請稍後再試。");
    } finally {
      setAuthBusy(false);
    }
  };

  const verifyEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const nextSession = await memberGateway.verifyEmailOtp(challenge.challengeId, otpCode.trim());
      if (nextSession.status !== "authenticated") {
        setAuthMessage("驗證碼不正確或已失效，請重新取得驗證碼。");
        return;
      }
      setSession(nextSession);
      setChallenge(null);
      setOtpCode("");
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "驗證失敗，請稍後再試。");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthBusy(true);
    try {
      await memberGateway.signOut();
      setSession({ status: "anonymous" });
      setChallenge(null);
      setOtpCode("");
      setAuthMessage("已登出會員中心。");
    } finally {
      setAuthBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <main className={styles.page} id="main-content">
        <div className={styles.localNotice} role="note">
          <b>本機測試模式</b>
          <p>會員登入、驗證碼與訂單資料僅保存在這台電腦的瀏覽器中，請勿輸入真實個資。</p>
        </div>
        <section className={styles.hero}>
          <div><p>會員服務</p><h1>會員中心</h1><span>登入後可查看訂單進度、管理個人資料與常用收件資訊。</span></div>
          <aside><b>訂單與收件資料集中管理</b><p>登入後即可查看訂單並管理常用收件資料。</p></aside>
        </section>

        <section className={styles.loginSection} aria-busy={session.status === "checking" || authBusy}>
          <div className={styles.loginCard}>
            <p className={styles.eyebrow}>會員登入</p>
            <h2>會員登入</h2>
            <p className={styles.loginLead}>歡迎回來。登入後即可查看訂單並管理收件資料。</p>

            <button className={styles.lineButton} type="button" disabled={!capabilities.line || authBusy} onClick={() => memberGateway.startLineLogin("/account/")}>
              <span aria-hidden="true">LINE</span>使用 LINE 登入
            </button>

            <div className={styles.divider}><span>或使用電子郵件驗證碼</span></div>

            {!challenge ? <form className={styles.authForm} onSubmit={requestEmailCode}>
              <label htmlFor="member-login-email">電子郵件</label>
              <input
                id="member-login-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="name@example.com"
                disabled={!capabilities.emailOtp || authBusy}
                required
              />
              <button className={styles.primary} type="submit" disabled={!capabilities.emailOtp || authBusy}>{authBusy ? "處理中…" : "寄送驗證碼"}</button>
            </form> : <form className={styles.authForm} onSubmit={verifyEmailCode}>
              <div className={styles.challengeHeading}><span>驗證碼已送出</span><button type="button" onClick={() => { setChallenge(null); setOtpCode(""); setAuthMessage(""); }}>更換電子郵件</button></div>
              <small>請輸入寄送至 {challenge.maskedDestination} 的 6 位數驗證碼。</small>
              <label htmlFor="member-login-code">驗證碼</label>
              <input
                id="member-login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                disabled={authBusy}
                required
              />
              <button className={styles.primary} type="submit" disabled={authBusy || otpCode.length !== 6}>{authBusy ? "驗證中…" : "登入會員中心"}</button>
            </form>}

            {authMessage && <p className={styles.authMessage} role="status">{authMessage}</p>}

            {session.status === "checking" && <p className={styles.checkingState} role="status">正在確認登入狀態…</p>}
            {session.status === "error" && !authMessage && <p className={styles.authMessage} role="alert">{session.message}</p>}

            {(session.status === "unavailable" || !capabilities.enabled) && session.status !== "checking" && !isLocalDemo && <div className={styles.serviceNotice}>
              <b>會員功能準備中</b>
              <p>目前尚未開放登入，你仍可直接瀏覽商品與使用購物車。</p>
            </div>}

            {isLocalDemo && <div className={styles.demoNotice}>
              <b>本機測試模式</b>
              <p>請使用測試用電子郵件操作登入流程，不要輸入真實個資；測試帳號不會跨裝置同步。</p>
            </div>}

            {capabilities.enabled && <p className={styles.signUpNote}>第一次登入將自動建立會員帳號。登入即表示你已閱讀<Link href="/service/privacy/">隱私權政策</Link>。</p>}
          </div>

          <aside className={styles.memberBenefits}>
            <p className={styles.eyebrow}>會員功能</p>
            <h2>會員服務</h2>
            <ol>
              <li><span>01</span><div><b>訂單查詢</b><p>集中查看訂單進度與購買紀錄。</p></div></li>
              <li><span>02</span><div><b>快速結帳</b><p>管理常用收件資料，減少重複填寫。</p></div></li>
              <li><span>03</span><div><b>資料管理</b><p>隨時更新個人資料與常用收件資訊。</p></div></li>
            </ol>
            <Link href="/#new">查看最新商品 →</Link>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} id="main-content">
      <section className={`${styles.hero} ${styles.memberHero}`}>
        <div><p>會員服務</p><h1>會員中心</h1><span>您好，{memberName}。在這裡查看訂單、更新個人資料與管理常用收件資訊。</span></div>
        <aside><b>歡迎回來</b><p>{memberEmail ? `目前登入帳號：${memberEmail}` : "你的會員資料與購物紀錄會集中顯示在這裡。"}</p></aside>
      </section>

      {isLocalDemo && <div className={styles.previewBar}>本機會員流程測試中｜帳號與資料不會跨裝置同步，請勿輸入真實個資。</div>}

      <section className={styles.summary} aria-label="會員摘要">
        <div><span>01</span><b>{ready ? (hasSavedProfile ? "已完成" : "待補充") : "讀取中"}</b><small>個人與收件資料</small></div>
        <div><span>02</span><b>{ready ? `${cartCount} 件` : "—"}</b><small>購物車商品</small></div>
        <div><span>03</span><b>{ready ? `${orders.length} 筆` : "—"}</b><small>訂單紀錄・共 {orderItemCount} 件</small></div>
      </section>

      <div className={styles.memberLayout} id="member-overview">
        <aside className={styles.accountNav}>
          <p className={styles.eyebrow}>會員選單</p>
          <h2>帳戶選單</h2>
          <nav aria-label="會員中心選單">
            <a href="#member-overview" aria-current="page">會員首頁<span>→</span></a>
            <a href="#profile">個人資料<span>→</span></a>
            <a href="#profile">常用收件資料<span>→</span></a>
            <a href="#orders">我的訂單<span>→</span></a>
            <Link href="/?cart=open">購物車<span>→</span></Link>
          </nav>
          <button type="button" onClick={signOut} disabled={authBusy}>{authBusy ? "處理中…" : "登出"}</button>
        </aside>

        <section className={styles.panel} id="profile">
          <div className={styles.panelHeading}><div><p>基本資料</p><h2>個人資料</h2></div><span>{hasSavedProfile ? "已儲存" : "尚未完成"}</span></div>
          <p className={styles.lead}>更新聯絡方式與常用收件資訊，結帳時可自動帶入。</p>
          <form className={styles.form} onSubmit={saveProfile} noValidate>
            <fieldset>
              <legend>基本資料</legend>
              <div className={styles.fieldGrid}>
                <label><span>姓名 *</span><input id="member-contactName" autoComplete="name" value={profile.contactName} onChange={(event) => updateField("contactName", event.target.value)} maxLength={80} aria-invalid={profileIssue?.field === "contactName"} aria-describedby={profileIssue?.field === "contactName" ? "member-profile-error" : undefined} required /></label>
                <label><span>手機號碼 *</span><input id="member-phone" type="tel" inputMode="tel" autoComplete="tel" value={profile.phone} onChange={(event) => updateField("phone", event.target.value)} maxLength={20} aria-invalid={profileIssue?.field === "phone"} aria-describedby={profileIssue?.field === "phone" ? "member-profile-error" : undefined} required /></label>
                <label><span>電子郵件</span><input id="member-email" type="email" autoComplete="email" value={profile.email} onChange={(event) => updateField("email", event.target.value)} maxLength={254} aria-invalid={profileIssue?.field === "email"} aria-describedby={profileIssue?.field === "email" ? "member-profile-error" : undefined} /></label>
                <label><span>LINE 聯絡 ID（選填）</span><input id="member-lineId" value={profile.lineId} onChange={(event) => updateField("lineId", event.target.value)} maxLength={80} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>常用收件資料</legend>
              <div className={styles.fieldGrid}>
                <label><span>預設配送方式</span><select value={profile.deliveryMethod} onChange={(event) => updateField("deliveryMethod", event.target.value as DeliveryMethod)}>{Object.entries(DELIVERY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className={styles.wide}><span>{profile.deliveryMethod === "home_delivery" ? "收件地址 *" : "門市／面交偏好"}</span><input id="member-address" autoComplete="street-address" value={profile.address} onChange={(event) => updateField("address", event.target.value)} maxLength={300} aria-invalid={profileIssue?.field === "address"} aria-describedby={profileIssue?.field === "address" ? "member-profile-error" : undefined} required={profile.deliveryMethod === "home_delivery"} /></label>
              </div>
            </fieldset>

            {profileIssue && <p className={styles.formError} id="member-profile-error" role="alert">{profileIssue.message}</p>}
            <p className={styles.storageNote}>{isLocalDemo ? "本機測試資料只會保存在目前瀏覽器，請勿輸入真實個資。" : "收件資料會用於結帳預填；請勿在公用電腦儲存。"}</p>
            <div className={styles.actions}>
              <button className={styles.primary} type="submit">儲存資料</button>
              {hasSavedProfile && !confirmProfileClear && <button className={styles.secondary} type="button" onClick={() => setConfirmProfileClear(true)}>清除收件資料</button>}
            </div>
            {confirmProfileClear && <div className={styles.confirmBar} role="group" aria-label="確認清除收件資料"><span>確定要清除已儲存的收件資料嗎？</span><button className={styles.danger} type="button" onClick={removeProfile}>確認清除</button><button className={styles.secondary} type="button" onClick={() => setConfirmProfileClear(false)}>取消</button></div>}
          </form>
        </section>
      </div>

      <section className={styles.orders} id="orders">
        <div className={styles.panelHeading}>
          <div><p>訂單紀錄</p><h2>我的訂單</h2></div>
          {orders.length > 0 && isLocalDemo && !confirmOrderClear && <button type="button" onClick={() => setConfirmOrderClear(true)}>清除測試紀錄</button>}
        </div>
        <p className={styles.lead}>{isLocalDemo ? "以下是這台電腦在測試流程中建立的訂單紀錄。" : "查看帳號名下的訂單與目前處理進度。"}</p>
        {confirmOrderClear && <div className={styles.confirmBar} role="group" aria-label="確認清除測試訂單紀錄"><span>只會清除瀏覽器中的測試紀錄，不會刪除站主端訂單。</span><button className={styles.danger} type="button" onClick={removeOrders}>確認清除</button><button className={styles.secondary} type="button" onClick={() => setConfirmOrderClear(false)}>取消</button></div>}
        {orders.length === 0 ? <div className={styles.empty}><span>◇</span><h3>目前沒有訂單</h3><p>完成下單後，訂單紀錄會顯示在這裡。</p><Link href="/#new">瀏覽最新商品 →</Link></div> : <div className={styles.orderList}>{orders.map((order) => <article key={order.orderNumber}><header><div><small>{formatDate(order.createdAt)}</small><h3>{order.orderNumber}</h3></div><span>{STATUS_LABELS[order.status] ?? order.status}</span></header><ul>{order.items.map((item, index) => <li key={`${order.orderNumber}-${index}`}><span>{item.name}</span><b>× {item.quantity}</b></li>)}</ul><footer><small>訂單金額</small><b>{formatPrice(order.total)}</b></footer></article>)}</div>}
      </section>

      {feedback && <div className={styles.toast} role="status">{feedback}</div>}
    </main>
  );
}
