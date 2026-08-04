/* eslint-disable @next/next/no-img-element */
import type {
  PageComponents,
  ShowcaseArticle,
  ShowcaseProduct,
} from "./types";
import styles from "./blocks.module.css";

function sectionClass(tone: string, extra?: string) {
  return [styles.section, styles[`tone_${tone}`], extra].filter(Boolean).join(" ");
}

function SectionHeading({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return <header className={styles.heading}>
    {eyebrow && <p>{eyebrow}</p>}
    <h2>{title}</h2>
    {intro && <div className={styles.intro}>{intro}</div>}
  </header>;
}

function safeHref(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? value
      : "#";
  } catch {
    return "#";
  }
}

function safeImageUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}

function ActionLink({ href, label, secondary = false }: { href: string; label: string; secondary?: boolean }) {
  if (!href || !label) return null;
  return <a className={secondary ? styles.secondaryAction : styles.primaryAction} href={safeHref(href)}>{label}<span aria-hidden="true">→</span></a>;
}

export function HeroBlock(props: PageComponents["Hero"]) {
  return <section className={sectionClass(props.tone, styles.hero)}>
    <div className={styles.heroGrid}>
      <div>
        {props.eyebrow && <p className={styles.eyebrow}>{props.eyebrow}</p>}
        <h1>{props.title}</h1>
        {props.description && <p className={styles.heroLead}>{props.description}</p>}
        <div className={styles.actions}>
          <ActionLink href={props.primaryHref} label={props.primaryLabel} />
          <ActionLink href={props.secondaryHref} label={props.secondaryLabel} secondary />
        </div>
      </div>
      <div className={styles.heroMotif} aria-hidden="true">
        <span className={styles.orbit} />
        <span className={styles.amulet}><i /><b>泰聚達</b></span>
      </div>
    </div>
  </section>;
}

export function TextBlock(props: PageComponents["Text"]) {
  return <section className={sectionClass(props.tone)} id="content">
    <div className={`${styles.textBlock} ${styles[`align_${props.alignment}`]}`}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} />
      <div className={styles.prose}>{props.body}</div>
    </div>
  </section>;
}

export function ImageFeatureBlock(props: PageComponents["ImageFeature"]) {
  const imageUrl = safeImageUrl(props.imageUrl);
  return <section className={sectionClass(props.tone)}>
    <div className={`${styles.imageFeature} ${props.imagePosition === "right" ? styles.imageRight : ""}`}>
      <div className={styles.imageFrame}>
        {imageUrl
          ? <img src={imageUrl} alt={props.imageAlt} loading="lazy" />
          : <div className={styles.imagePlaceholder} role="img" aria-label="尚未設定圖片"><span>IMAGE</span><b>加入系列主視覺</b></div>}
      </div>
      <div className={styles.featureCopy}>
        <SectionHeading eyebrow={props.eyebrow} title={props.title} />
        <div className={styles.prose}>{props.body}</div>
        <ActionLink href={props.buttonHref} label={props.buttonLabel} />
      </div>
    </div>
  </section>;
}

export function FeaturesBlock(props: PageComponents["Features"]) {
  return <section className={sectionClass(props.tone)}>
    <div className={styles.shell}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <div className={styles.featureGrid} style={{ "--columns": props.columns } as React.CSSProperties}>
        {props.items.map((item, index) => <article key={`${item.title}-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>)}
      </div>
    </div>
  </section>;
}

export function FaqBlock(props: PageComponents["FAQ"]) {
  return <section className={sectionClass(props.tone)}>
    <div className={`${styles.shell} ${styles.faqShell}`}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      <div className={styles.faqList}>
        {props.items.map((item, index) => <details key={`${item.question}-${index}`}>
          <summary><span>{item.question}</span><i aria-hidden="true">＋</i></summary>
          <p>{item.answer}</p>
        </details>)}
      </div>
    </div>
  </section>;
}

export function CtaBlock(props: PageComponents["CTA"]) {
  return <section className={sectionClass(props.tone, styles.cta)}>
    <div className={styles.ctaCopy}>
      {props.eyebrow && <p className={styles.eyebrow}>{props.eyebrow}</p>}
      <h2>{props.title}</h2>
      {props.body && <p>{props.body}</p>}
    </div>
    <ActionLink href={props.buttonHref} label={props.buttonLabel} />
  </section>;
}

function formatPrice(value?: number) {
  if (!Number.isSafeInteger(value)) return "洽詢價格";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function ProductShowcaseBlock(
  props: PageComponents["ProductShowcase"] & { products?: ShowcaseProduct[] },
) {
  const limit = Number(props.limit);
  const items = (props.products || [])
    .filter((item) => (!item.status || item.status === "active") && (props.category === "all" || item.category === props.category))
    .slice(0, limit);

  return <section className={sectionClass(props.tone)}>
    <div className={styles.shell}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      {items.length > 0 ? <div className={styles.cardGrid}>
        {items.map((item) => <article className={styles.productCard} key={item.id}>
          <a className={styles.productArt} href={`/products/${encodeURIComponent(item.slug)}/`} aria-label={`查看${item.name}`}>
            <span aria-hidden="true">泰</span>
          </a>
          <p>{[item.origin, item.material].filter(Boolean).join(" · ") || "藏品資料"}</p>
          <h3><a href={`/products/${encodeURIComponent(item.slug)}/`}>{item.name}</a></h3>
          <div><b>{formatPrice(item.price)}</b>{typeof item.stock === "number" && <small>{item.stock > 0 ? `現貨 ${item.stock} 件` : "目前無庫存"}</small>}</div>
        </article>)}
      </div> : <div className={styles.emptyState}>商品資料會在公開頁由已發布的商品快照帶入。</div>}
      <div className={styles.sectionAction}><ActionLink href={props.viewAllHref} label={props.viewAllLabel} secondary /></div>
    </div>
  </section>;
}

export function ArticleShowcaseBlock(
  props: PageComponents["ArticleShowcase"] & { articles?: ShowcaseArticle[] },
) {
  const items = (props.articles || [])
    .filter((item) => (!item.status || item.status === "published") && item.noindex !== true)
    .slice(0, Number(props.limit));

  return <section className={sectionClass(props.tone)}>
    <div className={styles.shell}>
      <SectionHeading eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
      {items.length > 0 ? <div className={styles.articleGrid}>
        {items.map((item, index) => <article key={item.id}>
          <div className={styles.articleArt}><span>{String(index + 1).padStart(2, "0")}</span><i aria-hidden="true" /></div>
          <p>{item.tag || "收藏誌"}</p>
          <h3><a href={`/articles/${encodeURIComponent(item.slug)}/`}>{item.title}</a></h3>
          {item.excerpt && <div>{item.excerpt}</div>}
          <a href={`/articles/${encodeURIComponent(item.slug)}/`}>閱讀文章 →</a>
        </article>)}
      </div> : <div className={styles.emptyState}>文章資料會在公開頁由已發布的文章快照帶入。</div>}
      <div className={styles.sectionAction}><ActionLink href={props.viewAllHref} label={props.viewAllLabel} secondary /></div>
    </div>
  </section>;
}
