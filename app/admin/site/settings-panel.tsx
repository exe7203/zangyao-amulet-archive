import { Plus } from "lucide-react";
import {
  evaluateSiteThemeContrast,
  HOME_SECTION_IDS,
  MIN_SITE_THEME_CONTRAST,
  type HomeSectionId,
  type SiteAppearance,
} from "../../../shared/site-settings";
import styles from "./site-editor.module.css";
import {
  formatContrastRatio,
  formatUpdatedAt,
  HOME_SECTION_LABELS,
  settingsRevisionActor,
  type SiteSettingsRevision,
} from "./helpers";

export type SiteSettingsPanelProps = {
  siteAppearance: SiteAppearance;
  siteThemeContrast: ReturnType<typeof evaluateSiteThemeContrast>;
  siteStructureError: string | null;
  siteSettingsDirty: boolean;
  siteSettingsVersion: number;
  siteSettingsSaving: boolean;
  showSiteSettingsHistory: boolean;
  siteSettingsRevisions: SiteSettingsRevision[];
  siteSettingsRevisionsLoading: boolean;
  siteSettingsRevisionsHasMore: boolean;
  updateIdentitySetting: <Key extends keyof SiteAppearance["settings"]>(key: Key, value: SiteAppearance["settings"][Key]) => void;
  updateThemeSetting: (key: keyof SiteAppearance["theme"], value: string) => void;
  updateNavigationItem: (index: number, field: "label" | "href", value: string) => void;
  moveNavigationItem: (index: number, direction: -1 | 1) => void;
  removeNavigationItem: (index: number) => void;
  addNavigationItem: () => void;
  moveHomeSection: (index: number, direction: -1 | 1) => void;
  setHomeSectionVisibility: (id: HomeSectionId, visible: boolean) => void;
  setShowSiteSettingsHistory: (next: boolean) => void;
  loadSiteSettingsRevisions: (offset?: number, append?: boolean) => Promise<void>;
  saveSiteSettings: () => Promise<void>;
  restoreSiteSettingsRevision: (revision: SiteSettingsRevision) => Promise<void>;
};

