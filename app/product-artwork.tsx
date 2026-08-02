import type { Product } from "./data";

export default function ProductArtwork({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  return (
    <div
      className={`amulet-art tone-${product.tone} ${large ? "amulet-art--large" : ""}`}
      aria-label={`${product.shortName}商品視覺示意`}
    >
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
