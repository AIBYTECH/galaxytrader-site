/**
 * "Find parts for your machine" on the home page: brand -> model -> go.
 *
 * Native <select> menus are used on purpose: on Android they open the
 * phone's own large, scrollable picker, which beats any custom dropdown.
 * Motion animates what happens around them: the model step slides in
 * once a brand is chosen, and the button shows how many parts fit.
 *
 * Without JavaScript the form opens /machines/, which lists every model.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import MotionRoot from "./MotionRoot";
import { useSafeTransition } from "../../lib/motion";

type Models = Record<string, { id: string; model: string; count: number }[]>;

function MachinePicker({ brands }: { brands: Models }) {
  const [ready, setReady] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const t = useSafeTransition();
  useEffect(() => setReady(true), []);

  const models = brands[brand] ?? [];
  const chosen = models.find((x) => x.id === model);

  return (
    <form
      action="/machines/"
      onSubmit={(e) => {
        e.preventDefault();
        location.href = chosen ? `/m/${chosen.id}/` : "/machines/";
      }}
      className="flex flex-col gap-2 rounded-xl bg-white p-5.5 text-ink shadow-[0_20px_50px_-20px_rgb(0_0_0/0.5)]"
    >
      <h2 className="m-0 font-head text-[26px] leading-tight font-extrabold uppercase">Find parts for your machine</h2>
      <p className="m-0 mb-1 text-sm text-ink-2">Pick your machine to see every part that fits it.</p>

      <label htmlFor="pick-brand">Machine brand</label>
      <select
        id="pick-brand"
        value={brand}
        disabled={!ready}
        onChange={(e) => {
          setBrand(e.currentTarget.value);
          setModel("");
        }}
      >
        <option value="">Choose a brand</option>
        {Object.keys(brands).map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>

      {/* The model step appears only after a brand is picked */}
      <AnimatePresence initial={false}>
        {brand && (
          <m.div
            key="model"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={t}
            className="flex flex-col gap-2"
          >
            <label htmlFor="pick-model">{brand} model</label>
            <select id="pick-model" value={model} onChange={(e) => setModel(e.currentTarget.value)}>
              <option value="">Choose a model</option>
              {models.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.model} ({x.count} parts)
                </option>
              ))}
            </select>
          </m.div>
        )}
      </AnimatePresence>

      <button className="btn btn-dark btn-big mt-1 overflow-hidden" type="submit" disabled={ready && !chosen}>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={chosen ? chosen.id : "none"}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={t}
            className="inline-block"
          >
            {chosen ? `Show ${chosen.count} parts for ${chosen.model}` : ready ? "Show parts" : "See all machines"}
          </m.span>
        </AnimatePresence>
      </button>
    </form>
  );
}

export default function MachinePickerIsland(props: { brands: Models }) {
  return (
    <MotionRoot>
      <MachinePicker {...props} />
    </MotionRoot>
  );
}
