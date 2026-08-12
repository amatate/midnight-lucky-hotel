import { describe, expect, it } from "vitest";
import { CONTRACT_TEMPLATES, generateContract, updateContract } from "@/core/contracts";
import { nextInt } from "@/core/random";
import { createRun, dispatchCommand } from "@/core/run";
import type { GameEvent } from "@/core/events";
import type { ContractState, RunState } from "@/core/types";

describe("contract generation", () => {
  it("publishes the three templates in stable order", () => {
    expect(CONTRACT_TEMPLATES.map((template) => template.id)).toEqual(["combination", "discipline", "rescue"]);
  });

  it("uses exactly one seeded draw and generates only completable contracts", () => {
    const state: RunState = {
      ...createRun(71),
      phase: "READY_TO_SPIN",
      service: "repair",
      rng: { value: 71 },
      baseSpinsInShift: 1,
      interventionPoints: 0,
      reels: [["cherry", "blank"], ["cherry", "blank"], ["cherry", "blank"]]
    };
    const expectedRng = nextInt(state.rng, 2).rng;
    const snapshot = structuredClone(state);
    const result = generateContract(state);

    expect(result.rng).toEqual(expectedRng);
    expect(["combination", "discipline"]).toContain(result.contract.id);
    if (result.contract.id === "combination") {
      expect(result.contract.targetSymbol).toBe("cherry");
      expect(result.contract.target).toBeGreaterThanOrEqual(1);
      expect(result.contract.target).toBeLessThanOrEqual(2);
    }
    expect(result.contract).toMatchObject({
      progress: 0,
      completed: false,
      rewardClaimed: false,
      startBankroll: state.bankroll,
      interventionsUsed: 0
    });
    expect(state).toEqual(snapshot);
  });

  it("uses an inert completed sentinel with one draw when no base spins remain", () => {
    const state: RunState = {
      ...createRun(72),
      phase: "READY_TO_SPIN",
      rng: { value: 72 },
      baseSpinsInShift: 3,
      interventionPoints: 0,
      reels: [["cherry"], ["lemon"], ["bell"]]
    };
    const result = generateContract(state);
    expect(result.contract).toEqual({
      id: "discipline",
      target: 0,
      progress: 0,
      completed: true,
      rewardClaimed: true,
      startBankroll: state.bankroll,
      interventionsUsed: 0
    });
    expect(result.rng).toEqual(nextInt(state.rng, 1).rng);
    expect(updateContract(result.contract, [{ sequence: 1, type: "BLOCK_COMPLETED", bankroll: 1_000 }])).toBe(
      result.contract
    );
  });

  it("witnesses combination wins with wild assistance instead of requiring a literal symbol on every reel", () => {
    const state: RunState = {
      ...createRun(74),
      phase: "READY_TO_SPIN",
      service: "repair",
      baseSpinsInShift: 0,
      reels: [["cherry", "blank", "blank"], ["wild", "blank", "blank"], ["cherry", "blank", "blank"]]
    };
    const combination = CONTRACT_TEMPLATES.find((template) => template.id === "combination")!;
    expect(combination.canGenerate(state)).toBe(true);
  });

  it("excludes combination and rescue when no reachable board can pay", () => {
    const state: RunState = {
      ...createRun(75),
      phase: "READY_TO_SPIN",
      service: "repair",
      baseSpinsInShift: 0,
      reels: [["cherry", "blank"], ["lemon", "blank"], ["bell", "blank"]]
    };
    expect(CONTRACT_TEMPLATES.find((template) => template.id === "combination")!.canGenerate(state)).toBe(false);
    expect(CONTRACT_TEMPLATES.find((template) => template.id === "rescue")!.canGenerate(state)).toBe(false);
  });

  it("excludes rescue when every reachable accepted board already pays", () => {
    const state: RunState = {
      ...createRun(76),
      phase: "READY_TO_SPIN",
      service: "repair",
      baseSpinsInShift: 0,
      reels: [["cherry", "wild"], ["cherry", "wild"], ["cherry", "wild"]]
    };
    expect(CONTRACT_TEMPLATES.find((template) => template.id === "rescue")!.canGenerate(state)).toBe(false);
  });

  it("includes rescue only when a legal respin has a concrete nonpaying-to-paying witness", () => {
    const state: RunState = {
      ...createRun(77),
      phase: "READY_TO_SPIN",
      service: "chapel",
      baseSpinsInShift: 0,
      interventionPoints: 1,
      reels: [
        ["cherry", "blank", "blank"],
        ["cherry", "blank", "blank"],
        ["cherry", "blank", "blank"]
      ]
    };
    expect(CONTRACT_TEMPLATES.find((template) => template.id === "rescue")!.canGenerate(state)).toBe(true);
  });

  it("requires a block-start payout witness that can cover all remaining paid wagers for discipline", () => {
    const discipline = CONTRACT_TEMPLATES.find((template) => template.id === "discipline")!;
    const base: RunState = {
      ...createRun(78),
      phase: "READY_TO_SPIN",
      service: "repair",
      baseSpinsInShift: 0,
      baseBet: 10,
      betMode: "normal"
    };
    expect(discipline.canGenerate({
      ...base,
      reels: [["cherry", "blank", "blank"], ["cherry", "blank", "blank"], ["cherry", "blank", "blank"]]
    })).toBe(false);
    expect(discipline.canGenerate({
      ...base,
      reels: [["lemon", "blank", "blank"], ["lemon", "blank", "blank"], ["lemon", "blank", "blank"]]
    })).toBe(true);
    expect(discipline.canGenerate({ ...base, baseSpinsInShift: 1 })).toBe(false);
  });

  it("terminates conservatively for exact witness searches above the safe window-product bound", () => {
    const symbols = ["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"] as const;
    const largeStrip = (seed: number) => {
      let value = seed;
      return Array.from({ length: 512 }, () => {
        value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
        return symbols[(value >>> 24) % symbols.length]!;
      });
    };
    const state: RunState = {
      ...createRun(79),
      phase: "READY_TO_SPIN",
      service: "repair",
      baseSpinsInShift: 0,
      interventionPoints: 3,
      reels: [largeStrip(1), largeStrip(2), largeStrip(3)]
    };
    expect(CONTRACT_TEMPLATES.find((template) => template.id === "discipline")!.canGenerate(state)).toBe(false);
    expect(CONTRACT_TEMPLATES.find((template) => template.id === "rescue")!.canGenerate(state)).toBe(false);
  });
});

