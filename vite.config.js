import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/norway-roadtrip-planner/" : "/",
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
});
