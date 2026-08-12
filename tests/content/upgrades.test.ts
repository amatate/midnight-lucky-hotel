import { describe, expect, it } from "vitest";
import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import { consumeSafetyFuse } from "@/content/effects/neutral";
import { applyUpgrade } from "@/core/upgrades";
import { createRun, dispatchCommand } from "@/core/run";
import type { PartInstance, ReelSet, RunState, UpgradeChoice, UpgradeId } from "@/core/types";

const EXPECTED_NAMES = {
  "lemon-crate": "柠檬木箱",
  "cherry-pitter": "樱桃去核器",
  "lemon-infection": "柠檬感染",
  "jam-jar": "果酱罐",
  "fruit-salad": "水果沙拉",
  leftovers: "剩菜打包",
  "seven-purification": "七之净化",
  "tithe-box": "什一税箱",
  "omen-collector": "恶兆收集器",
  "triple-blessing": "三重祝福",
  "midnight-bell": "午夜钟声",
  "martyr-coin": "殉道者硬币",
  "artificial-crack": "人为裂纹",
  "scrap-magnet": "废料磁铁",
  "loose-spring": "松动弹簧",
  "blank-capacitor": "空白电容",
  "warranty-fraud": "骗保单",
  "overload-motor": "过载马达",
  "pruning-shears": "修枝剪",
  "carbon-copy": "复写纸",
  "safety-fuse": "安全保险丝",
  calculator: "计算器",
  ledger: "会计账本",
  "statistics-terminal": "统计终端"
} as const satisfies Readonly<Record<UpgradeId, string>>;

function withService(service: RunState["service"], patch: Partial<RunState> = {}): RunState {
  return { ...createRun(100), service, ...patch };
}

function candidatesIncluding(id: UpgradeId): RunState["currentCandidates"] {
  const alternatives = UPGRADE_IDS.filter((candidate) => candidate !== id);
  return { synergy: id, pivot: alternatives[0]!, wildcard: alternatives[1]! };
}

function choosing(id: UpgradeId, patch: Partial<RunState> = {}): RunState {
  return {
    ...withService("repair"),
    phase: "CHOOSING_UPGRADE",
    shift: 1,
    baseSpinsInShift: 3,
    shiftWager: 30,
    shiftPayout: 12,
    currentCandidates: candidatesIncluding(id),
    ...patch
  };
}

function expectAccepted(result: ReturnType<typeof applyUpgrade>): RunState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe("UPGRADES", () => {
  it("publishes exactly the 24 design IDs with unique exact Chinese names and complete metadata", () => {
    expect(UPGRADE_IDS).toHaveLength(24);
    expect(new Set(UPGRADE_IDS).size).toBe(24);
    expect(Object.keys(UPGRADES)).toEqual(UPGRADE_IDS);
    expect(Object.fromEntries(UPGRADE_IDS.map((id) => [id, UPGRADES[id].name]))).toEqual(EXPECTED_NAMES);
    expect(new Set(UPGRADE_IDS.map((id) => UPGRADES[id].name)).size).toBe(24);

    for (const id of UPGRADE_IDS) {
      expect(UPGRADES[id].id).toBe(id);
      expect(UPGRADES[id].tags.length).toBeGreaterThan(0);
      expect(UPGRADES[id].candidateRoles.length).toBeGreaterThan(0);
    }
  });

  it("gates service-dependent food, omen, kick, and crack parts", () => {
    expect(UPGRADES.leftovers.requires(withService("repair"))).toBe(false);
    expect(UPGRADES.leftovers.requires(withService("kitchen"))).toBe(true);
    expect(UPGRADES["omen-collector"].requires(withService("repair"))).toBe(false);
    expect(UPGRADES["omen-collector"].requires(withService("chapel"))).toBe(true);
    expect(UPGRADES["loose-spring"].requires(withService("repair"))).toBe(false);
    expect(UPGRADES["loose-spring"].requires(withService("security"))).toBe(true);

    for (const id of ["scrap-magnet", "warranty-fraud"] as const) {
      expect(UPGRADES[id].requires(withService("repair"))).toBe(false);
      expect(UPGRADES[id].requires(withService("security"))).toBe(true);
      const crackReels: ReelSet = [["crack", ...createRun(1).reels[0]], createRun(1).reels[1], createRun(1).reels[2]];
      expect(UPGRADES[id].requires(withService("repair", { reels: crackReels }))).toBe(true);
    }
  });

  it("gates tithe by bankroll and information tools in strict sequence", () => {
    expect(UPGRADES["tithe-box"].requires(withService("chapel", { bankroll: 9.99 }))).toBe(false);
    expect(UPGRADES["tithe-box"].requires(withService("chapel", { bankroll: 10 }))).toBe(true);
    expect(UPGRADES.calculator.requires(withService("repair", { toolLevel: 0 }))).toBe(true);
    expect(UPGRADES.ledger.requires(withService("repair", { toolLevel: 0 }))).toBe(false);
    expect(UPGRADES.ledger.requires(withService("repair", { toolLevel: 1 }))).toBe(true);
    expect(UPGRADES["statistics-terminal"].requires(withService("repair", { toolLevel: 1 }))).toBe(false);
    expect(UPGRADES["statistics-terminal"].requires(withService("repair", { toolLevel: 2 }))).toBe(true);
  });
});

