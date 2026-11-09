# Credits and licences

Everything copied or adapted into this project comes from an MIT-licensed source
(or, for the font, the SIL Open Font License). Each copied component also names
its source in a comment at the top of the file.

## UI components copied into `src/components/ui/` (or adapted into our CSS)

| Our file | Based on | Source | Licence | What we changed |
| --- | --- | --- | --- | --- |
| `src/components/ui/Marquee.astro` | Magic UI **Marquee** | https://magicui.design/docs/components/marquee · https://github.com/magicuidesign/magicui | MIT | Astro instead of React (pure CSS, no JS); our colours; pauses on hover and keyboard focus; reduced motion shows one wrapped, non-moving copy |
| `src/components/ui/DotPattern.astro` | Magic UI **Dot Pattern** | https://magicui.design/docs/components/dot-pattern | MIT | Drawn with CSS gradients on one element (`.dot-pattern` in `global.css`) instead of one SVG `<circle>` per dot: no measuring, no JS, cheap to paint; "glow" replaced by a soft orange beam that fades in once (400 ms) |
| `src/components/ui/NumberTicker.tsx` | Magic UI **Number Ticker** | https://magicui.design/docs/components/number-ticker | MIT | Server HTML shows the real number; 400 ms ease-out count instead of a long spring; skipped with reduced motion |
| `.js-reveal [data-reveal]` in `src/styles/global.css` + `initReveal()` in `src/scripts/site.ts` | Magic UI **Blur Fade** | https://magicui.design/docs/components/blur-fade | MIT | Same fade + small offset, 400 ms, done with CSS + one IntersectionObserver; blur removed (blur animations cannot run on the GPU and hurt phone performance); content stays visible without JavaScript |
| `.spot` in `src/styles/global.css` + `initSpotlight()` in `src/scripts/site.ts` | Magic UI **Magic Card** (spotlight) | https://magicui.design/docs/components/magic-card | MIT | Radial-gradient spotlight that follows the pointer, in CSS custom properties instead of Motion values, in our orange |
| Headline word reveal in `src/pages/index.astro` (`animate-word`) | Magic UI **Blur Fade** (per-word use) | https://magicui.design/docs/components/blur-fade | MIT | CSS keyframes with staggered delays, no JavaScript; opacity + slide only, no blur |

Magic UI licence: MIT, Copyright (c) Magic UI — https://github.com/magicuidesign/magicui/blob/main/LICENSE.md

### Libraries checked but not used

- **Animata** (MIT), **Cult UI** (MIT), **VengeanceUI** (MIT): nothing needed beyond the Magic UI pieces
  above; we kept the JavaScript budget for the site's own features.
- **Aceternity UI**: *not used*. Its free components are under Aceternity's own licence
  (https://ui.aceternity.com/licence), not MIT, so they fall outside this project's MIT-only rule.
- **skiper-ui** (github.com/nischayhq/skiper-ui): *not used* — no licence.
- Paid packs (Animmaster, Hover.dev Pro): *not used*.

## Libraries (installed with npm, not copied)

| Library | Used for | Licence |
| --- | --- | --- |
| Astro | static site builder | MIT |
| Preact (+ `preact/compat`) | runs the React-style islands (about 10 KB) | MIT |
| Motion (`motion/react`) | dropdown, button, toast and list animations | MIT |
| Tailwind CSS | styling | MIT |
| MiniSearch | part search | MIT |
| Playwright (dev only) | tests and screenshots | Apache-2.0 |

## Font

**Barlow Condensed** 700 and 800 (Latin subset), self-hosted in `public/fonts/`.
Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1 (`public/fonts/OFL.txt`).
