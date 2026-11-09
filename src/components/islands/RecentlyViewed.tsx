/**
 * "Recently viewed" row on the home page (from this browser's history of
 * product pages; see addRecent() in ProductActions). Renders nothing on
 * the server or for first-time visitors.
 */
import { useEffect, useState } from "react";
import { m } from "motion/react";
import MotionRoot from "./MotionRoot";
import { getRecent, type RecentItem } from "../../lib/store";
import { useSafeTransition } from "../../lib/motion";

function RecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const t = useSafeTransition();
  useEffect(() => setItems(getRecent()), []);

  if (!items.length) return null;
  return (
    <m.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={t} className="wrap pt-10" aria-labelledby="recent-title">
      <h2 id="recent-title" className="section-title">
        Recently viewed
      </h2>
      <div className="grid auto-cols-[150px] grid-flow-col gap-3 overflow-x-auto pb-1.5">
        {items.map((r) => (
          <a key={r.sku} href={r.url} className="spot text-[13px] no-underline">
            <img src={r.thumb} alt="" width={150} height={150} loading="lazy" className="zoom aspect-square w-full" />
            <span className="block p-2">
              <b className="font-mono">{r.sku}</b>
              <br />
              {r.name}
            </span>
          </a>
        ))}
      </div>
    </m.section>
  );
}

export default function RecentlyViewedIsland() {
  return (
    <MotionRoot>
      <RecentlyViewed />
    </MotionRoot>
  );
}