describe("applyUpgrade", () => {
  it("requires a currently offered ID and an eligible definition without mutating rejected input", () => {
    const state = choosing("lemon-crate", {
      currentCandidates: { synergy: "calculator", pivot: "ledger", wildcard: "statistics-terminal" }
    });
    const snapshot = structuredClone(state);
    const result = applyUpgrade(state, {
      id: "lemon-crate",
      action: "apply",
      target: { kind: "two-reels", reels: [0, 1] }
    });

    expect(result).toEqual({
      ok: false,
      state,
      error: { code: "INVALID_TARGET", message: "upgrade is not a current candidate" }
    });
    expect(state).toEqual(snapshot);
  });

  it("validates and applies every route reel modification target", () => {
    const missing = choosing("lemon-crate");
    expect(applyUpgrade(missing, { id: "lemon-crate", action: "apply" })).toEqual({
      ok: false,
      state: missing,
      error: { code: "INVALID_TARGET", message: "lemon-crate requires two distinct reels" }
    });
    expect(
      applyUpgrade(missing, {
        id: "lemon-crate",
        action: "apply",
        target: { kind: "two-reels", reels: [1, 1] }
      })
    ).toEqual({
      ok: false,
      state: missing,
      error: { code: "INVALID_TARGET", message: "lemon-crate requires two distinct reels" }
    });

    const crateState = choosing("lemon-crate");
    const crate = expectAccepted(
      applyUpgrade(crateState, {
        id: "lemon-crate",
        action: "apply",
        target: { kind: "two-reels", reels: [0, 2] }
      })
    );
    expect(crate.reels[0].slice(-2)).toEqual(["lemon", "lemon"]);
    expect(crate.reels[1]).toEqual(crateState.reels[1]);
    expect(crate.reels[2].slice(-2)).toEqual(["lemon", "lemon"]);

    const pitterState = choosing("cherry-pitter");
    const pitter = expectAccepted(
      applyUpgrade(pitterState, {
        id: "cherry-pitter",
        action: "apply",
        target: { kind: "symbol-on-reel", reel: 0, symbol: "lemon" }
      })
    );
    expect(pitter.reels[0].filter((symbol) => symbol === "lemon")).toHaveLength(
      pitterState.reels[0].filter((symbol) => symbol === "lemon").length - 1
    );
    expect(pitter.reels[0].filter((symbol) => symbol === "cherry")).toHaveLength(
      pitterState.reels[0].filter((symbol) => symbol === "cherry").length + 1
    );

    const purificationState = choosing("seven-purification");
    const purification = expectAccepted(
      applyUpgrade(purificationState, {
        id: "seven-purification",
        action: "apply",
        target: { kind: "symbol-on-reel", reel: 1, symbol: "cherry" }
      })
    );
    expect(purification.reels[1].filter((symbol) => symbol === "seven")).toHaveLength(
      purificationState.reels[1].filter((symbol) => symbol === "seven").length + 1
    );

    const titheState = choosing("tithe-box", { bankroll: 25 });
    const tithe = expectAccepted(
      applyUpgrade(titheState, { id: "tithe-box", action: "apply", target: { kind: "reel", reel: 2 } })
    );
    expect(tithe).toMatchObject({ bankroll: 15, omen: 1 });
    expect(tithe.expenses.chapel).toBe(10);
    expect(tithe.reels[2].at(-1)).toBe("seven");

    const crackState = choosing("artificial-crack");
    const crack = expectAccepted(
      applyUpgrade(crackState, {
        id: "artificial-crack",
        action: "apply",
        target: { kind: "reel", reel: 1 }
      })
    );
    expect(crack.reels[1].at(-1)).toBe("crack");
    expect(crack.maxInterventionPoints).toBe(4);
    expect(crack.interventionPoints).toBe(4);
    expect(crack.nextShiftFocusBonus).toBe(0);
  });

  it("rejects ineligible structural targets without mutation", () => {
    const pitter = choosing("cherry-pitter");
    const pitterSnapshot = structuredClone(pitter);
    const absent = applyUpgrade(pitter, {
      id: "cherry-pitter",
      action: "apply",
      target: { kind: "symbol-on-reel", reel: 0, symbol: "food" }
    });
    expect(absent.ok).toBe(false);
    expect(absent.state).toBe(pitter);
    expect(pitter).toEqual(pitterSnapshot);

    const purification = choosing("seven-purification");
    const invalidSymbol = applyUpgrade(purification, {
      id: "seven-purification",
      action: "apply",
      target: { kind: "symbol-on-reel", reel: 0, symbol: "bell" }
    });
    expect(invalidSymbol.ok).toBe(false);
    expect(invalidSymbol.state).toBe(purification);
  });

  it("puts new parts in the first empty slot and upgrades a duplicate only to level two", () => {
    const existing: PartInstance = { id: "safety-fuse", level: 1 };
    const inserted = expectAccepted(
      applyUpgrade(choosing("jam-jar", { partSlots: [existing, null, null, null, null] }), {
        id: "jam-jar",
        action: "apply"
      })
    );
    expect(inserted.partSlots).toEqual([existing, { id: "jam-jar", level: 1 }, null, null, null]);

    const levelTwo = expectAccepted(
      applyUpgrade(choosing("jam-jar", { partSlots: [{ id: "jam-jar", level: 1 }, null, null, null, null] }), {
        id: "jam-jar",
        action: "apply"
      })
    );
    expect(levelTwo.partSlots[0]).toEqual({ id: "jam-jar", level: 2 });

    const maxed = choosing("jam-jar", { partSlots: [{ id: "jam-jar", level: 2 }, null, null, null, null] });
    expect(applyUpgrade(maxed, { id: "jam-jar", action: "apply" })).toEqual({
      ok: false,
      state: maxed,
      error: { code: "RESOURCE_EXHAUSTED", message: "part is already level two" }
    });
  });

  it("requires replace or decline for a new part when all five slots are full", () => {
    const full = [
      { id: "jam-jar", level: 1 },
      { id: "fruit-salad", level: 1 },
      { id: "midnight-bell", level: 1 },
      { id: "blank-capacitor", level: 1 },
      { id: "safety-fuse", level: 1 }
    ] as const satisfies RunState["partSlots"];
    const state = choosing("overload-motor", { partSlots: full });

    expect(applyUpgrade(state, { id: "overload-motor", action: "apply" })).toEqual({
      ok: false,
      state,
      error: { code: "RESOURCE_EXHAUSTED", message: "part inventory is full" }
    });
    const replaced = expectAccepted(
      applyUpgrade(state, { id: "overload-motor", action: "replace", replaceSlot: 2 })
    );
    expect(replaced.partSlots[2]).toEqual({ id: "overload-motor", level: 1 });
    expect(applyUpgrade(state, { id: "overload-motor", action: "replace", replaceSlot: 5 })).toEqual({
      ok: false,
      state,
      error: { code: "INVALID_TARGET", message: "replace slot must be between zero and four" }
    });

    const roomAvailable = choosing("overload-motor", { partSlots: [full[0], null, full[2], full[3], full[4]] });
    expect(applyUpgrade(roomAvailable, { id: "overload-motor", action: "replace", replaceSlot: 2 })).toEqual({
      ok: false,
      state: roomAvailable,
      error: { code: "INVALID_TARGET", message: "replacement requires a full part inventory" }
    });

    const declined = expectAccepted(applyUpgrade(state, { id: "overload-motor", action: "decline" }));
    expect(declined.partSlots).toEqual(full);
    expect(declined.tips).toBe(state.tips + 1);
  });

  it("advances information tools only in order", () => {
    expect(expectAccepted(applyUpgrade(choosing("calculator"), { id: "calculator", action: "apply" })).toolLevel).toBe(1);

    const earlyLedger = choosing("ledger", { toolLevel: 0 });
    expect(applyUpgrade(earlyLedger, { id: "ledger", action: "apply" })).toEqual({
      ok: false,
      state: earlyLedger,
      error: { code: "INVALID_TARGET", message: "upgrade prerequisites are not met" }
    });
    expect(expectAccepted(applyUpgrade(choosing("ledger", { toolLevel: 1 }), { id: "ledger", action: "apply" })).toolLevel).toBe(2);
    expect(
      expectAccepted(
        applyUpgrade(choosing("statistics-terminal", { toolLevel: 2 }), {
          id: "statistics-terminal",
          action: "apply"
        })
      ).toolLevel
    ).toBe(3);
  });

  it("revalidates stale declined candidates before granting a tip or advancing", () => {
    const cases: readonly RunState[] = [
      choosing("tithe-box", { bankroll: 9.99 }),
      choosing("jam-jar", { partSlots: [{ id: "jam-jar", level: 2 }, null, null, null, null] }),
      choosing("leftovers", { service: "repair" })
    ];

    for (const state of cases) {
      const snapshot = structuredClone(state);
      const result = applyUpgrade(state, {
        id: state.currentCandidates!.synergy,
        action: "decline"
      });
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      expect(result.state.tips).toBe(state.tips);
      expect(result.state).toEqual(snapshot);
    }
  });

  it("enforces pruning and carbon-copy neutral safety rules", () => {
    const sixSymbols: ReelSet = [createRun(1).reels[0].slice(0, 6), createRun(1).reels[1], createRun(1).reels[2]];
    const tooShort = choosing("pruning-shears", { reels: sixSymbols });
    expect(
      applyUpgrade(tooShort, {
        id: "pruning-shears",
        action: "apply",
        target: { kind: "symbol-on-reel", reel: 0, symbol: "lemon" }
      })
    ).toEqual({
      ok: false,
      state: tooShort,
      error: { code: "INVALID_TARGET", message: "pruning-shears cannot reduce a reel below six symbols" }
    });

    const wildChoice = {
      id: "pruning-shears",
      action: "apply",
      target: { kind: "symbol-on-reel", reel: 0, symbol: "wild" }
    } as unknown as UpgradeChoice;
    expect(applyUpgrade(choosing("pruning-shears"), wildChoice).ok).toBe(false);

    const prunedState = choosing("pruning-shears");
    const pruned = expectAccepted(
      applyUpgrade(prunedState, {
        id: "pruning-shears",
        action: "apply",
        target: { kind: "symbol-on-reel", reel: 0, symbol: "lemon" }
      })
    );
    expect(pruned.reels[0]).toHaveLength(prunedState.reels[0].length - 1);

    const specialCopy = choosing("carbon-copy");
    expect(
      applyUpgrade(specialCopy, {
        id: "carbon-copy",
        action: "apply",
        target: { kind: "symbol-on-reel", reel: 0, symbol: "food" }
      })
    ).toEqual({
      ok: false,
      state: specialCopy,
      error: { code: "INVALID_TARGET", message: "carbon-copy only copies base symbols" }
    });
    const copiedState = choosing("carbon-copy");
    const copied = expectAccepted(
      applyUpgrade(copiedState, {
        id: "carbon-copy",
        action: "apply",
        target: { kind: "symbol-on-reel", reel: 2, symbol: "bell" }
      })
    );
    expect(copied.reels[2].slice(-2)).toEqual(["bell", "bell"]);
  });

  it("starts the next shift with per-shift state reset and consumes the queued focus bonus", () => {
    const state = choosing("blank-capacitor", {
      shift: 3,
      nextShiftFocusBonus: 2,
      interventionPoints: 0,
      pendingPrayer: "seven",
      temporaryReelAdditions: [["seven", "seven"], ["seven", "seven"], ["seven", "seven"]],
      shiftFlags: {
        foodBought: true,
        prayerUsed: true,
        kickUsed: true,
        repairLockUsed: true,
        martyrEnabled: true,
        warrantyPaid: true,
        returnedFoodCount: 2
      },
      counters: { blankCharge: 2, cherryWinsThisShift: 7 }
    });
    const advanced = expectAccepted(applyUpgrade(state, { id: "blank-capacitor", action: "decline" }));

    expect(advanced).toMatchObject({
      phase: "READY_TO_SPIN",
      shift: 4,
      baseSpinsInShift: 0,
      shiftWager: 0,
      shiftPayout: 0,
      maxInterventionPoints: 5,
      interventionPoints: 5,
      nextShiftFocusBonus: 0,
      pendingPrayer: null,
      temporaryReelAdditions: [[], [], []],
      currentCandidates: null,
      counters: { blankCharge: 2, cherryWinsThisShift: 0 },
      shiftFlags: {
        foodBought: false,
        prayerUsed: false,
        kickUsed: false,
        repairLockUsed: false,
        martyrEnabled: false,
        warrantyPaid: false,
        returnedFoodCount: 0
      }
    });
    expect(advanced.shiftHistory.at(-1)).toMatchObject({
      shift: 3,
      bankroll: state.bankroll,
      totalWager: 30,
      totalPayout: 12
    });
  });
});

