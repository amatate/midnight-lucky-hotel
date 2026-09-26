# 六房机台生产素材 · 2026-09-24

通过内置 imagegen 生成；以下为最终实际使用的提示词。参考图取自此前批准的构筑/六房概念图，只参考造型和材质，不直接贴入游戏。

## 资源与来源

| 生产文件 | 尺寸与用途 | 生成源文件 |
| --- | --- | --- |
| public/art/installed-parts-v1.png | 1402×1122，5×4 单件图集；19 部件 + 1 餐罩 | exec-0d6d9abd-07ef-4eb4-8299-9f9f92bd9b88.png |
| public/art/room-crowns-v1.png | 1536×1024，3×2 顶冠图集 | exec-0c9574a2-046d-41c2-adc9-73d093894ce2.png |
| public/art/hotel-rooms-v1.png | 1536×1024，3×2 环境图集 | exec-3d71ba06-0828-420b-9fd7-5d6d000426c7.png |

源图由本地生成器保存；入选原图随项目保留在 `public/art/`，上表记录生成文件名供追溯。

生成结果不是精确数学网格：部件按实际行边界采样，每个 SVG image 另加 clipPath，避免宽插槽露出相邻单元。房间背景按格内缩 8px 采样，避免接缝。顶冠的透明区仍有光晕，第二次生成式清理没有改善，故未采用该编辑结果（exec-530a8759-cbf5-4d46-9f73-2b6129b44635.png）；由原生 SVG 轮廓裁切显示，不修改栅格源文件。

图片不包含实时文字、奖金、灯光状态或按钮。等级、充能、保护与触发读数由 React/SVG 渲染，裁切坐标定义于 `src/app/components/CabinetArtwork.tsx`。

## parts

```text
Use case: stylized-concept. Asset type: ONE production game sprite atlas for a mobile Art Deco slot-machine's interchangeable physical equipment, PNG with genuinely transparent alpha. Reference image: material and silhouette reference ONLY; do not reproduce UI.
Render EXACTLY FIVE columns and FOUR rows of equally-sized square cells, all 20 cells filled with ONE separate isolated object each, consistent orthographic front view, centered at precise cell centers x=10,30,50,70,90 percent and y=12.5,37.5,62.5,87.5 percent. No outside margin, no visible grid or dividers. Every sprite fits within central 72% of its cell so adjacent cells never touch. Each has a small flat mounting foot, readable bold silhouette and fine restrained detail. Entire composition aspect ratio 5:4, preferably 1600x1280. All background is truly transparent, not a painted checkerboard, not white, no black boxes. No captions, text, numbers, labels or progress states baked in. Static objects, NO flames, glowing charge bars or active sparks; live indicators are drawn in code.
Reading order left to right then top to bottom:
row1: copper-banded glass fruit fermentation barrel with dark unlit window; three-candle brass holder with UNLIT ivory candles; protective vertical flywheel in dark metal housing; compact mechanical cherry press with one cherry; small salad-dressing glass bottle.
row2: brass citrus injection capsule with one lemon emblem; glass cherry jam jar with cherries on label but NO words; enamel fruit bowl with cherries and lemon; lidded leftovers tin with fork; upright brass eye-shaped omen-collector instrument.
row3: three short geometric pale amber crystal prisms, unlit; small midnight hotel bell on pedestal; coin in a small sacrificial brass coin press; U-shaped aged metal magnet; exposed steel helical spring on mounting base.
row4: tall glass vacuum-tube capacitor with dark interior; compact brass shield-shaped warranty ticket box; horizontal copper-wound electric motor; replaceable glass safety fuse in a small brass clip; small domed hotel room-service dish cloche.
Style exactly the reference components: satin pale champagne brass, ink-green/charcoal machinery, cream enamel and clear glass, quiet ruby/cherry accents. Tactile 2.5D painted game art, not photorealistic clutter. Consistent light from upper left, no cast shadows outside the object. At 60 pixels each the 20 distinct silhouettes must read. Do NOT generate cabinets, reels, buttons, frames, chains, loose background decorations or ornamental flourishes. This is a sprite SHEET asset, not a concept board. All 20 objects visible and correctly aligned.
```

