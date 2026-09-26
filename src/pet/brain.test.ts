import { describe, expect, it } from 'vitest';
import type { EnvironmentSnapshot } from '$lib/ipc';
import { Brain, type BrainConfig, type BrainEvent, type BrainOutput } from './brain';
import type { MonitorArea, Point } from './geometry';

// One 1920×1080 monitor with a 40 px taskbar: the ground is y = 1040.
const MONITOR: MonitorArea = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  work: { x: 0, y: 0, width: 1920, height: 1040 },
  scale: 1,
  primary: true,
};
const GROUND = 1040;
const HOME: Point = { x: 1600, y: GROUND };
const DT = 1 / 30;

function seeded(seed = 7) {
  // mulberry32: tiny deterministic RNG
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function config(overrides: Partial<BrainConfig> = {}): BrainConfig {
  return {
    movement: 'stay',
    roamSpeed: 'normal',
    idleMinutes: 3,
    sleepWhenIdle: true,
    perchOnWindows: true,
    cursorAwareness: true,
    mood: 'content',
    home: HOME,
    scale: 1,
    px: 3,
    speed: 1,
    ...overrides,
  };
}

/** A brain plus a tiny simulation clock. */
function sim(overrides: Partial<BrainConfig> = {}, start: Point = HOME) {
  let now = 0;
  const env: EnvironmentSnapshot = { idleSeconds: 0, foregroundWindow: null, fullscreenMonitor: null };
  const brain = new Brain({ config: config(overrides), start, monitors: [MONITOR], now, rng: seeded() });
  const events: BrainEvent[] = [];
  let last!: BrainOutput;
  const step = () => {
    now += DT * 1000;
    last = brain.tick({ now, dt: DT, cursor: null, env, monitors: [MONITOR] });
    events.push(...last.events);
    return last;
  };
  /** Tick for `seconds`, stopping early once `until` holds. */
  const run = (seconds: number, until?: (out: BrainOutput) => boolean) => {
    for (let i = 0; i < seconds / DT; i++) {
      const out = step();
      if (until?.(out)) return true;
    }
    return false;
  };
  return { brain, env, events, run, step, out: () => last };
}

describe('Brain', () => {
  it('stays put at home in stay mode', () => {
    const s = sim({ movement: 'stay' });
    const xs: number[] = [];
    const ys: number[] = [];
    s.run(120, (o) => {
      xs.push(o.x);
      ys.push(o.y);
      return false;
    });
    expect(xs.every((x) => Math.abs(x - HOME.x) < 1)).toBe(true);
    // Little hops go up, never down or sideways.
    expect(ys.every((y) => y <= HOME.y + 0.5)).toBe(true);
  });

  it('settles as close as it can to a home past the screen edge', () => {
    const edge = { x: 1915, y: GROUND };
    const s = sim({ movement: 'stay', home: edge }, edge);
    let walked = 0;
    s.run(30, (o) => {
      if (o.activity === 'walk') walked++;
      return false;
    });
    expect(s.out().x).toBe(1920 - 48);
    expect(walked).toBeLessThan(30);
  });

  it('roam-when-idle: roams while you are away and heads home when you return', () => {
    const s = sim({ movement: 'roam-when-idle' });
    s.run(5);
    expect(Math.abs(s.out().x - HOME.x)).toBeLessThan(1);

    s.env.idleSeconds = 3 * 60 + 1;
    const wandered = s.run(60, (o) => Math.abs(o.x - HOME.x) > 50);
    expect(wandered).toBe(true);

    s.env.idleSeconds = 0;
    const home = s.run(90, () => s.events.some((e) => e.type === 'arrived-home'));
    expect(home).toBe(true);
    expect(s.out().x).toBeCloseTo(HOME.x, 0);
    expect(s.out().y).toBeCloseTo(HOME.y, 0);
    s.run(5);
    expect(Math.abs(s.out().x - HOME.x)).toBeLessThan(1);
  });

  it('roam: a dropped pet falls to the ground and makes that its home', () => {
    const s = sim({ movement: 'roam' });
    s.step();
    s.brain.startDrag();
    s.brain.dragTo({ x: 900, y: 400 });
    s.step();
    s.brain.drop({ x: 0, y: 0 });
    expect(s.run(5, () => s.events.some((e) => e.type === 'landed'))).toBe(true);
    expect(s.out().y).toBe(GROUND);
    expect(s.out().x).toBeCloseTo(900, 0);
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: 900, y: GROUND } });
  });

  it('stay: a dropped pet stays where it is put', () => {
    const s = sim({ movement: 'stay' });
    s.step();
    s.brain.startDrag();
    s.brain.dragTo({ x: 700, y: 500 });
    s.step();
    s.brain.drop({ x: 0, y: 1500 });
    s.run(3);
    expect(s.out()).toMatchObject({ x: 700, y: 500 });
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: 700, y: 500 } });
  });

  it('lands on a window, then falls when the window goes away', () => {
    const s = sim({ movement: 'roam' });
    s.env.foregroundWindow = { x: 600, y: 400, width: 800, height: 500 };
    s.step();
    s.brain.startDrag();
    s.brain.dragTo({ x: 900, y: 250 });
    s.step();
    s.brain.drop({ x: 0, y: 0 });
    expect(s.run(5, () => s.events.some((e) => e.type === 'landed'))).toBe(true);
    expect(s.out().y).toBe(400);
    expect(s.brain.perched).toBe(true);

    s.env.foregroundWindow = null;
    s.events.length = 0;
    expect(s.run(4, () => s.events.some((e) => e.type === 'landed'))).toBe(true);
    expect(s.out().y).toBe(GROUND);
  });

  it('follows a perch when its window moves', () => {
    const s = sim({ movement: 'roam' });
    s.env.foregroundWindow = { x: 600, y: 400, width: 800, height: 500 };
    s.step();
    s.brain.startDrag();
    s.brain.dragTo({ x: 900, y: 250 });
    s.step();
    s.brain.drop({ x: 0, y: 0 });
    s.run(5, () => s.events.some((e) => e.type === 'landed'));
    const x = s.out().x;

    s.env.foregroundWindow = { x: 650, y: 380, width: 800, height: 500 };
    s.step();
    expect(s.out().y).toBe(380);
    expect(s.out().x).toBeCloseTo(x + 50, 0);
  });

  it('eats a treat', () => {
    const s = sim({ movement: 'stay' });
    s.step();
    expect(s.brain.treat()).toBe(true);
    s.step();
    expect(s.events.some((e) => e.type === 'treat-incoming')).toBe(true);
    expect(s.run(2, (o) => o.anim === 'eat')).toBe(true);
    expect(s.run(3, () => s.events.some((e) => e.type === 'ate'))).toBe(true);
  });

  it('wakes a sleeping pet grumpily when clicked', () => {
    const s = sim({ movement: 'stay' });
    s.env.idleSeconds = 3 * 60 + 5;
    expect(s.run(20, (o) => o.sleeping)).toBe(true);
    s.brain.poke(false);
    s.step();
    expect(s.events).toContainEqual({ type: 'woke', grumpy: true });
    expect(s.out().sleeping).toBe(false);
  });

  it('survives a long, chaotic session on screen', () => {
    const s = sim({ movement: 'roam', roamSpeed: 'zoomy' });
    const rng = seeded(42);
    for (let i = 0; i < 20 * 60 * 30; i++) {
      if (i % 300 === 0) {
        const r = rng();
        s.env.idleSeconds = r < 0.3 ? 1000 : 0;
        s.env.foregroundWindow = r < 0.6 ? { x: 200 + Math.round(r * 600), y: 300, width: 900, height: 600 } : null;
        if (r < 0.1) s.brain.treat();
        else if (r < 0.2) s.brain.poke(r < 0.15);
        else if (r < 0.25) s.brain.goHome();
        else if (r < 0.3) s.brain.summon({ x: 300, y: 500 });
      }
      const o = s.step();
      expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true);
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x).toBeLessThanOrEqual(1920);
      expect(o.y).toBeLessThanOrEqual(1080);
    }
  });

  it('gets dizzy when poked too much', () => {
    const s = sim({ movement: 'stay' });
    s.step();
    for (let i = 0; i < 5; i++) {
      s.brain.poke(false);
      s.step();
    }
    expect(s.events.some((e) => e.type === 'dizzy')).toBe(true);
    expect(s.out().shake).toBe(true);
  });
});
