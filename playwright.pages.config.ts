import { defineConfig } from "@playwright/test";

const liveUrl = process.env.PLAYTEST_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["fixed-console.spec.ts", "pages-smoke.spec.ts"],
  timeout: 60_000,
  workers: 1,
  outputDir: "/tmp/midnight-pages-smoke",
  use: {
    baseURL: liveUrl ?? "http://localhost:4197/midnight-lucky-hotel/",
    viewport: { width: 390, height: 760 }
  },
  webServer: liveUrl ? undefined : {
    command: "DEPLOY_BASE_PATH=/midnight-lucky-hotel/ npm run preview -- --host 127.0.0.1 --port 4197 --strictPort",
    url: "http://localhost:4197/midnight-lucky-hotel/",
    reuseExistingServer: false
  }
});
