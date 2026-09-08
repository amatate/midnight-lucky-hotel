import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function ruleSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => entry.isDirectory() ? ruleSources(join(directory, entry.name))
      : entry.name.endsWith(".ts") ? [readFileSync(join(directory, entry.name), "utf8")] : []);
}
const rulesRoot = fileURLToPath(new URL("./src", import.meta.url));
const rulesFingerprint = createHash("sha256")
  .update([...ruleSources(join(rulesRoot, "core")), ...ruleSources(join(rulesRoot, "content"))].join("\n"))
  .digest("hex").slice(0, 16);

export default defineConfig({
  define: { __RULES_FINGERPRINT__: JSON.stringify("rules-" + rulesFingerprint), __BUILD_VERSION__: JSON.stringify("playtest-2026.09.08") },
  plugins: [
    {
      name: "restart-on-rule-change",
      async handleHotUpdate({ file, server }) {
        // Reload the rules fingerprint together with gameplay, never HMR new rules into an old run.
        if (["core", "content"].some((folder) => file.startsWith(join(rulesRoot, folder) + "/"))) {
          await server.restart();
          return [];
        }
      }
    },
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
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
