import {
  catalogCategories,
  formatPrice,
} from "../shared/catalog";
import { publishedProducts } from "../shared/published-content";

export { catalogCategories, formatPrice };
export const products = publishedProducts;

export type {
  CatalogCategory,
  Product,
  ProductCategory,
  ProductShape,
  ProductStatus,
} from "../shared/catalog";
