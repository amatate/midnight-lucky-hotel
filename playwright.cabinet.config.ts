import { defineConfig } from "@playwright/test";

// Reuse the local game server with an isolated browser profile, never the player's save.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "deco-cabinet.spec.ts",
  timeout: 20_000,
  workers: 1,
  use: { baseURL: "http://localhost:5173", viewport: { width: 390, height: 844 } }
});
