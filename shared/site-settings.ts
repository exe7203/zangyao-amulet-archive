export type SiteIdentitySettings = {
  announcement: string;
  brandName: string;
  brandSubtitle: string;
  footerNote: string;
};

export type SiteThemeSettings = {
  preset: "archive";
  accent: string;
  surface: string;
  ink: string;
};

export type SiteAppearance = {
  settings: SiteIdentitySettings;
  theme: SiteThemeSettings;
};

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  settings: {
    announcement: "台灣現貨・來源透明",
    brandName: "泰聚達",
    brandSubtitle: "THAI AMULET ARCHIVE",
    footerNote: "展示商品與來源資料正式上架前仍須逐件覆核。",
  },
  theme: {
    preset: "archive",
    accent: "#c5a15a",
    surface: "#fbf9f2",
    ink: "#171713",
  },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function color(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

export function normalizeSiteAppearance(settingsValue: unknown, themeValue: unknown): SiteAppearance {
  const settings = record(settingsValue);
  const theme = record(themeValue);
  return {
    settings: {
      announcement: boundedText(settings.announcement, DEFAULT_SITE_APPEARANCE.settings.announcement, 120),
      brandName: boundedText(settings.brandName, DEFAULT_SITE_APPEARANCE.settings.brandName, 80),
      brandSubtitle: boundedText(settings.brandSubtitle, DEFAULT_SITE_APPEARANCE.settings.brandSubtitle, 120),
      footerNote: boundedText(settings.footerNote, DEFAULT_SITE_APPEARANCE.settings.footerNote, 300),
    },
    theme: {
      preset: "archive",
      accent: color(theme.accent, DEFAULT_SITE_APPEARANCE.theme.accent),
      surface: color(theme.surface, DEFAULT_SITE_APPEARANCE.theme.surface),
      ink: color(theme.ink, DEFAULT_SITE_APPEARANCE.theme.ink),
    },
  };
}
