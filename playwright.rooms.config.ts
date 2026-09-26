import { defineConfig } from "@playwright/test";

// Isolated browser contexts on the existing local preview; never the player's profile.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "hotel-expansion.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:5173", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }
});
