import { useCallback, useState } from "react";
import { HelpWindow } from "@/app/components/HelpWindow";
import { CabinetPartArt } from "@/app/components/CabinetArtwork";
import { SymbolFace } from "@/app/components/SymbolFace";
import { SYMBOL_LABELS } from "@/app/labels";
import { describeEquippedPart } from "@/app/player-copy";
import { UPGRADES } from "@/content/upgrades";
import { canEditWorkbench, canEditReel, getReserveParts } from "@/core/workbench";
import type { GameCommand } from "@/core/commands";
import type { PartInstance, ReelIndex, RunState, SymbolId } from "@/core/types";
import { useLanguage } from "@/i18n/language";
import { translate } from "@/i18n/translate";
import { RULES_VERSION } from "@/persistence/archives";
import { captureBlueprint, readBlueprints, saveBlueprint, deleteBlueprint, type Blueprint } from "@/workshop/blueprints";
import { runExperiment, type ExperimentReport } from "@/workshop/experiment";
import { getBuildInsights } from "@/workshop/insights";
import "@/app/workbench.css";

type Address = { area: "machine" | "reserve"; slot: number };
type Tab = "insights" | "parts" | "reels" | "lab";
const SYMBOLS: readonly SymbolId[] = ["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"];
const EN_SYMBOLS: Record<SymbolId, string> = { cherry: "Cherry", lemon: "Lemon", bell: "Bell", seven: "Seven", wild: "Wild", blank: "Blank", food: "Food", crack: "Crack" };
const money = (value: number): string => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function BuildWorkshopButton({ state, onCommand, className = "workbench-entry" }: {
  readonly state: RunState; readonly onCommand: (command: GameCommand) => void; readonly className?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const english = useLanguage() === "en";
  return <>
    <button type="button" className={className} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      {english ? "Build workshop" : "构筑工坊"}<small>{english ? "Inspect · arrange · test" : "诊断 · 换装 · 编排 · 试机"}</small>
    </button>
    {open && <HelpWindow title={english ? "Build workshop" : "构筑工坊"} interactive onClose={close}
      closeLabel={english ? "Close workshop" : "关闭工坊"}
      footnote={english ? "The official game is paused. Experiments never spend your money or reveal your next spin." : "正式局已暂停。试机不消耗正式局资源，也不会预测下一转。"}>
      <BuildWorkshop state={state} onCommand={onCommand} />
    </HelpWindow>}
  </>;
}

export function BuildWorkshop({ state, onCommand }: {
  readonly state: RunState; readonly onCommand: (command: GameCommand) => void;
}): React.JSX.Element {
  const english = useLanguage() === "en";
  const text = (zh: string, en: string): string => english ? en : zh;
  const [tab, setTab] = useState<Tab>("insights");
  const editable = canEditWorkbench(state);
  return <div className="build-workbench">
    <p className="workbench-intro">{text("澪：客人，机器不必只走一条路。先看看哪里没接上，再试试你的新点子。", "Mio: Guest, your machine needn't follow just one path. Find the missing link, then try your idea.")}</p>
    <nav className="workbench-tabs" aria-label={text("工坊分区", "Workshop sections")}>
      {([ ["insights", "诊断", "Inspect"], ["parts", "组装", "Parts"], ["reels", "编排", "Reels"], ["lab", "试机收藏", "Test & save"] ] as const).map(([id, zh, en]) =>
        <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{text(zh, en)}</button>)}
    </nav>
    <p className="workbench-status" data-ready={editable}>{editable ? text("休息时间 · 可免费换装与调序", "Break time · free swaps and ordering") : text("现在只能查看与试机；本回合结束后再改装。", "Inspect and test now; modify at the next break.")}</p>
    {tab === "insights" && <section aria-label={text("构筑诊断", "Build diagnosis")}>
      <p>{text("这些是触发条件，不是最优答案。空白、裂纹和不同水果，都可能成为另一件部件的燃料。", "These are trigger conditions, not an optimal build. Blanks, cracks and mixed fruit can power other parts.")}</p>
      <div className="workbench-insights">{getBuildInsights(state).map((insight) => <article key={insight.id} data-tone={insight.tone}>
        <h3>{english ? insight.titleEn : insight.title}</h3><p>{english ? insight.detailEn : insight.detail}</p>
      </article>)}</div>
      <details className="workbench-detail"><summary>{text("已装部件 · 触发与当前进度", "Installed parts · triggers and progress")}</summary>
        {state.partSlots.every((part) => part === null) && <p>{text("还没有部件。先完成一回合，选择首件升级。", "No parts yet. Finish a round to choose your first upgrade.")}</p>}
        {state.partSlots.map((part, index) => {
          if (part === null) return null;
          const copy = describeEquippedPart(state, part);
          return <article className="workbench-part-copy" key={index}><h3>{translate(copy.name)} · L{part.level}</h3><p>{translate(copy.effect)}</p><p>{translate(copy.currentImpact)}</p></article>;
        })}
      </details>
      <p className="workbench-note">{text("基础信息免费查看，不再占升级名额。试机是小样本对比，不能证明一台机器长期必赚。", "Basic information is free and no longer consumes an upgrade. Short experiments compare ideas; they cannot prove long-term profit.")}</p>
    </section>}
    {tab === "parts" && <PartsWorkbench state={state} onCommand={onCommand} />}
    {tab === "reels" && <ReelsWorkbench state={state} onCommand={onCommand} />}
    {tab === "lab" && <ExperimentWorkbench state={state} />}
  </div>;
}

function PartsWorkbench({ state, onCommand }: { readonly state: RunState; readonly onCommand: (command: GameCommand) => void }): React.JSX.Element {
  const english = useLanguage() === "en";
  const text = (zh: string, en: string): string => english ? en : zh;
  const [from, setFrom] = useState<Address | null>(null);
  const [to, setTo] = useState<Address | null>(null);
  const [name, setName] = useState(state.workbench?.name ?? "");
  const editable = canEditWorkbench(state);
  const reserve = getReserveParts(state);
  const at = (address: Address): PartInstance | null => (address.area === "machine" ? state.partSlots : reserve)[address.slot] ?? null;
  const label = (address: Address): string => `${address.area === "machine" ? text("工作槽", "Active") : text("备用槽", "Reserve")} ${address.slot + 1}`;
  const select = (address: Address): void => {
    if (from?.area === address.area && from.slot === address.slot) { setFrom(null); setTo(null); return; }
    if (from === null) { if (at(address)) setFrom(address); }
    else setTo(address);
  };
  const crossesReserve = from !== null && to !== null && from.area !== to.area;
  return <section aria-label={text("部件组装", "Parts assembly")}>
    <form className="workbench-name" onSubmit={(event) => { event.preventDefault(); if (editable && name.trim()) onCommand({ type: "SET_BUILD_NAME", name: name.trim() }); }}>
      <label>{text("给这台机器起个名字", "Name this machine")}<input maxLength={32} value={name} placeholder={text("例如：柠檬汽水", "e.g. Lemon fizz")} onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit" disabled={!editable || !name.trim() || name.trim() === state.workbench?.name}>{text("命名", "Name")}</button>
    </form>
    <p>{text("先点一件部件，再点目标槽，最后确认。换装不收费。备用件不生效；同一部件只能保留一件，重复获得会升级。", "Pick a part, pick its destination, then confirm. Swaps are free. Reserve parts are inactive; duplicates upgrade the existing part.")}</p>
    {([ ["machine", state.partSlots], ["reserve", reserve] ] as const).map(([area, slots]) => <div key={area} className="workbench-rack">
      <h3>{area === "machine" ? text("工作槽 · 5 / 编号越大越先受裂纹影响", "5 active slots · cracks affect higher numbers first") : text("备用槽 · 2 / 留给另一个点子", "2 reserve slots · keep another idea")}</h3>
      <div className="workbench-sockets">{slots.map((part, slot) => {
        const address = { area, slot };
        const selected = from?.area === area && from.slot === slot;
        const targeted = to?.area === area && to.slot === slot;
        return <button type="button" key={slot} disabled={!editable || from === null && part === null} aria-pressed={selected || targeted}
          aria-label={`${label(address)} · ${part ? translate(UPGRADES[part.id].name) + " L" + part.level : text("空", "Empty")}`}
          className="workbench-socket" data-selected={selected} data-target={targeted} onClick={() => select(address)}>
          <small>{slot + 1}{selected ? " · A" : targeted ? " · B" : ""}</small>
          {part ? <><CabinetPartArt id={part.id} /><span>{translate(UPGRADES[part.id].name)}</span><small>L{part.level}</small></> : <span className="workbench-empty">＋</span>}
        </button>;
      })}</div>
    </div>)}
    {from && <div className="workbench-confirm">
      <p>{to ? `${label(from)} ↔ ${label(to)}` : text("再点一个目标槽。", "Choose a destination slot.")}</p>
      {crossesReserve && <p>{text("移入备用的部件会清空自身蓄力／本回合连赢计数；工作槽内调序不清空。", "Moving a part into reserve clears its stored charge or round streak. Reordering active slots keeps them.")}</p>}
      <button type="button" disabled={!editable || !to} onClick={() => { if (to) onCommand({ type: "MOVE_PART", from, to }); setFrom(null); setTo(null); }}>{text("确认换装", "Confirm swap")}</button>
      <button type="button" onClick={() => { setFrom(null); setTo(null); }}>{text("取消", "Cancel")}</button>
    </div>}
  </section>;
}

function ReelsWorkbench({ state, onCommand }: { readonly state: RunState; readonly onCommand: (command: GameCommand) => void }): React.JSX.Element {
  const english = useLanguage() === "en";
  const text = (zh: string, en: string): string => english ? en : zh;
  const [reel, setReel] = useState<ReelIndex>(0);
  const [first, setFirst] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const strip = state.reels[reel];
  const editable = canEditReel(state);
  const legalPair = first !== null && second !== null && strip[first] !== strip[second];
  const symbolLabel = (symbol: SymbolId): string => english ? EN_SYMBOLS[symbol] : SYMBOL_LABELS[symbol];
  return <section aria-label={text("转轮编排", "Reel arrangement")}>
    <p>{text("每回合一次：互换同一转轮的两格。图案数量不变，邻居会变；可以改变多行同时中奖和踹击时的选择，但不是直接提高每一行的基础期望。", "Once per round, swap two positions on one reel. Counts stay the same; neighbors change. This changes simultaneous wins and kick choices, not each line's base expected payout.")}</p>
    <nav className="workbench-reel-tabs" aria-label={text("选择转轮", "Choose reel")}>{([0, 1, 2] as const).map((index) =>
      <button type="button" key={index} aria-pressed={index === reel} onClick={() => { setReel(index); setFirst(null); setSecond(null); }}>{text(`第 ${index + 1} 轮`, `Reel ${index + 1}`)}</button>)}</nav>
    <p className="workbench-note">{text("永久条带，首尾相接。编号不是下一次停轮位置；祈祷、食物与临时空白不在这里改。", "This permanent strip wraps around. Numbers do not predict the next stop. Prayer, food and temporary blanks are not edited here.")}</p>
    <div className="workbench-strip">{strip.map((symbol, index) => <button type="button" key={index} disabled={!editable} aria-pressed={first === index || second === index}
      aria-label={`${text("位置", "Position")} ${index + 1} · ${symbolLabel(symbol)}`} onClick={() => {
        if (first === index) { setFirst(null); setSecond(null); } else if (first === null) setFirst(index); else setSecond(index);
      }}><SymbolFace symbol={symbol} decorative /><small>{index + 1}{first === index ? " A" : second === index ? " B" : ""}</small></button>)}</div>
    {first !== null && <div className="workbench-confirm"><p>{second === null ? text("再选一格，预览交换位置。", "Select a second position.") : `${first + 1} ${symbolLabel(strip[first]!)} ↔ ${second + 1} ${symbolLabel(strip[second]!)}`}</p>
      <button type="button" disabled={!editable || !legalPair} onClick={() => { if (first !== null && second !== null) onCommand({ type: "SWAP_REEL_SYMBOLS", reelIndex: reel, firstIndex: first, secondIndex: second }); setFirst(null); setSecond(null); }}>{text("确认编排 · 本回合 1 次", "Confirm · once this round")}</button></div>}
    <p className="workbench-status">{editable ? text("编排次数：可用 1 次", "Arrangement available: 1") : canEditWorkbench(state) ? text("本回合已编排；下一回合恢复。", "Already arranged; available next round.") : text("回合结束后才能编排。", "Arrange at the next break.")}</p>
    <h3>{text("图案占比 · 免费查看", "Symbol proportions · always free")}</h3>
    <dl className="workbench-composition">{SYMBOLS.map((symbol) => {
      const count = strip.filter((entry) => entry === symbol).length;
      return count === 0 ? null : <div key={symbol}><dt>{symbolLabel(symbol)}</dt><dd>{count}/{strip.length} · {(count / strip.length * 100).toFixed(1)}%</dd></div>;
    })}</dl>
    <p className="workbench-note">{text("这是单轮单格占比，不是整机中奖率。酒店仍按三横两斜共五条线结算。", "These are one-cell proportions on one reel, not the machine's win probability. Hotel mode still pays three rows and two diagonals.")}</p>
  </section>;
}

function ExperimentWorkbench({ state }: { readonly state: RunState }): React.JSX.Element {
  const english = useLanguage() === "en";
  const text = (zh: string, en: string): string => english ? en : zh;
  const [library, setLibrary] = useState(() => readBlueprints());
  const [name, setName] = useState(state.workbench?.name || text("我的机台", "My machine"));
  const [selected, setSelected] = useState<string>("current");
  const [seed, setSeed] = useState("24680");
  const [allowCurrent, setAllowCurrent] = useState(false);
  const [result, setResult] = useState<{ name: string; report: ExperimentReport } | null>(null);
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const blueprint = library.entries.find((entry) => entry.id === selected);
  const stale = blueprint !== undefined && blueprint.rulesVersion !== RULES_VERSION;
  const numericSeed = Number(seed);
  const validSeed = /^\d+$/.test(seed) && Number.isInteger(numericSeed) && numericSeed >= 0 && numericSeed <= 0xffff_ffff;
  const run = (): void => {
    try {
      const target = blueprint ?? captureBlueprint(state, name.trim() || text("我的机台", "My machine"));
      setResult({ name: target.name, report: runExperiment(target, numericSeed, 12, { allowCurrentRules: allowCurrent }) });
      setNotice("");
    } catch (cause) { setNotice(english ? "Experiment could not run. Check the seed, blueprint and rule-version consent. Your run is unchanged." : cause instanceof Error ? cause.message : "试机失败。"); }
  };
  const store = (): void => {
    try {
      const updated = saveBlueprint(captureBlueprint(state, name.trim()));
      setLibrary(updated);
      setNotice(updated.error ? english ? "Could not save: check storage permissions, collection capacity and existing data. Existing blueprints were preserved." : updated.error : text("已收藏当前机台。更换选择即可复试，不会覆盖正式进度。", "Current machine saved. Select it below to retest without replacing your run."));
    } catch (cause) { setNotice(english ? "Could not save this blueprint. Use a name of up to 32 characters and reel strips of at most 128 symbols." : cause instanceof Error ? cause.message : "收藏失败。"); }
  };
  return <section aria-label={text("独立试机与收藏", "Independent experiments and collection")}>
    <p>{text("固定下注 ¥10，连续 12 次付费转，含获得的免费转。蓄力从零开始，不点餐、不祈祷、不手动干预，不套用房间限制。只比较当前装配的被动表现。", "Fixed ¥10 bet, 12 paid spins plus earned free spins. Charges start empty; no meals, prayer, manual intervention or room restrictions. This compares passive builds only.")}</p>
    <p className="workbench-note">{text("正式钱包、随机数、任务和收藏奖励都不受影响。建议用相同实验种子比较改装前后；单次盈亏不是长期收益率。", "Your wallet, random sequence, tasks and rewards stay untouched. Compare builds with the same experiment seed. One short run is not a long-term return estimate.")}</p>
    <div className="workbench-name"><label>{text("收藏名称", "Blueprint name")}<input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} /></label><button type="button" disabled={!name.trim() || library.entries.length >= 12} onClick={store}>{text("收藏当前", "Save current")}</button></div>
    <label className="workbench-field">{text("试机对象", "Machine to test")}<select value={selected} onChange={(event) => { setSelected(event.target.value); setAllowCurrent(false); setDeleteId(null); setResult(null); }}><option value="current">{text("当前机台（不含备用件）", "Current machine (active parts only)")}</option>{library.entries.map((entry) => <option key={entry.id} value={entry.id} translate="no">{entry.name}</option>)}</select></label>
    {blueprint && <BlueprintSummary blueprint={blueprint} />}
    {stale && <label className="workbench-version-warning"><input type="checkbox" checked={allowCurrent} onChange={(event) => setAllowCurrent(event.target.checked)} />{text("这份收藏属于旧规则。我同意按当前规则重新试算；原记录不变，结果可能不同。", "This blueprint uses older rules. Recalculate with current rules; keep the original unchanged.")}</label>}
    <div className="workbench-name"><label>{text("实验种子", "Experiment seed")}<input inputMode="numeric" value={seed} onChange={(event) => { setSeed(event.target.value); setResult(null); }} aria-invalid={!validSeed} /></label><button type="button" className="primary-button" disabled={!validSeed || stale && !allowCurrent} onClick={run}>{text("独立试转 12 次", "Test 12 paid spins")}</button></div>
    {!validSeed && <p role="alert">{text("种子需为 0–4294967295 的整数。", "Use an integer seed from 0 to 4294967295.")}</p>}
    <p className="workbench-note">{text(`本机已收藏 ${library.entries.length}/12 台；满额不会自动删除旧收藏。`, `${library.entries.length}/12 blueprints on this device; full collections never evict older entries.`)}</p>
    {blueprint && <button type="button" className="workbench-delete" onClick={() => {
      if (deleteId !== blueprint.id) { setDeleteId(blueprint.id); return; }
      const updated = deleteBlueprint(blueprint.id); setLibrary(updated); setNotice(updated.error ? english ? "Could not delete. Existing data was preserved; check browser storage." : updated.error : text("已删除这份机台收藏，正式存档未变。", "Blueprint deleted; your official save is unchanged."));
      if (!updated.error) { setSelected("current"); setResult(null); } setDeleteId(null);
    }}>{deleteId === blueprint.id ? text("再次点击 · 确认删除此收藏", "Click again to delete this blueprint") : text("删除选中收藏", "Delete selected blueprint")}</button>}
    {(notice || library.error) && <p className="workbench-notice" role="status">{notice || (english ? "Could not read the blueprint collection. Existing data was preserved; check browser storage." : library.error)}</p>}
    {result && <ExperimentResult name={result.name} report={result.report} />}
  </section>;
}

