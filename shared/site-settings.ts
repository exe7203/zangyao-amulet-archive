export type SiteIdentitySettings = {
  announcement: string;
  brandName: string;
  brandSubtitle: string;
  footerNote: string;
  homeHeroEyebrow: string;
  homeHeroTitlePrimary: string;
  homeHeroTitleSecondary: string;
  homeHeroLead: string;
  homePrimaryCtaLabel: string;
  homeSecondaryCtaLabel: string;
  homeCollectionsTitle: string;
  homeCollectionsIntro: string;
  homeArrivalsTitle: string;
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

export const MIN_SITE_THEME_CONTRAST = 4.5;
export const MIN_ARCHIVE_SURFACE_LUMINANCE = 0.72;
export const MAX_ARCHIVE_INK_LUMINANCE = 0.12;

export type SiteThemeContrast = {
  minimum: number;
  inkSurface: number;
  inkAccent: number;
  passesInkSurface: boolean;
  passesInkAccent: boolean;
  surfaceLuminance: number;
  inkLuminance: number;
  passesArchivePalette: boolean;
  ok: boolean;
};

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  settings: {
    announcement: "泰國佛牌與收藏品網站建置中",
    brandName: "泰聚達",
    brandSubtitle: "THAI AMULET ARCHIVE",
    footerNote: "網站內容建置中，商品資訊確認後才會開放訂購。",
    homeHeroEyebrow: "泰國佛牌與收藏品",
    homeHeroTitlePrimary: "清楚的商品資訊，",
    homeHeroTitleSecondary: "讓選擇更有依據。",
    homeHeroLead: "提供商品尺寸、材質、年份、來源與保存狀況等資訊，讓你在選購前先了解商品內容。",
    homePrimaryCtaLabel: "查看最新商品",
    homeSecondaryCtaLabel: "閱讀選購指南",
    homeCollectionsTitle: "依商品類型瀏覽",
    homeCollectionsIntro: "從佛牌、神尊與符印等分類查看商品，並參考材質、尺寸與來源說明。",
    homeArrivalsTitle: "最新商品",
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

function colorLuminance(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (channels[0] * 0.2126) + (channels[1] * 0.7152) + (channels[2] * 0.0722);
}

export function colorContrastRatio(first: string, second: string) {
  const firstLuminance = colorLuminance(first);
  const secondLuminance = colorLuminance(second);
  if (firstLuminance === null || secondLuminance === null) return null;
  const lightest = Math.max(firstLuminance, secondLuminance);
  const darkest = Math.min(firstLuminance, secondLuminance);
  return (lightest + 0.05) / (darkest + 0.05);
}

export function evaluateSiteThemeContrast(
  theme: Pick<SiteThemeSettings, "accent" | "surface" | "ink">,
): SiteThemeContrast {
  const inkSurface = colorContrastRatio(theme.ink, theme.surface) ?? 0;
  const inkAccent = colorContrastRatio(theme.ink, theme.accent) ?? 0;
  const surfaceLuminance = colorLuminance(theme.surface) ?? 0;
  const inkLuminance = colorLuminance(theme.ink) ?? 1;
  const passesInkSurface = inkSurface >= MIN_SITE_THEME_CONTRAST;
  const passesInkAccent = inkAccent >= MIN_SITE_THEME_CONTRAST;
  const passesArchivePalette = surfaceLuminance >= MIN_ARCHIVE_SURFACE_LUMINANCE &&
    inkLuminance <= MAX_ARCHIVE_INK_LUMINANCE;
  return {
    minimum: MIN_SITE_THEME_CONTRAST,
    inkSurface,
    inkAccent,
    passesInkSurface,
    passesInkAccent,
    surfaceLuminance,
    inkLuminance,
    passesArchivePalette,
    ok: passesInkSurface && passesInkAccent && passesArchivePalette,
  };
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
      homeHeroEyebrow: boundedText(settings.homeHeroEyebrow, DEFAULT_SITE_APPEARANCE.settings.homeHeroEyebrow, 80),
      homeHeroTitlePrimary: boundedText(settings.homeHeroTitlePrimary, DEFAULT_SITE_APPEARANCE.settings.homeHeroTitlePrimary, 80),
      homeHeroTitleSecondary: boundedText(settings.homeHeroTitleSecondary, DEFAULT_SITE_APPEARANCE.settings.homeHeroTitleSecondary, 80),
      homeHeroLead: boundedText(settings.homeHeroLead, DEFAULT_SITE_APPEARANCE.settings.homeHeroLead, 300),
      homePrimaryCtaLabel: boundedText(settings.homePrimaryCtaLabel, DEFAULT_SITE_APPEARANCE.settings.homePrimaryCtaLabel, 40),
      homeSecondaryCtaLabel: boundedText(settings.homeSecondaryCtaLabel, DEFAULT_SITE_APPEARANCE.settings.homeSecondaryCtaLabel, 40),
      homeCollectionsTitle: boundedText(settings.homeCollectionsTitle, DEFAULT_SITE_APPEARANCE.settings.homeCollectionsTitle, 80),
      homeCollectionsIntro: boundedText(settings.homeCollectionsIntro, DEFAULT_SITE_APPEARANCE.settings.homeCollectionsIntro, 300),
      homeArrivalsTitle: boundedText(settings.homeArrivalsTitle, DEFAULT_SITE_APPEARANCE.settings.homeArrivalsTitle, 80),
    },
    theme: {
      preset: "archive",
      accent: color(theme.accent, DEFAULT_SITE_APPEARANCE.theme.accent),
      surface: color(theme.surface, DEFAULT_SITE_APPEARANCE.theme.surface),
      ink: color(theme.ink, DEFAULT_SITE_APPEARANCE.theme.ink),
    },
  };
}
