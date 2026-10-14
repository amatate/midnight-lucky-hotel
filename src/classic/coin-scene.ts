import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { COIN_HALF_HEIGHT, COIN_RADIUS, createCoinPhysics, type CoinImpact } from "./coin-physics";
import { MAX_COINS, type CoinCue } from "./coin-plan";

export interface CoinScene { play(cue: CoinCue): void; clear(): void; dispose(): void }

function coinTexture(reverse: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Coin texture unavailable");
  const gold = ctx.createLinearGradient(0, 0, 230, 240);
  gold.addColorStop(0, "#fbebaf"); gold.addColorStop(.48, "#c8a253"); gold.addColorStop(.72, "#f2d890"); gold.addColorStop(1, "#a97e38");
  ctx.fillStyle = gold; ctx.fillRect(0, 0, 256, 256);
  for (const [radius, color, width] of [[115, "#fff0b5", 4], [109, "#88622c", 3], [98, "#e9cc7d", 2]] as const) {
    ctx.beginPath(); ctx.arc(128, 128, radius, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const angle = i * Math.PI / 20;
    ctx.beginPath(); ctx.moveTo(128 + Math.cos(angle) * 101, 128 + Math.sin(angle) * 101);
    ctx.lineTo(128 + Math.cos(angle) * 106, 128 + Math.sin(angle) * 106); ctx.strokeStyle = "#816032"; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 112px Georgia, serif";
  ctx.fillStyle = "#fff1bd"; ctx.fillText(reverse ? "✦" : "M", 129, 138);
  ctx.fillStyle = "#88622f"; ctx.fillText(reverse ? "✦" : "M", 126, 134);
  ctx.font = "bold 16px Georgia, serif"; ctx.fillText("MIDNIGHT", 128, 67); ctx.font = "bold 13px Georgia, serif"; ctx.fillText("REEL CLUB", 128, 197);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export async function createCoinScene(host: HTMLElement, onImpact: (impact: CoinImpact) => void, onFailure: () => void, signal: AbortSignal): Promise<CoinScene> {
  const physics = await createCoinPhysics(onImpact);
  if (signal.aborted) { physics.dispose(); throw new DOMException("Cancelled", "AbortError"); }
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch (error) { physics.dispose(); throw error; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .86;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x09160f, 0); renderer.domElement.setAttribute("aria-hidden", "true"); host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3.15, 3.15, 1.1, -1.1, .1, 30);
  camera.position.set(0, 4.8, 8); camera.lookAt(0, .4, 0);
  const geometries: THREE.BufferGeometry[] = []; const materials: THREE.Material[] = []; const textures: THREE.Texture[] = [];
  const metal = new THREE.MeshStandardMaterial({ color: "#b5a077", metalness: .85, roughness: .27 });
  const grain = document.createElement("canvas"); grain.width = 512; grain.height = 128;
  const grainContext = grain.getContext("2d")!;
  grainContext.fillStyle = "#26372b"; grainContext.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 14) { grainContext.fillStyle = "#18261d"; grainContext.fillRect(x, 0, 2, 128); grainContext.fillStyle = "#415244"; grainContext.fillRect(x + 2, 0, 1, 128); }
  const grainTexture = new THREE.CanvasTexture(grain); grainTexture.colorSpace = THREE.SRGBColorSpace; textures.push(grainTexture);
  const bowl = new THREE.MeshStandardMaterial({ map: grainTexture, metalness: .4, roughness: .56 });
  const dark = new THREE.MeshStandardMaterial({ color: "#09130d", metalness: .25, roughness: .8 });
  materials.push(metal, bowl, dark);
  const box = (x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) => {
    const geometry = new RoundedBoxGeometry(width, height, depth, 2, Math.min(.035, width / 4, height / 4, depth / 4)); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh); return mesh;
  };
  box(0, -.085, 0, 5.78, .17, 1.54, bowl);
  for (const x of [-2.85, 2.85]) box(x, .13, 0, .1, .26, 1.54, metal);
  for (const z of [-.73, .73]) box(0, .13, z, 5.6, .26, .1, metal);
  // A dark mouth and thin machined hood at the rear: coins originate here.
  box(0, 1.08, -.58, 1.38, .2, .07, dark);
  box(0, 1.22, -.56, 1.56, .065, .18, metal);
  box(0, .955, -.51, 1.5, .05, .24, metal);
  for (const x of [-.76, .76]) box(x, 1.075, -.56, .045, .26, .18, metal);
  const faces = [coinTexture(false), coinTexture(true)]; textures.push(...faces);
  const edge = new THREE.MeshStandardMaterial({ color: "#caa353", metalness: .82, roughness: .27, transparent: true });
  const coinMaterials = [edge, ...faces.map((map) => new THREE.MeshStandardMaterial({ map, metalness: .76, roughness: .36, transparent: true }))];
  materials.push(...coinMaterials);
  const geometry = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HALF_HEIGHT * 2, 32); geometries.push(geometry);
  const coins = new THREE.InstancedMesh(geometry, coinMaterials, MAX_COINS); coins.count = 0; coins.castShadow = true; coins.receiveShadow = true;
  coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage); coins.frustumCulled = false; scene.add(coins);
  const dummy = new THREE.Object3D();
  scene.add(new THREE.HemisphereLight(0xffefc3, 0x213728, 1));
  const light = new THREE.DirectionalLight(0xffebbd, 2); light.position.set(-3, 7, 4); light.castShadow = true;
  light.shadow.mapSize.set(512, 512); light.shadow.camera.left = -4; light.shadow.camera.right = 4; light.shadow.camera.top = 4; light.shadow.camera.bottom = -3;
  light.shadow.normalBias = .012; light.shadow.bias = -.0005; scene.add(light);
  const fill = new THREE.DirectionalLight(0xd9e8df, .85); fill.position.set(4, 2, -2); scene.add(fill);
  const environment = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environment, .06); scene.environment = env.texture; scene.environmentIntensity = .6; environment.dispose(); pmrem.dispose();
  let frame = 0; let previous = 0; let disposed = false;
  const paint = () => {
    coins.count = physics.bodies.length;
    physics.bodies.forEach((body, i) => { const position = body.translation(); const rotation = body.rotation(); dummy.position.set(position.x, position.y, position.z); dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w); dummy.updateMatrix(); coins.setMatrixAt(i, dummy.matrix); });
    coins.instanceMatrix.needsUpdate = true; coinMaterials.forEach((material) => { material.opacity = physics.opacity; });
    host.dataset.coinCount = String(physics.bodies.length); host.dataset.impacts = String(physics.impacts); host.dataset.simulation = physics.active ? "running" : "idle"; host.dataset.steps = String(physics.steps);
    renderer.render(scene, camera);
  };
  const tick = (now: number) => {
    if (disposed || document.hidden) return;
    physics.advance(Math.max(0, (now - previous) / 1000)); previous = now; paint();
    if (physics.active) frame = requestAnimationFrame(tick);
  };
  const clear = () => { if (disposed) return; cancelAnimationFrame(frame); physics.clear(); paint(); };
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.top = 3.15 * height / width; camera.bottom = -camera.top; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); paint();
  };
  const observer = new ResizeObserver(resize); observer.observe(host);
  const visibility = () => { if (document.hidden) clear(); };
  const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); onFailure(); };
  document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", clear); renderer.domElement.addEventListener("webglcontextlost", lost);
  resize();
  return {
    play(cue) { if (disposed || document.hidden) return; cancelAnimationFrame(frame); physics.start(cue); previous = performance.now(); frame = requestAnimationFrame(tick); },
    clear,
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", clear);
      renderer.domElement.removeEventListener("webglcontextlost", lost); physics.dispose();
      geometries.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); textures.forEach((item) => item.dispose());
      coins.dispose(); light.shadow.dispose(); env.dispose(); renderer.dispose(); renderer.domElement.remove();
    }
  };
}
