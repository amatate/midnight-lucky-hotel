import type { UpgradePresentation } from "@/app/player-copy";

interface UpgradeStrategyDetailsProps {
  readonly presentation: UpgradePresentation;
  readonly levelLabel: "L1 → L2" | "L2 效果";
}

export function UpgradeStrategyDetails({ presentation, levelLabel }: UpgradeStrategyDetailsProps): React.JSX.Element {
  return (
    <details className="upgrade-strategy">
      <summary>搭配建议与完整规则</summary>
      <div className="upgrade-strategy-copy">
        <p><strong>完整效果</strong> {presentation.effect}</p>
        {presentation.levelTwoEffect !== null && (
          <p><strong>{levelLabel}</strong> {presentation.levelTwoEffect.replace(/^L2：/, "")}</p>
        )}
        <p><strong>适合搭配</strong> {presentation.synergy}</p>
        <p><strong>代价／风险</strong> {presentation.risk}</p>
      </div>
    </details>
  );
}
