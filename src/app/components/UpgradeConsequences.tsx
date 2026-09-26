import { UPGRADES } from "@/content/upgrades";
import { getMartyrCost } from "@/core/progression";
import type { RunState, UpgradeId } from "@/core/types";

export function UpgradeConsequences({ state, id }: { readonly state: RunState; readonly id: UpgradeId }): React.JSX.Element {
  const rows: { when: string; text: string }[] = [];
  const cost = (state.workshop?.status === "shopping" ? state.workshop.cost : 0) + (id === "tithe-box" ? 10 : 0);
  rows.push({ when: "立即扣除", text: cost > 0 ? `确认后扣 ¥${cost}。只看预览不扣款。` : "获取不扣余额；会用掉本次升级机会。" });
  if (UPGRADES[id].kind === "reel-mod") rows.push({ when: "永久改变", text: "转轮改造跨班保留；只影响所选转轮和符号。" });
  switch (id) {
    case "harvest-vat": rows.push({ when: "跨班保留", text: "水果中奖付费转存酿，第三次才发奖金；替换此部件会丢失未开的存酿。" }); break;
    case "votive-candle": rows.push({ when: "主动启用", text: "拿到不会自动扣小费。转前可点烛，花 1 小费存入最多 3 恶兆；存量跨班保留，替换会丢失。" }); break;
    case "shock-absorber": rows.push({ when: "本转保护", text: "先抵消少量裂纹停工，再结算部件；裂纹本身不移除。" }); break;
    case "triple-blessing": rows.push({ when: "本班影响", text: "本班首次触发加 1 个临时空白，之后不再追加；下一班清除。" }); break;
    case "martyr-coin": rows.push({ when: "主动启用", text: `拿到不自动献祭。首转前可自选支付余额的 10%（有上限；按当前余额为 ¥${getMartyrCost(state)}），只在本班生效。` }); break;
    case "jam-jar": rows.push({ when: "本班影响", text: "樱桃线累计充能，最多计 6 层；下一班从头积累。" }); break;
    case "artificial-crack": rows.push({ when: "下班影响", text: "下一班多 1 干预点，但仍受房间上限约束；裂纹不会跟着清除。" }); break;
    case "overload-motor": rows.push({ when: "永久改变", text: "结算到第 6 个核心效果时新增 1 个裂纹；不是获取时立刻加裂纹。" }); break;
    case "loose-spring": rows.push({ when: "永久改变", text: "只有使用踹击才留下 1 个裂纹；弹簧本身不额外扣款。" }); break;
    case "safety-fuse": rows.push({ when: "触发时消耗", text: "余额低于最低下注时救援一次，随后保险丝消失。" }); break;
    case "omen-collector": rows.push({ when: "跨班保留", text: "恶兆可以留到下一班；触发兑现时才全部清空。" }); break;
    case "lemon-infection": case "midnight-bell": rows.push({ when: "永久改变", text: "触发后改写的符号跨班保留；不是只改变这一转。" }); break;
    default: break;
  }
  return <ul className="upgrade-consequences" aria-label="影响何时发生">{rows.map((row) => <li key={row.when}><strong>{row.when}</strong><span>{row.text}</span></li>)}</ul>;
}
