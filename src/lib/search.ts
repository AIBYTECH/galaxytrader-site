/**
 * Part search: MiniSearch over one JSON index (/data/search-index.json).
 *
 * The library and the index are downloaded only the first time someone
 * focuses a search box, so pages that never search stay small.
 *
 * Matching rules (same as the old site):
 *  - fuzzy + prefix on words, so "rotery hok" and "presser f" still match;
 *  - SKUs are also searched in a normalised form (capitals, no dashes or
 *    spaces, letter O read as zero), so "gt10115", "GT-1O115" and
 *    "ddl8700" find GT-10115 and DDL-8700;
 *  - local names ("kanda") come from the aliases columns of the workbook.
 */
import type MiniSearch from "minisearch";
import type { SearchResult } from "minisearch";

export interface SearchDoc {
  id: string;
  sku: string;
  name: string;
  url: string;
  thumb: string;
  fits: string;
  status: string;
  inStock: boolean;
  moq: number | null;
}

export type Hit = SearchResult & SearchDoc;

/** Capitals, letters and digits only, and the letter O read as zero. */
export function skuNorm(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
}

let ready: Promise<MiniSearch<SearchDoc>> | null = null;

/** Download MiniSearch + the index once; later calls reuse the same promise. */
export function loadSearch(): Promise<MiniSearch<SearchDoc>> {
  ready ??= Promise.all([
    import("minisearch"),
    fetch("/data/search-index.json").then((r) => {
      if (!r.ok) throw new Error(`search index: HTTP ${r.status}`);
      return r.json();
    }),
  ]).then(([{ default: MiniSearchClass }, docs]) => {
    const ms = new MiniSearchClass<SearchDoc>({
      fields: ["sku", "skuNorm", "name", "aliases", "machines", "category"],
      storeFields: ["sku", "name", "url", "thumb", "fits", "status", "inStock", "moq"],
      searchOptions: { boost: { sku: 4, skuNorm: 4, name: 2, machines: 1.5 }, prefix: true, fuzzy: 0.2 },
      // Machine models are also indexed without dashes, so "ddl8700" finds
      // "DDL-8700" even when nobody typed that alias into the workbook.
      extractField: (doc, field) => {
        const value = String((doc as unknown as Record<string, unknown>)[field] ?? "");
        return field === "machines" ? `${value} ${value.replace(/(?<=\w)-(?=\w)/g, "")}` : value;
      },
    });
    ms.addAll(docs);
    return ms;
  });
  // If it fails (offline), let the next attempt try again.
  ready.catch(() => (ready = null));
  return ready;
}

/** Search the words AND the normalised SKU, then merge the two result lists. */
export function runSearch(ms: MiniSearch<SearchDoc>, query: string): Hit[] {
  const q = query.trim();
  if (!q) return [];
  const words = ms.search(q);
  const norm = skuNorm(q);
  const bySku = norm.length >= 3 ? ms.search(norm, { fields: ["skuNorm"], prefix: true, fuzzy: false }) : [];
  const seen = new Set<string>();
  return [...bySku, ...words]
    .sort((a, b) => b.score - a.score)
    .filter((r) => !seen.has(r.id) && seen.add(r.id)) as Hit[];
}
