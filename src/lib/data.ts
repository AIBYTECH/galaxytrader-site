/**
 * Catalogue data, read at BUILD time from the JSON files that
 * `python build.py --emit-json` writes into src/data/.
 *
 * Only .astro pages import this file. Islands receive the small pieces
 * they need as props, so the full catalogue never ships to the browser.
 */
import siteJson from "../data/site.json";
import productsJson from "../data/products.json";
import categoriesJson from "../data/categories.json";
import machinesJson from "../data/machines.json";
import type { CardItem } from "./types";

export interface Product {
  sku: string;
  slug: string;
  url: string;
  name: string;
  categoryId: string;
  subcategoryId: string;
  machineIds: string[];
  brands: string[];
  fits: string;
  description: string;
  specs: [string, string][];
  aliases: string[];
  moq: number | null;
  inStock: boolean;
  status: "active" | "discontinued";
  thumb: string;
  image: string;
  related: string[];
}

export interface Category {
  id: string;
  name: string;
  parentId: string;
  intro: string;
  url: string;
  children: string[];
  skus: string[];
  /** brand -> machine models, for the category filters */
  filters: Record<string, { id: string; model: string }[]>;
}

export interface Machine {
  id: string;
  brand: string;
  model: string;
  label: string;
  aliases: string[];
  url: string;
  skus: string[];
}

export const site = siteJson;
export const products = productsJson as Product[];
export const categories = categoriesJson as Category[];
export const machines = machinesJson as Machine[];

const productBySku = new Map(products.map((p) => [p.sku, p]));
const categoryById = new Map(categories.map((c) => [c.id, c]));
const machineById = new Map(machines.map((m) => [m.id, m]));

export const getProduct = (sku: string) => productBySku.get(sku)!;
export const getCategory = (id: string) => categoryById.get(id)!;
export const getMachine = (id: string) => machineById.get(id)!;

/** Top-level categories, in workbook order (used by the menu and home page). */
export const topCategories = categories.filter((c) => !c.parentId);

/** Machines that have at least one part, grouped by brand (A-Z). */
export const machinesByBrand: Record<string, Machine[]> = {};
for (const m of machines) {
  if (m.skus.length) (machinesByBrand[m.brand] ??= []).push(m);
}

/** The small record product cards, filters and the reorder list use. */
export function toCard(p: Product): CardItem {
  return {
    sku: p.sku, name: p.name, url: p.url, thumb: p.thumb, fits: p.fits,
    inStock: p.inStock, status: p.status, moq: p.moq,
  };
}

/** Split a list into pages of `size` (always at least one page). */
export function paginate<T>(items: T[], size = site.perPage): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

/** WhatsApp click-to-chat link with a pre-filled message. */
export function waLink(text?: string): string {
  const base = `https://wa.me/${site.whatsappNumber}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Pre-filled WhatsApp message for one product (SKU, name and page URL). */
export function productWaLink(p: Product): string {
  const link = site.baseUrl + p.url;
  return waLink(
    p.status === "discontinued"
      ? `Hi ${site.name}, part ${p.sku} (${p.name}) is discontinued. Can you suggest an alternative? ${link}`
      : `Hi ${site.name}, I want to ask about part ${p.sku} - ${p.name}. ${link}`,
  );
}
