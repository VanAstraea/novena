import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// VITE_BASE is the path the site is served under: "/" locally, "/<repo>/" on GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [preact()],
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 600 },
});
