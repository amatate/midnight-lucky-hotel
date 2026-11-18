import { canMakeSalad } from "@/content/build-fit";
import { UPGRADES } from "@/content/upgrades";
import { getReserveParts } from "@/core/workbench";
import type { PartId, RunState, SymbolId } from "@/core/types";

export interface BuildInsight {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly titleEn: string;
  readonly detailEn: string;
  readonly tone: "ready" | "setup" | "conflict" | "info";
}

/** Read-only explanations of this machine, not optimal moves or predictions of its next draw. */
export function getBuildInsights(state: RunState): readonly BuildInsight[] {
  const result: BuildInsight[] = [];
  const owns = (id: PartId) => state.partSlots.some((part) => part?.id === id);
  const count = (symbol: SymbolId) => state.reels.flat().filter((entry) => entry === symbol).length;
  const canLine = (symbol: SymbolId) => count(symbol) > 0
    && state.reels.every((strip) => strip.includes(symbol) || strip.includes("wild"));
  const add = (id: string, tone: BuildInsight["tone"], title: string, detail: string, titleEn: string, detailEn: string) =>
    result.push({ id, tone, title, detail, titleEn, detailEn });

  for (const part of state.partSlots) {
    if (!part) continue;
    const id = part.id;
    switch (id) {
      case "harvest-vat": {
        const charge = state.counters.harvestCharge ?? 0;
        const ready = canLine("cherry") || canLine("lemon") || (owns("fruit-salad") && canMakeSalad(state));
        add(id, ready ? "ready" : "setup", `果桶 · 已存 ${charge}/3`,
          `付费转有水果中奖才存1格；一转多条线也只存1格。还差${3 - charge}次开桶，免费转不存。`,
          `Harvest Vat · ${charge}/3 stored`, `A paid spin with a fruit win stores one charge, even with several lines. ${3 - charge} more opens the vat. Free spins do not charge it.`);
        break;
      }
      case "jam-jar":
        add(id, canLine("cherry") ? "ready" : "setup", "果酱罐 · 第一条先充能",
          `本回合已有${state.counters.cherryWinsThisShift}条樱桃线。后面的樱桃线才吃到累计奖金，换回合清零。`,
          "Jam Jar · the first line charges it", `${state.counters.cherryWinsThisShift} cherry lines this round. Later cherry lines earn the stored bonus; a new round resets it.`);
        break;
      case "cherry-press":
        add(id, canLine("cherry") ? "ready" : "setup", "压榨机 · 要樱桃线和真樱桃",
          "先有樱桃中奖线，再数盘面真正的樱桃；从第3颗开始奖励。百搭接线，但不算樱桃数量。",
          "Cherry Press · line plus literal cherries", "First make a cherry line. Then the third and later literal cherries on the board add a bonus. Wilds connect lines but do not count as cherries.");
        break;
      case "fruit-salad":
      case "salad-dressing": {
        if (id === "salad-dressing" && owns("fruit-salad")) break;
        const ready = (id !== "salad-dressing" || owns("fruit-salad")) && canMakeSalad(state);
        add(id, ready ? "ready" : "setup", ready ? "沙拉 · 三种图案各留一席" : "沙拉 · 还没凑齐条件",
          id === "salad-dressing" && !owns("fruit-salad") ? "沙拉酱不会自己造中奖；先把水果沙拉装进工作槽。"
            : "同一条线上需要樱桃、柠檬、铃铛各一个，顺序不限。百搭不算；全盘改柠檬会让它失效。",
          ready ? "Salad · keep all three symbols" : "Salad · missing a requirement",
          id === "salad-dressing" && !owns("fruit-salad") ? "Dressing cannot create wins. Equip Fruit Salad in an active slot first."
            : "A payline needs one cherry, one lemon and one bell, in any order. Wilds cannot substitute. A pure-lemon machine cannot make salads.");
        break;
      }
      case "lemon-infection":
        add(id, ["jam-jar", "cherry-press", "fruit-salad", "salad-dressing"].some((entry) => owns(entry as PartId)) ? "conflict" : canLine("lemon") ? "ready" : "setup",
          "感染 · 改图案，也会拆掉旧配合",
          "第一条柠檬线才启动。感染会吃掉线外樱桃、铃铛、幸运7；可把不再适合的部件存进备用。没有可感染图案且盘面至少6颗真柠檬时，改发收成奖金。",
          "Infection · conversion can break old combos", "The first lemon line starts it. It consumes off-line cherries, bells and sevens; reserve parts that no longer fit. With no convertible symbols and at least six literal lemons, it pays a harvest bonus instead.");
        break;
      case "votive-candle":
        add(id, (state.counters.votiveCharge ?? 0) > 0 || (state.omen > 0 && state.tips > 0) ? "ready" : "setup",
          `烛台 · ${state.counters.votiveCharge ?? 0}层已点亮`,
          `现在有${state.omen}恶兆、${state.tips}小费。转动前主动点烛，把最多3层恶兆存进烛台；下一转直接领，不需要幸运7中奖。`,
          `Candle · ${state.counters.votiveCharge ?? 0} stored`, `You have ${state.omen} omens and ${state.tips} tips. Before a spin, light the candle to store up to three omens. The next spin pays them without needing a Seven win.`);
        break;
      case "omen-collector":
        add(id, state.omen > 0 && canLine("seven") ? "ready" : "setup", "收集器 · 恶兆不是自动奖金",
          `存着${state.omen}层恶兆，等第一条幸运7线兑现。没有恶兆时不加钱；也可把恶兆交给烛台，但同一份不能领两次。`,
          "Collector · omens need a Seven line", `${state.omen} omens wait for the first Seven line. No omens means no extra payout. The Candle is another way to spend them, not a second claim on the same omens.`);
        break;
      case "triple-blessing":
        add(id, canLine("seven") ? "ready" : "setup", "祝福 · 先接上幸运7",
          "每转只复制第一条幸运7线；本回合第一次触发会加1个临时空白。空白电容或空白股息可以利用它，但不消除抽空的风险。",
          "Blessing · start with a Seven line", "Copies only the first Seven line each spin. Its first trigger this round adds a temporary blank. Capacitor or Blank Dividend can use that blank, but cannot remove its cost to normal wins.");
        break;
      case "martyr-coin":
        add(id, state.shiftFlags.martyrEnabled ? "ready" : "setup", state.shiftFlags.martyrEnabled ? "硬币 · 本回合已经启用" : "硬币 · 装上后还要启用",
          state.shiftFlags.martyrEnabled ? "已付过本回合费用，不再扣一次。幸运7线中奖时追加复制奖金。"
            : "在本回合第一次付费转之前，从准备面板启用；不启用就不会复制幸运7奖金。先确认机器能连出幸运7。",
          state.shiftFlags.martyrEnabled ? "Coin · enabled this round" : "Coin · equip, then activate",
          state.shiftFlags.martyrEnabled ? "This round's cost is already paid. Seven lines now earn copy bonuses."
            : "Activate it in Prepare before the first paid spin of the round. Equipping alone does nothing. First check that your reels can form Seven lines.");
        break;
      case "midnight-bell":
        add(id, canLine("bell") ? "ready" : "setup", "钟声 · 百搭不是所有玩法的答案",
          "铃铛中奖才把真正铃铛改成百搭，再检查新连线。百搭能帮普通连线，却不能代替沙拉、裂纹或空白条件。",
          "Bell · Wilds do not solve every pattern", "A bell win converts literal bells to Wilds and checks lines again. Wilds help normal lines, but do not substitute for salad, crack or blank requirements.");
        break;
      case "shock-absorber":
        add(id, count("crack") > 0 || state.service === "security" ? "ready" : "setup", `飞轮 · 保护${part.level}个可见裂纹`,
          "按本转盘面裂纹计算，不是机器总裂纹数。保护以外的裂纹，会从工作槽右侧开始让部件停工；重要部件可往左放。",
          `Flywheel · guards ${part.level} visible cracks`, "Protection uses cracks visible this spin, not all cracks in the reels. Excess cracks jam active parts from the right. Put important parts further left.");
        break;
      case "scrap-magnet":
        add(id, state.reels.every((strip) => strip.includes("crack")) ? "ready" : "setup", "磁铁 · 裂纹要在三个转轮都有",
          "需要同一条线的三个真裂纹，才领奖并清除它们。只在一个转轮加很多裂纹，不能凑这条线。",
          "Magnet · cracks need all three reels", "Three literal cracks must share a payline to pay and be removed. Many cracks on only one reel cannot make that line.");
        break;
      case "blank-capacitor":
      case "blank-dividend":
        add(id, count("blank") >= (id === "blank-dividend" ? 2 : 1) || owns("triple-blessing") ? "ready" : "setup", id === "blank-capacitor" ? `电容 · 已存${state.counters.blankCharge}/${part.level === 1 ? 3 : 2}` : "空白股息 · 留空也有用途",
          id === "blank-capacitor" ? "只在付费转存入可见空白，达到门槛赠1转；每个付费转最多赠1次，免费转不继续充能。"
            : "付费转盘面至少2个真空白就发一次奖金；可与电容共用空白。免费转不领，保留空白也会少一些普通连线。",
          id === "blank-capacitor" ? `Capacitor · ${state.counters.blankCharge}/${part.level === 1 ? 3 : 2} stored` : "Blank Dividend · blanks can pay",
          id === "blank-capacitor" ? "Visible blanks charge only on paid spins. Reaching the threshold grants one spin, at most once per paid spin. Free spins do not charge it."
            : "At least two literal blanks on a paid-spin board pay once. Shares blanks with Capacitor. Free spins do not pay it, and blanks still reduce normal lines.");
        break;
      case "warranty-fraud":
        add(id, state.partSlots.filter(Boolean).length > 1 && count("crack") > 0 ? "ready" : "setup", "骗保 · 保护太好反而没赔款",
          "每回合第一次有其他非免疫部件被裂纹停工才赔。只有骗保单、没有裂纹，或飞轮挡住全部停工，都不会赔。",
          "Warranty · no jam means no claim", "Pays the first time another vulnerable part is jammed this round. Alone, without cracks, or with Flywheel blocking every jam, it has nothing to pay for.");
        break;
      case "overload-motor":
        add(id, state.partSlots.some((entry) => entry && ["lemon-infection", "midnight-bell", "fruit-salad", "scrap-magnet"].includes(entry.id)) ? "ready" : "setup",
          "马达 · 吃效果连锁，不吃点击次数", "从第2个核心效果起才加钱；感染、钟声、沙拉可以接入。第6个效果会留1道永久裂纹，需保护或回收。",
          "Motor · chains effects, not clicks", "Pays from the second core effect. Infection, Bell and Salad can feed it. The sixth effect leaves a permanent crack, so plan protection or recycling.");
        break;
      case "intervention-relay":
        add(id, "ready", "继电器 · 看盘面再出手", "付费转重转、锁轮或踹击后，普通线或水果沙拉中奖就加一次奖金；单独祈祷不算。干预没有救出中奖就不奖励。",
          "Relay · intervene, then win", "After a paid-spin respin, lock or kick, a normal line or Salad win pays one bonus. Prayer alone does not qualify. A losing intervention pays nothing.");
        break;
      default:
        add(id, "info", UPGRADES[id].name, id === "leftovers" ? "先点餐并抽到食物，才能把食物送回转轮；打包本身不是金币。"
          : id === "loose-spring" ? "停轮后主动踹击才用到弹簧。先看移动预览；每次踹击仍会留下裂纹。"
            : "保险丝在余额低于最低下注时自动消耗一次。它保住下一转，不保证完成任务或付清房费。",
          id === "leftovers" ? "Leftovers" : id === "loose-spring" ? "Loose Spring" : "Safety Fuse",
          id === "leftovers" ? "Order food and land on it first. Returning food to a reel is not a cash payout."
            : id === "loose-spring" ? "The spring works only when you actively kick after stopping. Check the preview; each kick still adds a crack."
              : "The fuse is consumed when your balance falls below the minimum bet. It saves a spin, not the room mission or rent.");
    }
  }
  if (getReserveParts(state).some(Boolean)) add("reserve", "info", "备用不触发", "备用槽不提供任何效果。回合开始或休息时换上；把蓄能部件卸下会清空它的蓄能。",
    "Reserve parts are inactive", "Reserve slots grant no effects. Equip them at a break or before a round. Removing a charged part clears its stored charge.");
  if (result.length === 0) add("start", "info", "从一个想法开始", "选一种你想制造的中奖：樱桃连中、三种沙拉、幸运7复制，或利用空白和裂纹。先做出第一条配合，再尝试混搭。",
    "Start with one idea", "Pick a win you want to create: cherry chains, mixed salads, copied Sevens, or useful blanks and cracks. Make one connection work, then try a hybrid.");
  return result;
}
