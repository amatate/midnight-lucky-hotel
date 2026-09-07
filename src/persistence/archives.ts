import { UPGRADE_IDS } from "@/content/upgrades";
import type { DispatchResult, GameCommand } from "@/core/commands";
import type { GameEvent } from "@/core/events";
import { createRun, dispatchCommand } from "@/core/run";
import { getFreeAfterHoursLevel } from "@/core/progression";
import type { CommandError, RunState, UpgradeId } from "@/core/types";
import { isGameCommand, isGameEventV2, isPlainRecord } from "@/persistence/codec-shared";
import { decodeRunStateV2 } from "@/persistence/schema-v2";
import { loadRun, saveRun } from "@/persistence/storage";

declare const __RULES_FINGERPRINT__: string;
export const RULES_VERSION = typeof __RULES_FINGERPRINT__ === "string" ? __RULES_FINGERPRINT__ : "development-unknown";
export const ARCHIVE_KEY = "midnight-lucky-hotel.archives.v1";
export const MAX_ARCHIVE_BYTES = 10_000_000;
const FORMAT = "midnight-lucky-hotel.archive";
const LOG_FIELDS = [
  "hotel", "freeAfterHoursLevel", "blockStartBankroll", "workshop", "expenses", "blockReelAdditions",
  "phase", "shift", "afterHoursLevel", "baseSpinsInShift", "bankroll", "shiftWager", "shiftPayout",
  "betMode", "rng", "tips", "interventionPoints", "agitation", "omen", "reels", "temporaryReelAdditions",
  "pendingSpin", "pendingPrayer", "freeSpinQueue", "service", "serviceCandidates", "currentCandidates",
  "partSlots", "acquiredUpgrades", "toolLevel", "buffs", "counters", "shiftFlags", "contract", "exitUnlocked"
] as const satisfies readonly (keyof RunState)[];

export interface ActionEntry {
  readonly ordinal: number;
  readonly at: string;
  readonly actor: "player" | "system";
  readonly command: GameCommand;
  readonly ok: boolean;
  readonly error: CommandError | null;
  readonly shift: number;
  readonly afterHoursLevel: number;
  readonly spin: number;
  readonly events: readonly GameEvent[];
  readonly changes: Readonly<Record<string, { readonly before: unknown; readonly after: unknown }>>;
}

export interface RunArchive {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rulesVersion: string;
  readonly coverage: "complete" | "from-checkpoint";
  readonly origin: "new" | "legacy" | "backup" | "import" | "restored";
  readonly parentId: string | null;
  readonly favorite: boolean;
  readonly initialState: RunState;
  readonly snapshot: RunState;
  readonly entries: readonly ActionEntry[];
}

export interface ArchiveLibrary {
  readonly format: typeof FORMAT;
  readonly version: 1;
  readonly revision: number;
  readonly activeId: string | null;
  readonly runs: readonly RunArchive[];
  readonly discovered: readonly UpgradeId[];
  readonly favoriteUpgrades: readonly UpgradeId[];
  readonly favoriteSeeds: readonly number[];
}

export interface ArchiveSession {
  library: ArchiveLibrary;
  record: RunArchive;
  warning: string | null;
}

const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const timestamp = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();
const text = (value: unknown, max = 160): value is string => typeof value === "string" && value.length <= max;
const date = (value: unknown): value is string => text(value, 40) && Number.isFinite(Date.parse(value));
const list = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const upgrade = (value: unknown): value is UpgradeId => typeof value === "string" && UPGRADE_IDS.includes(value as UpgradeId);
export const validSeed = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffff_ffff;

function parse(textValue: string): unknown {
  if (new Blob([textValue]).size > MAX_ARCHIVE_BYTES) throw new Error("档案超过 10 MB，请按单局导出后再导入。");
  try {
    return JSON.parse(textValue, (key: string, value: unknown) => {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("档案包含非法字段。");
      return value;
    });
  } catch { throw new Error("档案内容无法解析或包含非法字段。原始数据未覆盖。"); }
}

