/**
 * Browser-side state shared by all islands: the reorder list and the
 * "recently viewed" parts. Both live in localStorage, so they survive
 * page changes and stay on the customer's phone for next time.
 *
 * Islands are separate React roots, so they can't share React state.
 * Instead every change fires a `gt:list` event on window, and the
 * useReorderList() hook re-reads the list when it hears one (or when
 * another browser tab changes it, via the `storage` event).
 *
 * The storage keys are the same as the old site's, so customers keep
 * their saved lists after the redesign.
 */
import { useSyncExternalStore } from "react";

export interface ListItem {
  sku: string;
  name: string;
  url: string;
  qty: number;
}

export interface RecentItem {
  sku: string;
  name: string;
  url: string;
  thumb: string;
}

const LIST_KEY = "gt-reorder-list-v1";
const RECENT_KEY = "gt-recent-v1";
const CHANGE = "gt:list";
const MAX_RECENT = 10;

/** Read JSON from localStorage; private mode or blocked storage returns the fallback. */
function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the page still works, the list just isn't saved */
  }
}

// ---------------------------------------------------------------------------
// Reorder list
// ---------------------------------------------------------------------------
// useSyncExternalStore needs the same array object until the data changes,
// so we cache the parsed list and only re-read it after a change event.
let cache: ListItem[] | null = null;

export function getList(): ListItem[] {
  if (cache === null) cache = load<ListItem[]>(LIST_KEY, []);
  return cache;
}

export function setList(list: ListItem[]): void {
  cache = list;
  save(LIST_KEY, list);
  window.dispatchEvent(new Event(CHANGE));
}

/** Add a part (or update its quantity if `replaceQty` is set). Returns the saved quantity. */
export function addToList(item: Omit<ListItem, "qty">, qty: number, replaceQty = false): number {
  const list = getList().slice();
  const i = list.findIndex((x) => x.sku === item.sku);
  if (i >= 0) {
    if (replaceQty) list[i] = { ...list[i], qty };
  } else {
    list.push({ ...item, qty });
  }
  setList(list);
  return list.find((x) => x.sku === item.sku)!.qty;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === LIST_KEY) {
      cache = null;
      onChange();
    }
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: ListItem[] = [];

/** React hook: the current reorder list; re-renders when it changes anywhere. */
export function useReorderList(): ListItem[] {
  // The server render (and the first client render) use an empty list,
  // so the static HTML always matches; the saved list appears right after.
  return useSyncExternalStore(subscribe, getList, () => EMPTY);
}

// ---------------------------------------------------------------------------
// Recently viewed parts
// ---------------------------------------------------------------------------
export function getRecent(): RecentItem[] {
  return load<RecentItem[]>(RECENT_KEY, []);
}

export function addRecent(item: RecentItem): void {
  const rest = getRecent().filter((r) => r.sku !== item.sku);
  save(RECENT_KEY, [item, ...rest].slice(0, MAX_RECENT));
}

// ---------------------------------------------------------------------------
// Toast messages (shown by the <Toaster> island)
// ---------------------------------------------------------------------------
export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent("gt:toast", { detail: message }));
}
