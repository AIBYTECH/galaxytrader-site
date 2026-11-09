/**
 * Wrap an island in <MotionRoot> to use Motion's small `m.*` components.
 *
 * `motion.div` bundles every Motion feature (about 45 KB gzipped). `m.div`
 * plus LazyMotion loads only the features we pass, as a separate file
 * after the page is interactive, and every island shares that file.
 * `strict` makes the build fail fast if someone uses `motion.*` by mistake.
 */
import type { ComponentChildren } from "preact";
import { LazyMotion, MotionConfig } from "motion/react";

const features = () => import("../../lib/motion-features").then((r) => r.default);

export default function MotionRoot({ children }: { children: ComponentChildren }) {
  return (
    <LazyMotion features={features} strict>
      {/* reducedMotion="user": Motion itself also respects the phone setting */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
