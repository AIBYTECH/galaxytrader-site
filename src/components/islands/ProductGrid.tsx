/**
 * A plain grid of product cards (related parts on product pages).
 * It is an island only because each card's "+ Reorder list" button is
 * interactive; the cards themselves are server-rendered HTML.
 */
import MotionRoot from "./MotionRoot";
import ProductCard from "./ProductCard";
import type { CardItem } from "../../lib/types";

/** Two columns on phones, as many 220px+ columns as fit on wider screens. */
export const gridClass = "grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4";

export default function ProductGrid({ items }: { items: CardItem[] }) {
  return (
    <MotionRoot>
      <div className={gridClass}>
        {items.map((item) => (
          <ProductCard key={item.sku} item={item} />
        ))}
      </div>
    </MotionRoot>
  );
}
