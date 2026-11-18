import type { RunState } from "@/core/types";
import type { MioExpression } from "@/meta/MioPortrait";

export interface MioLine { readonly title: string; readonly text: string; readonly expression: MioExpression }
export const MIO_BIO = [
  "澪，23 岁，午夜酒店的夜班前台。外向、嘴快，喜欢金灿灿的东西和套房里的水晶灯，自称对金币声特别敏感。客人住得越好，她越藏不住得意；不过账要算清，客人不开心时，房费和漂亮话都先放一边。",
  "Mio, 23, runs the midnight reception. Chatty and quick-witted, she loves shiny things and suite chandeliers, and claims she can hear a coin from any floor. She beams when her guests move upstairs, but keeps the accounts honest and puts their feelings before her love of luxury."
] as const;

export const MIO_KEYCARD_NOTES = [
  ["客人，第一张房卡收好。别看它朴素，这可是我们第一次把任务和房费都办妥啦。", "Your first keycard, dear guest. A modest one, perhaps, but our first task and room bill neatly settled!"],
  ["客人，花园房住得还舒服吧？这张卡我挑了最亮的金边。没额外收钱，放心。", "Enjoyed the garden, dear guest? I picked the card with the shiniest gold edge. No extra charge, I promise."],
  ["客人，景观房的卡！你上楼看夜景，我在楼下看账本。嗯，各有各的好风景。", "The Panorama card, dear guest! You admire the lights upstairs; I admire the ledger downstairs. A fine view for each of us."],
  ["套房客人，这张卡可要放显眼一点。我承认，帮你办入住时嘴角就没下来过。", "Display this one proudly, dear suite guest. I admit it: I was grinning the whole time I checked you in."],
  ["客人，那张漂亮的大额小票我可记住了。房卡给你，留声机里的曲子也别忘啦。", "I remember that handsome receipt, dear guest. Keep the card—and remember the tune on the gramophone too."],
  ["客人，三盏达标灯都亮了。这不是靠一张大额小票撑场面，是你的机器真有两下子。", "All three lamps, dear guest! Not just one grand receipt: your machine really earned its place here."],
  ["皇家套房的客人！让我多叫一次，真好听。最高级的房卡也归你了；这次先陪我欣赏一下水晶灯吧。", "My Royal Suite guest! Let me say that again; it sounds lovely. The finest keycard is yours. Come admire the chandeliers with me."]
] as const;

/** Reception chatter is presentation-only: no relationship meter, reward or RNG. */
export const MIO_CHAT: readonly { readonly text: readonly [string, string]; readonly expression: MioExpression }[] = [
  { expression: "thinking", text: ["客人，每间房都有自己的机台和任务。中途强化、房费、房卡都找我。只想转几把？经典机台用独立筹码，不影响这边的钱包。", "Dear guest, each room has a cabinet and a task. I handle upgrades, fees and keycards. Just fancy a few spins? Classic cabinets use separate credits, leaving your hotel wallet alone."] },
  { expression: "thinking", text: ["客人，赔付可不全是赚的：花 10 收到 10，只是回本。我是喜欢金币，可没喜欢到把账算错呀。", "Dear guest, a payout is not all profit: spend 10 and receive 10, and you have only broken even. I love coins, but not enough to miscount them!"] },
  { expression: "delighted", text: ["客人问我最喜欢哪间房？皇家套房！水晶灯、金边杯子……咳，我是说，服务设施非常齐全。", "My favorite room, dear guest? The Royal Suite! Chandeliers, gold-rimmed cups… ahem. I mean, excellent amenities."] },
  { expression: "smile", text: ["客人，叫我澪就好。我负责房卡，也负责在你得意时多夸两句。不过小费和房费，我可是分开记的。", "Call me Mio, dear guest. I look after the keycards and supply a little applause when things go well. Tips and room fees? Separate columns, naturally."] },
  { expression: "proud", text: ["客人，每张房卡我都擦得亮亮的。住进好房间当然有面子，不过标准房的第一张，也不许嫌弃。那可是我亲手递的。", "Dear guest, I polish every keycard. A fine suite is something to be proud of, but do not overlook that first Standard Room card. I handed it to you myself."] },
  { expression: "concerned", text: ["客人，机器今天不配合？过来歇一会儿。想再挑战，我们就看看哪件部件能帮上忙；想收工，前台也不会给你脸色看。", "The machine being difficult, dear guest? Come sit for a moment. If you want another challenge, we can look at your parts. If you want to call it a night, you are just as welcome here."] }
];

/** React only to an already settled receipt, never pending outcomes or gross
 * payout alone. No new randomness, persistent state or gameplay side effects. */
export function mioSpinReaction(state: RunState, english: boolean): MioLine | null {
  if (state.phase !== "READY_TO_SPIN") return null;
  const receipt = state.spinHistory.at(-1);
  if (!receipt || receipt.isFree || receipt.wager <= 0) return null;
  const net = receipt.bankrollAfter - receipt.bankrollBefore;
  if (receipt.totalPayout >= receipt.wager * 8 && net > 0) return {
    title: english ? "I heard that from reception!" : "这动静，前台都听见啦！", expression: "delighted",
    text: english ? `Dear guest! A net gain of ¥${net} on that spin! I do love that sound. Let me admire the receipt… and keep the room fee aside before we admire the suites.`
      : `客人！这一转净增 ¥${net}，这声音我爱听。让我欣赏一下小票……好，先给房费留个位，再欣赏楼上的套房。`
  };
  if (receipt.totalPayout === 0) return {
    title: english ? "The reels are being stingy" : "机器这回有点小气", expression: "concerned",
    text: english ? "Dear guest, nothing paid that time. No need to raise the bet to get it back. Check whether your parts fit this room's task; I am here if you want a rest."
      : "客人，这转没出奖，先别急着加注补回来。看看部件有没有帮上房间任务；想休息就来前台，我陪你聊会儿。"
  };
  return null;
}
