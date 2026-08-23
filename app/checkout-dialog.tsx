"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { publishedBrandName, publishedSiteAppearance } from "../shared/published-site";
import type { DeliveryMethod, DeviceCheckoutProfile } from "../shared/member-contract";
import { PUBLIC_SITE_CODE } from "../shared/site-context";
import type { CartLine } from "./cart";
import { formatPrice } from "./data";

export type CheckoutResult = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  currency?: "TWD";
  createdAt?: string;
  reservedUntil?: string | null;
};

export type CheckoutIdempotencyAttempt = {
  fingerprint: string;
  key: string;
};

export function resolveCheckoutIdempotencyAttempt(
  current: CheckoutIdempotencyAttempt | null,
  fingerprint: string,
  createKey: () => string = () => crypto.randomUUID(),
): CheckoutIdempotencyAttempt {
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, key: createKey() };
}

type CheckoutDialogProps = {
  lines: CartLine[];
  open: boolean;
  subtotal: number;
  testingMode?: boolean;
  initialProfile?: DeviceCheckoutProfile | null;
  onClose(): void;
  onCompleted(order: CheckoutResult, profile: DeviceCheckoutProfile, rememberProfile: boolean): void;
};

const DELIVERY_LABELS = {
  home_delivery: "台灣本島宅配",
  convenience_store: "超商取貨（門市稍後確認）",
  appointment: "預約面交",
} as const;

export default function CheckoutDialog({
  lines,
  open,
  subtotal,
  testingMode = false,
  initialProfile,
  onClose,
  onCompleted,
}: CheckoutDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [lineId, setLineId] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("home_delivery");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [rememberProfile, setRememberProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const idempotencyAttemptRef = useRef<CheckoutIdempotencyAttempt | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose, open, submitting]);

  useEffect(() => {
    if (!open || !initialProfile) return;
    const timer = window.setTimeout(() => {
      setName((current) => current || initialProfile.contactName);
      setPhone((current) => current || initialProfile.phone);
      setEmail((current) => current || initialProfile.email);
      setLineId((current) => current || initialProfile.lineId);
      setAddress((current) => current || initialProfile.address);
      setDeliveryMethod(initialProfile.deliveryMethod);
      setRememberProfile(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialProfile, open]);

  if (!open) return null;

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (lines.length === 0) {
      setError("購物車目前沒有商品，請先選擇商品。");
      return;
    }
    if (name.trim().length < 2) {
      setError("請填寫收件人姓名。");
      return;
    }
    if (!/^[0-9+()\-\s]{8,20}$/.test(phone.trim())) {
      setError("請填寫可聯絡的電話號碼。");
      return;
    }
    if (deliveryMethod === "home_delivery" && address.trim().length < 8) {
      setError("宅配訂單請填寫完整收件地址。");
      return;
    }
    const profile: DeviceCheckoutProfile = {
      contactName: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      lineId: lineId.trim(),
      deliveryMethod,
      address: address.trim(),
    };

    setSubmitting(true);
    try {
      const requestPayload = {
        siteCode: PUBLIC_SITE_CODE,
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          lineId: lineId.trim(),
        },
        deliveryMethod,
        address: address.trim(),
        note: note.trim(),
        website,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      };
      const fingerprint = JSON.stringify(requestPayload);
      const attempt = resolveCheckoutIdempotencyAttempt(idempotencyAttemptRef.current, fingerprint);
      idempotencyAttemptRef.current = attempt;
      const response = await fetch("/api/store/orders", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          ...requestPayload,
          idempotencyKey: attempt.key,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        order?: CheckoutResult;
        error?: string;
      };
      if (!response.ok || !payload.order) {
        if (response.status === 404 || response.status === 503) {
          throw new Error("目前無法送出訂單，請稍後再試或聯絡客服。");
        }
        throw new Error(payload.error || "訂單送出失敗，請稍後再試。");
      }
      idempotencyAttemptRef.current = null;
      onCompleted(payload.order, profile, rememberProfile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "訂單送出失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <button type="button" className="checkout-backdrop" onClick={submitting ? undefined : onClose} aria-label="關閉結帳資料" tabIndex={-1} />
      <div className="checkout-panel" ref={panelRef}>
        <header>
          <div>
            <p>訂購資料</p>
            <h2 id={titleId}>填寫訂購資料</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={submitting} aria-label="關閉結帳資料">×</button>
        </header>

        <p className="checkout-intro" id={descriptionId}>
          {testingMode
            ? "本機測試模式：請使用虛構資料，送出後只會建立這台電腦的測試訂單與庫存紀錄。"
            : <>送出後，{publishedBrandName}客服將確認商品、庫存、運費與付款方式；{publishedSiteAppearance.settings.paymentPolicySummary}</>}
        </p>

        <form onSubmit={submitOrder}>
          <div className="checkout-fields">
            <label><span>收件人姓名 *</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>
            <label><span>聯絡電話 *</span><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={20} required /></label>
            <label><span>電子郵件</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={160} /></label>
            <label><span>LINE 聯絡 ID</span><input value={lineId} onChange={(event) => setLineId(event.target.value)} maxLength={80} /></label>
            <label className="checkout-wide"><span>配送方式 *</span><select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as DeliveryMethod)}>{Object.entries(DELIVERY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="checkout-wide"><span>{deliveryMethod === "home_delivery" ? "收件地址 *" : "門市／面交偏好"}</span><input autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} required={deliveryMethod === "home_delivery"} placeholder={deliveryMethod === "home_delivery" ? "請填寫郵遞區號與完整地址" : "可先填寫希望的地區或門市"} /></label>
            <label className="checkout-wide"><span>訂單備註</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="例如方便聯絡的時間、商品問題或配送需求" /></label>
            <label className="checkout-honeypot" aria-hidden="true"><span>網站</span><input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
          </div>

          <section className="checkout-review" aria-label="訂單內容">
            {lines.map((line) => (
              <div key={line.productId}>
                <span>{line.product.shortName} × {line.quantity}</span>
                <b>{formatPrice(line.product.price * line.quantity)}</b>
              </div>
            ))}
            <div className="checkout-total"><span>商品小計</span><b>{formatPrice(subtotal)}</b></div>
            <small>{publishedSiteAppearance.settings.shippingPolicySummary} 送出不代表已完成付款。</small>
          </section>

          <div className="checkout-remember">
            <label>
              <input type="checkbox" checked={rememberProfile} onChange={(event) => setRememberProfile(event.target.checked)} />
              <span>記住收件資料，方便下次結帳</span>
            </label>
            <small>資料只會保存在目前瀏覽器；不建議在公用裝置使用。</small>
          </div>

          {error && <p className="checkout-error" role="alert">{error}</p>}
          <button className="button button--gold checkout-submit" type="submit" disabled={submitting}>
            {submitting ? "正在送出訂單…" : testingMode ? "送出測試訂單 →" : "送出訂單 →"}
          </button>
          <small className="checkout-consent">送出即表示同意{publishedBrandName}依<a href="/service/privacy/" target="_blank" rel="noreferrer">隱私權政策</a>，僅為訂單聯繫、配送與售後處理使用上述資料。</small>
        </form>
      </div>
    </div>
  );
}
