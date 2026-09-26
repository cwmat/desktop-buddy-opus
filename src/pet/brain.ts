/**
 * The buddy's behaviour: a small state machine that turns world snapshots into a pose.
 *
 * PURE on purpose — no Tauri, no DOM. Time, randomness and the world come in from the
 * runtime (main.ts), which applies the output: moves the window, draws the sprite and
 * turns one-shot `events` into effects, speech and persistence. That keeps every
 * behaviour here unit-testable (see brain.test.ts).
 *
 * All positions are the pet's FEET anchor (bottom-centre of the sprite) in physical px.
 */
import type { EnvironmentSnapshot, ForegroundWindow } from '$lib/ipc';
import type { Home, MovementMode, RoamSpeed } from '$lib/settings';
import type { Mood } from '$lib/stats';
import { SPRITE_SIZE, type AnimationName } from '$pets/types';
import {
  aboveFeet,
  bottom,
  clamp,
  distance,
  monitorAt,
  right,
  type MonitorArea,
  type Point,
  type Rect,
} from './geometry';

export type Rng = () => number;

export interface BrainConfig {
  movement: MovementMode;
  roamSpeed: RoamSpeed;
  idleMinutes: number;
  sleepWhenIdle: boolean;
  perchOnWindows: boolean;
  cursorAwareness: boolean;
  /** Current mood, or null when needs are switched off. */
  mood: Mood | null;
  home: Home | null;
  /** Window scale factor: physical px per logical px. */
  scale: number;
  /** Physical px per sprite pixel. */
  px: number;
  /** The buddy's walk-speed trait (1 = normal). */
  speed: number;
}

export interface WorldInput {
  /** Monotonic clock in ms. */
  now: number;
  /** Seconds since the last tick (already clamped by the caller). */
  dt: number;
  cursor: Point | null;
  env: EnvironmentSnapshot;
  monitors: readonly MonitorArea[];
}

export type Activity =
  | 'idle'
  | 'sit'
  | 'walk'
  | 'sleep'
  | 'waking'
  | 'happy'
  | 'dizzy'
  | 'catch'
  | 'eat'
  | 'drag'
  | 'fall'
  | 'jump'
  | 'poof';

export type BrainEvent =
  /** `impact` is 0..1 (how hard it hit). */
  | { type: 'landed'; impact: number }
  | { type: 'patted' }
  | { type: 'dizzy' }
  | { type: 'celebrate' }
  /** A treat starts falling; it reaches the mouth after `ms`. */
  | { type: 'treat-incoming'; ms: number }
  | { type: 'eat-start'; ms: number }
  | { type: 'ate' }
  | { type: 'fell-asleep'; forced: boolean }
  | { type: 'woke'; grumpy: boolean }
  /** The cursor came close. */
  | { type: 'notice' }
  | { type: 'drag-start' }
  | { type: 'poof'; phase: 'out' | 'in'; tag?: string }
  | { type: 'home-changed'; home: Home }
  | { type: 'arrived-home' };

export interface Pose {
  x: number;
  y: number;
  /** 1 = facing right (the way frames are drawn), -1 = mirrored. */
  facing: 1 | -1;
  anim: AnimationName;
  /** `now` when `anim` (re)started, so one-shots play from frame 0. */
  animStart: number;
  /** Sprite px: > 0 squashed (wider, shorter), < 0 stretched. */
  squash: number;
  /** Physical px above the surface it will land on (shrinks the shadow). */
  lift: number;
  /** Sprite px horizontal dangle while dragged. */
  sway: number;
  shake: boolean;
  visible: boolean;
  sleeping: boolean;
  activity: Activity;
}

export interface BrainOutput extends Pose {
  events: BrainEvent[];
}

type Surface = { kind: 'ground' } | { kind: 'spot' } | { kind: 'perch'; rect: ForegroundWindow };
type WalkThen = 'pause' | 'decide' | 'perch';

interface Goal {
  kind: 'home' | 'summon';
  /** Summon target; 'home' always reads the live home setting. */
  target?: Point;
  /** Walk only if the target is within this fraction of the monitor width, else poof. */
  walkLimit: number;
  speedMul: number;
}

interface Jump {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  vy0: number;
  duration: number;
  land: Surface;
}

interface Fall {
  vx: number;
  vy: number;
  /** Ignore window tops (hopping down off one). */
  ignorePerch: boolean;
  /** Dropped by the user: wherever it lands on the ground becomes home. */
  fromDrop: boolean;
}

interface Poof {
  to: Point;
  land: Surface;
  tag?: string;
  moved: boolean;
  shown: boolean;
}

