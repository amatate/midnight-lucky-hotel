import type { ArchiveLibrary } from "@/persistence/archives";
import { isClassicState } from "@/classic/engine";
import { MACHINE_IDS, isFeatureMachineState, type MachineId } from "@/classic/machines";
import { machineKey } from "@/classic/machine-storage";

/** Cosmetic progression only. Never writes a machine, hotel archive, RNG, wallet or paytable. */
export const GUESTBOOK_KEY = "midnight-lucky-hotel.guestbook.v1";
export type QuestId = "first-spin" | "read-ledger" | "two-cabinets" | "first-part" | "four-cabinets" | "eight-parts" | "garden" | "penthouse" | "all-rooms";
export type QuestAction = "lesson" | "ledger" | "tour" | "hotel" | "collection";
type Copy = readonly [string, string];
export interface GuestQuest {
  readonly id: QuestId; readonly kind: "short" | "long"; readonly title: Copy; readonly description: Copy;
  readonly reward: Copy; readonly memory: Copy; readonly target: number; readonly action: QuestAction; readonly mark: string;
}
export const QUESTS: readonly GuestQuest[] = [
  { id: "first-spin", kind: "short", title: ["学会第一转", "Your first spin"], description: ["完成经典机台气泡教学；也可转一次原版机，再打开账本。输赢都算。", "Finish the Original's tutorial, or play one spin on it and open its ledger. Wins and losses both count."], reward: ["初夜印章", "First night stamp"], memory: ["澪：第一枚印章，留给愿意弄懂规则的你。", "Mio: Your first stamp is for learning the rules, not winning a bet."], target: 1, action: "lesson", mark: "☾" },
  { id: "read-ledger", kind: "short", title: ["把账算清", "Read the receipt"], description: ["打开任一经典机台账本，看一眼下注、赔付和净变化。", "Open any classic machine's ledger and compare bets, payouts and net change."], reward: ["黄铜账签", "Brass ledger tab"], memory: ["澪：回本不是净赚。现在，你比招牌上的大数字更清醒。", "Mio: A returned stake is not a profit. Now you can see past the big numbers."], target: 1, action: "ledger", mark: "≡" },
  { id: "two-cabinets", kind: "short", title: ["隔壁也有好风景", "Try the next cabinet"], description: ["在两种不同的经典机台各完成至少一转。", "Settle at least one spin on two different classic cabinets."], reward: ["双机票根", "Two-cabinet ticket"], memory: ["澪：喜欢哪一台，不必只看它给过多少筹码。", "Mio: A favorite cabinet is about more than how much it paid."], target: 2, action: "tour", mark: "Ⅱ" },
  { id: "first-part", kind: "short", title: ["第一次改造", "Make it your own"], description: ["在酒店闯关中获得一项永久改造或部件。", "Acquire your first permanent upgrade or part in a hotel run."], reward: ["维修间印章", "Workshop stamp"], memory: ["澪：从这里起，你不只是等好运，还能亲手改造它。", "Mio: From here, you can build your luck instead of only waiting for it."], target: 1, action: "hotel", mark: "◇" },
  { id: "four-cabinets", kind: "long", title: ["机械俱乐部常客", "Reel Club regular"], description: ["原版、钻石、轮盘、金库，四台机各完成至少一转。", "Play the Original, Diamond, Wheel and Vault at least once each."], reward: ["四机巡游纪念卡", "Reel Club postcard"], memory: ["澪：四种不同的机械脾气。现在，这间俱乐部也有你的座位了。", "Mio: Four different mechanical personalities. There is a seat for you in this club now."], target: 4, action: "tour", mark: "Ⅳ" },
  { id: "eight-parts", kind: "long", title: ["夜班收藏家", "Night-shift collector"], description: ["图鉴累计发现 8 种不同的永久改造或部件。可跨局完成。", "Discover eight different permanent upgrades or parts across hotel runs."], reward: ["黄铜房钥匙", "Brass room key"], memory: ["澪：钥匙不替你开出大奖，它纪念你试过的八种可能。", "Mio: This key does not unlock a jackpot. It remembers eight possibilities you explored."], target: 8, action: "collection", mark: "✧" },
  { id: "garden", kind: "long", title: ["花园的第一封信", "A letter from the garden"], description: ["在酒店闯关中通关花园房。已保存的旧成绩也计入。", "Clear the Garden Room in a hotel run. Existing saved achievements count."], reward: ["花园明信片", "Garden postcard"], memory: ["澪：天快亮时，花园里的灯是最后一盏熄灭的。", "Mio: At dawn, the garden lamp is the last one to go dark."], target: 1, action: "hotel", mark: "❀" },
  { id: "penthouse", kind: "long", title: ["顶层住客", "The penthouse guest"], description: ["通关前三间客房，抵达并完成顶层套房。", "Clear the first three rooms, including the Penthouse Suite."], reward: ["顶层夜景纪念卡", "Penthouse night-view card"], memory: ["澪：从顶层看下去，每一扇亮着的窗都像一段还没结束的故事。", "Mio: From the top floor, every lit window looks like an unfinished story."], target: 3, action: "hotel", mark: "♜" },
  { id: "all-rooms", kind: "long", title: ["午夜酒店的全部风景", "Every view after midnight"], description: ["完成现有六间客房挑战，收下最后一枚酒店印章。", "Clear all six existing hotel-room challenges for the final hotel stamp."], reward: ["午夜常客纪念章", "Midnight regular medallion"], memory: ["澪：你已经看过酒店所有的风景。下次回来，不必再说初次见面。", "Mio: You have seen every view in this hotel. Next time, we can skip the introductions."], target: 6, action: "hotel", mark: "✦" }
];
export interface Guestbook {
  readonly version: 1; readonly met: boolean; readonly lesson: boolean; readonly ledger: boolean;
  readonly played: readonly MachineId[]; readonly discovered: number; readonly rooms: number; readonly claimed: readonly QuestId[];
}
type Store = Pick<Storage, "getItem" | "setItem">;
export const emptyGuestbook = (): Guestbook => ({ version: 1, met: false, lesson: false, ledger: false, played: [], discovered: 0, rooms: 0, claimed: [] });
const unique = <T,>(items: readonly T[]): T[] => [...new Set(items)];
function valid(value: unknown): value is Guestbook {
  if (!value || typeof value !== "object") return false;
  const v = value as Guestbook;
  return v.version === 1 && [v.met, v.lesson, v.ledger].every(x => typeof x === "boolean")
    && Number.isInteger(v.discovered) && v.discovered >= 0 && v.discovered <= 1000
    && Number.isInteger(v.rooms) && v.rooms >= 0 && v.rooms <= 6
    && Array.isArray(v.played) && v.played.length <= 4 && v.played.every(id => MACHINE_IDS.includes(id)) && unique(v.played).length === v.played.length
    && Array.isArray(v.claimed) && v.claimed.length <= QUESTS.length && v.claimed.every(id => QUESTS.some(q => q.id === id)) && unique(v.claimed).length === v.claimed.length;
}
export function readGuestbook(storage: Store = localStorage): Guestbook {
  const raw = storage.getItem(GUESTBOOK_KEY); if (raw === null) return emptyGuestbook();
  if (raw.length > 10000) throw new Error("guestbook-invalid");
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error("guestbook-invalid"); }
  if (!valid(value)) throw new Error("guestbook-invalid"); return value;
}
function save(previous: Guestbook, next: Guestbook, storage: Store): Guestbook {
  if (JSON.stringify(previous) !== JSON.stringify(next)) storage.setItem(GUESTBOOK_KEY, JSON.stringify(next));
  return next;
}
/** Read existing achievements without opening, creating, settling or migrating any save. */
export function syncGuestbook(library: ArchiveLibrary | null, storage: Store = localStorage): Guestbook {
  const previous = readGuestbook(storage);
  const played = [...previous.played];
  for (const id of MACHINE_IDS) {
    try {
      const raw = storage.getItem(machineKey(id)); if (!raw || raw.length > 200000) continue;
      const state: unknown = JSON.parse(raw);
      const okay = id === "original" ? isClassicState(state) && !("machine" in state) : isFeatureMachineState(state, id);
      if (okay && (state as { spins: number }).spins > 0) played.push(id);
    } catch { /* Invalid machine data is never rewritten by this optional display. */ }
  }
  return save(previous, { ...previous, played: unique(played), discovered: Math.max(previous.discovered, library?.discovered.length ?? 0),
    rooms: Math.max(previous.rooms, ...(library?.runs.map(run => run.snapshot.hotel?.cleared ?? 0) ?? [0])) }, storage);
}
export function noteGuestActivity(activity: "met" | "lesson" | "ledger" | MachineId, storage: Store = localStorage): boolean {
  try {
    const previous = readGuestbook(storage);
    const next = activity === "met" || activity === "lesson" || activity === "ledger" ? { ...previous, [activity]: true }
      : { ...previous, played: unique([...previous.played, activity]) };
    save(previous, next, storage); return true;
  } catch { return false; } // Cosmetic failure must never change a paid spin's result.
}
export function questProgress(quest: GuestQuest, book: Guestbook): number {
  const values: Record<QuestId, number> = {
    "first-spin": book.lesson || (book.played.includes("original") && book.ledger) ? 1 : 0,
    "read-ledger": book.ledger ? 1 : 0, "two-cabinets": book.played.length, "first-part": book.discovered,
    "four-cabinets": book.played.length, "eight-parts": book.discovered, garden: book.rooms, penthouse: book.rooms, "all-rooms": book.rooms
  };
  return Math.min(quest.target, values[quest.id]);
}
export function claimQuest(id: QuestId, library: ArchiveLibrary | null, storage: Store = localStorage): Guestbook {
  const book = syncGuestbook(library, storage); const quest = QUESTS.find(q => q.id === id);
  if (!quest || questProgress(quest, book) < quest.target) throw new Error("guestbook-incomplete");
  return save(book, { ...book, claimed: unique([...book.claimed, id]) }, storage);
}
