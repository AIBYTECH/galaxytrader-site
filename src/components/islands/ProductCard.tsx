/**
 * One product card. Rendered on the server inside grid islands (so it is in
 * the HTML without JavaScript) and re-rendered in the browser when filters
 * or search change the grid.
 *
 * Hover: soft lift, orange spotlight and photo zoom come from the CSS
 * classes .spot and .zoom (global.css), so they cost no JavaScript.
 */
import AddToListButton from "./AddToListButton";
import type { CardItem } from "../../lib/types";

export default function ProductCard({ item }: { item: CardItem }) {
  const discontinued = item.status === "discontinued";
  return (
    <article className="spot flex flex-col" data-sku={item.sku}>
      <div className="relative overflow-hidden bg-bg">
        <img
          src={item.thumb}
          alt={`${item.name} (${item.sku})`}
          width={300}
          height={300}
          loading="lazy"
          decoding="async"
          className="zoom aspect-square w-full object-cover"
          data-vt-photo
        />
        {discontinued ? (
          <span className="tag tag-gray absolute top-2 left-2">Discontinued</span>
        ) : !item.inStock ? (
          <span className="tag tag-warn absolute top-2 left-2">Ask for stock</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="sku">{item.sku}</span>
        <h3 className="m-0 text-[15px] font-semibold">
          {/* The ::after overlay makes the whole card one big tap target */}
          <a href={item.url} className="no-underline after:absolute after:inset-0 after:content-['']">
            {item.name}
          </a>
        </h3>
        {item.fits && <p className="m-0 mb-2 text-[13px] text-ink-2">Fits {item.fits}</p>}
        {/* relative z-10 lifts the button above the card-wide link overlay */}
        <div className="relative z-10 mt-auto">
          {discontinued ? (
            <a href={item.url} className="btn btn-link min-h-11 text-sm">
              Ask for an alternative
            </a>
          ) : (
            <AddToListButton item={item} />
          )}
        </div>
      </div>
    </article>
  );
}
