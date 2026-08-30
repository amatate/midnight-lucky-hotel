import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "icons/icon-192.svg",
        "icons/icon-512.svg",
        "fonts/SmileySans-Oblique.woff2",
        "fonts/BarlowCondensed-SemiBold.woff2"
      ],
      manifest: {
        name: "午夜好运酒店",
        short_name: "好运酒店",
        description: "一拉一爆的午夜酒店老虎机 Roguelite",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#0B0908",
        background_color: "#0B0908",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
          { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [],
        cleanupOutdatedCaches: true
      }
    })
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    testTimeout: 30_000,
    clearMocks: true,
    exclude: ["e2e/**", ...configDefaults.exclude]
  }
});
