/**
 * Motion presets shared by the islands.
 *
 * Rules for this site: nothing longer than 400 ms, and with
 * "reduce motion" switched on in the phone settings there is no
 * movement at all (every transition becomes instant).
 */
import { useReducedMotion, type Transition } from "motion/react";

/** Snappy ease-out used for dropdowns, toasts and list rows (200 ms). */
export const quick: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };

const instant: Transition = { duration: 0 };

/**
 * Returns `transition` unchanged, or an instant transition when the user
 * asked for reduced motion. Use it for every `transition` prop.
 */
export function useSafeTransition(transition: Transition = quick): Transition {
  return useReducedMotion() ? instant : transition;
}