export default function SiteSettingsPanel(props: SiteSettingsPanelProps) {
  const {
    siteAppearance,
    siteThemeContrast,
    siteStructureError,
    siteSettingsDirty,
    siteSettingsVersion,
    siteSettingsSaving,
    showSiteSettingsHistory,
    siteSettingsRevisions,
    siteSettingsRevisionsLoading,
    siteSettingsRevisionsHasMore,
    updateIdentitySetting,
    updateThemeSetting,
    updateNavigationItem,
    moveNavigationItem,
    removeNavigationItem,
    addNavigationItem,
    moveHomeSection,
    setHomeSectionVisibility,
    setShowSiteSettingsHistory,
    loadSiteSettingsRevisions,
    saveSiteSettings,
    restoreSiteSettingsRevision,
  } = props;

  return (
    <section className={`${styles.settingsPanel} ${styles.siteSettingsPanel}`} aria-label="全站品牌、配色與首頁內容">
      <div>
        <div className={styles.settingsTitle}>
          <div><small>SITE IDENTITY</small><h2>全站品牌、配色與首頁內容</h2></div>
          <div className={styles.siteSettingsTitleActions}>
            <span>{siteSettingsDirty ? "尚未儲存" : `版本 ${siteSettingsVersion}`}</span>
            <button type="button" onClick={() => {
              const next = !showSiteSettingsHistory;
              setShowSiteSettingsHistory(next);
              if (next) void loadSiteSettingsRevisions();
            }}>{showSiteSettingsHistory ? "收合版本紀錄" : "版本紀錄"}</button>
          </div>
        </div>
        <div className={styles.basicFields}>
          <label><span>品牌名稱</span><input value={siteAppearance.settings.brandName} maxLength={80} onChange={(event) => updateIdentitySetting("brandName", event.target.value)} /></label>
          <label><span>英文副標</span><input value={siteAppearance.settings.brandSubtitle} maxLength={120} onChange={(event) => updateIdentitySetting("brandSubtitle", event.target.value)} /></label>
          <label><span>公告短句</span><input value={siteAppearance.settings.announcement} maxLength={120} onChange={(event) => updateIdentitySetting("announcement", event.target.value)} /></label>
          <label className={styles.wideField}><span>頁尾提醒</span><textarea rows={2} value={siteAppearance.settings.footerNote} maxLength={300} onChange={(event) => updateIdentitySetting("footerNote", event.target.value)} /></label>
          <div className={styles.settingsGroupTitle}><b>企業與客服資訊</b><small>填寫後會顯示於頁尾與客服頁；空白則前台顯示「尚未公布」，避免虛構聯絡資料。</small></div>
          <label><span>法定商號／公司名</span><input value={siteAppearance.settings.businessLegalName} maxLength={120} placeholder="例如：泰聚達行銷有限公司" onChange={(event) => updateIdentitySetting("businessLegalName", event.target.value)} /></label>
          <label><span>客服電話</span><input value={siteAppearance.settings.contactPhone} maxLength={40} placeholder="例如：09xx-xxx-xxx" onChange={(event) => updateIdentitySetting("contactPhone", event.target.value)} /></label>
          <label><span>客服 Email</span><input value={siteAppearance.settings.contactEmail} maxLength={120} placeholder="例如：service@example.com" onChange={(event) => updateIdentitySetting("contactEmail", event.target.value)} /></label>
          <label><span>客服時間</span><input value={siteAppearance.settings.contactHours} maxLength={120} placeholder="例如：週一至週五 10:00–18:00" onChange={(event) => updateIdentitySetting("contactHours", event.target.value)} /></label>
          <label className={styles.wideField}><span>營業／聯絡地址</span><input value={siteAppearance.settings.businessAddress} maxLength={200} placeholder="公開聯絡地址（可與退貨地址不同）" onChange={(event) => updateIdentitySetting("businessAddress", event.target.value)} /></label>
          <label className={styles.wideField}><span>LINE 官方連結</span><input value={siteAppearance.settings.lineOfficialUrl} maxLength={300} placeholder="https://line.me/..." onChange={(event) => updateIdentitySetting("lineOfficialUrl", event.target.value)} /></label>
          <div className={styles.settingsGroupTitle}><b>交易政策摘要</b><small>會顯示於配送／退貨／結帳說明；正式數字與地址請寫清楚。</small></div>
          <label className={styles.wideField}><span>配送與運費摘要</span><textarea rows={3} value={siteAppearance.settings.shippingPolicySummary} maxLength={500} onChange={(event) => updateIdentitySetting("shippingPolicySummary", event.target.value)} /></label>
          <label className={styles.wideField}><span>付款方式摘要</span><textarea rows={3} value={siteAppearance.settings.paymentPolicySummary} maxLength={500} onChange={(event) => updateIdentitySetting("paymentPolicySummary", event.target.value)} /></label>
          <label className={styles.wideField}><span>退換貨摘要</span><textarea rows={3} value={siteAppearance.settings.returnsPolicySummary} maxLength={500} onChange={(event) => updateIdentitySetting("returnsPolicySummary", event.target.value)} /></label>
          <label className={styles.colorField}><span>品牌金色</span><div><input type="color" value={siteAppearance.theme.accent} onChange={(event) => updateThemeSetting("accent", event.target.value)} /><code>{siteAppearance.theme.accent}</code></div></label>
          <label className={styles.colorField}><span>頁面底色</span><div><input type="color" value={siteAppearance.theme.surface} onChange={(event) => updateThemeSetting("surface", event.target.value)} /><code>{siteAppearance.theme.surface}</code></div></label>
          <label className={styles.colorField}><span>主要文字</span><div><input type="color" value={siteAppearance.theme.ink} onChange={(event) => updateThemeSetting("ink", event.target.value)} /><code>{siteAppearance.theme.ink}</code></div></label>
          <div className={styles.settingsGroupTitle}><b>全站主要導覽</b><small>桌機、手機抽屜與頁尾共用；最多 6 個，只接受站內路徑或 #錨點。</small></div>
          <div className={styles.navigationEditor}>
            {siteAppearance.settings.primaryNavigation.map((item, index) => {
              const required = item.href === "/" || item.href === "/#hero" || item.href === "#hero" || item.href === "/#products" || item.href === "#products";
              return <article key={index}>
                <span className={styles.itemIndex}>{String(index + 1).padStart(2, "0")}</span>
                <label><span>顯示文字</span><input value={item.label} maxLength={30} onChange={(event) => updateNavigationItem(index, "label", event.target.value)} /></label>
                <label><span>站內連結</span><input value={item.href} maxLength={200} aria-invalid={!item.href.startsWith("/") && !item.href.startsWith("#")} onChange={(event) => updateNavigationItem(index, "href", event.target.value)} /></label>
                <div className={styles.rowActions}><button type="button" onClick={() => moveNavigationItem(index, -1)} disabled={index === 0} aria-label={`將${item.label || "連結"}上移`}>↑</button><button type="button" onClick={() => moveNavigationItem(index, 1)} disabled={index === siteAppearance.settings.primaryNavigation.length - 1} aria-label={`將${item.label || "連結"}下移`}>↓</button><button type="button" onClick={() => removeNavigationItem(index)} disabled={required || siteAppearance.settings.primaryNavigation.length <= 2}>刪除</button></div>
                {required && <small className={styles.requiredTag}>必備</small>}
              </article>;
            })}
            <div className={styles.editorFooter}><span>至少保留首頁與商品連結；服務、隱私與客服安全連結會另外固定保留。</span><button type="button" onClick={addNavigationItem} disabled={siteAppearance.settings.primaryNavigation.length >= 6}><Plus size={12} />新增導覽</button></div>
          </div>
          <div className={styles.settingsGroupTitle}><b>首頁區塊順序</b><small>共 {HOME_SECTION_IDS.length} 個區塊；主視覺與最新商品為商店必備，不能隱藏。</small></div>
          <div className={styles.sectionOrderEditor}>
            {siteAppearance.settings.homeSectionOrder.map((section, index) => {
              const required = section.id === "hero" || section.id === "products";
              return <article key={section.id}>
                <span className={styles.itemIndex}>{String(index + 1).padStart(2, "0")}</span>
                <div><b>{HOME_SECTION_LABELS[section.id]}</b><small>{section.id}</small></div>
                <label className={styles.visibilityControl}><input type="checkbox" checked={required || section.visible} disabled={required} onChange={(event) => setHomeSectionVisibility(section.id, event.target.checked)} /><span>{required ? "必備顯示" : section.visible ? "顯示" : "隱藏"}</span></label>
                <div className={styles.rowActions}><button type="button" onClick={() => moveHomeSection(index, -1)} disabled={index === 0} aria-label={`將${HOME_SECTION_LABELS[section.id]}上移`}>↑</button><button type="button" onClick={() => moveHomeSection(index, 1)} disabled={index === siteAppearance.settings.homeSectionOrder.length - 1} aria-label={`將${HOME_SECTION_LABELS[section.id]}下移`}>↓</button></div>
              </article>;
            })}
          </div>
          <div className={styles.settingsGroupTitle}><b>首頁固定版型文案</b><small>以下欄位只修改文字；導覽與區塊順序請使用上方設定。</small></div>
          <label><span>首頁眉題 <small>{siteAppearance.settings.homeHeroEyebrow.length}/80</small></span><input value={siteAppearance.settings.homeHeroEyebrow} maxLength={80} onChange={(event) => updateIdentitySetting("homeHeroEyebrow", event.target.value)} /></label>
          <label><span>主標第一行 <small>{siteAppearance.settings.homeHeroTitlePrimary.length}/80</small></span><input value={siteAppearance.settings.homeHeroTitlePrimary} maxLength={80} onChange={(event) => updateIdentitySetting("homeHeroTitlePrimary", event.target.value)} /></label>
          <label><span>主標第二行 <small>{siteAppearance.settings.homeHeroTitleSecondary.length}/80</small></span><input value={siteAppearance.settings.homeHeroTitleSecondary} maxLength={80} onChange={(event) => updateIdentitySetting("homeHeroTitleSecondary", event.target.value)} /></label>
          <label className={styles.wideField}><span>首頁引言 <small>{siteAppearance.settings.homeHeroLead.length}/300</small></span><textarea rows={3} value={siteAppearance.settings.homeHeroLead} maxLength={300} onChange={(event) => updateIdentitySetting("homeHeroLead", event.target.value)} /></label>
          <label><span>主要按鈕文字 <small>{siteAppearance.settings.homePrimaryCtaLabel.length}/40</small></span><input value={siteAppearance.settings.homePrimaryCtaLabel} maxLength={40} onChange={(event) => updateIdentitySetting("homePrimaryCtaLabel", event.target.value)} /></label>
          <label><span>次要按鈕文字 <small>{siteAppearance.settings.homeSecondaryCtaLabel.length}/40</small></span><input value={siteAppearance.settings.homeSecondaryCtaLabel} maxLength={40} onChange={(event) => updateIdentitySetting("homeSecondaryCtaLabel", event.target.value)} /></label>
          <label><span>典藏導覽標題 <small>{siteAppearance.settings.homeCollectionsTitle.length}/80</small></span><input value={siteAppearance.settings.homeCollectionsTitle} maxLength={80} onChange={(event) => updateIdentitySetting("homeCollectionsTitle", event.target.value)} /></label>
          <label className={styles.wideField}><span>典藏導覽說明 <small>{siteAppearance.settings.homeCollectionsIntro.length}/300</small></span><textarea rows={3} value={siteAppearance.settings.homeCollectionsIntro} maxLength={300} onChange={(event) => updateIdentitySetting("homeCollectionsIntro", event.target.value)} /></label>
          <label><span>商品區標題 <small>{siteAppearance.settings.homeArrivalsTitle.length}/80</small></span><input value={siteAppearance.settings.homeArrivalsTitle} maxLength={80} onChange={(event) => updateIdentitySetting("homeArrivalsTitle", event.target.value)} /></label>
          <div className={styles.settingsGroupTitle}><b>全站預設 SEO</b><small>首頁與未另設 SEO 的頁面會用這些預設；單篇文章／頁面／商品仍以各自欄位為準。空白則沿用系統預設文案。</small></div>
          <label className={styles.wideField}><span>預設 SEO 標題 <small>{siteAppearance.settings.defaultSeoTitle.length}/70</small></span><input value={siteAppearance.settings.defaultSeoTitle} maxLength={70} placeholder="例如：泰聚達｜泰國佛牌與收藏品" onChange={(event) => updateIdentitySetting("defaultSeoTitle", event.target.value)} /></label>
          <label className={styles.wideField}><span>預設 Meta 描述 <small>{siteAppearance.settings.defaultSeoDescription.length}/180</small></span><textarea rows={3} value={siteAppearance.settings.defaultSeoDescription} maxLength={180} placeholder="用一段話說明網站提供什麼，方便搜尋結果摘要顯示" onChange={(event) => updateIdentitySetting("defaultSeoDescription", event.target.value)} /></label>
          <label className={styles.wideField}><span>預設社群／OG 圖網址 <small>{siteAppearance.settings.defaultOgImageUrl.length}/1000</small></span><input type="url" value={siteAppearance.settings.defaultOgImageUrl} maxLength={1000} placeholder="https://… 空白則使用站內 og.png" onChange={(event) => updateIdentitySetting("defaultOgImageUrl", event.target.value)} /></label>
        </div>
      </div>
      <aside className={styles.siteSettingsSummary}>
        <span>SAFE TEMPLATE</span>
        <h3>保留商店骨架，只開放安全欄位</h3>
        <p>品牌、主要導覽、首頁編排、頁尾、配色與全站預設 SEO 會套用到前台；商品流程與行動版骨架不會被任意拖曳破壞。單篇 SEO 請到文章／頁面／商品各自設定。</p>
        <div className={styles.colorPreview} style={{ background: siteAppearance.theme.surface, color: siteAppearance.theme.ink, borderColor: siteAppearance.theme.accent }}><i style={{ background: siteAppearance.theme.accent }} />{siteAppearance.settings.brandName || "品牌預覽"}</div>
        <div className={`${styles.contrastStatus} ${siteThemeContrast.ok ? styles.contrastPass : styles.contrastFail}`} role="status" aria-live="polite">
          <b>{siteThemeContrast.ok ? "主要配色對比檢查通過" : "主要配色對比不足，暫時不能儲存"}</b>
          <span data-pass={siteThemeContrast.passesInkSurface}>文字／底色 <strong>{formatContrastRatio(siteThemeContrast.inkSurface)}</strong></span>
          <span data-pass={siteThemeContrast.passesInkAccent}>文字／重點色 <strong>{formatContrastRatio(siteThemeContrast.inkAccent)}</strong></span>
          <span data-pass={siteThemeContrast.passesArchivePalette}>固定版型明暗 <strong>{siteThemeContrast.passesArchivePalette ? "適用" : "不適用"}</strong></span>
          <small>兩組對比都必須至少 {MIN_SITE_THEME_CONTRAST}:1，並維持淺底深字。</small>
        </div>
        {siteStructureError && <p className={styles.structureError} role="status">{siteStructureError}</p>}
        <button type="button" onClick={() => void saveSiteSettings()} disabled={siteSettingsSaving || !siteSettingsDirty || !siteThemeContrast.ok || Boolean(siteStructureError)}>{siteSettingsSaving ? "儲存中…" : "儲存全站設定"}</button>
        {showSiteSettingsHistory && <div className={styles.siteSettingsHistory} aria-label="全站設定版本紀錄">
          <div><b>版本紀錄</b><small>還原會建立新版本，不會覆寫或刪除舊紀錄。</small></div>
          {siteSettingsRevisions.map((revision) => <article key={revision.revisionId}>
            <div>
              <b>第 {revision.version} 版{revision.version === siteSettingsVersion ? "・目前版本" : ""}</b>
              <small>{formatUpdatedAt(revision.createdAt)}・{settingsRevisionActor(revision.savedBy)}</small>
            </div>
            <button type="button" onClick={() => void restoreSiteSettingsRevision(revision)} disabled={siteSettingsSaving || revision.version === siteSettingsVersion}>{revision.version === siteSettingsVersion ? "目前版本" : "還原"}</button>
          </article>)}
          {!siteSettingsRevisionsLoading && siteSettingsRevisions.length === 0 && <p>目前沒有可顯示的版本紀錄。</p>}
          {siteSettingsRevisionsLoading && <p>正在讀取版本紀錄…</p>}
          {siteSettingsRevisionsHasMore && !siteSettingsRevisionsLoading && <button type="button" className={styles.loadMoreButton} onClick={() => void loadSiteSettingsRevisions(siteSettingsRevisions.length, true)}>載入更多版本</button>}
        </div>}
      </aside>
    </section>
  );
}
