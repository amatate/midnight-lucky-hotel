import * as THREE from "three";
import { REELS, type Stops } from "./engine";
import type { ReelStrips, ReelSymbol } from "./machines";
import { reelAngle, spinDuration, type ReelMotion } from "./motion";
import { paintSymbol } from "./symbols";

export interface ReelScene {
  show(stops: Stops, motion: ReelMotion | null): void;
  dispose(): void;
}

function texture(symbol: ReelSymbol): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas unavailable");
  const paper = context.createLinearGradient(0, 0, 256, 0);
  paper.addColorStop(0, "#b6aa85"); paper.addColorStop(.06, "#f0e6c9");
  paper.addColorStop(.5, "#fff3d3"); paper.addColorStop(.94, "#f0e6c9"); paper.addColorStop(1, "#b6aa85");
  context.fillStyle = paper; context.fillRect(0, 0, 256, 256);
  context.fillStyle = "#baad85"; context.fillRect(0, 0, 256, 2); context.fillRect(0, 254, 256, 2);
  // Compensate for the physical panel's 1.03 : .785 aspect so the printed art is not squashed.
  context.save(); context.translate(48, 20); context.scale(2.5, 3.25); paintSymbol(context, symbol); context.restore();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Curved segments around a horizontal axle. The center index faces the camera at angle = index * step. */
function panelGeometry(): THREE.BufferGeometry {
  const vertices: number[] = []; const uv: number[] = []; const indices: number[] = [];
  const segments = 12; const radius = 2.5; const step = Math.PI * 2 / 20;
  for (let row = 0; row <= segments; row++) {
    const angle = (row / segments - .5) * step;
    for (const x of [-.515, .515]) {
      vertices.push(x, Math.sin(angle) * radius, Math.cos(angle) * radius);
      uv.push(x < 0 ? 0 : 1, row / segments);
    }
    if (row < segments) {
      const n = row * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createReelScene(host: HTMLElement, onFailure: () => void, strips: ReelStrips = REELS): ReelScene {
  // Shared 20-stop geometry preserves the original acceleration, braking and rebound.
  if (strips.length !== 3 || strips.some((strip) => strip.length !== 20)) throw new Error("The physical reels require 20 stops.");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor("#111812");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.66, 1.66, 1.12, -1.12, .1, 30);
  camera.position.set(0, 0, 10);
  const ambient = new THREE.HemisphereLight(0xfff6df, 0x333b31, 2.2);
  scene.add(ambient);
  const light = new THREE.DirectionalLight(0xfff0cf, 2.8);
  light.position.set(-2, 3, 8); scene.add(light);
  const geometry = panelGeometry();
  const materials = new Map<ReelSymbol, THREE.MeshStandardMaterial>();
  for (const symbol of new Set(strips.flat())) materials.set(symbol, new THREE.MeshStandardMaterial({
    map: texture(symbol), roughness: .74, metalness: .04
  }));
  const drums = strips.map((strip, reel) => {
    const drum = new THREE.Group(); drum.position.x = (reel - 1) * 1.085;
    strip.forEach((symbol, index) => {
      const mesh = new THREE.Mesh(geometry, materials.get(symbol)!);
      mesh.rotation.x = -index * Math.PI * 2 / strip.length;
      drum.add(mesh);
    });
    scene.add(drum); return drum;
  });
  let frame = 0; let disposed = false; let currentStops: Stops = [0, 0, 0]; let currentMotion: ReelMotion | null = null;
  const draw = () => {
    if (disposed || document.hidden) return;
    const elapsed = currentMotion === null ? 0 : performance.now() - currentMotion.startedAt;
    drums.forEach((drum, index) => { drum.rotation.x = currentMotion === null
      ? currentStops[index]! * Math.PI * 2 / strips[index]!.length : reelAngle(currentMotion, index, elapsed); });
    renderer.render(scene, camera);
    if (currentMotion !== null && elapsed < spinDuration(currentMotion.reduced)) frame = requestAnimationFrame(draw);
  };
  const schedule = () => { cancelAnimationFrame(frame); draw(); };
  const resize = () => {
    if (disposed) return;
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), false); schedule();
  };
  const observer = new ResizeObserver(resize); observer.observe(host);
  const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden) schedule(); };
  const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); onFailure(); };
  document.addEventListener("visibilitychange", visibility);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  resize();
  return {
    show(stops, motion) { currentStops = stops; currentMotion = motion; schedule(); },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      geometry.dispose(); materials.forEach((material) => { material.map?.dispose(); material.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    }
  };
}
