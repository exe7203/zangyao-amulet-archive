"use client";

import { useEffect, useState } from "react";
import { publicContentSiteSettingsPath } from "../shared/admin/api-paths";
import { publishedSnapshot } from "../shared/published-content";
import { PUBLIC_SITE_CODE } from "../shared/site-context";
import {
  normalizeSiteAppearance,
  type SiteAppearance,
} from "../shared/site-settings";

const initialAppearance = normalizeSiteAppearance(
  publishedSnapshot.siteSettings.settings,
  publishedSnapshot.siteSettings.theme,
);

export function useLiveSiteAppearance() {
  const [appearance, setAppearance] = useState<SiteAppearance>(initialAppearance);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSiteAppearance() {
      try {
        const response = await fetch(publicContentSiteSettingsPath(PUBLIC_SITE_CODE), {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json() as {
          siteSettings?: { settings?: unknown; theme?: unknown };
        };
        if (!payload.siteSettings) return;
        setAppearance(normalizeSiteAppearance(
          payload.siteSettings.settings,
          payload.siteSettings.theme,
        ));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 靜態公開版沒有動態 API，沿用快照外觀。
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadSiteAppearance();
    return () => controller.abort();
  }, []);

  return { appearance, loading };
}
