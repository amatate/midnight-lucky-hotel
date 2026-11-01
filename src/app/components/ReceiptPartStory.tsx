import { CabinetPartArt } from "@/app/components/CabinetArtwork";
import { UPGRADES } from "@/content/upgrades";
import type { PartId, SpinReceipt } from "@/core/types";
import type { ActionEntry } from "@/persistence/archives";
import { counterSnapshot, receiptPartAwards, settlementEntry } from "@/presentation/part-feedback";
import { getLanguage } from "@/i18n/language";

/** A readable index over existing evidence, not another mutable reward ledger. */
export function ReceiptPartStory({ receipt, entries = [] }: {
  readonly receipt: SpinReceipt; readonly entries?: readonly ActionEntry[] | undefined;
}): React.JSX.Element | null {
  const english = getLanguage() === "en";
  const entry = settlementEntry(entries, receipt);
  const awards = receiptPartAwards(receipt);
  const ids = [...new Set<PartId>([...awards.map(award => award.id), ...(entry?.events.flatMap(event =>
    event.type === "PART_TRIGGERED" || event.type === "PART_DISABLED" ? [event.partId] : []) ?? [])])];
  if (!ids.length) return null;
  const before = counterSnapshot(entry?.changes.counters?.before);
  const after = counterSnapshot(entry?.changes.counters?.after);
  return <section className="receipt-part-story" aria-label={english ? "What the parts did" : "这转部件做了什么"}>
    <h3>{english ? "What the parts did" : "这转部件做了什么"}</h3>
    {ids.map(id => {
      const amount = awards.find(award => award.id === id)?.amount ?? 0;
      const disabled = entry?.events.some(event => event.type === "PART_DISABLED" && event.partId === id);
      const charge = id === "harvest-vat" ? "harvestCharge" : id === "votive-candle" ? "votiveCharge" : id === "blank-capacitor" ? "blankCharge" : undefined;
      const delta = charge && before && after ? `${before[charge] ?? 0} → ${after[charge] ?? 0}` : null;
      const changes = entry?.events.some(event => event.type === "SYMBOL_CHANGED");
      const action = disabled ? english ? "Stopped by cracks this spin" : "这转因裂纹停工"
        : amount > 0 ? `${id === "harvest-vat" ? english ? "Vat released" : "开桶" : id === "votive-candle" ? english ? "Candle paid" : "兑现" : english ? "Direct payout" : "直接奖金"} +¥${amount}`
          : delta ? `${english ? "Charge" : "蓄能"} ${delta}${id === "harvest-vat" ? english ? " · no payout yet" : " · 尚未发钱" : ""}`
            : changes && (id === "lemon-infection" || id === "midnight-bell") ? english ? "Changed symbols; resulting wins are listed as line payouts" : "改变了图案；由此连出的奖金记在线路中"
              : english ? "Effect triggered; no direct payout recorded" : "效果已触发，本次没有直接奖金";
      return <div className="receipt-part-row" key={id}><CabinetPartArt id={id} /><div><strong>{UPGRADES[id].name}</strong><p>{action}</p></div></div>;
    })}
    <small>{english ? "Part payouts are included in the total, not added again. Meals and other service costs are listed on the shift receipt." : "部件奖金已包含在总额内，不再另加。餐费等额外支出请看本班小票。"}</small>
  </section>;
}
