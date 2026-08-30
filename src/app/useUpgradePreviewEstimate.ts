import { useMemo } from "react";
import { buildEstimateRequest, useEstimateRequest, type EstimateResult } from "@/app/useEstimate";
import { UPGRADES } from "@/content/upgrades";
import { dispatchCommand } from "@/core/run";
import type { RunState, UpgradeChoice } from "@/core/types";
import type { EstimateRequest } from "@/sim/types";

export function buildUpgradePreviewRequest(
  state: RunState,
  choice: UpgradeChoice
): EstimateRequest | null {
  if (state.toolLevel < 2 || choice.action !== "apply" || UPGRADES[choice.id].kind !== "reel-mod") return null;
  const projected = dispatchCommand(state, { type: "CHOOSE_UPGRADE", choice });
  if (!projected.ok) return null;
  const current = buildEstimateRequest(state);
  return {
    ...current,
    reels: projected.state.reels,
    parts: projected.state.partSlots.filter((part) => part !== null)
  };
}

export function useUpgradePreviewEstimate(
  state: RunState,
  choice: UpgradeChoice | null
): EstimateResult {
  const choiceKey = choice === null ? "none" : JSON.stringify(choice);
  const request = useMemo(
    () => choice === null ? null : buildUpgradePreviewRequest(state, choice),
    [choiceKey, state]
  );
  return useEstimateRequest(request);
}
