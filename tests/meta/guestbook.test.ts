import { beforeEach, expect, it, vi } from "vitest";
import { beginMachineSpin, createMachine, settleMachineSpin } from "@/classic/machines";
import { machineKey } from "@/classic/machine-storage";
import { readLibrary, startArchivedRun } from "@/persistence/archives";
import { GUESTBOOK_KEY, QUESTS, claimQuest, emptyGuestbook, noteGuestActivity, questProgress, readGuestbook, syncGuestbook } from "@/meta/guestbook";

beforeEach(() => localStorage.clear());
it("does not create any save for an empty visit", () => {
  expect(syncGuestbook(null)).toEqual(emptyGuestbook());
  expect(localStorage.length).toBe(0);
});
it("imports settled machine achievements without settling pending spins or modifying saves", () => {
  localStorage.setItem(machineKey("original"), JSON.stringify(settleMachineSpin(beginMachineSpin(createMachine("original", 8), 0))));
  localStorage.setItem(machineKey("diamond"), JSON.stringify(beginMachineSpin(createMachine("diamond", 8), 0)));
  localStorage.setItem(machineKey("wheel"), "invalid original save");
  const before = { ...localStorage };
  expect(syncGuestbook(null).played).toEqual(["original"]);
  for (const [key, value] of Object.entries(before)) expect(localStorage.getItem(key)).toBe(value);
  expect(localStorage.getItem(machineKey("vault"))).toBeNull();
});
it("requires actual play and learning, not just visiting or opening the ledger", () => {
  const quest = QUESTS[0]!;
  noteGuestActivity("met"); noteGuestActivity("ledger");
  expect(questProgress(quest, readGuestbook())).toBe(0);
  noteGuestActivity("original");
  expect(questProgress(quest, readGuestbook())).toBe(1);
  expect(questProgress(quest, { ...emptyGuestbook(), lesson: true })).toBe(1);
});
it("keeps highest hotel progress across runs, with idempotent cosmetic claims", () => {
  const library = startArchivedRun(readLibrary(), 8);
  const record = library.runs[0]!;
  const progressed = { ...library, discovered: ["lemon-infection"] as const, runs: [{ ...record, snapshot: { ...record.snapshot, hotel: { ...record.snapshot.hotel!, cleared: 3 as const } } }] };
  const prior = { ...localStorage };
  const book = syncGuestbook(progressed);
  expect(book.rooms).toBe(3); expect(book.discovered).toBe(1);
  expect(syncGuestbook(library).rooms).toBe(3);
  expect(claimQuest("penthouse", library).claimed).toEqual(["penthouse"]);
  expect(claimQuest("penthouse", library).claimed).toEqual(["penthouse"]);
  expect(() => claimQuest("all-rooms", library)).toThrow("guestbook-incomplete");
  for (const [key, value] of Object.entries(prior)) expect(localStorage.getItem(key)).toBe(value);
});
it("refuses to overwrite an invalid or future guestbook", () => {
  const raw = JSON.stringify({ ...emptyGuestbook(), version: 999 });
  localStorage.setItem(GUESTBOOK_KEY, raw);
  expect(() => syncGuestbook(null)).toThrow("guestbook-invalid");
  expect(noteGuestActivity("original")).toBe(false);
  expect(localStorage.getItem(GUESTBOOK_KEY)).toBe(raw);
});
it("does not claim a reward if persistence fails", () => {
  noteGuestActivity("ledger");
  const before = localStorage.getItem(GUESTBOOK_KEY);
  const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(() => claimQuest("read-ledger", null)).toThrow("quota");
  expect(noteGuestActivity("original")).toBe(false);
  setter.mockRestore();
  expect(localStorage.getItem(GUESTBOOK_KEY)).toBe(before);
});
