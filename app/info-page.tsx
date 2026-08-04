import Link from "next/link";
import type { ReactNode } from "react";
import { publishedBrandMark, publishedBrandName } from "../shared/published-site";
import styles from "./info-page.module.css";

export default function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span>{publishedBrandMark}</span><b>{publishedBrandName}</b></Link>
        <Link href="/">返回典藏首頁 →</Link>
      </header>
      <article className={styles.article}>
        <nav aria-label="麵包屑"><Link href="/">首頁</Link><span>/</span><span>{title}</span></nav>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        <div className={styles.content}>{children}</div>
      </article>
      <footer className={styles.footer}><span>© 2026 {publishedBrandName}</span><Link href="/service/contact/">聯絡與訂單協助</Link></footer>
    </main>
  );
}
