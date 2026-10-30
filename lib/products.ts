import { packPriceCents, priceCents } from "@/lib/env";
import { STYLE_IDS, type StyleId } from "@/lib/types";

export const PRODUCTS = ["single", "pack"] as const;
export type Product = (typeof PRODUCTS)[number];

export function isProduct(value: unknown): value is Product {
  return typeof value === "string" && PRODUCTS.includes(value as Product);
}

/** Prices always come from the server env, never from the client. */
export function productPriceCents(product: Product): number {
  return product === "pack" ? packPriceCents() : priceCents();
}

const PACK_DEFAULTS: StyleId[] = ["vampire", "zombie", "witch", "pumpkin"];

/**
 * Pack composition is a pure function of the chosen style: the chosen style
 * first, then the ordered defaults minus the chosen one (first three), padded
 * with any remaining styles so the result is always four distinct styles.
 */
export function packStyles(chosen: StyleId): StyleId[] {
  const result: StyleId[] = [chosen];
  for (const style of PACK_DEFAULTS) {
    if (result.length === 4) break;
    if (!result.includes(style)) result.push(style);
  }
  for (const style of STYLE_IDS) {
    if (result.length === 4) break;
    if (!result.includes(style)) result.push(style);
  }
  return result;
}
