import { UPGRADES } from "@/content/upgrades";
import type { PartInstance, ReelSet, RunState, ServiceId, SymbolId } from "@/core/types";
import { RULES_VERSION } from "@/persistence/archives";

/** A construction recipe, never a checkpoint or a copy of the official RNG. */
export interface Blueprint {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly rulesVersion: string;
  readonly reels: ReelSet;
  readonly partSlots: RunState["partSlots"];
  readonly service: ServiceId | null;
}

export const BLUEPRINT_STORAGE_KEY = "midnight-lucky-hotel.blueprints.v1";
export const MAX_BLUEPRINTS = 12;
export const MAX_BLUEPRINT_REEL_LENGTH = 128;
const MAX_LIBRARY_BYTES = 200_000;
const SYMBOLS = new Set<SymbolId>(["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"]);
const SERVICES = new Set<ServiceId>(["repair", "kitchen", "chapel", "security"]);
const BLUEPRINT_KEYS = ["version", "id", "name", "createdAt", "rulesVersion", "reels", "partSlots", "service"];

export type BlueprintStorage = Pick<Storage, "getItem" | "setItem">;
export interface BlueprintLibraryResult {
  readonly entries: readonly Blueprint[];
  readonly error: string | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function denseArray(value: unknown, length?: number): value is unknown[] {
  return Array.isArray(value) && (length === undefined || value.length === length)
    && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);
}

function part(value: unknown): value is PartInstance {
  return record(value) && Object.keys(value).length === 2 && typeof value.id === "string"
    && Object.hasOwn(UPGRADES, value.id) && UPGRADES[value.id as keyof typeof UPGRADES].kind === "part"
    && (value.level === 1 || value.level === 2);
}

/** Deliberately accepts past fingerprints for viewing; running them needs explicit consent. */
export function isBlueprint(value: unknown): value is Blueprint {
  if (!record(value) || Object.keys(value).length !== BLUEPRINT_KEYS.length
    || !BLUEPRINT_KEYS.every((key) => Object.hasOwn(value, key)) || value.version !== 1
    || !text(value.id, 80) || !text(value.name, 32) || !text(value.rulesVersion, 80)
    || !text(value.createdAt, 32) || !Number.isFinite(Date.parse(value.createdAt))
    || !denseArray(value.reels, 3) || !denseArray(value.partSlots, 5)
    || value.service !== null && !SERVICES.has(value.service as ServiceId)) return false;
  if (!value.reels.every((strip) => denseArray(strip) && strip.length >= 1 && strip.length <= MAX_BLUEPRINT_REEL_LENGTH
    && strip.every((symbol) => SYMBOLS.has(symbol as SymbolId)))) return false;
  if (!value.partSlots.every((entry) => entry === null || part(entry))) return false;
  const ids = value.partSlots.filter((entry) => entry !== null).map((entry) => (entry as PartInstance).id);
  return new Set(ids).size === ids.length;
}

function cloneBlueprint(blueprint: Blueprint): Blueprint {
  return { ...blueprint,
    reels: blueprint.reels.map((strip) => [...strip]) as unknown as ReelSet,
    partSlots: blueprint.partSlots.map((entry) => entry === null ? null : { ...entry }) as unknown as RunState["partSlots"] };
}

let fallbackId = 0;
export function captureBlueprint(state: RunState, name: string): Blueprint {
  const cleanName = name.trim() || "未命名机台";
  if (!text(cleanName, 32)) throw new Error("构筑名称须为 1–32 个字符，不能含换行或控制字符。");
  const createdAt = new Date().toISOString();
  const blueprint: Blueprint = {
    version: 1,
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `build-${Date.now()}-${++fallbackId}`,
    name: cleanName, createdAt, rulesVersion: RULES_VERSION,
    reels: state.reels, partSlots: state.partSlots, service: state.service
  };
  if (!isBlueprint(blueprint)) throw new Error(`此构筑无法收藏：请检查部件，单轮最多支持 ${MAX_BLUEPRINT_REEL_LENGTH} 个符号。`);
  return cloneBlueprint(blueprint);
}

function getStorage(storage?: BlueprintStorage): BlueprintStorage {
  return storage ?? localStorage;
}

/** Invalid/unknown data stays in storage. A later save must not overwrite it. */
export function readBlueprints(storage?: BlueprintStorage): BlueprintLibraryResult {
  try {
    const raw = getStorage(storage).getItem(BLUEPRINT_STORAGE_KEY);
    if (raw === null) return { entries: [], error: null };
    if (raw.length > MAX_LIBRARY_BYTES) return { entries: [], error: "收藏数据过大，原数据已保留；本次不会写入。" };
    const decoded: unknown = JSON.parse(raw);
    if (!record(decoded) || Object.keys(decoded).length !== 2 || decoded.version !== 1
      || !denseArray(decoded.entries) || decoded.entries.length > MAX_BLUEPRINTS
      || !decoded.entries.every(isBlueprint)
      || new Set(decoded.entries.map((entry) => entry.id)).size !== decoded.entries.length) {
      return { entries: [], error: "收藏数据版本不支持或已损坏，原数据已保留；本次不会写入。" };
    }
    return { entries: decoded.entries.map(cloneBlueprint), error: null };
  } catch {
    return { entries: [], error: "无法读取本地收藏；请检查浏览器存储权限。原数据未被修改。" };
  }
}

function writeLibrary(entries: readonly Blueprint[], previous: readonly Blueprint[], storage?: BlueprintStorage): BlueprintLibraryResult {
  try {
    const raw = JSON.stringify({ version: 1, entries });
    if (raw.length > MAX_LIBRARY_BYTES) return { entries: previous, error: "收藏空间已满，原收藏已保留。" };
    getStorage(storage).setItem(BLUEPRINT_STORAGE_KEY, raw);
    return { entries: entries.map(cloneBlueprint), error: null };
  } catch {
    return { entries: previous, error: "收藏未保存：浏览器存储不可用或空间不足。原收藏已保留。" };
  }
}

export function saveBlueprint(blueprint: Blueprint, storage?: BlueprintStorage): BlueprintLibraryResult {
  const previous = readBlueprints(storage);
  if (previous.error !== null) return previous;
  if (!isBlueprint(blueprint)) return { ...previous, error: "无效构筑，未写入收藏。" };
  const index = previous.entries.findIndex((entry) => entry.id === blueprint.id);
  if (index < 0 && previous.entries.length >= MAX_BLUEPRINTS) {
    return { ...previous, error: `最多收藏 ${MAX_BLUEPRINTS} 台机台。请先手动删除一项，不会自动覆盖旧收藏。` };
  }
  const entries = index < 0 ? [...previous.entries, cloneBlueprint(blueprint)]
    : previous.entries.map((entry, position) => position === index ? cloneBlueprint(blueprint) : entry);
  return writeLibrary(entries, previous.entries, storage);
}

/** Invoke only for the explicit Delete action, never to make room automatically. */
export function deleteBlueprint(id: string, storage?: BlueprintStorage): BlueprintLibraryResult {
  const previous = readBlueprints(storage);
  if (previous.error !== null) return previous;
  return writeLibrary(previous.entries.filter((entry) => entry.id !== id), previous.entries, storage);
}
