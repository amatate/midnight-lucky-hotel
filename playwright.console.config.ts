import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "fixed-console.spec.ts", timeout: 45_000, workers: 1,
  outputDir: "/tmp/midnight-fixed-console",
  use: { baseURL: "http://localhost:5173", viewport: { width: 390, height: 760 } }
});
