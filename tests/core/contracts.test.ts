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

  it("consumes one draw for a deterministic discipline fallback", () => {
    const state: RunState = {
      ...createRun(72),
      phase: "READY_TO_SPIN",
      rng: { value: 72 },
      baseSpinsInShift: 3,
      interventionPoints: 0,
      reels: [["cherry"], ["lemon"], ["bell"]]
    };
    const result = generateContract(state);
    expect(result.contract.id).toBe("discipline");
    expect(result.rng).toEqual(nextInt(state.rng, 1).rng);
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
