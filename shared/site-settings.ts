export const HOME_SECTION_IDS = ["hero", "collections", "products", "themes", "archive", "journal"] as const;
export type HomeSectionId = typeof HOME_SECTION_IDS[number];
export type HomeSectionSetting = { id: HomeSectionId; visible: boolean };
export type PrimaryNavigationItem = { label: string; href: string };

export type SiteIdentitySettings = {
  announcement: string;
  brandName: string;
  brandSubtitle: string;
  footerNote: string;
  /** 法定商號／公司名；空白表示尚未公布 */
  businessLegalName: string;
  /** 營業／聯絡地址；空白表示尚未公布 */
  businessAddress: string;
  /** 客服 Email；空白表示尚未公布 */
  contactEmail: string;
  /** 客服電話；空白表示尚未公布 */
  contactPhone: string;
  /** 客服時間；空白表示尚未公布 */
  contactHours: string;
  /** LINE 官方帳號公開連結；空白表示未啟用 */
  lineOfficialUrl: string;
  /** 配送與運費摘要（服務頁／結帳提示） */
  shippingPolicySummary: string;
  /** 退換貨摘要（含退貨地址或申請管道） */
  returnsPolicySummary: string;
  /** 付款方式摘要（半手工接單時必填說明） */
  paymentPolicySummary: string;
  homeHeroEyebrow: string;
  homeHeroTitlePrimary: string;
  homeHeroTitleSecondary: string;
  homeHeroLead: string;
  homePrimaryCtaLabel: string;
  homeSecondaryCtaLabel: string;
  homeCollectionsTitle: string;
  homeCollectionsIntro: string;
  homeArrivalsTitle: string;
  primaryNavigation: PrimaryNavigationItem[];
  homeSectionOrder: HomeSectionSetting[];
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
    announcement: "佛牌典藏與活動聚會｜商品資料陸續覆核中",
    brandName: "泰聚達",
    brandSubtitle: "THAI AMULET ARCHIVE",
    footerNote: "商品圖目前為氛圍示意；正式上架前會換成實物照片與可查證資料。",
    businessLegalName: "",
    businessAddress: "",
    contactEmail: "",
    contactPhone: "",
    contactHours: "",
    lineOfficialUrl: "",
    shippingPolicySummary: "台灣本島宅配為主；運費、偏遠加價與出貨時間於客服確認訂單後告知。網站小計不含運費。",
    returnsPolicySummary: "退換貨申請管道與退貨地址將於正式開放訂購前公布；七日解除權適用範圍依實際商品與法規辦理。",
    paymentPolicySummary: "目前不提供線上刷卡。訂單確認後由客服通知可使用的付款方式與期限。",
    homeHeroEyebrow: "泰聚達 · 佛牌典藏與活動",
    homeHeroTitlePrimary: "看懂來源，",
    homeHeroTitleSecondary: "也走進現場。",
    homeHeroLead: "我們整理可查證的佛牌資料，也籌辦講座、參訪與見面聚會，讓收藏不只停留在螢幕上。",
    homePrimaryCtaLabel: "瀏覽典藏商品",
    homeSecondaryCtaLabel: "了解近期活動",
    homeCollectionsTitle: "依類型走進典藏",
    homeCollectionsIntro: "佛牌、神尊與符印分門別類；正式商品會附上實物照片與來源說明。",
    homeArrivalsTitle: "近期典藏",
    primaryNavigation: [
      { href: "/", label: "首頁" },
      { href: "/#products", label: "最新商品" },
      { href: "/#themes", label: "活動聚會" },
      { href: "/#collections", label: "商品分類" },
      { href: "/articles/", label: "佛牌專欄" },
      { href: "/about/", label: "關於泰聚達" },
    ],
    homeSectionOrder: HOME_SECTION_IDS.map((id) => ({ id, visible: true })),
  },
  theme: {
    preset: "archive",
    accent: "#9c7642",
    surface: "#ebe4d7",
    ink: "#12100e",
  },
};

/** 允許空白字串（營運欄位未填時不套用預設文案） */
function optionalBoundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function siteHasPublicContact(settings: SiteIdentitySettings) {
  return Boolean(settings.contactEmail || settings.contactPhone || settings.lineOfficialUrl);
}

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

export function safeInternalNavigationHref(value: unknown) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 200 || /[\\\u0000-\u001f\u007f]/u.test(candidate)) return null;
  if (candidate.startsWith("#")) {
    return /^#[A-Za-z][A-Za-z0-9_-]*$/.test(candidate) ? candidate : null;
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;
  try {
    const base = new URL("https://site.invalid/");
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin || parsed.username || parsed.password) return null;
    return candidate;
  } catch {
    return null;
  }
}

function parsePrimaryNavigation(value: unknown): PrimaryNavigationItem[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) return null;
  const items: PrimaryNavigationItem[] = [];
  const hrefs = new Set<string>();
  for (const entry of value) {
    const item = record(entry);
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const href = safeInternalNavigationHref(item.href);
    if (!label || label.length > 30 || !href || hrefs.has(href)) return null;
    hrefs.add(href);
    items.push({ label, href });
  }
  const hasHome = items.some((item) => item.href === "/" || item.href === "/#hero" || item.href === "#hero");
  const hasProducts = items.some((item) => item.href === "/#products" || item.href === "#products");
  return hasHome && hasProducts ? items : null;
}

