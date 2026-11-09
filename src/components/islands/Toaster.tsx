/**
 * Shows short confirmation messages ("GT-10021 saved to your reorder list").
 * Any code can call toast("...") from lib/store; this island listens for it.
 * role="status" makes screen readers announce the message.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import MotionRoot from "./MotionRoot";
import { useSafeTransition } from "../../lib/motion";

function Toaster() {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const t = useSafeTransition();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      clearTimeout(timer);
      setMsg({ id: Date.now(), text: (e as CustomEvent<string>).detail });
      timer = setTimeout(() => setMsg(null), 2400);
    };
    window.addEventListener("gt:toast", onToast);
    return () => {
      window.removeEventListener("gt:toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {msg && (
          <m.div
            key={msg.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={t}
            className="rounded-lg bg-ink px-4.5 py-3 text-[15px] text-white shadow-[0_8px_24px_rgb(0_0_0/0.25)]"
          >
            {msg.text}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ToasterIsland() {
  return (
    <MotionRoot>
      <Toaster />
    </MotionRoot>
  );
}
