import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const isCI = !!process.env.CI;

/**
 * End-to-end tests against the production build (vite preview), in real
 * Chromium and real WebKit (Safari's engine) with iPhone emulation.
 * Run `pnpm --filter @workspace/writelater run test:e2e` (builds first).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // No retries: a flaky end-to-end test is a bug to fix, not to hide.
  retries: 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `pnpm exec vite preview --config vite.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
