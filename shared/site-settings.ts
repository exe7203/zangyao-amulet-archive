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
    announcement: "台灣現貨・來源透明",
    brandName: "泰聚達",
    brandSubtitle: "THAI AMULET ARCHIVE",
    footerNote: "展示商品與來源資料正式上架前仍須逐件覆核。",
    homeHeroEyebrow: "AMULET ARCHIVE · TAIWAN",
    homeHeroTitlePrimary: "把來源說清楚，",
    homeHeroTitleSecondary: "才值得長久收藏。",
    homeHeroLead: "精選泰國佛牌與聖物，以實物影像、尺寸材質、法會年份與來源紀錄，陪你從理解文化開始選擇。",
    homePrimaryCtaLabel: "探索本週新藏",
    homeSecondaryCtaLabel: "先讀選牌指南",
    homeCollectionsTitle: "從喜歡的形制開始",
    homeCollectionsIntro: "不確定該怎麼選？先從外型、文化脈絡與收藏偏好認識，不必急著替自己套上答案。",
    homeArrivalsTitle: "本週新藏",
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
