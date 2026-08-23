"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type SessionState =
  | { status: "checking" }
  | { status: "allowed"; username: string; mode: string }
  | { status: "denied"; mode: string };

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login" || pathname === "/admin/login/";
  const [session, setSession] = useState<SessionState>({ status: "checking" });

  useEffect(() => {
    if (isLoginPage) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/admin/auth/session", {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as {
          authenticated?: boolean;
          username?: string | null;
          mode?: string;
        };
        if (cancelled) return;
        if (payload.authenticated) {
          setSession({
            status: "allowed",
            username: payload.username || "admin",
            mode: payload.mode || "unknown",
          });
          return;
        }
        setSession({ status: "denied", mode: payload.mode || "local-login" });
        const returnTo = encodeURIComponent(pathname || "/admin/");
        router.replace(`/admin/login/?return_to=${returnTo}`);
      } catch {
        if (!cancelled) setSession({ status: "denied", mode: "local-login" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) return children;

  if (session.status === "checking") {
    return (
      <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#687069", fontFamily: "Inter, sans-serif" }}>
        正在確認後台登入狀態…
      </main>
    );
  }

  if (session.status === "denied") return null;

  return children;
}
