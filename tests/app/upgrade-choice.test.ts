import { describe, expect, it } from "vitest";
import { buildDefaultUpgradeChoice } from "@/app/upgrade-choice";
import { UPGRADE_IDS } from "@/content/upgrades";
import { createRun } from "@/core/run";
import { applyUpgrade } from "@/core/upgrades";
import type { PartInstance, RunState, ServiceId, UpgradeId } from "@/core/types";

function legalState(id: UpgradeId, patch: Partial<RunState> = {}): RunState {
  const service: ServiceId = id === "leftovers"
    ? "kitchen"
    : id === "omen-collector"
      ? "chapel"
      : id === "loose-spring" || id === "scrap-magnet" || id === "warranty-fraud"
        ? "security"
        : "repair";
  const alternatives = UPGRADE_IDS.filter((candidate) => candidate !== id);
  const toolLevel = id === "ledger" ? 1 : id === "statistics-terminal" ? 2 : 0;
  return {
    ...createRun(6),
    phase: "CHOOSING_UPGRADE",
    service,
    bankroll: 100,
    baseSpinsInShift: 3,
    toolLevel,
    currentCandidates: { synergy: id, pivot: alternatives[0]!, wildcard: alternatives[1]! },
    ...patch
  };
}

describe("buildDefaultUpgradeChoice", () => {
  it("produces an accepted real core dispatch for every currently legal upgrade", () => {
    for (const id of UPGRADE_IDS) {
      const state = legalState(id);
      const choice = buildDefaultUpgradeChoice(state, id);

      expect(choice, id).not.toBeNull();
      const result = applyUpgrade(state, choice!);
      expect(result.ok, `${id}: ${result.ok ? "" : result.error.message}`).toBe(true);
    }
  });

  it("selects the first visible replacement slot for a legal new part in a full inventory", () => {
    const full = [
      { id: "jam-jar", level: 1 },
      { id: "fruit-salad", level: 1 },
      { id: "midnight-bell", level: 1 },
      { id: "blank-capacitor", level: 1 },
      { id: "safety-fuse", level: 1 }
    ] as const satisfies readonly PartInstance[];
    const state = legalState("overload-motor", { partSlots: full });

    const choice = buildDefaultUpgradeChoice(state, "overload-motor");

    expect(choice).toEqual({ id: "overload-motor", action: "replace", replaceSlot: 0 });
    expect(applyUpgrade(state, choice!).ok).toBe(true);
  });
});
