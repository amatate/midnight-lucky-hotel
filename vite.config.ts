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
// Root hosting and local development stay unchanged; Pages builds opt into a subpath.
const deployBase = process.env.DEPLOY_BASE_PATH ?? "/";

export default defineConfig({
  base: deployBase,
  // These are local source modules, not dependencies. Prebundling them would
  // create a second language store and make dev mode ignore the UI preference.
  optimizeDeps: { exclude: ["@/i18n/jsx-runtime", "@/i18n/jsx-dev-runtime"] },
  define: { __RULES_FINGERPRINT__: JSON.stringify("rules-" + rulesFingerprint), __BUILD_VERSION__: JSON.stringify("playtest-2026.10.05-routes") },
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
    react({ jsxImportSource: "@/i18n" }),
    {
      name: "local-jsx-runtime-is-source",
      enforce: "post",
      config(config) {
        // React's plugin explicitly includes its JSX runtime in optimizeDeps.
        // Remove our source runtime from that list as well as excluding discovery.
        if (config.optimizeDeps?.include) config.optimizeDeps.include = config.optimizeDeps.include
          .filter((entry) => !entry.startsWith("@/i18n/"));
      }
    },
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "icons/icon-192.svg",
        "icons/icon-512.svg",
        "fonts/SmileySans-Oblique.woff2",
        "fonts/BarlowCondensed-SemiBold.woff2",
        "art/cabinet-frame-v1.png",
        "art/hotel-lobby-v1.png",
        "art/installed-parts-v1.png",
        "art/room-crowns-v1.png",
        "art/hotel-rooms-v1.png",
        "audio/after-hours-v1.wav"
      ],
      manifest: {
        name: "Midnight Lucky Hotel · 午夜好运酒店",
        short_name: "Lucky Hotel",
        lang: "en",
        description: "A bilingual slot-machine roguelite. Build the reels. Make your own luck.",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#0c1715",
        background_color: "#0c1715",
        start_url: deployBase,
        scope: deployBase,
        icons: [
          { src: `${deployBase}icons/icon-192.svg`, sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
          { src: `${deployBase}icons/icon-512.svg`, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
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
