import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH is "/<repo-name>/" when hosted on GitHub Pages, "/" locally.
// DEMO_SINGLE_FILE bundles everything into one script for the shareable prototype page.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  build: {
    // Older iPhones (iOS 14+) too.
    target: ["es2020", "safari14"],
    ...(process.env.DEMO_SINGLE_FILE ? { rolldownOptions: { output: { inlineDynamicImports: true, format: "iife" } } } : {}),
  },
});
