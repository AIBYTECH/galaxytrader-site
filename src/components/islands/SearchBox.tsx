/**
 * Header search with an instant results dropdown.
 *
 * Without JavaScript it is a normal form that opens /search/?q=...
 * With JavaScript (hydrated when the browser is idle):
 *  - MiniSearch + the index download on first focus (lib/search.ts);
 *  - results appear as you type, in an animated dropdown;
 *  - keyboard: ↓/↑ move through results, Enter opens the highlighted part
 *    (or the full results page), Esc closes the dropdown.
 * Follows the WAI-ARIA "combobox with listbox" pattern for screen readers.
 */
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { loadSearch, runSearch, type Hit } from "../../lib/search";
import MotionRoot from "./MotionRoot";
import { useSafeTransition } from "../../lib/motion";

const MAX_RESULTS = 6;

function SearchBox({ id = "q" }: { id?: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);   // highlighted row, -1 = none
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const t = useSafeTransition();

  // Search 120 ms after the last key press (feels instant, avoids extra work).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      loadSearch()
        .then((ms) => {
          setHits(runSearch(ms, q).slice(0, MAX_RESULTS));
          setFailed(false);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          setFailed(true);
          setOpen(true);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  // Close when tapping anywhere outside the search box.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const allUrl = `/search/?q=${encodeURIComponent(query.trim())}`;
  // Rows = the results plus the "See all results" link at the end.
  const rowCount = hits.length + 1;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setActive((i) => (i + 1) % rowCount);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? rowCount - 1 : i - 1));
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      location.href = active < hits.length ? hits[active].url : allUrl;
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <form ref={boxRef} action="/search/" role="search" className="relative flex min-w-0 flex-1">
      <label htmlFor={id} className="sr-only">
        Search parts
      </label>
      <input
        id={id}
        name="q"
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Part number or machine model"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          loadSearch().catch(() => {}); // start downloading early
          if (hits.length) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        className="h-12 min-w-0 flex-1 rounded-l-lg rounded-r-none border-2 border-r-0 border-ink bg-white px-3.5 text-base text-ink placeholder:text-ink-2"
      />
      <button
        type="submit"
        aria-label="Search"
        className="flex w-13 cursor-pointer items-center justify-center rounded-r-lg bg-accent text-ink hover:bg-accent-hover"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            id={listId}
            role="listbox"
            aria-label="Search suggestions"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={t}
            className="absolute inset-x-0 top-[54px] z-30 max-h-[70vh] origin-top overflow-auto rounded-[10px] border border-line bg-white shadow-[0_10px_30px_rgb(0_0_0/0.12)]"
          >
            {failed && <p className="m-0 p-3 text-ink-2">Search couldn't load. Check your connection and try again.</p>}
            {!failed && !hits.length && (
              <p className="m-0 p-3 text-ink-2">No parts found. Try another spelling or the machine model.</p>
            )}
            {hits.map((h, i) => (
              <a
                key={h.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                href={h.url}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-3 border-b border-line px-3 py-2 no-underline ${i === active ? "bg-bg" : ""}`}
              >
                <img src={h.thumb} alt="" width={48} height={48} loading="lazy" className="size-12 flex-none rounded-md" />
                <span className="min-w-0">
                  <strong className="block truncate text-[15px]">{h.name}</strong>
                  <small className="block truncate text-ink-2">
                    <span className="font-mono">{h.sku}</span>
                    {h.fits && ` · fits ${h.fits}`}
                    {h.status === "discontinued" && " · discontinued"}
                  </small>
                </span>
              </a>
            ))}
            <a
              id={optionId(hits.length)}
              role="option"
              aria-selected={active === hits.length}
              href={allUrl}
              onMouseEnter={() => setActive(hits.length)}
              className={`block px-3 py-3 font-semibold text-accent-text ${active === hits.length ? "bg-bg" : ""}`}
            >
              See all results for “{query.trim()}”
            </a>
          </m.div>
        )}
      </AnimatePresence>
    </form>
  );
}

/** The island: SearchBox inside the shared lazy Motion setup. */
export default function SearchBoxIsland(props: { id?: string }) {
  return (
    <MotionRoot>
      <SearchBox {...props} />
    </MotionRoot>
  );
}
