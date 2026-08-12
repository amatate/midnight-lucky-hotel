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
      includeAssets: ["icons/icon-192.svg", "icons/icon-512.svg"],
      manifest: {
        name: "午夜好运酒店",
        short_name: "好运酒店",
        description: "离线可玩的老虎机 Roguelite 功能原型",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#17191f",
        background_color: "#17191f",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
          { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
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
    clearMocks: true,
    exclude: ["e2e/**", ...configDefaults.exclude]
  }
});
