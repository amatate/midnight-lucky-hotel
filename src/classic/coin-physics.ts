import RAPIER from "@dimforge/rapier3d-compat";
import { COIN_PRESETS, cosmeticRandom, type CoinCue } from "./coin-plan";

export const COIN_RADIUS = .18;
export const COIN_HALF_HEIGHT = .035;
export const PHYSICS_STEP = 1 / 60;
export const TRAY = { halfWidth: 2.8, halfDepth: .68, wall: .09, rimHeight: .18 } as const;
export interface CoinImpact { readonly strength: number; readonly pan: number; readonly variant: number }
let initialized: Promise<void> | null = null;
export async function createCoinPhysics(onImpact: (impact: CoinImpact) => void): Promise<CoinPhysics> {
  initialized ??= RAPIER.init().catch((error: unknown) => { initialized = null; throw error; });
  await initialized;
  return new CoinPhysics(onImpact);
}

/** Bounded, disposable visual simulation. There are no economy callbacks. */
export class CoinPhysics {
  readonly world = new RAPIER.World({ x: 0, y: -12, z: 0 });
  readonly bodies: RAPIER.RigidBody[] = [];
  private readonly events = new RAPIER.EventQueue(true);
  private cue: CoinCue | null = null;
  private random = cosmeticRandom(1);
  private accumulator = 0;
  elapsed = 0;
  impacts = 0;
  steps = 0;
  private disposed = false;
  private readonly onImpact: (impact: CoinImpact) => void;
  constructor(onImpact: (impact: CoinImpact) => void) {
    this.onImpact = onImpact;
    this.world.timestep = PHYSICS_STEP;
    this.world.numSolverIterations = 8;
    const block = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(.65).setRestitution(.18));
    block(0, -.1, 0, TRAY.halfWidth + TRAY.wall, .1, TRAY.halfDepth + TRAY.wall);
    block(-TRAY.halfWidth - TRAY.wall / 2, .13, 0, TRAY.wall / 2, .13, TRAY.halfDepth);
    block(TRAY.halfWidth + TRAY.wall / 2, .13, 0, TRAY.wall / 2, .13, TRAY.halfDepth);
    block(0, .13, -TRAY.halfDepth - TRAY.wall / 2, TRAY.halfWidth, .13, TRAY.wall / 2);
    block(0, .13, TRAY.halfDepth + TRAY.wall / 2, TRAY.halfWidth, .13, TRAY.wall / 2);
  }
  get active(): boolean { return !this.disposed && this.cue !== null; }
  get opacity(): number { return this.cue ? Math.min(1, Math.max(0, (COIN_PRESETS[this.cue.tier].lifetime - this.elapsed) / .55)) : 0; }
  start(cue: CoinCue): void {
    if (this.disposed) return;
    this.clear(); this.cue = cue; this.random = cosmeticRandom(cue.seed); this.impacts = 0; this.steps = 0;
  }
  clear(): void {
    if (this.disposed) return;
    for (const body of this.bodies) this.world.removeRigidBody(body);
    this.bodies.length = 0; this.events.clear(); this.cue = null; this.elapsed = 0; this.accumulator = 0;
  }
  private spawn(): void {
    const r = this.random;
    const qx = r() - .5, qy = r() - .5, qz = r() - .5;
    const norm = Math.hypot(qx, qy, qz, 1);
    // A short arc from the rear payout mouth into the bowl, not a screen-wide shower.
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation((r() - .5) * .95, 1.03 + r() * .08, -.43)
      .setRotation({ x: qx / norm, y: qy / norm, z: qz / norm, w: 1 / norm })
      .setLinvel((r() - .5) * 3.6, .45 + r() * .6, .6 + r() * .6)
      .setAngvel({ x: (r() - .5) * 16, y: (r() - .5) * 22, z: (r() - .5) * 16 })
      .setLinearDamping(.3).setAngularDamping(.7).setCcdEnabled(true).setCanSleep(true));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(COIN_HALF_HEIGHT, COIN_RADIUS)
      .setMass(.055).setFriction(.62).setRestitution(.28)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(2), body);
    this.bodies.push(body);
  }
  advance(delta: number): void {
    if (!this.cue || this.disposed || !Number.isFinite(delta) || delta <= 0) return;
    this.accumulator += Math.min(delta, PHYSICS_STEP * 4);
    const preset = COIN_PRESETS[this.cue.tier];
    while (this.accumulator >= PHYSICS_STEP) {
      this.accumulator -= PHYSICS_STEP; this.elapsed += PHYSICS_STEP; this.steps++;
      if (this.bodies.length < preset.count && this.elapsed >= this.bodies.length * preset.interval) this.spawn();
      this.world.step(this.events);
      let strongest = 0; let contactX = 0;
      this.events.drainContactForceEvents((event) => {
        const force = event.totalForceMagnitude();
        if (force > strongest) { strongest = force; contactX = this.world.getCollider(event.collider1())?.translation().x ?? 0; }
      });
      if (strongest > 2.5) { this.impacts++; this.onImpact({ strength: Math.min(1, strongest / 22), pan: Math.max(-.8, Math.min(.8, contactX / 3)), variant: this.impacts % 3 }); }
      if (this.elapsed >= preset.lifetime) { this.clear(); break; }
    }
  }
  dispose(): void { if (this.disposed) return; this.clear(); this.disposed = true; this.events.free(); this.world.free(); }
}
