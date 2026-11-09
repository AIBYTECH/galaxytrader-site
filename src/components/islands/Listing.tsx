/**
 * Category / machine listing: optional filters + product grid + pages.
 *
 * Without JavaScript: the server-rendered page of 48 cards and the page
 * links (/c/<id>/page/2/ ...) work on their own; the filters are disabled.
 *
 * With JavaScript: choosing a brand, model or "in stock only" downloads
 * /data/c/<id>.json once, filters ALL parts of the category in the browser,
 * and shows them 48 at a time with a "Show more" button.
 *
 * Re-filtering is animated with the browser's View Transitions API: each
 * card gets a view-transition-name (its SKU) just for the transition, so
 * cards that stay slide to their new place and the others fade in or out.
 * Browsers without the API (and reduced motion) simply update instantly.
 * This costs no extra JavaScript, unlike Motion's layout animations (+14 KB).
 */
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, m } from "motion/react";
import MotionRoot from "./MotionRoot";
import ProductCard from "./ProductCard";
import { gridClass } from "./ProductGrid";
import { useSafeTransition } from "../../lib/motion";
import type { CardItem, FilterItem } from "../../lib/types";

interface Props {
  /** cards on this static page (page 1, 2...) */
  items: CardItem[];
  total: number;
  /** brand -> models; an empty object means no filters (machine pages) */
  filters: Record<string, { id: string; model: string }[]>;
  /** /data/c/<id>.json: all parts of the category, for filtering */
  dataUrl?: string;
  pages: { n: number; href: string; current: boolean }[];
}

const PAGE = 48;

/** Run `update` inside a view transition when the browser supports it. */
function animateGrid(grid: HTMLElement | null, update: () => void) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!grid || reduce || !("startViewTransition" in document)) {
    update();
    return;
  }
  const cards = () => grid.querySelectorAll<HTMLElement>("[data-sku]");
  const name = () => cards().forEach((el) => (el.style.viewTransitionName = `card-${el.dataset.sku}`));
  name(); // capture the old positions
  const vt = document.startViewTransition(() => {
    flushSync(update); // render the new grid synchronously...
    name(); // ...and name the new cards so matching SKUs morph
  });
  vt.finished.finally(() => cards().forEach((el) => (el.style.viewTransitionName = "")));
}

function Listing({ items, total, filters, dataUrl, pages }: Props) {
  const [ready, setReady] = useState(false); // false until hydrated
  const [all, setAll] = useState<FilterItem[] | null>(null);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [stock, setStock] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [status, setStatus] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const t = useSafeTransition();

  useEffect(() => setReady(true), []);

  const active = Boolean(brand || model || stock);
  const hasFilters = Object.keys(filters).length > 0;

  // Download every part of the category the first time a filter is used.
  useEffect(() => {
    if (!active || all || !dataUrl) return;
    setStatus("Loading…");
    fetch(dataUrl)
      .then((r) => r.json())
      .then((data: FilterItem[]) => animateGrid(gridRef.current, () => { setAll(data); setStatus(""); }))
      .catch(() => setStatus("Filters couldn't load. Please refresh the page."));
  }, [active, all, dataUrl]);

  const matches =
    active && all
      ? all.filter(
          (i) =>
            (!brand || i.brands.includes(brand)) &&
            (!model || i.machines.includes(model)) &&
            (!stock || (i.inStock && i.status !== "discontinued")),
        )
      : null;
  const visible = matches ? matches.slice(0, shown) : items;
  const count = matches ? matches.length : total;
  const countText = status || `${count} ${count === 1 ? "part" : "parts"}`;

  /** Change a filter, animating the grid from the old to the new result. */
  function change(fn: () => void) {
    animateGrid(gridRef.current, () => {
      fn();
      setShown(PAGE);
    });
  }

  return (
    <>
      {hasFilters ? (
        <form
          className="my-2 mb-4 grid grid-cols-2 items-end gap-x-3.5 gap-y-2.5 rounded-[10px] border border-line bg-white p-3.5 lg:grid-cols-[1fr_1fr_auto_1fr]"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filter parts"
        >
          {/* Disabled until JavaScript is running, because filtering needs it */}
          <fieldset disabled={!ready} className="contents">
            <div>
              <label htmlFor="f-brand">Machine brand</label>
              <select
                id="f-brand"
                value={brand}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  change(() => { setBrand(value); setModel(""); });
                }}
              >
                <option value="">All brands</option>
                {Object.keys(filters).map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-model">Machine model</label>
              <select
                id="f-model"
                value={model}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  change(() => setModel(value));
                }}
              >
                <option value="">All models</option>
                {(brand ? filters[brand] : Object.values(filters).flat()).map((mo) => (
                  <option key={mo.id} value={mo.id}>
                    {mo.model}
                  </option>
                ))}
              </select>
            </div>
            <label className="col-span-2 flex min-h-11 items-center gap-2 text-[15px] font-normal lg:col-span-1">
              <input
                type="checkbox"
                className="size-5 accent-ink"
                checked={stock}
                onChange={(e) => {
                  const value = e.currentTarget.checked;
                  change(() => setStock(value));
                }}
              />
              In stock only
            </label>
          </fieldset>
          {/* The count slides when it changes; aria-live announces it */}
          <p className="relative col-span-2 m-0 h-6 overflow-hidden text-sm text-ink-2 lg:col-span-1" aria-live="polite">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={countText}
                className="block"
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={t}
              >
                {countText}
              </m.span>
            </AnimatePresence>
          </p>
        </form>
      ) : (
        <p className="mb-3 text-sm text-ink-2">{countText}</p>
      )}

      <h2 className="sr-only">Parts</h2>
      <div ref={gridRef} className={gridClass}>
        {visible.map((item) => (
          <ProductCard key={item.sku} item={item} />
        ))}
      </div>
      {matches && matches.length === 0 && (
        <p className="notice">No parts match these filters. Try “All models”, or untick “In stock only”.</p>
      )}

      {matches && shown < matches.length && (
        <div className="mt-5 mb-10 flex justify-center">
          <button type="button" className="btn btn-outline btn-big" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({matches.length - shown})
          </button>
        </div>
      )}

      {/* Page links for the unfiltered list (also work without JavaScript) */}
      {!matches && pages.length > 1 && (
        <nav className="mt-6 mb-10 flex flex-wrap gap-1.5" aria-label="Pages">
          {pages.map((p) =>
            p.current ? (
              <span key={p.n} aria-current="page" className="inline-flex size-11 items-center justify-center rounded-lg bg-ink font-semibold text-white">
                {p.n}
              </span>
            ) : (
              <a key={p.n} href={p.href} className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-white font-semibold no-underline">
                {p.n}
              </a>
            ),
          )}
        </nav>
      )}
    </>
  );
}

export default function ListingIsland(props: Props) {
  return (
    <MotionRoot>
      <Listing {...props} />
    </MotionRoot>
  );
}
