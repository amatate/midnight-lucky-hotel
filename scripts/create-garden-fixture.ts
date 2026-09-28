/** Generates a clearly marked, isolated UI checkpoint; never reads/writes browser storage. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RunState } from "../src/core/types.ts";
import type { RunArchive } from "../src/persistence/archives.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const base = resolve(root, "src", specifier.slice(2));
  return { url: pathToFileURL(existsSync(base) ? base : `${base}.ts`).href, shortCircuit: true };
} });
const { createRun, dispatchCommand } = await import("../src/core/run.ts");
const { decodeRunStateV2 } = await import("../src/persistence/schema-v2.ts");
const { exportArchive } = await import("../src/persistence/archives.ts");
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => entry.isDirectory() ? sources(join(directory, entry.name))
      : entry.name.endsWith(".ts") ? [readFileSync(join(directory, entry.name), "utf8")] : []);
}
const rules = "rules-" + createHash("sha256").update([...sources(join(root, "src/core")), ...sources(join(root, "src/content"))].join("\n")).digest("hex").slice(0, 16);
const initial: RunState = { ...createRun(8), phase: "SHIFT_COMPLETE", shift: 5, baseSpinsInShift: 3,
  service: "kitchen", bankroll: 600, exitUnlocked: true, tips: 3,
  partSlots: [{ id: "fruit-salad", level: 1 }, { id: "harvest-vat", level: 1 }, null, null, null] };
const result = dispatchCommand(initial, { type: "ENTER_ROOM" });
if (!result.ok || !decodeRunStateV2(result.state)) throw new Error("Invalid Garden fixture");
const now = new Date().toISOString();
const record: RunArchive = { id: randomUUID(), name: "测试专用 · 花园房三回合（非真实战绩）", createdAt: now,
  updatedAt: now, rulesVersion: rules, coverage: "from-checkpoint", origin: "restored", parentId: null,
  favorite: false, initialState: result.state, snapshot: result.state, entries: [] };
const destination = process.argv[2];
if (!destination) throw new Error("Usage: node scripts/create-garden-fixture.ts /absolute/path/to/new-fixture.json");
// Refuse to overwrite a user file.
writeFileSync(destination, exportArchive(record), { flag: "wx" });
console.log(destination);
