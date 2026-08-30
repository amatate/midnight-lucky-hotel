import { describe, expect, test } from "vitest";

describe("jsdom storage environment", () => {
  test("shares localStorage and sessionStorage between global and window references", () => {
    localStorage.setItem("global-local", "available");
    expect(window.localStorage.getItem("global-local")).toBe("available");

    window.localStorage.setItem("window-local", "available");
    expect(localStorage.getItem("window-local")).toBe("available");

    sessionStorage.setItem("global-session", "available");
    expect(window.sessionStorage.getItem("global-session")).toBe("available");

    window.sessionStorage.setItem("window-session", "available");
    expect(sessionStorage.getItem("window-session")).toBe("available");

    window.localStorage.clear();
    window.sessionStorage.clear();

    expect(localStorage.getItem("global-local")).toBeNull();
    expect(localStorage.getItem("window-local")).toBeNull();
    expect(sessionStorage.getItem("global-session")).toBeNull();
    expect(sessionStorage.getItem("window-session")).toBeNull();
  });
});
