import { useState } from "react";
import { useAudioSettings, setAudioSettings } from "@/presentation/audio-settings";
import { playSfx, unlockAudio } from "@/presentation/audio";
import type { SfxId } from "@/presentation/audio-synthesis";
import "@/app/audio-settings.css";

export function AudioSettings(): React.JSX.Element {
  const settings = useAudioSettings();
  const [sample, setSample] = useState<SfxId>("spin");
  return <section className="audio-settings" aria-label="声音设置">
    <h3>声音设置</h3>
    <label className="inline-check"><input type="checkbox" checked={settings.muted} onChange={(event) => {
      setAudioSettings({ muted: event.target.checked }); unlockAudio();
    }} />静音</label>
    <label className="audio-fader"><span>音乐音量 <output>{Math.round(settings.music * 100)}%</output></span>
      <input aria-label="音乐音量" type="range" min="0" max="100" step="1" value={Math.round(settings.music * 100)} onChange={(event) => { setAudioSettings({ music: Number(event.target.value) / 100 }); unlockAudio(); }} />
    </label>
    <label className="audio-fader"><span>音效音量 <output>{Math.round(settings.sfx * 100)}%</output></span>
      <input aria-label="音效音量" type="range" min="0" max="100" step="1" value={Math.round(settings.sfx * 100)} onChange={(event) => { setAudioSettings({ sfx: Number(event.target.value) / 100 }); unlockAudio(); }} />
    </label>
    <p className="fine-print">音乐：After Hours · 48 秒循环。首次触摸后播放，切到后台时暂停。</p>
    <details><summary>音效试听</summary><label>选择音效<select value={sample} onChange={(event) => setSample(event.target.value as SfxId)}>
      <option value="ui">按钮</option><option value="lever">拉杆卡点</option><option value="spin">启动转轮</option><option value="stop">转轮停下</option>
      <option value="reroll">重转</option><option value="hold">锁轮</option><option value="kick">脚踹</option><option value="prayer">祈祷</option>
      <option value="meal">用餐</option><option value="part">部件触发</option><option value="coin">金币入账</option><option value="win">小奖</option>
      <option value="big-win">大奖</option><option value="upgrade">安装升级</option><option value="room-clear">客房通关</option><option value="run-end">本局结束</option>
    </select></label><button type="button" disabled={settings.muted || settings.sfx === 0} onClick={() => { unlockAudio(); playSfx(sample); }}>试听音效</button></details>
    <p className="fine-print">音量分别保存；静音不改变滑杆，也不影响存档和中奖结果。</p>
  </section>;
}
