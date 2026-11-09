/**
 * The /search/?q=... page: full results as product cards (up to 120).
 * The page is noindex; the search itself runs in the browser.
 */
import { useEffect, useState } from "react";
import MotionRoot from "./MotionRoot";
import ProductCard from "./ProductCard";
import { gridClass } from "./ProductGrid";
import { loadSearch, runSearch, type Hit } from "../../lib/search";

const MAX = 120;

function SearchResults({ whatsapp }: { whatsapp: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const q = (new URLSearchParams(location.search).get("q") ?? "").trim();
    setQuery(q);
    if (!q) return;
    document.title = `Search: ${q} | GalaxyTrader`;
    loadSearch()
      .then((ms) => setHits(runSearch(ms, q)))
      .catch(() => setError(true));
  }, []);

  return (
    <>
      <h1>{query ? `Results for “${query}”` : "Search parts"}</h1>
      <form action="/search/" role="search" className="mb-4 flex gap-2">
        <label htmlFor="q2" className="sr-only">
          Search parts
        </label>
        <input
          id="q2"
          name="q"
          type="search"
          defaultValue={query}
          key={query}
          placeholder="Part number, part name or machine model"
          className="h-13 min-w-0 flex-1 rounded-lg border-2 border-ink px-3.5"
        />
        <button className="btn btn-accent btn-big" type="submit">
          Search
        </button>
      </form>
      <p className="mb-3 min-h-5 text-sm text-ink-2" aria-live="polite">
        {error
          ? "Search couldn't load. Please refresh the page."
          : query && !hits
            ? "Searching…"
            : hits
              ? `${hits.length} ${hits.length === 1 ? "part" : "parts"} found`
              : ""}
      </p>
      {hits && hits.length > 0 && (
        <div className={gridClass}>
          {hits.slice(0, MAX).map((h) => (
            <ProductCard key={h.id} item={h} />
          ))}
        </div>
      )}
      {hits && hits.length === 0 && (
        <div className="notice">
          No parts found. Try the part number without dashes, or your machine model (e.g. DDL-8700). Or{" "}
          <a href={`https://wa.me/${whatsapp}`} rel="noopener" data-wa-click="search">
            send us a photo on WhatsApp
          </a>
          .
        </div>
      )}
    </>
  );
}

export default function SearchResultsIsland(props: { whatsapp: string }) {
  return (
    <MotionRoot>
      <SearchResults {...props} />
    </MotionRoot>
  );
}