function isEntry(value: unknown, index: number): value is ActionEntry {
  if (!isPlainRecord(value) || value.ordinal !== index + 1 || !date(value.at)
    || !["player", "system"].includes(String(value.actor)) || !isGameCommand(value.command)
    || typeof value.ok !== "boolean" || !Number.isSafeInteger(value.shift) || Number(value.shift) < 1
    || !Number.isSafeInteger(value.afterHoursLevel) || Number(value.afterHoursLevel) < 0
    || !Number.isSafeInteger(value.spin) || Number(value.spin) < 1
    || !list(value.events, 20_000) || !value.events.every(isGameEventV2) || !isPlainRecord(value.changes)) return false;
  if (value.ok ? value.error !== null : !isPlainRecord(value.error)
    || !["INVALID_PHASE", "INVALID_TARGET", "INSUFFICIENT_FUNDS", "RESOURCE_EXHAUSTED"].includes(String(value.error.code))
    || !text(value.error.message, 2_000)) return false;
  return Object.entries(value.changes).every(([key, change]) => LOG_FIELDS.includes(key as typeof LOG_FIELDS[number])
    && isPlainRecord(change) && Object.keys(change).length === 2 && "before" in change && "after" in change);
}

function isRecord(value: unknown): value is RunArchive {
  return isPlainRecord(value) && text(value.id) && value.id.length > 0 && text(value.name, 80)
    && date(value.createdAt) && date(value.updatedAt) && text(value.rulesVersion)
    && ["complete", "from-checkpoint"].includes(String(value.coverage))
    && ["new", "legacy", "backup", "import", "restored"].includes(String(value.origin))
    && (value.parentId === null || text(value.parentId)) && typeof value.favorite === "boolean"
    && decodeRunStateV2(value.initialState) !== null && decodeRunStateV2(value.snapshot) !== null
    && (value.initialState as RunState).initialSeed === (value.snapshot as RunState).initialSeed
    && list(value.entries, 30_000) && value.entries.every(isEntry);
}

function isLibrary(value: unknown): value is ArchiveLibrary {
  return isPlainRecord(value) && value.format === FORMAT && value.version === 1
    && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
    && list(value.runs, 500) && value.runs.every(isRecord)
    && new Set(value.runs.map((run) => (run as RunArchive).id)).size === value.runs.length
    && (value.activeId === null || value.runs.some((run) => (run as RunArchive).id === value.activeId))
    && list(value.discovered, UPGRADE_IDS.length) && value.discovered.every(upgrade)
    && list(value.favoriteUpgrades, UPGRADE_IDS.length) && value.favoriteUpgrades.every(upgrade)
    && list(value.favoriteSeeds, 256) && value.favoriteSeeds.every(validSeed);
}

function emptyLibrary(): ArchiveLibrary {
  return { format: FORMAT, version: 1, revision: 0, activeId: null, runs: [], discovered: [], favoriteUpgrades: [], favoriteSeeds: [] };
}

export function activeRecord(library: ArchiveLibrary): RunArchive | null {
  return library.runs.find((run) => run.id === library.activeId) ?? null;
}

function makeRecord(state: RunState, origin: RunArchive["origin"], name: string): RunArchive {
  return {
    id: newId(), name, createdAt: timestamp(), updatedAt: timestamp(),
    rulesVersion: origin === "legacy" && state.hotel === undefined ? "legacy-before-hotel" : RULES_VERSION,
    coverage: origin === "new" ? "complete" : "from-checkpoint", origin,
    parentId: null, favorite: false, initialState: state, snapshot: state, entries: []
  };
}

/** Read only. Legacy keys remain untouched and are treated as an explicit checkpoint. */
export function readLibrary(): ArchiveLibrary {
  const raw = localStorage.getItem(ARCHIVE_KEY);
  if (raw !== null) {
    const parsed = parse(raw);
    if (!isLibrary(parsed)) throw new Error("档案损坏或版本不支持。原始数据未覆盖，请先导出原始备份。");
    return parsed;
  }
  const legacy = loadRun();
  if (!legacy.ok) {
    if (legacy.reason !== "MISSING") throw new Error("旧存档无法读取，未覆盖原始数据。请先导出原始备份。");
    return emptyLibrary();
  }
  const record = makeRecord(legacy.state, "legacy", "更新前的游戏 · 检查点");
  return { ...emptyLibrary(), activeId: record.id, runs: [record], discovered: [...new Set(legacy.state.acquiredUpgrades)] };
}

/** One atomic write. Never evicts history; a stale tab cannot overwrite a newer library. */
export function writeLibrary(library: ArchiveLibrary): ArchiveLibrary {
  if (!isLibrary(library)) throw new Error("档案校验失败，当前内存进度保留，请导出检查。");
  const currentRaw = localStorage.getItem(ARCHIVE_KEY);
  const current: unknown = currentRaw === null ? null : parse(currentRaw);
  if (current !== null && !isLibrary(current)) throw new Error("已保存的档案损坏，未覆盖原始数据。请先导出原始备份。");
  if (current !== null && (!isPlainRecord(current) || current.revision !== library.revision)) {
    throw new Error("另一个标签页已更新档案。请先导出本页进度，再刷新；未覆盖另一页的数据。");
  }
  if (current === null && library.revision !== 0) throw new Error("本地档案已在别处移除。请先导出本页进度。");
  const next = { ...library, revision: library.revision + 1 };
  const raw = JSON.stringify(next);
  if (new Blob([raw]).size > MAX_ARCHIVE_BYTES) throw new Error("档案容量已满。请导出备份；没有删除任何历史记录。");
  try { localStorage.setItem(ARCHIVE_KEY, raw); }
  catch { throw new Error("自动保存失败：浏览器空间不足或禁止存储。内存进度仍在，请立即导出备份。"); }
  const active = activeRecord(next);
  if (active !== null) saveRun(active.snapshot); // Compatibility mirror, never the authoritative archive.
  return next;
}

