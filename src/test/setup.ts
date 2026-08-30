import "@testing-library/jest-dom/vitest";
import type {} from "vitest/jsdom";

if (typeof window !== "undefined") {
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: jsdom.window.localStorage },
    sessionStorage: { configurable: true, value: jsdom.window.sessionStorage }
  });
}