// Tunables. Distances are logical px (× scale) unless noted; times are seconds.
const WALK_SPEED: Record<RoamSpeed, number> = { slow: 30, normal: 55, zoomy: 110 };
const GRAVITY = 2600;
const MAX_FLING = 2600;
const PERCH_CHANCE = 0.3;
const PERCH_GRACE_MS = 1500;
const ARRIVE_EPS = 2;
const CATCH_S = 0.6;
const EAT_S = 1.5;
const POOF_OUT = 0.3;
const POOF_GAP = 0.12;
const POOF_IN = 0.3;
const FORCED_NAP_MS = 10 * 60_000;
const NO_SLEEP_AFTER_WAKE_MS = 20_000;
const NOTICE_COOLDOWN_MS = 15_000;
const HOME_GOAL: Goal = { kind: 'home', walkLimit: 0.6, speedMul: 1.3 };

/** Activities a new plan may cut short right away. */
const INTERRUPTIBLE = new Set<Activity>(['idle', 'sit', 'walk']);
/** Standing around on a surface, able to react (pats, naps, looking at the cursor). */
const RELAXED = new Set<Activity>(['idle', 'sit', 'walk', 'happy', 'waking']);
const AIRBORNE = new Set<Activity>(['jump', 'fall', 'poof']);

const between = (rng: Rng, min: number, max: number) => min + (max - min) * rng();

const NO_ENV: EnvironmentSnapshot = { idleSeconds: null, foregroundWindow: null, fullscreenMonitor: null };

export class Brain {
  private cfg: BrainConfig;
  private readonly rng: Rng;
  private world: WorldInput;
  private now: number;
  private events: BrainEvent[] = [];

  private x: number;
  private y: number;
  private facing: 1 | -1 = -1;
  private surface: Surface = { kind: 'spot' };

  private activity: Activity = 'idle';
  /** Seconds spent in the current activity. */
  private t = 0;
  /** Timed activities end after `duration` seconds and run `after`. */
  private duration = 0;
  private after: (() => void) | null = null;
  private anim: AnimationName = 'idle';
  private animStart: number;

  private walkTarget = 0;
  private walkThen: WalkThen = 'pause';
  private walkSpeedMul = 1;
  private jump: Jump | null = null;
  private fall: Fall | null = null;
  private poofPlan: Poof | null = null;
  private perchPlan: { rect: ForegroundWindow; x: number } | null = null;
  private perchStrolls = 0;
  private fgMissingSince: number | null = null;

  private goal: Goal | null = null;
  /** roam-when-idle: currently out exploring because the user is away. */
  private roaming = false;
  /** Hang around home until this time before roaming again (after go-home / summon). */
  private lingerUntil = 0;
  private pendingTreats = 0;
  private pendingNap = false;
  /** 0 for an automatic nap; otherwise when a forced nap ends. */
  private forcedNapUntil = 0;
  private noSleepUntil = 0;
  private turnAt = 0;

  private pokes: number[] = [];
  private squashAmount = 0;
  private squashStart = 0;
  private squashMs = 1;
  private shakeUntil = 0;
  private sway = 0;
  private dragVx = 0;
  private prevX = 0;
  private cursorNear = false;
  private noticeAfter = 0;

