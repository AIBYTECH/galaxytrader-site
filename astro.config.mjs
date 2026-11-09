// Astro configuration for the GalaxyTrader catalogue.
//
// - output "static": every page is plain HTML built ahead of time.
// - trailingSlash "always" + build.format "directory" keep the old URLs:
//   /p/gt-10021/ is written as dist/p/gt-10021/index.html.
// - Islands are written as normal React components (hooks, JSX, Motion),
//   but run on Preact's React-compatible layer ("compat"): about 10 KB
//   instead of React's 45 KB, which keeps product and category pages
//   under the 60 KB JavaScript budget. `import { useState } from "react"`
//   works unchanged.
// - No inline <style> or small inlined scripts: everything becomes a file
//   under /_astro/, so the Content-Security-Policy can stay strict.
//   (Astro's tiny island loader is still inline; scripts/postbuild.mjs adds
//   its sha256 hash to the CSP in dist/_headers.)
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";

const MOTION = ["motion", "framer-motion", "motion-dom", "motion-utils"];

export default defineConfig({
  site: process.env.BASE_URL || "https://galaxytraderco.com",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
    inlineStylesheets: "never",
  },
  integrations: [preact({ compat: true })],
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
    // Bundle Motion when pages are rendered at build time too, so its
    // `import "react"` is redirected to preact/compat like in the browser.
    // ("prerender" is the Vite environment Astro uses for static pages.)
    ssr: { noExternal: MOTION },
    environments: { prerender: { resolve: { noExternal: MOTION } } },
  },
  devToolbar: { enabled: false },
});
