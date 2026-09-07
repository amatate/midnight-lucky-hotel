import { defineConfig } from "@playwright/test";

// Dedicated preview port and fresh Playwright context: never touches the player's Chrome profile.
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["archives.spec.ts", "stage-three.spec.ts", "hotel-recovery.spec.ts", "route-balance.spec.ts"],
  timeout: 30_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", viewport: { width: 960, height: 900 } },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false
  }
});
