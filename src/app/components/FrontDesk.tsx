import { useState } from "react";
import { downloadText, money } from "@/app/archive-copy";
import { ArchiveViewer } from "@/app/components/ArchiveViewer";
import { describeUpgrade } from "@/content/player-copy";
import { GameGuide } from "@/app/components/GameGuide";
import { FeedbackButton } from "@/app/components/FeedbackButton";
import { UPGRADES, UPGRADE_IDS } from "@/content/upgrades";
import { createRun } from "@/core/run";
import type { UpgradeId } from "@/core/types";
import {
  activeRecord, ARCHIVE_KEY, canMigrateArchive, migrateArchive, exportArchive, importArchive, MAX_ARCHIVE_BYTES, restoreArchive, RULES_VERSION,
  startArchivedRun, validSeed, writeLibrary, type ArchiveLibrary, type RunArchive
} from "@/persistence/archives";
import { LEGACY_RUN_STORAGE_KEY, RUN_STORAGE_KEY } from "@/persistence/storage";

interface FrontDeskProps {
  readonly library: ArchiveLibrary | null;
  readonly error: string | null;
  readonly defaultSeed: number;
  readonly onLibrary: (library: ArchiveLibrary) => void;
  readonly onPlay: () => void;
}
const SECTION_LABELS = { lobby: "前台", history: "历史与存档", collection: "收藏图鉴", settings: "玩法与设置" } as const;

