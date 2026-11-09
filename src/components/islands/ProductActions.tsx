/**
 * Product page actions: quantity stepper, "Add to reorder list",
 * "Ask on WhatsApp" and "Share". Also records the part in
 * "recently viewed" when the page opens.
 *
 * Discontinued parts only get the "Ask for an alternative" WhatsApp button.
 * The WhatsApp links are real <a href> links, so they work without JS.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import MotionRoot from "./MotionRoot";
import { addRecent, addToList, toast, useReorderList } from "../../lib/store";
import { useSafeTransition } from "../../lib/motion";

interface Props {
  sku: string;
  name: string;
  url: string;
  thumb: string;
  moq: number | null;
  discontinued: boolean;
  /** pre-filled WhatsApp link (SKU, name and page URL) */
  wa: string;
}

function ProductActions({ sku, name, url, thumb, moq, discontinued, wa }: Props) {
  const min = moq ?? 1;
  const [qty, setQty] = useState(min);
  const [justAdded, setJustAdded] = useState(0); // >0 while the success tick shows
  const inList = useReorderList().find((x) => x.sku === sku);
  const t = useSafeTransition();

  useEffect(() => addRecent({ sku, name, url, thumb }), [sku, name, url, thumb]);

  // Hide the success tick after 1.6 s.
  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(0), 1600);
    return () => clearTimeout(timer);
  }, [justAdded]);

  if (discontinued) {
    return (
      <>
        <div className="notice">This part is no longer made. Ask us for an alternative that fits your machine.</div>
        <a className="btn btn-accent btn-big w-full" href={wa} rel="noopener" data-wa-click="product" data-sku={sku}>
          Ask for an alternative on WhatsApp
        </a>
      </>
    );
  }

  function add() {
    const saved = addToList({ sku, name, url }, Math.max(min, qty), true);
    setJustAdded((n) => n + 1);
    toast(`${sku} saved to your reorder list (${saved})`);
  }

  async function share() {
    const link = location.href;
    if (navigator.share) {
      navigator.share({ title: `${name} (${sku})`, url: link }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(link);
        toast("Link copied");
      } catch {
        toast(link);
      }
    }
  }

  return (
    <>
      <div className="mt-4.5 mb-3">
        <label htmlFor="qty">Quantity{moq ? ` (min ${moq})` : ""}</label>
        <div className="mt-1.5 inline-flex h-13 overflow-hidden rounded-lg border border-[#9ca3af] bg-white">
          <button type="button" aria-label="Decrease quantity" className="w-12 cursor-pointer text-2xl" onClick={() => setQty((q) => Math.max(min, q - 1))}>
            −
          </button>
          <input
            id="qty"
            type="number"
            inputMode="numeric"
            min={min}
            value={qty}
            onChange={(e) => setQty(parseInt(e.currentTarget.value, 10) || min)}
            className="w-18 rounded-none border-x border-y-0 border-line text-center font-mono"
          />
          <button type="button" aria-label="Increase quantity" className="w-12 cursor-pointer text-2xl" onClick={() => setQty((q) => q + 1)}>
            +
          </button>
        </div>
        {inList && <p className="mt-2 mb-0 text-sm text-ok">✓ In your list ({inList.qty}). Adding again updates the quantity.</p>}
      </div>

      <div className="my-1.5 mb-2.5 flex flex-wrap gap-2.5">
        <button type="button" className="btn btn-accent btn-big flex-[1_1_200px] overflow-hidden" onClick={add}>
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={justAdded ? "done" : "add"}
              initial={{ y: 18, opacity: 0, scale: 0.85 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={t}
              className="inline-flex items-center gap-2"
            >
              {justAdded ? (
                <>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  Added to your list
                </>
              ) : (
                "Add to reorder list"
              )}
            </m.span>
          </AnimatePresence>
        </button>
        <a className="btn btn-dark btn-big flex-[1_1_200px]" href={wa} rel="noopener" data-wa-click="product" data-sku={sku}>
          Ask on WhatsApp
        </a>
      </div>
      <button type="button" className="btn btn-link text-sm" onClick={share}>
        Share this part
      </button>
    </>
  );
}

export default function ProductActionsIsland(props: Props) {
  return (
    <MotionRoot>
      <ProductActions {...props} />
    </MotionRoot>
  );
}
