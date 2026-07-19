"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPrice, products, type Product } from "./data";

type CartLine = { product: Product; quantity: number };
const filters = ["全部新藏", "佛牌", "神尊", "符印"] as const;

function AmuletArtwork({ product, large = false }: { product: Product; large?: boolean }) {
  return (
    <div className={`amulet-art tone-${product.tone} ${large ? "amulet-art--large" : ""}`} aria-label={`${product.shortName}商品視覺示意`}>
      <span className={`amulet-piece shape-${product.shape}`}>
        <span className="amulet-loop" />
        <span className="amulet-aura" />
        <span className="amulet-figure"><i /><b /></span>
        <span className="amulet-line amulet-line--one" />
        <span className="amulet-line amulet-line--two" />
      </span>
      <small>PROTOTYPE VISUAL</small>
    </div>
  );
}

export default function Storefront() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("全部新藏");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.body.classList.toggle("no-scroll", cartOpen || menuOpen || selected !== null);
    return () => document.body.classList.remove("no-scroll");
  }, [cartOpen, menuOpen, selected]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCartOpen(false); setMenuOpen(false); setSearchOpen(false); setSelected(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const filterMatch = activeFilter === "全部新藏" || product.category === activeFilter;
      const queryMatch = !normalized || [product.name, product.theme, product.origin, product.material].join(" ").toLowerCase().includes(normalized);
      return filterMatch && queryMatch;
    });
  }, [activeFilter, query]);

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const addToCart = (product: Product) => {
    setCart((current) => {
      const exists = current.find((line) => line.product.id === product.id);
      return exists
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1 }];
    });
    showNotice(`${product.shortName}已加入收藏袋`);
  };

  const updateQuantity = (productId: number, amount: number) => {
    setCart((current) => current
      .map((line) => line.product.id === productId ? { ...line, quantity: line.quantity + amount } : line)
      .filter((line) => line.quantity > 0));
  };

  return (
    <main>
      <div className="announcement"><p>原型展示｜每件聖物正式上架前皆須完成來源覆核</p><span>台灣現貨・安心配送</span></div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="藏曜選物首頁">
          <span className="brand-mark">藏</span>
          <span><b>藏曜選物</b><small>ZANGYAO AMULET ARCHIVE</small></span>
        </a>
        <nav className="desktop-nav" aria-label="主要導覽">
          <a href="#new">本週新藏</a><a href="#collections">佛牌與聖物</a><a href="#themes">依祈願主題</a><a href="#archive">來源履歷</a><a href="#journal">收藏誌</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button desktop-search" onClick={() => setSearchOpen((value) => !value)} aria-label="搜尋商品" aria-expanded={searchOpen}>⌕</button>
          <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`收藏袋，共 ${itemCount} 件商品`}><i className="bag-glyph" aria-hidden="true">◇</i><span>收藏袋</span>{itemCount > 0 && <b>{itemCount}</b>}</button>
          <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="開啟選單">☰</button>
        </div>
        {searchOpen && <div className="search-panel"><label htmlFor="site-search">搜尋</label><input id="site-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋佛牌、材質、地區或祈願主題" /><a href="#new" onClick={() => setSearchOpen(false)}>查看結果 →</a></div>}
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AMULET ARCHIVE · TAIWAN</p>
          <h1>把來源說清楚，<br />才值得長久收藏。</h1>
          <p className="hero-lead">精選泰國佛牌與聖物，以實物影像、尺寸材質、法會年份與來源紀錄，陪你從理解文化開始選擇。</p>
          <div className="hero-actions"><a className="button button--gold" href="#new">探索本週新藏 <span>→</span></a><a className="text-link" href="#journal">先讀選牌指南 ↗</a></div>
          <div className="hero-note"><span>01</span><p>不以神奇功效作銷售話術<small>從文化、來源與工藝開始認識</small></p></div>
        </div>
        <div className="hero-art" aria-label="佛牌視覺概念示意">
          <div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" />
          <div className="hero-card hero-card--back"><span>2566</span></div>
          <div className="hero-amulet"><span className="hero-loop" /><span className="hero-halo" /><span className="hero-figure"><i /><b /></span><span className="hero-inscription">藏 曜</span></div>
          <div className="hero-caption"><small>COLLECTION 001</small><b>典藏系列</b></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="服務特色">
        {[["01", "資料透明", "年份、材質與來源欄位"], ["02", "一物一拍", "正反面與細節如實留存"], ["03", "安心結帳", "正式版串接台灣金物流"], ["04", "尊重信仰", "文化導讀，不保證功效"]].map(([number, title, text]) => <div key={number}><span>{number}</span><p><b>{title}</b><small>{text}</small></p></div>)}
      </section>

      <section className="collection-nav" id="collections">
        <div className="section-heading"><div><p className="eyebrow eyebrow--dark">FIND YOUR COLLECTION</p><h2>從喜歡的形制開始</h2></div><p>不確定該怎麼選？先從外型、文化脈絡與收藏偏好認識，不必急著替自己套上答案。</p></div>
        <div className="category-grid">
          {[["佛牌", "崇迪・必打・坤平・龍婆托", "arch"], ["神尊", "四面神・象神・招財女神", "statue"], ["符印", "哈奴曼・符管・紀念章", "round"]].map(([name, detail, shape], index) => (
            <a href="#new" className="category-card" key={name} onClick={() => setActiveFilter(name as "佛牌" | "神尊" | "符印")}><span className={`category-symbol category-symbol--${shape}`}><i /></span><span className="category-index">0{index + 1}</span><h3>{name}</h3><p>{detail}</p><b>查看系列 →</b></a>
          ))}
        </div>
      </section>

      <section className="products-section" id="new">
        <div className="section-heading section-heading--products"><div><p className="eyebrow eyebrow--dark">NEW ARRIVALS</p><h2>本週新藏</h2></div><div className="filters" role="group" aria-label="商品分類">{filters.map((filter) => <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => setActiveFilter(filter)}>{filter}</button>)}</div></div>
        {query && <p className="search-result-copy">搜尋「{query}」— 找到 {visibleProducts.length} 件展示商品</p>}
        <div className="product-grid">
          {visibleProducts.map((product) => <article className="product-card" key={product.id}>
            <button className="product-visual" onClick={() => setSelected(product)} aria-label={`查看${product.name}詳情`}><span className="product-badge">{product.badge}</span><span className="favorite">♡</span><AmuletArtwork product={product} /><span className="quick-view">查看收藏履歷</span></button>
            <div className="product-info"><p>{product.origin} · {product.buddhistYear}</p><h3><button onClick={() => setSelected(product)}>{product.name}</button></h3><div><b>{formatPrice(product.price)}</b><button className="add-button" onClick={() => addToCart(product)} aria-label={`將${product.shortName}加入收藏袋`}>＋</button></div></div>
          </article>)}
        </div>
        {visibleProducts.length === 0 && <div className="empty-products"><p>目前沒有符合的展示商品。</p><button onClick={() => { setQuery(""); setActiveFilter("全部新藏"); }}>清除搜尋</button></div>}
        <div className="section-footer"><a href="#collections">查看全部典藏 →</a></div>
      </section>

      <section className="theme-section" id="themes">
        <div className="theme-intro"><p className="eyebrow">CULTURAL CONTEXT</p><h2>想找的，不只是<br />一個「功效」標籤。</h2><p>我們以常見的信仰脈絡整理主題，保留每個人理解與感受的空間。</p><small>祈願主題為文化脈絡與民間信仰整理，不代表效果承諾。</small></div>
        <div className="theme-list">{["守護與安心", "事業與行動", "財運與商務", "人緣與溝通", "學業與專注"].map((theme, index) => <a key={theme} href="#new" onClick={() => { setQuery(theme); setActiveFilter("全部新藏"); }}><span>0{index + 1}</span><b>{theme}</b><i>→</i></a>)}</div>
      </section>

      <section className="archive-section" id="archive">
        <div className="archive-visual"><div className="document-card document-card--back"><span>ZAA</span></div><div className="document-card document-card--front"><p>OBJECT RECORD</p><h3>藏品履歷卡</h3><dl><div><dt>編號</dt><dd>ZAA-2566-001</dd></div><div><dt>年份</dt><dd>佛曆 2566</dd></div><div><dt>材質</dt><dd>Sacred powder</dd></div><div><dt>狀態</dt><dd>待逐件覆核</dd></div></dl><span className="record-seal">藏曜<br />選物</span></div></div>
        <div className="archive-copy"><p className="eyebrow eyebrow--dark">PROVENANCE MATTERS</p><h2>一件聖物，<br />應該有看得懂的履歷。</h2><p>正式商品頁不只放名稱與價格，也會整理寺廟或來源、師父或法會、佛曆年份、材質尺寸、取得方式、保存狀況與實拍日期。</p><ul><li><span>01</span>來源與法會資訊</li><li><span>02</span>尺寸、材質與保存狀況</li><li><span>03</span>正反面及細節實拍</li><li><span>04</span>單件庫存與典藏編號</li></ul><a className="button button--dark" href="#journal">了解我們的紀錄方式 →</a></div>
      </section>

      <section className="journal-section" id="journal">
        <div className="section-heading"><div><p className="eyebrow eyebrow--dark">THE JOURNAL</p><h2>收藏誌</h2></div><a className="heading-link" href="#journal">閱讀全部文章 →</a></div>
        <div className="journal-grid">{[["新手指南", "第一次接觸泰國佛牌：先看懂年份、材質與來源", "07 MIN READ", "paper"], ["收藏保養", "佛牌外殼只是保護嗎？常見材質與收藏方式", "05 MIN READ", "case"], ["來源紀錄", "從寺廟到收藏櫃：一件聖物的履歷應包含什麼？", "08 MIN READ", "stamp"]].map(([tag, title, time, art], index) => <article className="journal-card" key={title}><div className={`journal-art journal-art--${art}`}><span>0{index + 1}</span><i /></div><p>{tag} <span>{time}</span></p><h3>{title}</h3><a href="#archive">閱讀文章 →</a></article>)}</div>
      </section>

      <section className="newsletter"><div><p className="eyebrow">ARCHIVE LETTER</p><h2>新藏與文化筆記，<br />一個月寄一封就好。</h2></div><form onSubmit={(event) => { event.preventDefault(); showNotice("已記下你的信箱（原型不會真的送出）"); }}><label htmlFor="email">電子信箱</label><div><input id="email" type="email" required placeholder="your@email.com" /><button aria-label="訂閱電子報">→</button></div><small>此為互動原型，不會儲存或送出個人資料。</small></form></section>

      <footer><div className="footer-brand"><a className="brand brand--footer" href="#top"><span className="brand-mark">藏</span><span><b>藏曜選物</b><small>ZANGYAO AMULET ARCHIVE</small></span></a><p>來源可讀，收藏可久。<br />從文化與工藝開始認識泰國佛牌。</p></div><div className="footer-links"><div><b>典藏</b><a href="#new">本週新藏</a><a href="#collections">佛牌與聖物</a><a href="#themes">依祈願主題</a></div><div><b>認識</b><a href="#archive">來源履歷</a><a href="#journal">收藏誌</a><a href="#journal">新手指南</a></div><div><b>服務</b><a href="#footer-note">配送與付款</a><a href="#footer-note">退換貨說明</a><a href="#footer-note">聯絡我們</a></div></div><div className="footer-bottom" id="footer-note"><span>© 2026 藏曜選物｜前台概念原型</span><span>商品、品牌與來源資料皆為展示，正式上架前須覆核。</span></div></footer>

      <aside className={`mobile-menu ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}><div className="drawer-head"><span>選單</span><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="關閉選單">×</button></div><nav>{[["本週新藏", "#new"], ["佛牌與聖物", "#collections"], ["依祈願主題", "#themes"], ["來源履歷", "#archive"], ["收藏誌", "#journal"]].map(([label, href]) => <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}<span>→</span></a>)}</nav></aside>

      <aside className={`cart-drawer ${cartOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="收藏袋" aria-hidden={!cartOpen}><div className="drawer-head"><span>收藏袋 <small>{itemCount} 件</small></span><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="關閉收藏袋">×</button></div><div className="cart-lines">{cart.length === 0 ? <div className="empty-cart"><span>◇</span><h3>收藏袋還是空的</h3><p>從本週新藏挑一件喜歡的作品看看。</p><button className="button button--dark" onClick={() => setCartOpen(false)}>繼續逛逛</button></div> : cart.map((line) => <div className="cart-line" key={line.product.id}><div className="cart-thumb"><AmuletArtwork product={line.product} /></div><div className="cart-line-info"><p>{line.product.buddhistYear}</p><h3>{line.product.shortName}</h3><b>{formatPrice(line.product.price)}</b><div className="quantity"><button onClick={() => updateQuantity(line.product.id, -1)} aria-label="減少數量">−</button><span>{line.quantity}</span><button onClick={() => updateQuantity(line.product.id, 1)} aria-label="增加數量">＋</button></div></div></div>)}</div>{cart.length > 0 && <div className="cart-summary"><div><span>小計</span><b>{formatPrice(subtotal)}</b></div><p>運費與付款方式將於正式結帳頁顯示。</p><button className="button button--gold" onClick={() => showNotice("結帳流程將在下一階段串接")}>前往結帳 →</button></div>}</aside>

      {selected && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><button className="modal-backdrop" onClick={() => setSelected(null)} aria-label="關閉商品詳情" /><div className="product-modal"><button className="modal-close icon-button" onClick={() => setSelected(null)} aria-label="關閉商品詳情">×</button><div className="modal-visual"><AmuletArtwork product={selected} large /></div><div className="modal-copy"><p className="eyebrow eyebrow--dark">OBJECT RECORD · {selected.badge}</p><h2 id="product-modal-title">{selected.name}</h2><p className="modal-price">{formatPrice(selected.price)}</p><p className="modal-description">此頁為前台原型展示。正式商品會逐件拍攝，並附上可閱讀的來源與保存資料。</p><dl><div><dt>地區／來源</dt><dd>{selected.origin}・{selected.temple}</dd></div><div><dt>年份</dt><dd>{selected.buddhistYear}（{selected.westernYear}）</dd></div><div><dt>材質</dt><dd>{selected.material}</dd></div><div><dt>尺寸</dt><dd>{selected.dimensions}</dd></div><div><dt>典藏狀態</dt><dd>展示資料・待逐件覆核</dd></div></dl><div className="modal-actions"><button className="button button--dark" onClick={() => { addToCart(selected); setSelected(null); setCartOpen(true); }}>加入收藏袋</button><button className="text-link" onClick={() => setSelected(null)}>繼續瀏覽</button></div><small className="faith-note">佛牌與聖物屬宗教文化及收藏商品，其意涵與感受因個人信仰而異，本店不作功效或結果保證。</small></div></div></div>}

      {(cartOpen || menuOpen) && <button className="drawer-backdrop" onClick={() => { setCartOpen(false); setMenuOpen(false); }} aria-label="關閉側邊欄" />}
      {notice && <div className="toast" role="status">{notice}</div>}
      <nav className="mobile-bottom-nav" aria-label="手機快速導覽"><a href="#top"><b>⌂</b><span>首頁</span></a><a href="#collections"><b>▦</b><span>分類</span></a><a href="#journal"><b>▤</b><span>收藏誌</span></a><button onClick={() => setCartOpen(true)}><b>◇</b><span>收藏袋</span>{itemCount > 0 && <i>{itemCount}</i>}</button></nav>
    </main>
  );
}
