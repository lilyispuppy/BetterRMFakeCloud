import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { manifest } from "./src/pwa/manifest";

const testing = !!process.env.VITEST;

// The app is served by the Go server at the root of the site; the old app lives below /legacy.
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    // the service worker is not part of unit tests
    !testing &&
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "prompt",
        injectRegister: false,
        manifest,
        manifestFilename: "manifest.webmanifest",
        injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"] },
        devOptions: { enabled: false },
      }),
  ],
  resolve: {
    alias: testing ? { "virtual:pwa-register": new URL("./src/test/pwa-register.ts", import.meta.url).pathname } : {},
  },
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