  constructor(opts: { config: BrainConfig; start: Point; monitors: readonly MonitorArea[]; now: number; rng?: Rng }) {
    this.cfg = opts.config;
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now;
    this.animStart = opts.now;
    this.world = { now: opts.now, dt: 0, cursor: null, env: NO_ENV, monitors: opts.monitors };
    this.x = this.prevX = opts.start.x;
    this.y = opts.start.y;
    this.surface = this.surfaceAt(opts.start);
    this.rest(2, 5);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  get sleeping(): boolean {
    return this.activity === 'sleep';
  }

  /** Hanging out (not busy, not asleep): a good moment for idle chatter. */
  get relaxed(): boolean {
    return RELAXED.has(this.activity);
  }

  /** On a window, or on the way up to one. */
  get perched(): boolean {
    return this.surface.kind === 'perch' || (this.activity === 'walk' && this.walkThen === 'perch');
  }

  get position(): Point {
    return { x: this.x, y: this.y };
  }

  setConfig(next: BrainConfig): void {
    const prev = this.cfg;
    this.cfg = next;
    const movedHome = !samePoint(prev.home, next.home);
    if (next.movement !== prev.movement) {
      this.roaming = false;
      this.lingerUntil = 0;
      if (INTERRUPTIBLE.has(this.activity)) this.decide();
    } else if (movedHome && !this.shouldRoam() && INTERRUPTIBLE.has(this.activity)) {
      this.decide();
    }
  }

  /** The monitor layout changed: use it before the next tick brings it (decisions may come first). */
  setMonitors(monitors: readonly MonitorArea[]): void {
    this.world = { ...this.world, monitors };
  }

  tick(input: WorldInput): BrainOutput {
    this.world = input;
    this.now = input.now;
    this.t += input.dt;
    this.direct();
    this.update(input.dt);
    this.watchCursor();
    this.updateSway(input.dt);
    return this.output();
  }

  /** Pop into existence (launch). */
  appear(): void {
    this.poof(this.here(), this.surface, 'appear', true);
  }

  /**
   * Poof in place, e.g. while swapping to another buddy. Watch for poof 'in' with `tag`.
   * Returns false (and does nothing) while carried or mid-air.
   */
  poofInPlace(tag: string): boolean {
    if (this.activity === 'drag' || this.activity === 'jump' || this.activity === 'fall') return false;
    this.poof(this.here(), this.surface, tag);
    return true;
  }

  /** A click on the buddy: a pat (or a celebration for a double-click), unless it is being poked too much. */
  poke(double: boolean): void {
    if (this.registerPoke()) return this.dizzy();
    if (double) this.celebrate();
    else this.pat();
  }

  pat(): void {
    if (this.activity === 'sleep') return this.wake(true);
    if (this.activity === 'drag') return;
    this.emit({ type: 'patted' });
    // Mid-air or munching: hearts only, no change of plans.
    if (!RELAXED.has(this.activity)) return;
    this.setActivity('happy', 'happy', 1.1, () => this.finish(true));
  }

  celebrate(): void {
    if (this.activity === 'drag' || AIRBORNE.has(this.activity)) return;
    if (this.activity === 'sleep') this.emit({ type: 'woke', grumpy: false });
    this.emit({ type: 'celebrate' });
    // Busy with a treat: sparkles only, the meal goes on.
    if (this.eating()) return;
    this.jumpTo(this.here(), this.surface, 'happy', 12 * this.cfg.px);
  }

  /** Give a treat. Returns false if it was ignored (while dragging). */
  treat(): boolean {
    if (this.activity === 'drag') return false;
    if (AIRBORNE.has(this.activity) || this.eating()) {
      this.pendingTreats = Math.min(3, this.pendingTreats + 1);
      return true;
    }
    this.startTreat();
    return true;
  }

  nap(): void {
    if (this.activity === 'sleep' || this.activity === 'drag') return;
    if (!RELAXED.has(this.activity)) {
      this.pendingNap = true;
      return;
    }
    this.fallAsleep(true);
  }

  wakeUp(): void {
    this.pendingNap = false;
    this.wake(false);
  }

  goHome(): void {
    if (!this.cfg.home) return;
    this.goal = HOME_GOAL;
    this.startGoal();
  }

  /** Come to the ground under the cursor; that becomes home. */
  summon(cursor: Point): void {
    const m = monitorAt(this.world.monitors, cursor);
    const half = this.half();
    const target = {
      x: Math.round(clamp(cursor.x, m.work.x + half, right(m.work) - half)),
      y: bottom(m.work),
    };
    this.goal = { kind: 'summon', target, walkLimit: 0.35, speedMul: 1.6 };
    this.startGoal();
  }

  startDrag(): void {
    if (this.activity === 'sleep') this.emit({ type: 'woke', grumpy: false });
    this.goal = null;
    this.perchPlan = null;
    this.jump = this.fall = this.poofPlan = null;
    this.pendingNap = false;
    this.dragVx = 0;
    this.setActivity('drag', 'drag');
    this.emit({ type: 'drag-start' });
  }

  dragTo(p: Point): void {
    if (this.activity !== 'drag') return;
    this.x = p.x;
    this.y = p.y;
  }

  /** Let go. `velocity` is the cursor's release velocity in physical px/s. */
  drop(velocity: Point): void {
    if (this.activity !== 'drag') return;
    const m = this.monitor();
    const half = this.half();
    this.x = clamp(this.x, m.work.x + half, right(m.work) - half);
    this.y = clamp(this.y, m.work.y + this.spriteSize(), bottom(m.bounds));

    const roamy = this.cfg.movement === 'roam' || (this.cfg.movement === 'roam-when-idle' && this.roaming);
    if (roamy) {
      const max = MAX_FLING * this.cfg.scale;
      const speed = Math.hypot(velocity.x, velocity.y);
      const k = speed > max ? max / speed : 1;
      this.startFall(velocity.x * k, velocity.y * k, { fromDrop: true });
      return;
    }
    // Placed by hand: no gravity, that spot is home now. Snap onto the taskbar if close.
    const ground = bottom(m.work);
    const onGround = Math.abs(this.y - ground) <= 4 * this.cfg.px;
    if (onGround) this.y = ground;
    const home = { x: Math.round(this.x), y: Math.round(this.y), ground: onGround };
    this.x = home.x;
    this.y = home.y;
    this.surface = this.surfaceAt(home);
    this.setHome(home);
    this.squashBy(1, 160);
    this.setActivity('idle', 'idle', 0.3, () => this.finish(true));
  }

  // -------------------------------------------------------------------------
  // Director: mode, idleness and naps
  // -------------------------------------------------------------------------

  private direct(): void {
    const { idleSeconds } = this.world.env;
    const cfg = this.cfg;
    const idleFor = (mult: number) => idleSeconds !== null && idleSeconds >= cfg.idleMinutes * 60 * mult;
    const userBack = idleSeconds !== null && idleSeconds < 2;
    const calm = () => INTERRUPTIBLE.has(this.activity) && !this.goal;

    if (cfg.movement === 'roam-when-idle') {
      if (!this.roaming && calm() && idleFor(1)) {
        this.roaming = true;
        this.decide();
      } else if (this.roaming && userBack) {
        this.roaming = false;
        this.goHome();
      }
    }

    const sleepMult = cfg.movement === 'stay' ? 1 : cfg.movement === 'roam' ? 2 : 3;
    const sleepy = cfg.sleepWhenIdle && idleFor(sleepMult);
    if (this.activity === 'sleep') {
      if (this.forcedNapUntil) {
        // A requested nap ends on its own after a while — unless you are away anyway.
        if (this.now >= this.forcedNapUntil) {
          if (sleepy) this.forcedNapUntil = 0;
          else this.wake(false);
        }
      } else if (userBack) {
        this.wake(false);
      }
    } else if (sleepy && calm() && this.now >= this.noSleepUntil) {
      this.fallAsleep(false);
    }
  }

  private shouldRoam(): boolean {
    if (this.now < this.lingerUntil) return false;
    return this.cfg.movement === 'roam' || (this.cfg.movement === 'roam-when-idle' && this.roaming);
  }

  /** Pick the next thing to do. Called whenever a step finishes. */
  private decide(): void {
    if (this.goal) return this.pursueGoal();
    if (this.shouldRoam()) return this.roamStep();
    if (this.cfg.home && !this.atHome()) {
      // Straight to it: goHome() waits for an interruptible activity, and we are between two.
      this.goal = HOME_GOAL;
      return this.pursueGoal();
    }
    this.lounge(4, 12);
  }

  /** End of a reaction/step: handle queued requests, optionally settle a moment, then decide. */
  private finish(settle: boolean): void {
    if (this.pendingTreats > 0) {
      this.pendingTreats--;
      return this.startTreat();
    }
    if (this.pendingNap) {
      this.pendingNap = false;
      return this.fallAsleep(true);
    }
    if (settle && !this.goal) return this.rest(1.2, 3);
    this.decide();
  }

  /** Hang around: rest a while, with the odd hop or look around. */
  private lounge(min: number, max: number): void {
    const hopChance = this.cfg.mood === 'happy' ? 0.25 : 0.1;
    const r = this.rng();
    if (r < hopChance) return this.hop();
    if (r < hopChance + 0.2) this.facing = this.facing === 1 ? -1 : 1;
    this.rest(min, max);
  }

  private rest(min: number, max: number): void {
    const sit = this.rng() < 0.35;
    this.setActivity(sit ? 'sit' : 'idle', sit ? 'sit' : 'idle', between(this.rng, min, max), () => this.decide());
    // Look the other way halfway through, sometimes.
    this.turnAt = this.rng() < 0.3 ? this.now + this.duration * 500 : 0;
  }

  private hop(): void {
    this.jumpTo(this.here(), this.surface, 'happy', 6 * this.cfg.px);
  }

  // -------------------------------------------------------------------------
  // Roaming & perching
  // -------------------------------------------------------------------------

  private roamStep(): void {
    const s = this.surface;
    if (s.kind === 'perch') {
      this.perchStrolls++;
      const range = this.perchRange(s.rect);
      if (!range || this.perchStrolls > 3 || this.rng() < 0.3) return this.hopDown();
      return this.walkTo(this.pickX(range.min, range.max), 'pause');
    }
    if (!this.onGround()) return this.hopDown();

    const fg = this.foreground();
    if (this.cfg.perchOnWindows && fg && this.rng() < PERCH_CHANCE) {
      const range = this.perchRange(fg);
      if (range && monitorAt(this.world.monitors, { x: fg.x + fg.width / 2, y: fg.y }) === this.monitor()) {
        return this.approachPerch(fg, range);
      }
    }
    const { min, max } = this.groundRange();
    this.walkTo(this.pickX(min, max), 'pause');
  }

  private pickX(min: number, max: number): number {
    const s = this.cfg.scale;
    const dist = between(this.rng, 60 * s, 480 * s);
    let dir = this.rng() < 0.5 ? -1 : 1;
    const target = this.x + dir * dist;
    if (target < min || target > max) dir = -dir;
    return clamp(this.x + dir * dist, min, max);
  }

  /**
   * Where the pet may stand on top of a window: clear of the left edge and of the caption
   * buttons on the right, inside the work area, with headroom above. null if unusable.
   */
  private perchRange(rect: Rect): { min: number; max: number } | null {
    const s = this.cfg.scale;
    const half = this.half();
    const m = monitorAt(this.world.monitors, { x: rect.x + rect.width / 2, y: rect.y });
    const min = Math.max(rect.x + 40 * s, m.work.x) + half;
    const max = Math.min(right(rect) - 160 * s, right(m.work)) - half;
    if (max - min < 40 * s) return null;
    // Room above the window for the pet and its speech bubbles.
    if (rect.y - this.spriteSize() - 64 * s < m.work.y) return null;
    if (bottom(m.work) - rect.y < 120 * s) return null;
    return { min, max };
  }

  private approachPerch(rect: ForegroundWindow, range: { min: number; max: number }): void {
    const landX = between(this.rng, range.min, range.max);
    const dir = Math.sign(landX - this.x) || this.facing;
    const run = Math.min(Math.abs(landX - this.x), 60 * this.cfg.scale);
    const ground = this.groundRange();
    this.perchPlan = { rect, x: landX };
    this.walkTo(clamp(landX - dir * run, ground.min, ground.max), 'perch');
  }

  private leapToPerch(): void {
    const plan = this.perchPlan;
    this.perchPlan = null;
    const fg = this.foreground();
    if (!plan || !fg || fg.id !== plan.rect.id) return this.lounge(1, 3);
    const range = this.perchRange(fg);
    if (!range) return this.lounge(1, 3);
    this.perchStrolls = 0;
    const x = clamp(plan.x + (fg.x - plan.rect.x), range.min, range.max);
    this.jumpTo({ x, y: fg.y }, { kind: 'perch', rect: fg }, 'happy');
  }

  /** Follow the window we stand on; fall if it goes away, another window takes over, or it leaves range. */
  private trackPerch(s: { kind: 'perch'; rect: ForegroundWindow }): void {
    const fg = this.foreground();
    if (!fg) {
      // Passing shell UI (Alt-Tab, Start) briefly means "no window": give it a moment.
      this.fgMissingSince ??= this.now;
      if (this.now - this.fgMissingSince > PERCH_GRACE_MS) this.dropOffPerch();
      return;
    }
    this.fgMissingSince = null;
    if (fg.id !== s.rect.id) return this.dropOffPerch();
    const dx = fg.x - s.rect.x;
    this.x += dx;
    this.walkTarget += dx;
    this.y = fg.y;
    this.surface = { kind: 'perch', rect: fg };
    const range = this.perchRange(fg);
    if (!range || this.x < range.min - 2 || this.x > range.max + 2) this.dropOffPerch();
  }

  private dropOffPerch(): void {
    this.fgMissingSince = null;
    this.startFall(0, 0, { ignorePerch: true });
  }

  private hopDown(): void {
    const s = this.cfg.scale;
    this.startFall(this.facing * 80 * s, -320 * s, { ignorePerch: true });
  }

  private foreground(): ForegroundWindow | null {
    const { env } = this.world;
    return env.fullscreenMonitor ? null : env.foregroundWindow;
  }

  // -------------------------------------------------------------------------
  // Goals: go home / come here
  // -------------------------------------------------------------------------

  private startGoal(): void {
    if (this.activity === 'drag') {
      this.goal = null;
      return;
    }
    // Asleep: wake first; the goal is picked up once awake.
    if (this.activity === 'sleep') return this.wake(false);
    if (INTERRUPTIBLE.has(this.activity)) {
      this.perchPlan = null;
      this.decide();
    }
  }

  private pursueGoal(): void {
    const goal = this.goal!;
    const wanted = goal.kind === 'home' ? this.cfg.home : (goal.target ?? null);
    if (!wanted) {
      this.goal = null;
      return this.decide();
    }
    const target = this.reachable(wanted);
    if (distance(this.here(), target) <= ARRIVE_EPS) return this.reachGoal(goal, target);

    const here = this.monitor();
    const far =
      this.monitor(target) !== here ||
      Math.abs(target.x - this.x) > here.work.width * goal.walkLimit ||
      bottom(here.work) - target.y > here.work.height * 0.45;
    if (far || (goal.kind === 'summon' && !this.onGround())) {
      return this.poof(target, this.surfaceAt(target), goal.kind);
    }
    if (!this.onGround()) return this.hopDown();

    const ground = this.groundRange();
    if (Math.abs(target.y - this.groundY()) <= 2 * this.cfg.px) {
      // On the ground: walk there, then step onto the exact spot.
      if (Math.abs(target.x - this.x) > 1) return this.walkTo(target.x, 'decide', goal.speedMul);
      return this.reachGoal(goal, target);
    }
    // Somewhere up high: walk to a run-up spot, then jump.
    const dir = Math.sign(target.x - this.x) || this.facing;
    const run = Math.min(Math.abs(target.x - this.x), 48 * this.cfg.scale);
    const launchX = clamp(target.x - dir * run, ground.min, ground.max);
    if (Math.abs(launchX - this.x) > 2) return this.walkTo(launchX, 'decide', goal.speedMul);
    this.jumpTo(target, this.surfaceAt(target), 'happy');
  }

  private reachGoal(goal: Goal, target: Point): void {
    this.goal = null;
    this.x = target.x;
    this.y = target.y;
    this.surface = this.surfaceAt(target);
    if (goal.kind === 'home') this.emit({ type: 'arrived-home' });
    else this.setHome({ ...target, ground: this.surface.kind === 'ground' });
    if (this.cfg.movement === 'roam') this.lingerUntil = this.now + between(this.rng, 30, 45) * 1000;
    this.lounge(3, 8);
  }

  private setHome(home: Home): void {
    this.cfg = { ...this.cfg, home };
    this.emit({ type: 'home-changed', home });
  }

  private atHome(): boolean {
    return !!this.cfg.home && distance(this.here(), this.reachable(this.cfg.home)) <= ARRIVE_EPS;
  }

  /** `p`, nudged so the whole sprite fits inside its monitor's work area (e.g. after growing). */
  private reachable(p: Point): Point {
    const w = this.monitor(p).work;
    const half = this.half();
    return { x: clamp(p.x, w.x + half, right(w) - half), y: p.y };
  }

  // -------------------------------------------------------------------------
  // Reactions
  // -------------------------------------------------------------------------

  private registerPoke(): boolean {
    this.pokes = this.pokes.filter((t) => this.now - t < 2000);
    this.pokes.push(this.now);
    if (this.pokes.length < 5) return false;
    this.pokes = [];
    return true;
  }

  private dizzy(): void {
    if (this.activity === 'drag' || AIRBORNE.has(this.activity) || this.eating()) return;
    this.emit({ type: 'dizzy' });
    this.setActivity('dizzy', 'idle', 1.2, () => this.finish(true));
  }

  private startTreat(): void {
    if (this.activity === 'sleep') this.emit({ type: 'woke', grumpy: false });
    this.noSleepUntil = this.now + NO_SLEEP_AFTER_WAKE_MS;
    this.emit({ type: 'treat-incoming', ms: CATCH_S * 1000 });
    this.setActivity('catch', 'happy', CATCH_S, () => {
      this.emit({ type: 'eat-start', ms: EAT_S * 1000 });
      this.setActivity('eat', 'eat', EAT_S, () => {
        this.emit({ type: 'ate' });
        this.finish(true);
      });
    });
  }

  private fallAsleep(forced: boolean): void {
    this.perchPlan = null;
    this.forcedNapUntil = forced ? this.now + FORCED_NAP_MS : 0;
    this.setActivity('sleep', 'sleep');
    this.emit({ type: 'fell-asleep', forced });
  }

  private wake(grumpy: boolean): void {
    if (this.activity !== 'sleep') return;
    this.forcedNapUntil = 0;
    this.noSleepUntil = this.now + NO_SLEEP_AFTER_WAKE_MS;
    if (grumpy) this.shakeUntil = this.now + 450;
    this.emit({ type: 'woke', grumpy });
    this.setActivity('waking', 'idle', 1.2, () => this.finish(false));
  }

  private watchCursor(): void {
    const c = this.world.cursor;
    const lookable = this.activity === 'idle' || this.activity === 'sit' || this.activity === 'walk';
    if (!this.cfg.cursorAwareness || !c || !lookable) {
      this.cursorNear = false;
      return;
    }
    const size = this.spriteSize();
    const d = distance({ x: this.x, y: this.y - size / 2 }, c);
    const dx = c.x - this.x;
    // Hysteresis so it does not flip-flop while you hover right above it.
    const faceCursor = () => {
      if (Math.abs(dx) > 3 * this.cfg.px) this.facing = dx > 0 ? 1 : -1;
    };
    if (d < 3 * size && this.activity !== 'walk') faceCursor();

    const near = d < 1.5 * size;
    if (near && !this.cursorNear && this.now >= this.noticeAfter) {
      this.noticeAfter = this.now + NOTICE_COOLDOWN_MS;
      this.emit({ type: 'notice' });
      // Roaming pets sometimes stop to have a look.
      if (this.activity === 'walk' && !this.goal && this.rng() < 0.4) {
        this.perchPlan = null;
        faceCursor();
        this.setActivity('idle', 'idle', between(this.rng, 1.5, 3), () => this.decide());
      }
    }
    this.cursorNear = near;
  }

  // -------------------------------------------------------------------------
  // Movement primitives
  // -------------------------------------------------------------------------

  private walkTo(x: number, then: WalkThen, speedMul = 1): void {
    this.walkTarget = x;
    this.walkThen = then;
    this.walkSpeedMul = speedMul;
    if (Math.abs(x - this.x) < 1) return this.arrive();
    this.facing = x > this.x ? 1 : -1;
    this.setActivity('walk', 'walk');
  }

  private arrive(): void {
    if (this.walkThen === 'perch') return this.leapToPerch();
    if (this.walkThen === 'decide') return this.decide();
    this.lounge(2, 8);
  }

  /** Ballistic arc to `to`, peaking `extra` px above the higher end. */
  private jumpTo(to: Point, land: Surface, anim: AnimationName, extra = 8 * this.cfg.px): void {
    const g = GRAVITY * this.cfg.scale;
    const rise = this.y - to.y;
    const apex = Math.max(0, rise) + extra;
    const up = Math.sqrt((2 * apex) / g);
    const down = Math.sqrt((2 * (apex - rise)) / g);
    this.jump = { x0: this.x, y0: this.y, x1: to.x, y1: to.y, vy0: -g * up, duration: up + down, land };
    if (Math.abs(to.x - this.x) > 1) this.facing = to.x > this.x ? 1 : -1;
    this.squashBy(-1, 120);
    this.setActivity('jump', anim);
  }

  private startFall(vx: number, vy: number, opts: { ignorePerch?: boolean; fromDrop?: boolean } = {}): void {
    if (this.activity === 'sleep') this.emit({ type: 'woke', grumpy: true });
    this.jump = null;
    this.fall = { vx, vy, ignorePerch: opts.ignorePerch ?? false, fromDrop: opts.fromDrop ?? false };
    this.setActivity('fall', 'fall');
  }

  private poof(to: Point, land: Surface, tag?: string, skipOut = false): void {
    this.jump = this.fall = null;
    this.poofPlan = { to, land, tag, moved: false, shown: false };
    if (!skipOut) this.emit({ type: 'poof', phase: 'out', tag });
    this.setActivity('poof', 'idle');
    if (skipOut) this.t = POOF_OUT;
  }

  private land(y: number, surface: Surface, vy: number): void {
    const fromDrop = this.fall?.fromDrop ?? false;
    this.y = y;
    this.surface = surface;
    this.fall = this.jump = null;
    const impact = clamp(vy / (1800 * this.cfg.scale), 0, 1);
    this.squashBy(1 + Math.round(impact * 2), 220);
    this.emit({ type: 'landed', impact });
    // Only the ground: a window top is no place to call home (windows move and close).
    if (fromDrop && surface.kind === 'ground') this.setHome({ x: Math.round(this.x), y: Math.round(y), ground: true });
    this.setActivity('idle', 'idle', 0.35, () => this.finish(fromDrop));
  }

  // -------------------------------------------------------------------------
  // Per-tick updates
  // -------------------------------------------------------------------------

  private update(dt: number): void {
    switch (this.activity) {
      case 'walk':
        this.updateWalk(dt);
        break;
      case 'jump':
        this.updateJump();
        break;
      case 'fall':
        this.updateFall(dt);
        break;
      case 'poof':
        this.updatePoof();
        break;
      default:
        if (this.turnAt && this.now >= this.turnAt) {
          this.turnAt = 0;
          this.facing = this.facing === 1 ? -1 : 1;
        }
        if (this.duration > 0 && this.t >= this.duration) {
          const after = this.after;
          this.after = null;
          this.duration = 0;
          after?.();
        }
    }
    if (!AIRBORNE.has(this.activity) && this.activity !== 'drag') this.followSurface();
  }

  private updateWalk(dt: number): void {
    const speed = WALK_SPEED[this.cfg.roamSpeed] * this.cfg.scale * this.cfg.speed * this.walkSpeedMul;
    const dx = this.walkTarget - this.x;
    const step = speed * dt;
    if (Math.abs(dx) <= step) {
      this.x = this.walkTarget;
      return this.arrive();
    }
    this.x += Math.sign(dx) * step;
    this.facing = dx > 0 ? 1 : -1;
  }

  private updateJump(): void {
    const j = this.jump!;
    const g = GRAVITY * this.cfg.scale;
    const t = Math.min(this.t, j.duration);
    this.x = j.x0 + (j.x1 - j.x0) * (t / j.duration);
    this.y = j.y0 + j.vy0 * t + 0.5 * g * t * t;
    if (this.t >= j.duration) {
      this.x = j.x1;
      this.land(j.y1, j.land, j.vy0 + g * j.duration);
    }
  }

  private updateFall(dt: number): void {
    const f = this.fall!;
    const g = GRAVITY * this.cfg.scale;
    const prevY = this.y;
    f.vy += g * dt;
    this.x += f.vx * dt;
    this.y += f.vy * dt;

    // Bounce off the sides and top of the current monitor.
    const m = this.monitor();
    const half = this.half();
    if (this.x < m.work.x + half) {
      this.x = m.work.x + half;
      f.vx = Math.abs(f.vx) * 0.5;
    } else if (this.x > right(m.work) - half) {
      this.x = right(m.work) - half;
      f.vx = -Math.abs(f.vx) * 0.5;
    }
    const ceiling = m.work.y + this.spriteSize();
    if (this.y < ceiling) {
      this.y = ceiling;
      f.vy = Math.abs(f.vy) * 0.3;
    }
    if (Math.abs(f.vx) > 1) this.facing = f.vx > 0 ? 1 : -1;

    const fg = this.foreground();
    if (!f.ignorePerch && fg && f.vy > 0 && prevY <= fg.y && this.y >= fg.y) {
      const range = this.perchRange(fg);
      if (range && this.x >= range.min && this.x <= range.max) {
        this.perchStrolls = 0;
        return this.land(fg.y, { kind: 'perch', rect: fg }, f.vy);
      }
    }
    const ground = bottom(m.work);
    if (this.y >= ground) this.land(ground, { kind: 'ground' }, f.vy);
  }

  private updatePoof(): void {
    const p = this.poofPlan!;
    if (!p.moved && this.t >= POOF_OUT) {
      p.moved = true;
      this.x = p.to.x;
      this.y = p.to.y;
      this.surface = p.land;
    }
    if (!p.shown && this.t >= POOF_OUT + POOF_GAP) {
      // Shown a beat after moving so the window has caught up.
      p.shown = true;
      this.emit({ type: 'poof', phase: 'in', tag: p.tag });
      this.squashBy(-2, 250);
    }
    if (this.t >= POOF_OUT + POOF_GAP + POOF_IN) {
      this.poofPlan = null;
      this.finish(false);
    }
  }

  /** Keep standing on whatever we stand on (the taskbar moves, windows move). */
  private followSurface(): void {
    const s = this.surface;
    if (s.kind === 'ground') {
      // The ground can shrink under us (bigger sprite, taskbar moved): keep walks reachable too.
      const { min, max } = this.groundRange();
      this.x = clamp(this.x, min, max);
      this.walkTarget = clamp(this.walkTarget, min, max);
      // The taskbar moved (auto-hide, display scaling): a home on the ground moves with it.
      const y = this.groundY();
      if (y !== this.y && this.atHome()) this.setHome({ x: this.cfg.home!.x, y, ground: true });
      this.y = y;
    } else if (s.kind === 'perch') {
      this.trackPerch(s);
    }
  }

  private updateSway(dt: number): void {
    let target = 0;
    if (this.activity === 'drag' && dt > 0) {
      const vx = (this.x - this.prevX) / dt;
      this.dragVx += (vx - this.dragVx) * 0.3;
      // The body lags behind the hand: offset against the motion.
      target = clamp((-this.dragVx / (500 * this.cfg.scale)) * 3, -3, 3);
    }
    this.sway += (target - this.sway) * Math.min(1, dt * 10);
    this.prevX = this.x;
  }

  // -------------------------------------------------------------------------
  // Output & helpers
  // -------------------------------------------------------------------------

  private output(): BrainOutput {
    const events = this.events;
    this.events = [];
    const p = this.poofPlan;
    const hidden = this.activity === 'poof' && p !== null && !p.shown && this.t >= 0.1;
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      anim: this.anim,
      animStart: this.animStart,
      squash: this.currentSquash(),
      lift: this.lift(),
      sway: this.sway,
      shake: this.activity === 'dizzy' || this.now < this.shakeUntil,
      visible: !hidden,
      sleeping: this.activity === 'sleep',
      activity: this.activity,
      events,
    };
  }