export function initializeLibrary(): ArchiveLibrary {
  const library = readLibrary();
  return library.revision === 0 ? writeLibrary(library) : library;
}

function replaceRecord(library: ArchiveLibrary, record: RunArchive): ArchiveLibrary {
  return {
    ...library,
    runs: library.runs.some((run) => run.id === record.id)
      ? library.runs.map((run) => run.id === record.id ? record : run) : [...library.runs, record],
    discovered: [...new Set([...library.discovered, ...record.snapshot.acquiredUpgrades])]
  };
}

export function startArchivedRun(library: ArchiveLibrary, seed: number): ArchiveLibrary {
  if (!validSeed(seed)) throw new Error("种子必须是 0 到 4294967295 之间的整数。");
  const record = makeRecord(createRun(seed), "new", "新夜班 · " + seed);
  return writeLibrary({ ...replaceRecord(library, record), activeId: record.id });
}

export function restoreArchive(library: ArchiveLibrary, source: RunArchive): ArchiveLibrary {
  if (source.rulesVersion !== RULES_VERSION) throw new Error("规则版本不同：可查看和导出，但不能用当前规则续玩。");
  const verification = verifyArchive(source);
  if (!verification.startsWith("核验通过")) throw new Error("档案未通过一致性核验，不能恢复。" + verification);
  const record: RunArchive = { ...source, id: newId(), name: source.name.slice(0, 65) + " · 续玩", parentId: source.id, origin: "restored", createdAt: timestamp(), updatedAt: timestamp() };
  return writeLibrary({ ...replaceRecord(library, record), activeId: record.id });
}

/** Explicit opt-in checkpoint migration, never a replay of old commands under new rules. */
export function canMigrateArchive(source: RunArchive): boolean {
  const state = source.snapshot;
  return ["rules-76b3ccda2416e7f9", "rules-705e0a792a2c3847"].includes(source.rulesVersion) && source.rulesVersion !== RULES_VERSION
    && state.hotel !== undefined && state.pendingSpin === null && state.freeSpinQueue === 0
    && (["AFTER_HOURS", "SHIFT_COMPLETE", "CHOOSING_UPGRADE"].includes(state.phase)
      || (state.phase === "READY_TO_SPIN" && state.baseSpinsInShift === 0));
}

export function migrateArchive(library: ArchiveLibrary, source: RunArchive): ArchiveLibrary {
  if (!isRecord(source) || !canMigrateArchive(source)) throw new Error("仅支持已知旧版本的结算／首转前检查点迁移，原档案没有改变。");
  let bankroll = source.initialState.bankroll;
  let opening = source.initialState.blockStartBankroll;
  for (const entry of source.entries) {
    if (!entry.ok) continue;
    const balance = entry.changes.bankroll?.after;
    if (typeof balance === "number") bankroll = balance;
    if (entry.command.type === "ENTER_ROOM" || entry.command.type === "CONTINUE" || entry.command.type === "SELECT_SERVICE"
      || entry.changes.phase?.after === "READY_TO_SPIN" && entry.changes.shift !== undefined) opening = bankroll;
  }
  const completed = source.entries.flatMap((entry) => entry.events).findLast((event) => event.type === "ROOM_COMPLETED");
  const challenge = source.snapshot.hotel?.challenge;
  const snapshot: RunState = { ...source.snapshot,
    freeAfterHoursLevel: getFreeAfterHoursLevel(source.snapshot), workshop: null,
    ...(opening === undefined ? {} : { blockStartBankroll: opening }),
    ...(challenge != null && challenge.status !== "playing" && completed?.type === "ROOM_COMPLETED" && completed.tier === challenge.tier
      ? { hotel: { cleared: source.snapshot.hotel!.cleared, challenge: { ...challenge, target: completed.target } } } : {})
  };
  if (decodeRunStateV2(snapshot) === null) throw new Error("迁移检查点校验失败，原档案没有改变。");
  const record: RunArchive = { ...makeRecord(snapshot, "restored", source.name.slice(0, 60) + " · 新版续玩"), parentId: source.id };
  return writeLibrary({ ...replaceRecord(library, record), activeId: record.id });
}