export function FrontDesk({ library, error, defaultSeed, onLibrary, onPlay }: FrontDeskProps): React.JSX.Element {
  const [section, setSection] = useState<keyof typeof SECTION_LABELS>("lobby");
  const [seed, setSeed] = useState(String(defaultSeed));
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<RunArchive | null>(null);
  const [route, setRoute] = useState("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favoritePartsOnly, setFavoritePartsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [reduceMotion, setReduceMotion] = useState(() => { try { return localStorage.getItem("midnight-lucky-hotel.reduce-flash") === "1"; } catch { return false; } });
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem("midnight-lucky-hotel.muted") === "1"; } catch { return false; } });
  const active = library === null ? null : activeRecord(library);
  const perform = (action: () => ArchiveLibrary, success: string): boolean => {
    try { onLibrary(action()); setNotice(success); return true; }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "操作失败，原始数据未覆盖。"); return false; }
  };
  const begin = (chosenSeed: number) => {
    if (library !== null && perform(() => startArchivedRun(library, chosenSeed), "新局已保存，旧局仍保留在历史中。")) onPlay();
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
      runV2: localStorage.getItem(RUN_STORAGE_KEY), runV1: localStorage.getItem(LEGACY_RUN_STORAGE_KEY)
    }, null, 2)); } catch { setNotice("浏览器不允许读取存储，无法导出原始备份。"); }
  };
  const setPreference = (key: string, checked: boolean, update: (value: boolean) => void) => {
    try { localStorage.setItem(key, checked ? "1" : "0"); update(checked); setNotice("设置已保存。"); }
    catch { setNotice("设置保存失败，请检查浏览器存储权限。"); }
  };

  if (selected !== null) return <ArchiveViewer record={selected} onClose={() => setSelected(null)} />;
  return (
    <section className="frontdesk" aria-label="酒店前台">
      <header className="frontdesk-heading"><div><p className="hotel-sign">MIDNIGHT LUCK / ROOM 1313</p><h1>午夜好运酒店</h1><p className="frontdesk-tagline">今夜，把运气改造成你的作品。</p></div><span className="frontdesk-key">1313</span></header>
      <nav className="frontdesk-tabs" aria-label="主菜单">{(Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]).map((key) =>
        <button type="button" aria-current={section === key ? "page" : undefined} onClick={() => { setSection(key); setNotice(""); }} key={key}>{SECTION_LABELS[key]}</button>)}</nav>
      {error !== null && <p className="archive-warning" role="alert">{error}</p>}
      <p className="frontdesk-notice" role="status">{notice}</p>

      {section === "lobby" && <>
        <section className="frontdesk-hero archive-card"><p className="eyebrow">YOUR ROOM IS WAITING</p><h2>{active === null ? "开始你的第一夜" : "你的机器还在等你"}</h2>
          {active !== null ? <><p>{active.name}</p><strong className="frontdesk-balance">{money(active.snapshot.bankroll)}</strong>
            <p>种子 {active.snapshot.initialSeed} · {active.snapshot.afterHoursLevel > 0 ? "加班第 " + active.snapshot.afterHoursLevel + " 段" : "第 " + active.snapshot.shift + " 班"} · 已转 {active.snapshot.nextSpinOrdinal - 1} 次</p>
            {active.rulesVersion !== RULES_VERSION && <p className="archive-notice">旧局原档案只读保留，不自动套用新规则。支持迁移时可按新版续玩：保留钱包和构筑，旧成绩不重算，新日志从此处开始核验。</p>}
            {library !== null && canMigrateArchive(active) && <button className="primary-button" type="button" onClick={() => {
              if (perform(() => migrateArchive(library, active), "已创建新版续玩分支，原档案保留。")) onPlay();
            }}>按新版续玩（保留旧局）</button>}
            <div className="frontdesk-actions"><button className="primary-button" type="button" disabled={active.rulesVersion !== RULES_VERSION} onClick={onPlay}>继续游戏</button><button type="button" onClick={() => setSelected(active)}>查看本局日志</button><button type="button" onClick={() => void copySeed(active.snapshot.initialSeed)}>复制当前种子</button></div>
          </> : <p>改造转轮、选择部件，在五个夜班内从 ¥100 赚到 ¥200。成型后可以继续加班。</p>}
        </section>
        <form className="archive-card new-run-form" onSubmit={(event) => { event.preventDefault(); if (seed.trim() === "" || !validSeed(Number(seed))) { setNotice("种子必须是 0 到 4294967295 之间的整数。"); return; } begin(Number(seed)); }}>
          <h2>新的夜班</h2><label>游戏种子<input inputMode="numeric" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
          <div className="frontdesk-actions"><button type="button" onClick={() => setSeed(String(crypto.getRandomValues(new Uint32Array(1))[0]))}>随机种子</button><button type="button" disabled={library === null || seed.trim() === ""} onClick={() => toggleSeed(Number(seed))}>{library?.favoriteSeeds.includes(Number(seed)) ? "取消收藏种子" : "收藏种子"}</button><button className="primary-button" type="submit" disabled={library === null}>开始新局</button></div>
          <p className="fine-print">旧局自动留在历史中。种子决定随机序列，但选择也会改变后续结果；同版本、同起点、同操作才可复现。</p>
        </form>
        {(library?.favoriteSeeds.length ?? 0) > 0 && <section className="archive-card"><h2>收藏的种子</h2><div className="seed-list">{library!.favoriteSeeds.map((value) => <button type="button" key={value} onClick={() => setSeed(String(value))}>{value}</button>)}</div></section>}
      </>}

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
          <p className="eyebrow">{run.id === library.activeId ? "当前局" : run.origin === "backup" ? "手动备份" : "历史档案"} · {new Date(run.updatedAt).toLocaleString("zh-CN")}</p>
          <h3>{run.name}</h3><p>{money(run.snapshot.bankroll)} · 种子 {run.snapshot.initialSeed} · {run.snapshot.nextSpinOrdinal - 1} 转 · {run.entries.length} 条日志</p>
          <div className="frontdesk-actions"><button type="button" onClick={() => setSelected(run)}>查看日志</button><button type="button" onClick={() => downloadText("night-" + run.snapshot.initialSeed + "-" + run.id + ".json", exportArchive(run))}>导出</button>
            <button type="button" aria-pressed={run.favorite} onClick={() => perform(() => writeLibrary({ ...library, runs: library.runs.map((item) => item.id === run.id ? { ...item, favorite: !item.favorite } : item) }), "收藏已更新。")}>{run.favorite ? "取消收藏本局" : "收藏本局"}</button>
            <button type="button" onClick={() => { setSeed(String(run.snapshot.initialSeed)); setSection("lobby"); }}>使用此种子</button>
            <button type="button" disabled={run.rulesVersion !== RULES_VERSION} onClick={() => { if (perform(() => restoreArchive(library, run), "已创建续玩分支，原档案仍保留。")) onPlay(); }}>恢复为续玩分支</button></div>
          {run.rulesVersion !== RULES_VERSION && <p className="fine-print">规则版本不同：原档案只读。新版续玩不重新计算旧成绩，只从迁移检查点开始核验。</p>}
          {canMigrateArchive(run) && <button type="button" onClick={() => {
            if (perform(() => migrateArchive(library, run), "已创建新版续玩分支，原档案保留。")) onPlay();
          }}>按新版续玩（保留旧局）</button>}
        </article>)}
      </>}

      {section === "collection" && <>
        <h2>收藏图鉴</h2><p>已获得 {library?.discovered.length ?? 0} / {UPGRADE_IDS.length} 项。图鉴不影响掉落，也不提供局外数值加成。</p>
        <div className="archive-filters"><label>搜索部件<input value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>路线<select value={route} onChange={(event) => setRoute(event.target.value)}><option value="all">全部路线</option><option value="fruit">水果自助餐</option><option value="chapel">小教堂</option><option value="violent">故障利用</option><option value="neutral">稳定维修</option><option value="information">会计工具</option></select></label></div>
        <label className="inline-check"><input type="checkbox" checked={favoritePartsOnly} onChange={(event) => setFavoritePartsOnly(event.target.checked)} />只看收藏的部件</label>
        <div className="collection-grid">{UPGRADE_IDS.filter((id) => (!favoritePartsOnly || library?.favoriteUpgrades.includes(id)) && (route === "all" || UPGRADES[id].route === route) && UPGRADES[id].name.includes(search)).map((id) => {
          const copy = describeUpgrade(active?.snapshot ?? createRun(defaultSeed), id);
          return <article className="archive-card collection-item" key={id}><p className="eyebrow">{copy.routeLabel} · {copy.kindLabel} · {library?.discovered.includes(id) ? "已获得" : "尚未获得"}</p><h3>{copy.name}</h3><p>{copy.decisionEffect}</p>
            {copy.triggerCondition !== null && <p>触发条件：{copy.triggerCondition}</p>}<details><summary>效果、搭配与代价</summary><p>{copy.effect}</p>{copy.levelTwoEffect !== null && <p>{copy.levelTwoEffect}</p>}<p>搭配：{copy.synergy}</p><p>代价：{copy.risk}</p></details>
            <button type="button" disabled={library === null} aria-pressed={library?.favoriteUpgrades.includes(id) ?? false} onClick={() => toggleUpgrade(id)}>{library?.favoriteUpgrades.includes(id) ? "已收藏 · 取消" : "收藏部件"}</button></article>;
        })}</div>
      </>}

      {section === "settings" && <>
        <section className="archive-card"><p className="eyebrow">WELCOME TO THE NIGHT SHIFT</p><h2>玩法与背景</h2><GameGuide /></section>
        <section className="archive-card"><h2>体验设置</h2><label className="inline-check"><input type="checkbox" checked={reduceMotion} onChange={(event) => setPreference("midnight-lucky-hotel.reduce-flash", event.target.checked, setReduceMotion)} />减少动态与闪烁</label><label className="inline-check"><input type="checkbox" checked={muted} onChange={(event) => setPreference("midnight-lucky-hotel.muted", event.target.checked, setMuted)} />静音</label><p className="fine-print">减少动态不会改变中奖结果。系统减少动态设置也会被尊重。</p></section>
        <section className="archive-card"><h2>本地数据</h2><p>所有记录保存在当前浏览器。清理网站数据会丢失本地存档，请定期导出。容量不足时会提示并暂停自动推进，不自动删除旧记录。</p><button type="button" onClick={exportRaw}>导出全部原始备份</button><p className="fine-print">原始备份用于留底和排错；跨浏览器游玩请在历史中导出单局复盘包。规则版本：{RULES_VERSION}</p></section>
      </>}
      {error !== null && <button type="button" onClick={exportRaw}>导出原始备份（不覆盖数据）</button>}
      <footer className="frontdesk-footer"><FeedbackButton seed={active?.snapshot.initialSeed ?? null} /><p>试玩原型 · 无真实货币 · 无账号或云同步</p><p>存档只在当前浏览器和站点保存。从本地版换到网页版，请先导出本局，再在这里导入。</p></footer>
    </section>
  );
}