  private lift(): number {
    if (this.activity === 'jump' && this.jump) return Math.max(0, this.jump.y1 - this.y);
    if (this.activity === 'fall') return Math.max(0, this.groundY() - this.y);
    if (this.activity === 'drag') return 10 * this.cfg.px;
    return 0;
  }

  private currentSquash(): number {
    const k = 1 - (this.now - this.squashStart) / this.squashMs;
    if (k > 0) return this.squashAmount * k;
    // Stretch a little while rising.
    if (this.activity === 'jump' && this.jump && this.t < this.jump.duration / 2) return -1;
    return 0;
  }

  private squashBy(amount: number, ms: number): void {
    this.squashAmount = amount;
    this.squashStart = this.now;
    this.squashMs = ms;
  }

  private setActivity(activity: Activity, anim: AnimationName, duration = 0, after: (() => void) | null = null): void {
    // A treat cut short (a fall, a drag, a poof) is served again once things settle.
    if (this.eating() && this.after) this.pendingTreats = Math.min(3, this.pendingTreats + 1);
    this.activity = activity;
    this.t = 0;
    this.duration = duration;
    this.after = after;
    this.turnAt = 0;
    this.anim = anim;
    this.animStart = this.now;
  }

  private emit(event: BrainEvent): void {
    this.events.push(event);
  }

