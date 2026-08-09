// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Served as a GitHub Pages project site at seanachan.github.io/trip-schedule/,
  // which is the same URL this page had when it lived in the portfolio repo.
  base: "/trip-schedule/",
});
