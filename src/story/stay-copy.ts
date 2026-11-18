import type { RunState } from "@/core/types";
import { safeMoney } from "@/core/money";
import { getRoomProgress, isRoomIntermission } from "@/content/hotel";
import { rentDue, type StayTier } from "@/core/stay";
import type { MioExpression } from "@/meta/MioPortrait";
import { MIO_KEYCARD_NOTES, mioSpinReaction } from "./mio-character";

export const STAY_ROOMS = [
  { name: ["标准房", "Standard Room"], machine: ["迎宾机械机", "Welcome Reels"], note: ["客人，先把房费留好。第一张房卡我已经擦亮啦，别让那串大数字把本金也算成赚的。", "Dear guest, keep the room fee aside. I have polished your first keycard already! Do not let a big payout make a returned stake look like profit."] },
  { name: ["花园房", "Garden Room"], machine: ["温室机台", "Conservatory Cabinet"], note: ["客人，花园景色不错吧？三回合慢慢改造，中途两次强化由我送来。花不用钱欣赏，部件可要认真挑。", "Lovely garden, dear guest? Build over three rounds; I bring two upgrades along the way. The view is free, but those parts deserve a careful choice."] },
  { name: ["景观房", "Panorama Room"], machine: ["全景机台", "Panorama Cabinet"], note: ["客人开始讲究夜景了呀。这里下注更高，先让一个核心部件发挥作用；漂亮外壳可不会替你付房费。", "A taste for fine views now, dear guest? Bets are higher here. Put a core part to work first; a pretty cabinet will not pay the room fee."] },
  { name: ["云端套房", "Skyline Suite"], machine: ["云端机台", "Skyline Cabinet"], note: ["套房客人，这边请！咳，刚才是不是笑得太明显？这层更考验构筑，先围着最重要的部件选强化。", "This way, dear suite guest! Was that grin a little too obvious? Your build matters up here; choose upgrades around your most important part."] },
  { name: ["留声套房", "Gramophone Suite"], machine: ["留声机台", "Gramophone Cabinet"], note: ["客人，这间考单转最高赔付，不是把小奖加起来。食物、蓄能、干预要配合着用；漂亮的小票，我可想看了。", "Dear guest, this task checks your best single spin, not a sum of small wins. Combine food, charge and intervention. I do enjoy a handsome receipt."] },
  { name: ["双星套房", "Twin Star Suite"], machine: ["双星机台", "Twin Star Cabinet"], note: ["客人，这次要三转各自达标，不必连续。我是爱大奖，但这间的三盏灯，可不能拿一张大额小票糊弄过去。", "Dear guest, three spins must each meet the target; they need not be consecutive. I love a big win, but one grand receipt cannot fill all three lamps."] },
  { name: ["长夜皇家套房", "Royal Midnight Suite"], machine: ["皇家机台", "Royal Cabinet"], note: ["客人，终于来到最高级的套房啦！水晶灯留着慢慢看，先完成这间的任务、留好房费。最后一张房卡，我亲手递给你。", "The finest suite at last, dear guest! The chandeliers can wait: complete this room's task and keep the fee aside. I want to hand you that final keycard myself."] }
] as const;
export const stayName = (tier: StayTier, english = false) => STAY_ROOMS[tier].name[english ? 1 : 0];
export function currentStayTier(state: RunState): StayTier { return state.hotel?.challenge?.tier ?? 0; }
export function stayLocation(state: RunState, english = false): string {
  return state.afterHoursLevel > 0 && state.hotel?.challenge == null ? english ? "Lobby lounge" : "大堂休息区" : stayName(currentStayTier(state), english);
}
/** Presentation names only: old save phases and command semantics stay unchanged. */
export function stayPhaseLabel(state: RunState, english = false): string {
  if (isRoomIntermission(state)) return english ? "Round break" : "回合休息";
  if (state.phase === "AFTER_HOURS") return english ? state.currentCandidates ? "Choose an upgrade" : "Room result" : state.currentCandidates ? "选择强化" : "本轮结算";
  const labels = {
    CHOOSING_SERVICE: ["选择玩法", "Choose your style"], READY_TO_SPIN: ["准备拉动", "Ready to spin"],
    SPINNING: ["转轮旋转中", "Reels spinning"], AWAITING_INTERVENTION: ["收下或干预", "Keep or intervene"],
    RESOLVING_EFFECTS: ["奖金结算中", "Counting payouts"], CHOOSING_UPGRADE: ["选择强化", "Choose an upgrade"],
    SHIFT_COMPLETE: ["入住结算", "Room result"], RUN_WON: ["已退房", "Checked out"], RUN_LOST: ["入住结束", "Stay ended"]
  } as const;
  return labels[state.phase][english ? 1 : 0];
}
export function stayTask(state: RunState, english = false, visibleBalance = state.bankroll, visibleSpinPayout?: number): string {
  const progress = getRoomProgress(state, visibleSpinPayout);
  if (!progress) return state.stay?.paid.includes(0)
    ? state.afterHoursLevel === 0 ? english ? "Standard Room task complete · room fee paid" : "标准房任务完成 · 房费已付"
      : english ? "Free play · apply for the next room after this round" : "自由游玩 · 本轮结束可申请下一房"
    : english ? `Keep ¥150 after 3 rounds · wallet ¥${visibleBalance}` : `三回合结束时留有 ¥150 · 当前 ¥${visibleBalance}`;
  if (progress.objective.kind === "scoring-spins") return english ? `${progress.value}/${progress.required} spins paid ≥¥${progress.target}` : `${progress.value}/${progress.required} 转各得 ≥¥${progress.target}`;
  const money = `¥${safeMoney(progress.value)} / ¥${safeMoney(progress.required)}`;
  return `${progress.objective.kind === "best-spin" ? english ? "Best spin" : "单转最高" : english ? "Room payouts" : "本房累计"} ${money}`;
}
export function mioBrief(state: RunState, english = false): { title: string; text: string; expression: MioExpression } {
  const t = (zh: string, en: string) => english ? en : zh;
  const tier = currentStayTier(state), bill = rentDue(state);
  const result = (title: string, text: string, expression: MioExpression = "welcome") => ({ title, text, expression });
  if (state.phase === "RUN_LOST") return result(t("客人，先来前台坐坐", "A seat at reception, dear guest"), t("这次没能续住，不代表客人就不受欢迎啦。房卡都替你收好了。想再挑战，我们从标准房换个思路；想休息也好，不必追回这一局的钱。", "You could not extend this stay, but you are still welcome here, dear guest. Your keycards are safe. Try a different build from the Standard Room whenever you wish, or take a rest. There is nothing you need to win back."), "concerned");
  if (state.phase === "RUN_WON") return result(t("我替你收好这段旅程", "I will keep the memory"), (state.hotel?.cleared ?? 0) === 6
    ? t("客人真的住进最高级的长夜皇家套房了！七张房卡，我要排整齐再欣赏一遍。下次回来就叫澪，不用再自我介绍啦。", "You made it to the finest room, dear guest: the Royal Midnight Suite! Seven keycards. Let me line them up and admire them. Next time, just ask for Mio; no introductions needed.")
    : t("客人今晚的房卡都收好了。漂亮收工，也很有派头嘛。新旅程还是从标准房开始，我在前台等你。", "Your keycards are safe, dear guest. A graceful exit has style too! A new journey starts in the Standard Room; you will find me at reception."), "proud");
  if (bill) return result(t("任务完成，来办续住吧", "Task complete. Let's settle the room."), t(`客人，漂亮！房费 ¥${bill.amount}，确认后从钱包扣，不再扣一次任务金额。交好我就递上${stayName(bill.tier)}房卡——我最喜欢发房卡这个环节。`, `Beautifully done, dear guest! The fee is ¥${bill.amount}, charged to your wallet when you confirm. The task amount is not charged again. Then comes your ${stayName(bill.tier, true)} keycard—my favorite part.`), "delighted");
  if (state.workshop?.status === "shopping") return result(t("这次是付费整备", "This is the paid workshop"), t("客人，这次不是免费礼物哦。查看不扣钱，确认购买才支付。再闪亮的部件，也得先看看钱包够不够下一轮下注。", "Dear guest, these are not complimentary gifts. Browsing is free; confirming a purchase costs credits. However shiny a part looks, leave enough for your next bet."), "thinking");
  if (state.hotel?.challenge?.status === "failed") return result(t("房费先不收，机器可以再调整", "No room charge yet"), t("客人，先别跟机器赌气。任务没完成，奖金还在。想再试就整备补强，也能回大堂休息；重新申请会重置本房任务，已领的中途强化不重复发。", "Do not let the machine wind you up, dear guest. The task is unfinished, but your payouts stay. Upgrade before trying again, or rest in the lobby. A new attempt resets this room's task; free rest-stop upgrades are not awarded twice."), "concerned");
  if (state.currentCandidates) return result(t("给机器选一份礼物", "Choose a gift for your machine"), isRoomIntermission(state)
    ? t("客人，礼物送到！先选一项强化，再回房继续下一回合。改造会留下，干预次数会恢复。挑有用的，别只挑金色的——这句也是提醒我自己。", "Delivery for my guest! Choose an upgrade, then continue the next round. Your build stays; intervention uses reset. Pick what helps, not just what glitters—a reminder for me too." )
    : t("客人，这份强化不用额外付钱。先看看能不能帮上房间任务；不合适就放弃，换一枚小费。我可没说免费的就得全收。", "Dear guest, this upgrade costs no extra credits. Check whether it helps the room task; decline for one tip if it does not. Free does not always mean useful."), "smile");
  if (state.phase === "CHOOSING_SERVICE") return result(t("欢迎入住，先挑一种玩法", "Welcome. Choose how you play."), t("客人，房间准备好啦！标准房三回合，每回合三次付费转，中途我送两次强化。结束时留够 ¥150，再找我交 ¥50 房费、领房卡。套房的事，我们慢慢来。", "Your room is ready, dear guest! Three rounds of three paid spins, with two upgrades from me between rounds. Finish with at least ¥150, then pay the ¥50 room fee and collect your keycard. The suites can wait."));
  if (state.phase === "AWAITING_INTERVENTION") return result(t("收下，还是改一次？", "Keep it, or change it?"), t("客人，三条横线、两条斜线都计奖。点转轮预览干预，也能直接收下。有现成的奖金，先看清改动会不会把它弄丢。", "Dear guest, all three rows and both diagonals pay. Tap a reel to preview an intervention, or keep the result. If you already have a win, check what changing the reels might undo."), "thinking");
  if (state.nextSpinOrdinal === 1 && state.phase === "READY_TO_SPIN") return result(t("先拉一转，我陪你看结果", "Pull once; we will read it together"), t("客人，向下拉右边拉杆，或点底部按钮。转完先看中奖线，再决定要不要干预。房费要等任务完成、你确认才收；我的账可清楚着呢。", "Dear guest, pull the right lever or press the bottom button. Read the winning lines before choosing an intervention. I only collect the room fee after the task and your confirmation. My accounts are precise!"));
  if (state.hotel?.challenge?.status === "cleared" || state.phase === "SHIFT_COMPLETE" && state.stay?.paid.includes(0)) return result(t(tier === 6 ? "皇家套房的钥匙，归你了" : "房卡收好，下一层在等你", tier === 6 ? "The Royal Suite key is yours" : "Keep your keycard. The next floor awaits."), tier === 0
    ? t("客人，第一张房卡收好！花园房有更大的机台和三回合任务。准备好了就来找我——给客人换好房间，我可是很积极的。", "Your first keycard, dear guest! The Garden Room has a grander cabinet and a three-round task. Ask whenever you are ready. Moving guests into nicer rooms? I am always enthusiastic about that.")
    : MIO_KEYCARD_NOTES[tier][english ? 1 : 0], tier === 6 ? "proud" : "smile");
  if (state.afterHoursLevel > 0 && !state.hotel?.challenge) return result(t("在大堂歇一会儿也好", "A little time in the lounge"), t("客人，大堂不另收房费，也不推进客房任务。完成这一回合有一份强化；之后再决定要不要申请下一间房。我也挺喜欢有人陪我值夜班。", "Dear guest, the lounge adds no room fee and does not advance room tasks. Finish this round for an upgrade, then decide about the next room. I rather like having company on the night shift."), "smile");
  const reaction = mioSpinReaction(state, english);
  if (reaction) return reaction;
  return result(t(`${stayName(tier)} · 澪的提醒`, `${stayName(tier, true)} · Mio's advice`), STAY_ROOMS[tier].note[english ? 1 : 0], "thinking");
}
