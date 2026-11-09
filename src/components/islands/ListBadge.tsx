/**
 * Reorder-list count in the header. The number "bumps" (scales up and
 * back, 300 ms) whenever a part is added or removed.
 */
import { useEffect, useRef, useState } from "react";
import { useReorderList } from "../../lib/store";

export default function ListBadge() {
  const count = useReorderList().length;
  const [bump, setBump] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    // Don't bump when the saved list first appears after page load.
    if (first.current) {
      first.current = false;
      return;
    }
    setBump((n) => n + 1);
  }, [count]);

  return (
    <span
      // A new key restarts the CSS animation (animate-bump in global.css).
      key={bump}
      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-ink ${
        bump ? "animate-bump" : ""
      }`}
      aria-label={`${count} ${count === 1 ? "part" : "parts"} in your list`}
    >
      {count}
    </span>
  );
}
