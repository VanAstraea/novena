import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

const jimpShim = fileURLToPath(new URL("./src/lib/depot/jimp-browser.ts", import.meta.url));

// VITE_BASE is the path the site is served under: "/" locally, "/<repo>/" on GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [preact()],
  resolve: { alias: [{ find: /^jimp$/, replacement: jimpShim }] },
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 800 },
});