function parseHomeSectionOrder(value: unknown): HomeSectionSetting[] | null {
  if (!Array.isArray(value) || value.length !== HOME_SECTION_IDS.length) return null;
  const allowed = new Set<string>(HOME_SECTION_IDS);
  const seen = new Set<string>();
  const sections: HomeSectionSetting[] = [];
  for (const entry of value) {
    const item = record(entry);
    if (typeof item.id !== "string" || !allowed.has(item.id) || seen.has(item.id) || typeof item.visible !== "boolean") return null;
    if ((item.id === "hero" || item.id === "products") && item.visible !== true) return null;
    seen.add(item.id);
    sections.push({ id: item.id as HomeSectionId, visible: item.visible });
  }
  return seen.size === HOME_SECTION_IDS.length ? sections : null;
}

export function validateSiteSettingsStructure(value: unknown) {
  const settings = record(value);
  if (Object.hasOwn(settings, "primaryNavigation") && !parsePrimaryNavigation(settings.primaryNavigation)) {
    return "主要導覽格式不正確；請保留首頁與商品連結，最多 6 個，且只能使用站內路徑或頁面錨點。";
  }
  if (Object.hasOwn(settings, "homeSectionOrder") && !parseHomeSectionOrder(settings.homeSectionOrder)) {
    return "首頁區塊設定不正確；每個區塊必須恰好出現一次，主視覺與商品區不可隱藏。";
  }
  return null;
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
      businessLegalName: optionalBoundedText(settings.businessLegalName, 120),
      businessAddress: optionalBoundedText(settings.businessAddress, 200),
      contactEmail: optionalBoundedText(settings.contactEmail, 120),
      contactPhone: optionalBoundedText(settings.contactPhone, 40),
      contactHours: optionalBoundedText(settings.contactHours, 120),
      lineOfficialUrl: optionalBoundedText(settings.lineOfficialUrl, 300),
      shippingPolicySummary: boundedText(
        settings.shippingPolicySummary,
        DEFAULT_SITE_APPEARANCE.settings.shippingPolicySummary,
        500,
      ),
      returnsPolicySummary: boundedText(
        settings.returnsPolicySummary,
        DEFAULT_SITE_APPEARANCE.settings.returnsPolicySummary,
        500,
      ),
      paymentPolicySummary: boundedText(
        settings.paymentPolicySummary,
        DEFAULT_SITE_APPEARANCE.settings.paymentPolicySummary,
        500,
      ),
      homeHeroEyebrow: boundedText(settings.homeHeroEyebrow, DEFAULT_SITE_APPEARANCE.settings.homeHeroEyebrow, 80),
      homeHeroTitlePrimary: boundedText(settings.homeHeroTitlePrimary, DEFAULT_SITE_APPEARANCE.settings.homeHeroTitlePrimary, 80),
      homeHeroTitleSecondary: boundedText(settings.homeHeroTitleSecondary, DEFAULT_SITE_APPEARANCE.settings.homeHeroTitleSecondary, 80),
      homeHeroLead: boundedText(settings.homeHeroLead, DEFAULT_SITE_APPEARANCE.settings.homeHeroLead, 300),
      homePrimaryCtaLabel: boundedText(settings.homePrimaryCtaLabel, DEFAULT_SITE_APPEARANCE.settings.homePrimaryCtaLabel, 40),
      homeSecondaryCtaLabel: boundedText(settings.homeSecondaryCtaLabel, DEFAULT_SITE_APPEARANCE.settings.homeSecondaryCtaLabel, 40),
      homeCollectionsTitle: boundedText(settings.homeCollectionsTitle, DEFAULT_SITE_APPEARANCE.settings.homeCollectionsTitle, 80),
      homeCollectionsIntro: boundedText(settings.homeCollectionsIntro, DEFAULT_SITE_APPEARANCE.settings.homeCollectionsIntro, 300),
      homeArrivalsTitle: boundedText(settings.homeArrivalsTitle, DEFAULT_SITE_APPEARANCE.settings.homeArrivalsTitle, 80),
      primaryNavigation: parsePrimaryNavigation(settings.primaryNavigation) || DEFAULT_SITE_APPEARANCE.settings.primaryNavigation.map((item) => ({ ...item })),
      homeSectionOrder: parseHomeSectionOrder(settings.homeSectionOrder) || DEFAULT_SITE_APPEARANCE.settings.homeSectionOrder.map((section) => ({ ...section })),
    },
    theme: {
      preset: "archive",
      accent: color(theme.accent, DEFAULT_SITE_APPEARANCE.theme.accent),
      surface: color(theme.surface, DEFAULT_SITE_APPEARANCE.theme.surface),
      ink: color(theme.ink, DEFAULT_SITE_APPEARANCE.theme.ink),
    },
  };
}