describe("consumeSafetyFuse", () => {
  it("consumes one fuse below the minimum bet for 20 or 40 bankroll and never triggers twice", () => {
    const levelOne = withService("repair", {
      bankroll: 4.99,
      partSlots: [{ id: "safety-fuse", level: 1 }, null, null, null, null]
    });
    const snapshot = structuredClone(levelOne);
    const first = consumeSafetyFuse(levelOne);
    expect(first).toMatchObject({ consumed: true, payout: 20 });
    expect(first.state.bankroll).toBe(24.99);
    expect(first.state.shiftPayout).toBe(20);
    expect(first.state.attribution.part).toBe(20);
    expect(first.state.partSlots[0]).toBeNull();
    expect(levelOne).toEqual(snapshot);
    expect(consumeSafetyFuse(first.state)).toEqual({ consumed: false, payout: 0, state: first.state });

    const levelTwo = withService("repair", {
      bankroll: 0,
      partSlots: [null, { id: "safety-fuse", level: 2 }, null, null, null]
    });
    expect(consumeSafetyFuse(levelTwo)).toMatchObject({ consumed: true, payout: 40, state: { bankroll: 40 } });

    const enough = { ...levelOne, bankroll: 5 };
    expect(consumeSafetyFuse(enough)).toEqual({ consumed: false, payout: 0, state: enough });
  });
});

describe("upgrade command integration", () => {
  it("dispatches the serializable choice command and records only accepted choices", () => {
    const state = choosing("calculator");
    const command = { type: "CHOOSE_UPGRADE", choice: { id: "calculator", action: "apply" } } as const;
    const result = dispatchCommand(state, command);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.commandHistory.at(-1)).toEqual(command);
    expect(JSON.parse(JSON.stringify(command))).toEqual(command);

    const invalidState = choosing("calculator");
    const rejected = dispatchCommand(invalidState, {
      type: "CHOOSE_UPGRADE",
      choice: { id: "ledger", action: "apply" }
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toBe(invalidState);
    expect(invalidState.commandHistory).toHaveLength(0);
  });
});
