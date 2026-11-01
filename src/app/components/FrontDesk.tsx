import { useEffect, useState } from "react";
import { downloadText, money } from "@/app/archive-copy";
import { ArchiveViewer } from "@/app/components/ArchiveViewer";
import { describeUpgrade } from "@/app/player-copy";
import { GameGuide } from "@/app/components/GameGuide";
import { FeedbackButton } from "@/app/components/FeedbackButton";
import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import { HOTEL_ROOMS } from "@/content/hotel";
import { createRun } from "@/core/run";
import type { UpgradeId } from "@/core/types";
import {
  activeRecord, ARCHIVE_KEY, canMigrateArchive, migrateArchive, exportArchive, importArchive, MAX_ARCHIVE_BYTES, restoreArchive, RULES_VERSION,
  startArchivedRun, validSeed, writeLibrary, type ArchiveLibrary, type RunArchive
} from "@/persistence/archives";
import { LEGACY_RUN_STORAGE_KEY, RUN_STORAGE_KEY } from "@/persistence/storage";
import "@/app/frontdesk-scene.css";
import { LanguageSelector } from "@/app/components/LanguageSelector";
import { AudioSettings } from "@/app/components/AudioSettings";
import { translate } from "@/i18n/translate";
import { getLanguage } from "@/i18n/language";
import type { MachineId } from "@/classic/machines";
import { MACHINE_IDS } from "@/classic/machines";
import { ConciergeDesk, GuestbookPage, GuestReward } from "@/meta/ConciergeDesk";
import { GUESTBOOK_KEY, QUESTS, claimQuest, emptyGuestbook, noteGuestActivity, questProgress, syncGuestbook, type GuestQuest } from "@/meta/guestbook";
import "@/meta/reception.css";
import { KeepsakeArt, RouteBadge, UpgradeArt } from "@/app/components/UiArtwork";

interface FrontDeskProps {
  readonly library: ArchiveLibrary | null;
  readonly error: string | null;
  readonly defaultSeed: number;
  readonly onLibrary: (library: ArchiveLibrary) => void;
  readonly onPlay: (entry: "new" | "resume") => void;
  readonly onClassic?: (options?: { machine?: MachineId; welcome?: "lesson" | "ledger" }) => void;
}
const SECTION_LABELS = { lobby: "前台", quests: "住客手册", collection: "收藏图鉴", history: "历史与存档", settings: "玩法与设置" } as const;

