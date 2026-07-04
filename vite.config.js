import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/norway-roadtrip-planner/" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/leaflet") ||
            id.includes("node_modules/react-leaflet")
          ) {
            return "framework-vendor";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons-vendor";
          }
        },
      },
    },
  },
  server: {
    allowedHosts: true,
  },
});
