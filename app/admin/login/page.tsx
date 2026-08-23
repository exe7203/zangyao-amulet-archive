"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import {
  publishedBrandMark,
  publishedBrandName,
  publishedBrandSubtitle,
} from "../../../shared/published-site";
import styles from "./login.module.css";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin/";
  if (value.startsWith("/admin/login")) return "/admin/";
  return value;
}

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("return_to"));
  const formRef = useRef<HTMLFormElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const syncAutofill = () => {
      const form = formRef.current;
      if (!form) return;
      const usernameInput = form.elements.namedItem("username");
      const passwordInput = form.elements.namedItem("password");
      if (usernameInput instanceof HTMLInputElement && usernameInput.value) {
        setUsername((current) => current || usernameInput.value);
      }
      if (passwordInput instanceof HTMLInputElement && passwordInput.value) {
        setPassword((current) => current || passwordInput.value);
      }
    };

    syncAutofill();
    const timer = window.setInterval(syncAutofill, 300);
    window.addEventListener("focus", syncAutofill);
    document.addEventListener("visibilitychange", syncAutofill);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncAutofill);
      document.removeEventListener("visibilitychange", syncAutofill);
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const usernameInput = event.currentTarget.elements.namedItem("username");
    const passwordInput = event.currentTarget.elements.namedItem("password");
    const usernameValue = usernameInput instanceof HTMLInputElement
      ? usernameInput.value.trim()
      : username.trim();
    const passwordValue = passwordInput instanceof HTMLInputElement
      ? passwordInput.value
      : password;

    if (!usernameValue) {
      setError("請輸入帳號。");
      return;
    }
    if (!passwordValue) {
      setError("請輸入密碼。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: usernameValue, password: passwordValue }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "登入失敗，請稍後再試。");
      }
      window.location.assign(returnTo);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "登入失敗，請稍後再試。";
      if (/failed to fetch|network|load failed/i.test(message)) {
        setError("無法連線到本機後台，請確認網站有在運行後再試一次。");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page} id="main-content">
      <section className={styles.card} aria-labelledby="admin-login-title">
        <header className={styles.brand}>
          <span aria-hidden="true">{publishedBrandMark}</span>
          <div>
            <b>{publishedBrandName}營運中樞</b>
            <small>{publishedBrandSubtitle}</small>
          </div>
        </header>

        <div className={styles.intro}>
          <p>後台登入</p>
          <h1 id="admin-login-title">請輸入帳號與密碼</h1>
          <span className={styles.lead}>此頁面供內容、商品、訂單與網站設定管理使用。</span>
        </div>

        <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
          <label htmlFor="admin-login-username">
            帳號
            <input
              id="admin-login-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onInput={(event) => setUsername(event.currentTarget.value)}
              placeholder="請輸入帳號"
              autoFocus
            />
          </label>
          <label htmlFor="admin-login-password">
            密碼
            <input
              id="admin-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onInput={(event) => setPassword(event.currentTarget.value)}
              placeholder="請輸入密碼"
            />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={submitting}>
            {submitting ? "登入中…" : "登入後台"}
          </button>
        </form>

        <footer className={styles.footer}>
          <Link href="/">返回前台首頁</Link>
        </footer>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.lead}>正在載入登入頁…</p>
        </section>
      </main>
    }>
      <AdminLoginForm />
    </Suspense>
  );
}
