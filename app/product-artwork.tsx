"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type CSSProperties, type ReactNode } from "react";
import type { Product } from "./data";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

/**
 * Keep stored image fields out of the DOM unless they resolve to an explicit
 * site-local path or an HTTP(S) resource without embedded credentials.
 */
export function safePublicImageUrl(value: unknown, siteUrl = ""): string {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate || CONTROL_CHARACTERS.test(candidate)) return "";

  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
    if (!siteUrl) return candidate;
    try {
      const base = new URL(siteUrl);
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) return candidate;
      if (!base.pathname.endsWith("/")) base.pathname += "/";
      return new URL(`.${candidate}`, base).toString();
    } catch {
      return candidate;
    }
  }

  if (candidate.startsWith("/")) return "";

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function SafePublicImage({
  src,
  alt,
  className,
  style,
  fallback = null,
  loading = "lazy",
  fetchPriority,
}: {
  src: unknown;
  alt: string;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const safeSrc = safePublicImageUrl(src, process.env.NEXT_PUBLIC_SITE_URL || "");
  const [failedSrc, setFailedSrc] = useState("");

  if (!safeSrc || failedSrc === safeSrc) return fallback;
  return <img
    src={safeSrc}
    alt={alt}
    className={className}
    style={style}
    loading={loading}
    decoding="async"
    fetchPriority={fetchPriority}
    onError={() => setFailedSrc(safeSrc)}
  />;
}

function PrototypeArtwork({ product }: { product: Product }) {
  return <>
    <span className={`amulet-piece shape-${product.shape}`} aria-hidden="true">
      <span className="amulet-loop" />
      <span className="amulet-aura" />
      <span className="amulet-figure"><i /><b /></span>
      <span className="amulet-line amulet-line--one" />
      <span className="amulet-line amulet-line--two" />
    </span>
    <small>PROTOTYPE VISUAL</small>
  </>;
}

export default function ProductArtwork({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  const imageAlt = product.imageAlt?.trim() || `${product.name}商品照片`;

  return (
    <div
      className={`amulet-art tone-${product.tone} ${large ? "amulet-art--large" : ""}`}
      role="img"
      aria-label={imageAlt}
    >
      <SafePublicImage
        src={product.imageUrl}
        alt={imageAlt}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        loading={large ? "eager" : "lazy"}
        fetchPriority={large ? "high" : "auto"}
        fallback={<PrototypeArtwork product={product} />}
      />
    </div>
  );
}
