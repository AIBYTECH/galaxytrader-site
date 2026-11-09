/** Types shared by .astro pages and React islands (no data, safe to import anywhere). */

/** One product as shown in a card, a search result or the reorder list. */
export interface CardItem {
  sku: string;
  name: string;
  url: string;
  thumb: string;
  fits: string;
  inStock: boolean;
  status: string;
  moq: number | null;
}

/** A card plus what the category filters need (from /data/c/<id>.json). */
export interface FilterItem extends CardItem {
  brands: string[];
  machines: string[];
}

/** Site details islands need (passed as props from the layout). */
export interface SiteInfo {
  name: string;
  whatsappNumber: string;
  email: string;
}
