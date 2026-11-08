import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The app is served by the Go server at the root of the site; the old app lives below /legacy.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3002,
    proxy: {
      // same origin as the Go server, so the session cookie works unchanged
      "/ui/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