describe("contract progress from committed events", () => {
  const base = (patch: Partial<ContractState>): ContractState => ({
    id: "combination",
    targetSymbol: "cherry",
    target: 2,
    progress: 0,
    completed: false,
    rewardClaimed: false,
    startBankroll: 100,
    interventionsUsed: 0,
    ...patch
  });

  it("counts only matching committed base line wins", () => {
    const events: readonly GameEvent[] = [
      { sequence: 1, type: "LINE_WIN", lineId: "top", symbol: "cherry", amount: 8, source: "base" },
      { sequence: 2, type: "LINE_WIN", lineId: "middle", symbol: "cherry", amount: 8, source: "part" },
      { sequence: 3, type: "LINE_WIN", lineId: "bottom", symbol: "lemon", amount: 12, source: "base" }
    ];
    expect(updateContract(base({}), events)).toMatchObject({ progress: 1, completed: false });
  });

  it("completes discipline only at a profitable intervention-free boundary", () => {
    const discipline = base({ id: "discipline", target: 1 });
    const ordinary = updateContract(discipline, [{ sequence: 1, type: "PAYOUT_COMPLETE", total: 50 }]);
    expect(ordinary.completed).toBe(false);
    const intervened = updateContract(discipline, [
      { sequence: 1, type: "INTERVENTION_USED", kind: "respin", target: 0 },
      { sequence: 2, type: "BLOCK_COMPLETED", bankroll: 120 }
    ]);
    expect(intervened).toMatchObject({ interventionsUsed: 1, completed: false });
    expect(updateContract(discipline, [{ sequence: 1, type: "BLOCK_COMPLETED", bankroll: 100 }])).toMatchObject({
      progress: 1,
      completed: true
    });
  });

  it("completes rescue only from explicit nonpaying-before and paying-after intervention evidence", () => {
    const rescue = base({ id: "rescue", target: 1 });
    const cases = [
      { interventionUsed: false, preInterventionPaying: false, finalPayout: 10 },
      { interventionUsed: true, preInterventionPaying: true, finalPayout: 10 },
      { interventionUsed: true, preInterventionPaying: false, finalPayout: 0 }
    ] as const;
    for (const evidence of cases) {
      expect(updateContract(rescue, [{ sequence: 1, type: "SPIN_COMMITTED", ...evidence }]).completed).toBe(false);
    }
    expect(updateContract(rescue, [{
      sequence: 1,
      type: "SPIN_COMMITTED",
      interventionUsed: true,
      preInterventionPaying: false,
      finalPayout: 10
    }])).toMatchObject({ progress: 1, completed: true });
  });

  it("grants one tip once when presentation commits a completed contract", () => {
    const initial = createRun(73);
    const selected = dispatchCommand(
      { ...initial, serviceCandidates: ["repair", "kitchen", "chapel"] },
      { type: "SELECT_SERVICE", serviceId: "repair" }
    );
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.error.message);
    let state: RunState = {
      ...selected.state,
      contract: base({ target: 1 }),
      pendingSpin: {
        isFree: false,
        draw: {
          strips: [["cherry"], ["cherry"], ["cherry"]],
          stops: [0, 0, 0],
          grid: [["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"], ["cherry", "cherry", "cherry"]],
          rng: selected.state.rng,
          preInterventionPaying: true
        }
      },
      phase: "AWAITING_INTERVENTION"
    };
    const accepted = dispatchCommand(state, { type: "ACCEPT_OUTCOME" });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error(accepted.error.message);
    const completed = dispatchCommand(accepted.state, { type: "PRESENTATION_COMPLETE" });
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error(completed.error.message);
    expect(completed.state.tips).toBe(1);
    expect(completed.state.contract).toMatchObject({ completed: true, rewardClaimed: true });
    expect(completed.events.filter((event) => event.type === "RESOURCE_CHANGED")).toEqual([
      expect.objectContaining({ resource: "tips", delta: 1 })
    ]);

    const replay = dispatchCommand(completed.state, { type: "PRESENTATION_COMPLETE" });
    expect(replay.ok).toBe(false);
    expect(replay.state.tips).toBe(1);
  });
});