## crowns

```text
Use case: stylized-concept. Asset type: ONE transparent production sprite atlas of six different Art Deco slot cabinet TOP CROWNS for a mobile hotel roguelite. Reference image: use only crown shapes/materials of its six cabinets, not entire cabinet or room.
Exactly THREE columns and TWO rows, SIX equal rectangular cells. Canvas 1536x1024; each cell 512x512. Precisely centered on each cell, a WIDE SHALLOW crown occupying x=4%..96% of cell and y=30%..70% of cell, with ample TRANSPARENT space above and below. No captions, NO words, no room names, NO numbers, NO instrument faces, no clocks, no lamps, no counters. Crown is purely static exterior architecture. PNG truly transparent alpha, not a fake checkerboard or black rectangle. Each crown has a short full-width straight baseline rail. Front orthographic view, no perspective. Do NOT include side rails descending, no full cabinet, no reels, buttons or backdrop.
Reading order:
1 jade-green enamel crown with gentle rounded/stepped shoulders, a single pale-gold fan-leaf relief.
2 blue-green smoked-glass crown with rectilinear city-skyline steps and restrained satin pale-gold central fins.
3 ivory stone short shoulders with black-lacquer center and three bold architectural champagne fins.
4 warm walnut veneer radio-like rounded shoulders with short brass ribbed speaker-grille side ornaments, NO gramophone horn.
5 midnight-blue twin-arch crown with silver-champagne outlines and a central simple engraved star motif; no lamp states.
6 black-navy shallow night-watch instrument crown with patinated pale brass parallel rails and a subtle blank circular medallion, NOT an actual clock or time.
Quiet premium retrofuturist Art Deco, same visual family as reference but reduce gold ornament density by one third. Distinct silhouettes, crisp outer contours, restrained pale-gold not saturated gold, soft upper-left highlights. No texture, glow or shadow outside shapes. Sheet will be sampled by CSS, all tiles equally placed.
```

## rooms

```text
Use case: stylized-concept. Asset type: ONE production environment atlas for SIX hotel room backgrounds in a mobile game. Reference image: use atmosphere and material palette only; REMOVE ALL SLOT MACHINES, UI, texts, numbers, arrows and game objects.
Canvas landscape 1536x1024 in an EXACT 3 columns by 2 rows grid. Six equally-sized square 512x512 scenes, no margins, no gaps, no visible borders, no labels. Each cell is one independent frontal room view with a calm relatively dark EMPTY CENTER suitable for overlaying a game cabinet; distinctive setting concentrated at left and right edges. No people. Painterly 2.5D softly realistic, restrained Art Deco hotel architecture, no sharp distracting foreground objects. Muted highlights and controlled shadow detail.
Reading order:
1 intimate jade-green garden sunroom, tall arched windows, softly lit leaf shadows, cream wall and a hint of potted greenery.
2 blue-green city-view suite, rectilinear tall window overlooking quiet night skyline, smoked glass and understated curtains.
3 premium ivory-stone and black-lacquer penthouse, spacious city panorama, champagne metal trims, one quiet lamp off-center.
4 warm walnut music room with radio-era fluted wall panels and dim amber lamp, hint of vinyl storage at outer edge, no text, no instrument in center.
5 midnight-blue symmetric room, two arched windows with faint distant stars, softly silver-gold trim.
6 deep dark-blue long-night suite, long vertical window moonlight, restrained aged brass details and dark drapery.
Keep relative framing and horizon consistent across six cells. No machines, no furniture blocking center, no slot symbols, no sign lettering, no watermark. This is a reusable atlas image not a labeled concept board.
```