export function openArchiveSession(state: RunState): ArchiveSession {
  const library = readLibrary();
  const active = activeRecord(library);
  if (active !== null && !equal(active.snapshot, state)) throw new Error("页面与存档进度不一致，请返回前台重新载入。");
  if (active !== null && active.rulesVersion !== RULES_VERSION) throw new Error("规则版本不同，请在前台查看旧局或开始新局。");
  const record = active ?? makeRecord(state, "new", "夜班 · " + state.initialSeed);
  return { library: { ...replaceRecord(library, record), activeId: record.id }, record, warning: null };
}

export function stateChanges(before: RunState, after: RunState): ActionEntry["changes"] {
  return Object.fromEntries(LOG_FIELDS.filter((key) => !equal(before[key], after[key]))
    .map((key) => [key, { before: before[key] ?? null, after: after[key] ?? null }]));
}

export function persistSession(session: ArchiveSession): void {
  try {
    session.library = writeLibrary(replaceRecord(session.library, session.record));
    session.warning = null;
  } catch (error) { session.warning = error instanceof Error ? error.message : "自动保存失败，请导出备份。"; }
}

export function recordAction(session: ArchiveSession, before: RunState, command: GameCommand, result: DispatchResult, actor?: ActionEntry["actor"]): void {
  if (!equal(before, session.record.snapshot)) throw new Error("日志起点与当前状态不一致，已停止记录，未覆盖旧档案。");
  const entry: ActionEntry = {
    ordinal: session.record.entries.length + 1, at: timestamp(),
    actor: actor ?? (["REELS_STOPPED", "PRESENTATION_COMPLETE"].includes(command.type) ? "system" : "player"),
    command, ok: result.ok, error: result.ok ? null : result.error,
    shift: before.shift, afterHoursLevel: before.afterHoursLevel, spin: before.nextSpinOrdinal,
    events: result.ok ? result.events : [], changes: stateChanges(before, result.state)
  };
  session.record = { ...session.record, snapshot: result.state, updatedAt: timestamp(), entries: [...session.record.entries, entry] };
  session.library = replaceRecord(session.library, session.record);
  persistSession(session);
}

export function backupSession(session: ArchiveSession, name: string): void {
  const backup: RunArchive = { ...session.record, id: newId(), name: name.trim().slice(0, 80) || "手动备份", parentId: session.record.id, origin: "backup", createdAt: timestamp(), updatedAt: timestamp() };
  session.library = replaceRecord(session.library, backup);
  persistSession(session);
}

export function exportArchive(record: RunArchive): string {
  return JSON.stringify({ format: FORMAT, version: 1, exportedAt: timestamp(), run: record }, null, 2);
}

export function importArchive(library: ArchiveLibrary, serialized: string): ArchiveLibrary {
  const parsed = parse(serialized);
  if (!isPlainRecord(parsed) || parsed.format !== FORMAT || parsed.version !== 1 || !isRecord(parsed.run)) {
    throw new Error("不是有效的游戏复盘包。当前局和历史记录没有改变。");
  }
  const imported: RunArchive = { ...parsed.run, id: newId(), parentId: parsed.run.id, origin: "import", name: (parsed.run.name + " · 导入").slice(0, 80) };
  return writeLibrary(replaceRecord(library, imported));
}

/** Pure offline verification, never dispatches to the live controller or saves anything. */
export function verifyArchive(record: RunArchive): string {
  if (record.rulesVersion !== RULES_VERSION) return "规则版本不同，不能执行一致性核验；原始日志仍可查看。";
  let state = record.initialState;
  try {
    for (const entry of record.entries) {
      const result = dispatchCommand(state, entry.command);
      if (result.ok !== entry.ok || !equal(result.ok ? null : result.error, entry.error)
        || !equal(result.ok ? result.events : [], entry.events) || !equal(stateChanges(state, result.state), entry.changes)) {
        return "第 " + entry.ordinal + " 条记录不一致。仅完成检查，没有改动存档。";
      }
      state = result.state;
    }
  } catch { return "核验中遇到无效状态，没有改动存档。"; }
  return equal(state, record.snapshot)
    ? "核验通过：" + record.entries.length + " 条操作与最终状态一致。" + (record.coverage === "from-checkpoint" ? "仅覆盖保存检查点之后的过程。" : "")
    : "最终快照与日志不一致，没有改动存档。";
}
