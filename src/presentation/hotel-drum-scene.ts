import * as THREE from "three";
import type { Grid, ReelIndex, ReelSet, SymbolId } from "@/core/types";
import type { ReelMotionPlan } from "./reel-timeline";
import { drumDistance, drumSymbol, type DrumPath } from "./hotel-drum-motion";

export interface HotelDrumFrame {
  readonly grid: Grid;
  readonly startGrid: Grid;
  readonly target: Grid;
  readonly strips: ReelSet;
  readonly plan: ReelMotionPlan | null;
  readonly paused: boolean;
  readonly startedAt: number;
}
export interface HotelDrumScene { show(frame: HotelDrumFrame): void; dispose(): void }
const SYMBOLS: readonly SymbolId[] = ["cherry", "lemon", "bell", "seven", "wild", "blank", "food", "crack"];
const REELS = [0, 1, 2] as const;
const STEP = Math.PI / 10, RADIUS = 2.7;

function panelGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 12; row++) {
    const angle = (row / 12 - .5) * STEP;
    for (const x of [-.5, .5]) {
      positions.push(x, Math.sin(angle) * RADIUS, Math.cos(angle) * RADIUS);
      uv.push(x < 0 ? 0 : 1, row / 12);
    }
    if (row < 12) { const n = row * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export async function loadDrumArt(): Promise<ReadonlyMap<SymbolId, HTMLImageElement>> {
  return new Map(await Promise.all(SYMBOLS.map(async symbol => {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}art/reels/${symbol}-v2.webp`;
    await image.decode();
    return [symbol, image] as const;
  })));
}

/** Bounded 21-panel renderer, independent of strip length. React keeps all
 * input, paylines, accessibility, presentation cursors and state transitions. */
export function createHotelDrumScene(host: HTMLElement, art: ReadonlyMap<SymbolId, HTMLImageElement>, onFailure: () => void): HotelDrumScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor("#08110c", 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.65, 1.65, 1.25, -1.25, .1, 20);
  camera.position.set(0, 0, 10);
  scene.add(new THREE.HemisphereLight(0xfff6df, 0x333b31, 2));
  const light = new THREE.DirectionalLight(0xfff0cf, 2.3); light.position.set(-2, 3, 8); scene.add(light);
  const geometry = panelGeometry();
  const textures = new Map<SymbolId, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; material: THREE.MeshStandardMaterial }>();
  for (const symbol of SYMBOLS) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    textures.set(symbol, { canvas, texture, material: new THREE.MeshStandardMaterial({ map: texture, roughness: .74, metalness: .04 }) });
  }
  const drums = REELS.map(() => {
    const group = new THREE.Group();
    const panels = Array.from({ length: 7 }, () => {
      const mesh = new THREE.Mesh(geometry, textures.get("blank")!.material); group.add(mesh); return mesh;
    });
    scene.add(group); return { group, panels };
  });
  let frame: HotelDrumFrame | null = null, raf = 0, disposed = false;
  let animation: { key: string; start: number; paths: readonly DrumPath[]; distances: number[]; starts: number[]; frozen: boolean } | null = null;
  const renderFrame = () => {
    if (disposed || !frame || document.hidden) return;
    const elapsed = animation ? performance.now() - animation.start : 0;
    drums.forEach(({ panels }, reel) => {
      const moving = animation !== null && frame!.plan?.spinningReels.includes(reel as ReelIndex);
      const path = animation?.paths[reel];
      const duration = frame!.plan?.revealAtMs[reel as ReelIndex] ?? frame!.plan?.completeAtMs ?? 0;
      const distance = animation && path && moving ? animation.frozen ? animation.distances[reel]!
        : drumDistance(elapsed, duration, path.travel, animation.starts[reel]!) : 0;
      if (animation && moving) animation.distances[reel] = distance;
      const center = Math.floor(distance);
      panels.forEach((mesh, panel) => {
        const index = center + panel - 3;
        const symbol = moving && path ? drumSymbol(path, index)
          : Math.abs(index) <= 1 ? frame!.grid[reel]![1 - index]!
            : frame!.strips[reel]![((index % frame!.strips[reel]!.length) + frame!.strips[reel]!.length) % frame!.strips[reel]!.length] ?? "blank";
        mesh.material = textures.get(symbol)!.material;
        mesh.rotation.x = (distance - index) * STEP;
      });
    });
    renderer.render(scene, camera);
    if (animation && !animation.frozen && frame.plan && elapsed < frame.plan.completeAtMs) raf = requestAnimationFrame(draw);
  };
  const draw = () => { try { renderFrame(); } catch { onFailure(); } };
  const schedule = () => { cancelAnimationFrame(raf); draw(); };
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    const aspect = width / height, gap = 5 / height * 2.5, column = (2.5 * aspect - 2 * gap) / 3;
    camera.left = -1.25 * aspect; camera.right = 1.25 * aspect; camera.updateProjectionMatrix();
    drums.forEach(({ group, panels }, index) => { group.position.x = (index - 1) * (column + gap); panels.forEach(mesh => { mesh.scale.x = column; }); });
    // Compensate for the physical panel aspect without stretching the artwork.
    // Short 320px layouts have wider-than-tall cells; shrink both axes there.
    const panelAspect = ((width - 10) / 3) / (height * 2 * RADIUS * Math.sin(STEP / 2) / 2.5);
    const glyphWidth = Math.min(220, 232 / panelAspect), glyphHeight = glyphWidth * panelAspect;
    textures.forEach(({ canvas, texture }, symbol) => {
      const ctx = canvas.getContext("2d")!;
      const paper = ctx.createLinearGradient(0, 0, 256, 0);
      paper.addColorStop(0, "#b6aa85"); paper.addColorStop(.08, "#f0e6c9"); paper.addColorStop(.5, "#fff3d3"); paper.addColorStop(.92, "#f0e6c9"); paper.addColorStop(1, "#b6aa85");
      ctx.fillStyle = paper; ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(art.get(symbol)!, (256 - glyphWidth) / 2, (256 - glyphHeight) / 2, glyphWidth, glyphHeight);
      ctx.fillStyle = "#b7a882"; ctx.fillRect(0, 0, 256, 1); ctx.fillRect(0, 255, 256, 1); texture.needsUpdate = true;
    });
    renderer.setSize(width, height, false); schedule();
  };
  const observer = new ResizeObserver(resize); observer.observe(host);
  const lost = (event: Event) => { event.preventDefault(); onFailure(); };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  const visibility = () => { cancelAnimationFrame(raf); if (!document.hidden) schedule(); };
  document.addEventListener("visibilitychange", visibility);
  resize();
  return {
    show(next) {
      if (disposed) return;
      if (next.paused && animation) {
        // Keep the last rendered positions. Resume stretches the remaining travel
        // over the restarted hotel timers without exposing the target behind a drawer.
        animation.frozen = true; cancelAnimationFrame(raf); return;
      }
      if (next.paused) {
        // A renderer mounted behind an open menu must not expose a pending result.
        frame = { ...next, grid: next.startGrid, plan: null }; schedule(); return;
      }
      if (next.plan && animation?.key !== next.plan.cycleKey) {
        const from = frame?.grid ?? next.startGrid;
        animation = { key: next.plan.cycleKey, start: next.startedAt, frozen: false, distances: [0, 0, 0], starts: [0, 0, 0],
          paths: REELS.map(reel => ({ from: from[reel], to: next.target[reel], strip: next.strips[reel],
            travel: next.plan!.kind === "base" ? 24 + reel * 4 : next.plan!.kind === "kick" ? 5 : 14 + reel * 2 })) };
      } else if (next.plan && animation?.frozen) {
        animation.start = next.startedAt; animation.starts = [...animation.distances]; animation.frozen = false;
      } else if (!next.plan) animation = null;
      frame = next;
      if (!next.paused) schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      document.removeEventListener("visibilitychange", visibility); renderer.domElement.removeEventListener("webglcontextlost", lost);
      geometry.dispose(); textures.forEach(({ texture, material }) => { texture.dispose(); material.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    }
  };
}
