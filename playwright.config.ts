/**
 * End-to-end tests: npm run test:e2e
 * Builds are not run here; do `python build.py --emit-json && npm run build`
 * first. The tests start scripts/serve.mjs, which applies dist/_headers
 * (so the strict CSP is enforced) and fakes the /api/click function.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4321" },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://localhost:4321",
    reuseExistingServer: true,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1366, height: 900 } } },
  ],
});
