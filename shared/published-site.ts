import { publishedSnapshot } from "./published-content";
import { normalizeSiteAppearance } from "./site-settings";

export const publishedSiteAppearance = normalizeSiteAppearance(
  publishedSnapshot.siteSettings.settings,
  publishedSnapshot.siteSettings.theme,
);

export const publishedBrandName = publishedSiteAppearance.settings.brandName;
export const publishedBrandSubtitle = publishedSiteAppearance.settings.brandSubtitle;
export const publishedBrandMark = Array.from(publishedBrandName)[0] || "T";
export const publishedEditorName = `${publishedBrandName}編輯部`;
