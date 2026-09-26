import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "cabinet-builds.spec.ts", timeout: 60_000, workers: 1,
  outputDir: "/tmp/midnight-cabinet-builds",
  use: { baseURL: "http://localhost:5173", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }
});