export function FrontDesk({ library, error, defaultSeed, onLibrary, onPlay, onClassic }: FrontDeskProps): React.JSX.Element {
  const english = getLanguage() === "en";
  const t = (zh: string, en: string) => english ? en : zh;
  const [section, setSection] = useState<keyof typeof SECTION_LABELS>("lobby");
  const [seed, setSeed] = useState(String(defaultSeed));
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<RunArchive | null>(null);
  const [route, setRoute] = useState("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favoritePartsOnly, setFavoritePartsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [guestbook, setGuestbook] = useState(emptyGuestbook);
  const [guestError, setGuestError] = useState("");
  const [reward, setReward] = useState<GuestQuest | null>(null);
  const [reduceMotion, setReduceMotion] = useState(() => { try { return localStorage.getItem("midnight-lucky-hotel.reduce-flash") === "1"; } catch { return false; } });
  const active = library === null ? null : activeRecord(library);
  const guestWarning = t("住客手册暂时无法保存，原记录未覆盖。你仍可正常游玩，稍后回前台重试。", "The guestbook cannot be saved right now. Its original data is untouched. You can still play and try again at reception later.");
  useEffect(() => {
    const refresh = () => { try { setGuestbook(syncGuestbook(library)); setGuestError(""); } catch { setGuestError("storage"); } };
    refresh();
    const changed = (event: StorageEvent) => { if (event.key === GUESTBOOK_KEY || event.key === null) refresh(); };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [library]);
  const goSection = (value: keyof typeof SECTION_LABELS) => { setSection(value); setNotice(""); window.scrollTo?.({ top: 0, behavior: "instant" }); };
  const goQuest = (quest: GuestQuest) => {
    if (quest.action === "lesson") onClassic?.({ machine: "original", welcome: "lesson" });
    else if (quest.action === "ledger") onClassic?.({ machine: "original", welcome: "ledger" });
    else if (quest.action === "tour") onClassic?.({ machine: MACHINE_IDS.find(id => !guestbook.played.includes(id)) ?? "original" });
    else if (quest.action === "collection") goSection("collection");
    else { goSection("lobby"); setNotice(t("在下方开始或继续酒店闯关，转动、改造，再挑战客房。", "Start or continue a hotel run below. Spin, upgrade, then challenge the rooms.")); }
  };
  const collect = (quest: GuestQuest) => {
    try { setGuestbook(claimQuest(quest.id, library)); setGuestError(""); setReward(quest); }
    catch { setGuestError("storage"); }
  };
  const nextQuest = QUESTS.find(q => !guestbook.claimed.includes(q.id));
  const perform = (action: () => ArchiveLibrary, success: string): boolean => {
    try { onLibrary(action()); setNotice(success); return true; }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "操作失败，原始数据未覆盖。"); return false; }
  };
  const begin = (chosenSeed: number) => {
    if (library !== null && perform(() => startArchivedRun(library, chosenSeed), "新局已保存，旧局仍保留在历史中。")) onPlay("new");
  };
  const toggleSeed = (chosenSeed: number) => {
    if (library === null || !validSeed(chosenSeed)) { setNotice("请输入有效整数种子。"); return; }
    const favorites = library.favoriteSeeds.includes(chosenSeed) ? library.favoriteSeeds.filter((value) => value !== chosenSeed) : [...library.favoriteSeeds, chosenSeed];
    if (favorites.length > 256) { setNotice("最多收藏 256 个种子。"); return; }
    perform(() => writeLibrary({ ...library, favoriteSeeds: favorites }), "种子收藏已更新。");
  };
  const toggleUpgrade = (id: UpgradeId) => {
    if (library === null) return;
    const favorites = library.favoriteUpgrades.includes(id) ? library.favoriteUpgrades.filter((value) => value !== id) : [...library.favoriteUpgrades, id];
    perform(() => writeLibrary({ ...library, favoriteUpgrades: favorites }), "图鉴收藏已更新。");
  };
  const copySeed = async (chosenSeed: number) => {
    try { await navigator.clipboard.writeText(String(chosenSeed)); setNotice("已复制种子 " + chosenSeed); }
    catch { setNotice("无法自动复制，请手动复制种子：" + chosenSeed); }
  };
  const exportRaw = () => {
    try { downloadText("midnight-local-backup.json", JSON.stringify({
      format: "midnight-raw-backup", archive: localStorage.getItem(ARCHIVE_KEY),
      runV2: localStorage.getItem(RUN_STORAGE_KEY), runV1: localStorage.getItem(LEGACY_RUN_STORAGE_KEY),
      guestbook: localStorage.getItem(GUESTBOOK_KEY)
    }, null, 2)); } catch { setNotice("浏览器不允许读取存储，无法导出原始备份。"); }
  };
  const setPreference = (key: string, checked: boolean, update: (value: boolean) => void) => {
    try { localStorage.setItem(key, checked ? "1" : "0"); update(checked); setNotice("设置已保存。"); }
    catch { setNotice("设置保存失败，请检查浏览器存储权限。"); }
  };
  const menu = <nav className="frontdesk-tabs" aria-label="主菜单">{(Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]).map((key) =>
    <button type="button" aria-label={key === "quests" ? t("住客手册", "Guestbook") : SECTION_LABELS[key]} aria-current={section === key ? "page" : undefined} onClick={() => goSection(key)} key={key}>
      <span className={"lobby-menu-mark lobby-menu-mark-" + key} aria-hidden="true" />{key === "quests" ? t("手册", "Guestbook") : key === "history" ? t("存档", "Saves") : key === "settings" ? t("设置", "Settings") : key === "collection" ? t("图鉴", "Collection") : t("前台", "Lobby")}
    </button>)}</nav>;

  if (selected !== null) return <ArchiveViewer record={selected} onClose={() => setSelected(null)} />;
  return (
    <section className="frontdesk frontdesk-scene reception" data-section={section} data-reduce-motion={reduceMotion || undefined} aria-label="酒店前台">
      <header className="frontdesk-heading"><div><p className="hotel-sign">MIDNIGHT LUCKY HOTEL</p><h1>午夜好运酒店</h1><p className="frontdesk-tagline">今夜，把运气改造成你的作品。</p></div><span className="frontdesk-key" aria-hidden="true">1313</span></header>
      <LanguageSelector />
      {error !== null && <p className="archive-warning" role="alert">{error}</p>}
      <p className="frontdesk-notice" role="status">{notice}</p>

      {section === "lobby" && <div className="lobby-arrival">
        <ConciergeDesk book={guestbook} hasRun={active !== null} onTasks={() => goSection("quests")} onMeet={() => { if (!noteGuestActivity("met")) setGuestError("storage"); }} />
        {guestError && <p className="archive-warning" role="alert">{guestWarning}</p>}
        {nextQuest && <button type="button" className="reception-next-goal" onClick={() => goSection("quests")}><span className="reception-goal-mark" aria-hidden="true"><KeepsakeArt id={nextQuest.id} /></span><span><small>{nextQuest.kind === "short" ? t("今夜小目标", "TONIGHT'S GOAL") : t("长住心愿", "YOUR NEXT CHAPTER")}</small><strong>{nextQuest.title[english ? 1 : 0]}</strong></span><span>{questProgress(nextQuest, guestbook)}/{nextQuest.target} <b aria-hidden="true">›</b></span></button>}
        <div className="lobby-playdesk">
        {onClassic && <button type="button" className="lobby-classic-entry" onClick={() => onClassic()}>
          <strong>{t("经典机台", "Classic machine")}</strong>
          <small>{t("四台机械 · 随时停下 · 独立筹码", "Four cabinets · play at your pace · separate credits")}</small><span aria-hidden="true">↗</span>
        </button>}
        <div className="reception-hotel-run">
        <section className="frontdesk-hero"><p className="eyebrow">{active === null ? "THE NIGHT IS YOURS" : "YOUR ROOM IS WAITING"}</p><h2>{active === null ? "好运，等待开场" : "接着玩，机器还热着"}</h2>
          {active !== null ? <><div className="lobby-current-run"><span>{active.snapshot.hotel?.challenge != null
            ? HOTEL_ROOMS[active.snapshot.hotel.challenge.tier].name + (active.snapshot.hotel.challenge.rounds ? ` · 回合 ${active.snapshot.hotel.challenge.rounds.current}/3` : "")
            : active.snapshot.afterHoursLevel > 0 ? "加班第 " + active.snapshot.afterHoursLevel + " 段" : "第 " + active.snapshot.shift + " 班"} · 已转 {active.snapshot.nextSpinOrdinal - 1} 次</span><strong className="frontdesk-balance">{money(active.snapshot.bankroll)}</strong></div>
            {active.rulesVersion !== RULES_VERSION && <p className="archive-notice">旧局原档案只读保留，不自动套用新规则。支持迁移时可按新版续玩：保留钱包和构筑，旧成绩不重算，新日志从此处开始核验。</p>}
            {library !== null && canMigrateArchive(active) && <button className="primary-button" type="button" onClick={() => {
              if (perform(() => migrateArchive(library, active), "已创建新版续玩分支，原档案保留。")) onPlay("resume");
            }}>按新版续玩（保留旧局）</button>}
            <button className="primary-button lobby-enter-button" type="button" disabled={active.rulesVersion !== RULES_VERSION} onClick={() => onPlay("resume")}>继续游戏<span aria-hidden="true">↗</span></button>
            <details className="lobby-run-details"><summary>本局档案 · 种子 {active.snapshot.initialSeed}</summary><p translate="no">{active.name}</p><div className="frontdesk-actions"><button type="button" onClick={() => setSelected(active)}>查看本局日志</button><button type="button" onClick={() => void copySeed(active.snapshot.initialSeed)}>复制当前种子</button></div></details>
          </> : <p className="lobby-premise">¥100 入场。转动、改造，让好运站在你这边。</p>}
        </section>
        <form className={"new-run-form" + (active !== null ? " has-current-run" : "")} onSubmit={(event) => { event.preventDefault(); if (seed.trim() === "" || !validSeed(Number(seed))) { setNotice("种子必须是 0 到 4294967295 之间的整数。"); return; } begin(Number(seed)); }}>
          <button className={active === null ? "primary-button lobby-enter-button" : "lobby-new-night"} type="submit" disabled={library === null}>开始新局{active === null && <span aria-hidden="true">↗</span>}</button>
          {active === null && <p className="lobby-goal">三班内达到 ¥150 · 再入住客房，边转边强化</p>}
          <details className="lobby-seed-options"><summary>自选种子与收藏</summary>
            <label>游戏种子<input inputMode="numeric" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
            <div className="frontdesk-actions"><button type="button" onClick={() => setSeed(String(crypto.getRandomValues(new Uint32Array(1))[0]))}>随机种子</button><button type="button" disabled={library === null || seed.trim() === ""} onClick={() => toggleSeed(Number(seed))}>{library?.favoriteSeeds.includes(Number(seed)) ? "取消收藏种子" : "收藏种子"}</button></div>
            <p className="fine-print">旧局自动留在历史中。种子决定随机序列，但选择也会改变后续结果；同版本、同起点、同操作才可复现。</p>
            {(library?.favoriteSeeds.length ?? 0) > 0 && <div className="lobby-favorite-seeds"><h3>收藏的种子</h3><div className="seed-list">{library!.favoriteSeeds.map((value) => <button type="button" key={value} onClick={() => setSeed(String(value))}>{value}</button>)}</div></div>}
          </details>
        </form>
        </div>
        </div>
      </div>}
      {section === "quests" && <GuestbookPage book={guestbook} onClaim={collect} onGo={goQuest} error={guestError ? guestWarning : ""} />}

      {section === "history" && <>
        <div className="frontdesk-actions"><h2>历史与存档</h2><label className="file-import">导入复盘包<input aria-label="导入复盘包" type="file" accept=".json,application/json" disabled={library === null} onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (file === undefined || library === null) return;
          if (file.size > MAX_ARCHIVE_BYTES) { setNotice("文件超过 10 MB，未读取或覆盖任何存档。"); return; }
          try { const serialized = await file.text(); perform(() => importArchive(library, serialized), "已导入为独立档案，当前局没有改变。"); }
          catch { setNotice("无法读取文件，原存档未改变。"); }
        }} /></label></div>
        <p className="fine-print">恢复备份会创建续玩分支，保留原记录。Chrome 与手机不自动同步，可导出单局复盘包再导入。</p>
        <label className="inline-check"><input type="checkbox" checked={onlyFavorites} onChange={(event) => setOnlyFavorites(event.target.checked)} />只看收藏的局</label>
        {library?.runs.length === 0 && <p className="archive-empty">还没有历史记录，开始新局后会自动建立档案。</p>}
        {library?.runs.toReversed().filter((run) => !onlyFavorites || run.favorite).map((run) => <article className="archive-card" key={run.id}>
          <p className="eyebrow">{run.id === library.activeId ? "当前局" : run.origin === "backup" ? "手动备份" : "历史档案"} · {new Date(run.updatedAt).toLocaleString(getLanguage() === "en" ? "en-US" : "zh-CN")}</p>
          <h3 translate="no">{run.name}</h3><p>{money(run.snapshot.bankroll)} · 种子 {run.snapshot.initialSeed} · {run.snapshot.nextSpinOrdinal - 1} 转 · {run.entries.length} 条日志</p>
          <div className="frontdesk-actions"><button type="button" onClick={() => setSelected(run)}>查看日志</button><button type="button" onClick={() => downloadText("night-" + run.snapshot.initialSeed + "-" + run.id + ".json", exportArchive(run))}>导出</button>
            <button type="button" aria-pressed={run.favorite} onClick={() => perform(() => writeLibrary({ ...library, runs: library.runs.map((item) => item.id === run.id ? { ...item, favorite: !item.favorite } : item) }), "收藏已更新。")}>{run.favorite ? "取消收藏本局" : "收藏本局"}</button>
            <button type="button" onClick={() => { setSeed(String(run.snapshot.initialSeed)); setSection("lobby"); }}>使用此种子</button>
            <button type="button" disabled={run.rulesVersion !== RULES_VERSION} onClick={() => { if (perform(() => restoreArchive(library, run), "已创建续玩分支，原档案仍保留。")) onPlay("resume"); }}>恢复为续玩分支</button></div>
          {run.rulesVersion !== RULES_VERSION && <p className="fine-print">规则版本不同：原档案只读。新版续玩不重新计算旧成绩，只从迁移检查点开始核验。</p>}
          {canMigrateArchive(run) && <button type="button" onClick={() => {
            if (perform(() => migrateArchive(library, run), "已创建新版续玩分支，原档案保留。")) onPlay("resume");
          }}>按新版续玩（保留旧局）</button>}
        </article>)}
      </>}

      {section === "collection" && <>
        <h2>收藏图鉴</h2><p>已获得 {library?.discovered.length ?? 0} / {UPGRADE_IDS.length} 项。图鉴不影响掉落，也不提供局外数值加成。</p>
        <div className="archive-filters"><label>搜索部件<input value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>路线<select value={route} onChange={(event) => setRoute(event.target.value)}><option value="all">全部路线</option><option value="fruit">水果自助餐</option><option value="chapel">小教堂</option><option value="violent">故障利用</option><option value="neutral">稳定维修</option><option value="information">会计工具</option></select></label></div>
        <label className="inline-check"><input type="checkbox" checked={favoritePartsOnly} onChange={(event) => setFavoritePartsOnly(event.target.checked)} />只看收藏的部件</label>
        <div className="collection-grid">{UPGRADE_IDS.filter((id) => (!favoritePartsOnly || library?.favoriteUpgrades.includes(id)) && (route === "all" || UPGRADES[id].route === route) && (UPGRADES[id].name.toLowerCase().includes(search.toLowerCase()) || translate(UPGRADES[id].name).toLowerCase().includes(search.toLowerCase()))).map((id) => {
          const copy = describeUpgrade(active?.snapshot ?? createRun(defaultSeed), id);
          return <article className="archive-card collection-item" key={id} data-discovered={library?.discovered.includes(id) || undefined}>
            <header className="collection-card-head">
              <div className="collection-art-display"><UpgradeArt id={id} /><span className="collection-index" aria-hidden="true">{String(UPGRADE_IDS.indexOf(id) + 1).padStart(2, "0")}</span></div>
              <div className="collection-card-title"><span className="collection-kind">{copy.kindLabel}</span><h3>{copy.name}</h3><RouteBadge route={UPGRADES[id].route} label={copy.routeLabel} /></div>
            </header>
            <p className="collection-discovery" data-discovered={library?.discovered.includes(id) || undefined}>{library?.discovered.includes(id) ? "已获得" : "尚未获得"}</p><p>{copy.decisionEffect}</p>
            {copy.triggerCondition !== null && <p>触发条件：{copy.triggerCondition}</p>}<details><summary>效果、搭配与代价</summary><p>{copy.effect}</p>{copy.levelTwoEffect !== null && <p>{copy.levelTwoEffect}</p>}<p>搭配：{copy.synergy}</p><p>代价：{copy.risk}</p></details>
            <button type="button" disabled={library === null} aria-pressed={library?.favoriteUpgrades.includes(id) ?? false} onClick={() => toggleUpgrade(id)}>{library?.favoriteUpgrades.includes(id) ? "已收藏 · 取消" : "收藏部件"}</button></article>;
        })}</div>
      </>}

      {section === "settings" && <>
        <section className="archive-card"><p className="eyebrow">WELCOME TO THE NIGHT SHIFT</p><h2>玩法与背景</h2><GameGuide /></section>
        <section className="archive-card"><h2>体验设置</h2><label className="inline-check"><input type="checkbox" checked={reduceMotion} onChange={(event) => setPreference("midnight-lucky-hotel.reduce-flash", event.target.checked, setReduceMotion)} />减少动态与闪烁</label><p className="fine-print">减少动态不会改变中奖结果。系统减少动态设置也会被尊重。</p><AudioSettings /></section>
        <section className="archive-card"><h2>本地数据</h2><p>所有记录保存在当前浏览器。清理网站数据会丢失本地存档，请定期导出。容量不足时会提示并暂停自动推进，不自动删除旧记录。</p><button type="button" onClick={exportRaw}>导出全部原始备份</button><p className="fine-print">原始备份用于留底和排错；跨浏览器游玩请在历史中导出单局复盘包。规则版本：{RULES_VERSION}</p></section>
      </>}
      {error !== null && <button type="button" onClick={exportRaw}>导出原始备份（不覆盖数据）</button>}
      <footer className="frontdesk-footer"><FeedbackButton seed={active?.snapshot.initialSeed ?? null} /><p>试玩原型 · 无真实货币 · 无账号或云同步</p><p>存档只在当前浏览器和站点保存。从本地版换到网页版，请先导出本局，再在这里导入。</p></footer>
      {menu}
      {reward && <GuestReward quest={reward} onClose={() => setReward(null)} />}
    </section>
  );
}
