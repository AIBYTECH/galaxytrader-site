/**
 * Counts a number up when it scrolls into view ("3,512 parts").
 *
 * Adapted from Magic UI "Number Ticker" (MIT):
 * https://magicui.design/docs/components/number-ticker
 * Changes for this site:
 *  - the server HTML shows the REAL number (readable without JavaScript);
 *  - the count-up lasts 400 ms with an ease-out curve instead of a long
 *    spring, and is skipped entirely with reduced motion;
 *  - uses Motion's useInView only (no animation features needed).
 */
import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";

const DURATION = 400; // ms
const format = (n: number) => new Intl.NumberFormat("en-US").format(n);

export default function NumberTicker({ value, className = "" }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!inView || reduce || !el) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = format(Math.round(value * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduce, value]);

  return (
    <span ref={ref} className={`inline-block tabular-nums ${className}`}>
      {format(value)}
    </span>
  );
}