function BlueprintSummary({ blueprint }: { readonly blueprint: Blueprint }): React.JSX.Element {
  const english = useLanguage() === "en";
  return <p className="workbench-note">{blueprint.partSlots.filter((part): part is PartInstance => part !== null).map((part) => `${translate(UPGRADES[part.id].name)} L${part.level}`).join(" · ") || (english ? "No active parts" : "无工作部件")}<br />{english ? "Reel lengths" : "转轮长度"} {blueprint.reels.map((strip) => strip.length).join(" / ")}</p>;
}

function ExperimentResult({ name, report }: { readonly name: string; readonly report: ExperimentReport }): React.JSX.Element {
  const english = useLanguage() === "en";
  const text = (zh: string, en: string): string => english ? en : zh;
  return <section className="workbench-result" aria-label={text("试机结果", "Experiment result")} aria-live="polite">
    <h3><span translate="no">{name}</span> · {text("试机小票", "Test receipt")}</h3>
    <p>{text("实验种子", "Experiment seed")} {report.seed} · {report.paidSpins} {text("付费", "paid")} + {report.freeSpins} {text("免费", "free")}</p>
    <dl className="workbench-composition"><div><dt>{text("总下注", "Wagers")}</dt><dd>¥{money(report.totalWager)}</dd></div><div><dt>{text("总奖金", "Payout")}</dt><dd>¥{money(report.totalPayout)}</dd></div><div><dt>{text("试机净额", "Test net")}</dt><dd>{report.net >= 0 ? "+" : "−"}¥{money(Math.abs(report.net))}</dd></div><div><dt>{text("有奖金的转数", "Paying spins")}</dt><dd>{report.winningSpins}/{report.paidSpins + report.freeSpins}</dd></div></dl>
    {Object.entries(report.partIncome).length > 0 && <details className="workbench-detail"><summary>{text("部件发了多少奖金？", "Which parts paid?")}</summary><ul>{Object.entries(report.partIncome).map(([id, amount]) => <li key={id}>{translate(UPGRADES[id as PartInstance["id"]].name)} · ¥{money(amount ?? 0)}</li>)}</ul><p>{text("仅列可归属的直接奖金；变图案、复制中奖等间接贡献不等于零。", "Only attributable direct bonuses are listed. Transformations and copied wins may contribute indirectly.")}</p></details>}
    <details className="workbench-detail"><summary>{text("试机范围与限制", "Experiment scope and limits")}</summary>{(english ? report.warningsEn : report.warnings).map((warning, index) => <p className="workbench-note" key={index}>{warning}</p>)}</details>
    {report.truncated && <p role="alert">{text("已到实验安全上限，结果未完整跑完。", "Experiment safety limit reached; results are incomplete.")}</p>}
    <details className="workbench-detail"><summary>{text("查看每一转", "Every spin")}</summary><ol className="workbench-spin-log">{report.spins.map((spin, index) => <li key={index}><span>#{index + 1} · {spin.isFree ? text("免费", "free") : `¥${money(spin.wager)}`}</span><strong>+¥{money(spin.totalPayout)}</strong></li>)}</ol></details>
  </section>;
}