  private here(): Point {
    return { x: this.x, y: this.y };
  }

  private monitor(p: Point = this.here()): MonitorArea {
    return monitorAt(this.world.monitors, aboveFeet(p));
  }

  private groundY(p: Point = this.here()): number {
    return bottom(this.monitor(p).work);
  }

  private groundRange(): { min: number; max: number } {
    const w = this.monitor().work;
    const half = this.half();
    return { min: w.x + half, max: right(w) - half };
  }

  /** On the ground (a spot at ground level counts, and becomes ground). */
  private onGround(): boolean {
    if (this.surface.kind === 'ground') return true;
    if (this.surface.kind === 'spot' && Math.abs(this.y - this.groundY()) <= 1) {
      this.surface = { kind: 'ground' };
      return true;
    }
    return false;
  }

  private surfaceAt(p: Point): Surface {
    return Math.abs(p.y - this.groundY(p)) <= 1 ? { kind: 'ground' } : { kind: 'spot' };
  }

  /** Catching or eating a treat. */
  private eating(): boolean {
    return this.activity === 'catch' || this.activity === 'eat';
  }

  private spriteSize(): number {
    return SPRITE_SIZE * this.cfg.px;
  }

  private half(): number {
    return this.spriteSize() / 2;
  }
}

function samePoint(a: Point | null, b: Point | null): boolean {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
}
