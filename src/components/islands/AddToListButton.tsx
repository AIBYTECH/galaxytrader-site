/**
 * "+ Reorder list" button used on product cards.
 *
 * After a tap the label slides to "✓ In your list" with a short pop,
 * a toast confirms it, and the header badge bumps (it listens to the store).
 */
import { AnimatePresence, m } from "motion/react";
import { addToList, toast, useReorderList } from "../../lib/store";
import { useSafeTransition } from "../../lib/motion";
import type { CardItem } from "../../lib/types";

export default function AddToListButton({ item }: { item: CardItem }) {
  const list = useReorderList();
  const inList = list.some((x) => x.sku === item.sku);
  const t = useSafeTransition();

  function add() {
    const qty = addToList({ sku: item.sku, name: item.name, url: item.url }, item.moq ?? 1);
    toast(`${item.sku} saved to your reorder list (${qty})`);
  }

  return (
    <button
      type="button"
      onClick={add}
      aria-pressed={inList}
      className={`btn mt-auto min-h-11 self-start overflow-hidden px-3 text-sm ${
        inList ? "border-ok bg-ok-bg text-ok hover:bg-ok-bg hover:text-ok" : "btn-outline"
      }`}
    >
      {/* popLayout keeps the button size steady while the labels swap */}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={inList ? "in" : "add"}
          initial={{ y: 14, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={t}
          className="inline-block"
        >
          {inList ? "✓ In your list" : "+ Reorder list"}
        </m.span>
      </AnimatePresence>
    </button>
  );
}
