/**
 * The reorder list page: quantities, remove, a note, and "send" buttons.
 *
 * The list lives in this browser (lib/store.ts). "Send on WhatsApp" opens
 * WhatsApp with every part number and quantity typed out; "Send by email"
 * opens the email app with the same text. Removed rows slide away.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import MotionRoot from "./MotionRoot";
import { setList, useReorderList, type ListItem } from "../../lib/store";
import { useSafeTransition } from "../../lib/motion";
import type { SiteInfo } from "../../lib/types";

const NOTE_KEY = "gt-list-note-v1";

function message(site: SiteInfo, list: ListItem[], note: string): string {
  const lines = [`Hi ${site.name}, please confirm availability and rates for:`];
  list.forEach((i, n) => lines.push(`${n + 1}. ${i.sku} - ${i.name} x ${i.qty}`));
  if (note.trim()) lines.push("", `Note: ${note.trim()}`);
  return lines.join("\n");
}

function ReorderList({ site }: { site: SiteInfo }) {
  const list = useReorderList();
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const t = useSafeTransition();

  // Restore the note typed last time.
  useEffect(() => {
    try {
      setNote(localStorage.getItem(NOTE_KEY) ?? "");
    } catch {
      /* storage blocked */
    }
    setReady(true);
  }, []);

  function saveNote(value: string) {
    setNote(value);
    try {
      localStorage.setItem(NOTE_KEY, value);
    } catch {
      /* ignore */
    }
  }

  const setQty = (sku: string, qty: number) =>
    setList(list.map((i) => (i.sku === sku ? { ...i, qty: Math.max(1, qty || 1) } : i)));
  const remove = (sku: string) => setList(list.filter((i) => i.sku !== sku));

  if (!ready) {
    // Server HTML / before JavaScript runs.
    return <p className="notice">Your reorder list is saved in this browser. It needs JavaScript switched on to show.</p>;
  }

  if (!list.length) {
    return (
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t} className="notice">
        Your list is empty. Search for a part or <a href="/machines/">browse by machine</a>, then tap <strong>+ Reorder list</strong>.
      </m.div>
    );
  }

  const text = message(site, list, note);
  const wa = `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(text)}`;
  const mail = `mailto:${site.email}?subject=${encodeURIComponent("Reorder list")}&body=${encodeURIComponent(text)}`;

  return (
    <>
      <p className="mb-2 text-sm text-ink-2" aria-live="polite">
        {list.length} {list.length === 1 ? "part" : "parts"} in your list
      </p>
      <ul className="m-0 mb-4 list-none overflow-hidden rounded-[10px] border border-line bg-white p-0">
        <AnimatePresence initial={false}>
          {list.map((i) => (
            <m.li
              key={i.sku}
              exit={{ opacity: 0, x: -40 }}
              transition={t}
              className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
            >
              <a href={i.url} className="min-w-0 flex-[1_1_180px] no-underline">
                <b className="sku">{i.sku}</b>
                <br />
                {i.name}
              </a>
              <label className="sr-only" htmlFor={`lq-${i.sku}`}>
                Quantity for {i.sku}
              </label>
              <input
                id={`lq-${i.sku}`}
                type="number"
                inputMode="numeric"
                min={1}
                value={i.qty}
                onChange={(e) => setQty(i.sku, parseInt(e.currentTarget.value, 10))}
                className="h-11 w-21 px-2 text-center font-mono"
              />
              <button
                type="button"
                onClick={() => remove(i.sku)}
                aria-label={`Remove ${i.sku}`}
                className="min-h-11 min-w-11 cursor-pointer font-bold text-accent-text"
              >
                Remove
              </button>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>

      <label htmlFor="list-note">Note for us (optional)</label>
      <textarea
        id="list-note"
        rows={2}
        value={note}
        onChange={(e) => saveNote(e.currentTarget.value)}
        placeholder="e.g. Company name, delivery city"
        className="mt-1.5 mb-3.5 w-full p-2.5"
      />

      <div className="my-1.5 mb-2.5 flex flex-wrap gap-2.5">
        <a className="btn btn-accent btn-big flex-[1_1_200px]" href={wa} rel="noopener" data-wa-click="list">
          Send list on WhatsApp
        </a>
        <a className="btn btn-dark btn-big flex-[1_1_200px]" href={mail}>
          Send by email
        </a>
      </div>

      {/* Two-step clear instead of a browser confirm() dialog */}
      {confirmClear ? (
        <p className="m-0 flex flex-wrap items-center gap-2 text-sm">
          Remove all {list.length} parts?
          <button type="button" className="btn btn-outline text-sm" onClick={() => { setList([]); setConfirmClear(false); }}>
            Yes, clear list
          </button>
          <button type="button" className="btn btn-link text-sm" onClick={() => setConfirmClear(false)}>
            Cancel
          </button>
        </p>
      ) : (
        <button type="button" className="btn btn-link text-sm" onClick={() => setConfirmClear(true)}>
          Clear list
        </button>
      )}
    </>
  );
}

export default function ReorderListIsland(props: { site: SiteInfo }) {
  return (
    <MotionRoot>
      <ReorderList {...props} />
    </MotionRoot>
  );
}
