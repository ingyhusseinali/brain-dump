import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH is "/<repo-name>/" when hosted on GitHub Pages, "/" locally.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
});
