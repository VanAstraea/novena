import { defineConfig, devices } from "@playwright/test";

// Smoke test of the built site (npm run build first): every page loads without console errors, at phone and
// desktop widths.
export default defineConfig({
  testDir: "tests/smoke",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173" },
  webServer: { command: "npx vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
