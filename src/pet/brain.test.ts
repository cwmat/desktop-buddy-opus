import { describe, expect, it } from 'vitest';
import type { EnvironmentSnapshot, ForegroundWindow } from '$lib/ipc';
import type { Home, MovementMode } from '$lib/settings';
import { Brain, type BrainConfig, type BrainEvent, type BrainOutput } from './brain';
import type { MonitorArea, Point } from './geometry';

// One 1920×1080 monitor with a 40 px taskbar: the ground is y = 1040.
const MONITOR: MonitorArea = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  work: { x: 0, y: 0, width: 1920, height: 1040 },
  scale: 1,
  primary: true,
};
// A second one to its left, at negative x (a common real setup).
const LEFT: MonitorArea = {
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  work: { x: -1920, y: 0, width: 1920, height: 1040 },
  scale: 1,
  primary: false,
};
const GROUND = 1040;
const HOME: Home = { x: 1600, y: GROUND, ground: true };
const WINDOW: ForegroundWindow = { id: 1, x: 600, y: 400, width: 800, height: 500 };
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

/** A brain plus a tiny simulation clock. `monitors` can be edited mid-run. */
function sim(overrides: Partial<BrainConfig> = {}, start: Point = HOME, screens: MonitorArea[] = [MONITOR]) {
  let now = 0;
  const env: EnvironmentSnapshot = { idleSeconds: 0, foregroundWindow: null, fullscreenMonitor: null };
  const monitors = [...screens];
  const brain = new Brain({ config: config(overrides), start, monitors, now, rng: seeded() });
  const events: BrainEvent[] = [];
  let last!: BrainOutput;
  const step = () => {
    now += DT * 1000;
    last = brain.tick({ now, dt: DT, cursor: null, env, monitors });
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
  const saw = (type: BrainEvent['type']) => events.some((e) => e.type === type);
  return { brain, env, monitors, events, run, step, saw, out: () => last };
}

/** Drop the pet (roam mode) onto `window` and wait until it stands on it. */
function perchOn(s: ReturnType<typeof sim>, window: ForegroundWindow = WINDOW) {
  s.env.foregroundWindow = window;
  s.step();
  s.brain.startDrag();
  s.brain.dragTo({ x: window.x + 300, y: window.y - 150 });
  s.step();
  s.brain.drop({ x: 0, y: 0 });
  expect(s.run(5, () => s.saw('landed'))).toBe(true);
  expect(s.out().y).toBe(window.y);
  expect(s.brain.perched).toBe(true);
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
    const edge = { x: 1915, y: GROUND, ground: true };
    const s = sim({ movement: 'stay', home: edge }, edge);
    let walked = 0;
    s.run(30, (o) => {
      if (o.activity === 'walk') walked++;
      return false;
    });
    expect(s.out().x).toBe(1920 - 48);
    expect(walked).toBeLessThan(30);
  });

  it.each<[string, Home, MonitorArea[], number]>([
    ['right', { x: 1872, y: GROUND, ground: true }, [MONITOR], 1920 - 64],
    ['left', { x: -1872, y: GROUND, ground: true }, [LEFT, MONITOR], -1920 + 64],
  ])('launches fine beside an edge home that no longer fits (%s edge, grown sprite)', (_, home, screens, x) => {
    // The home was saved at the edge for size px 3; at px 4 the sprite needs 64 px of room.
    const s = sim({ movement: 'stay', px: 4, home }, home, screens);
    s.brain.appear();
    expect(() => s.run(3)).not.toThrow();
    expect(s.out().x).toBeCloseTo(x, 0);
  });

  it('wakes up and heads home after switching to stay mode during a nap away from home', () => {
    const s = sim({ movement: 'roam' }, { x: 600, y: GROUND });
    s.step();
    s.brain.nap();
    s.step();
    expect(s.out().activity).toBe('sleep');
    s.brain.setConfig(config({ movement: 'stay' }));
    s.brain.wakeUp();
    expect(s.run(5, (o) => o.activity !== 'sleep' && o.activity !== 'waking')).toBe(true);
    expect(s.run(30, () => s.saw('arrived-home'))).toBe(true);
  });

  it('still arrives when the sprite grows during a walk to the screen edge', () => {
    const s = sim({ movement: 'stay' }, { x: 1700, y: GROUND });
    s.step();
    s.brain.summon({ x: 1919, y: 500 });
    s.step();
    expect(s.out().activity).toBe('walk');
    s.brain.setConfig(config({ movement: 'stay', px: 4 }));
    expect(s.run(10, () => s.saw('home-changed'))).toBe(true);
    expect(s.out().x).toBe(1920 - 64);
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: 1920 - 64, y: GROUND, ground: true } });
  });

  it('keeps its ground home on the ground when the taskbar moves', () => {
    const s = sim({ movement: 'stay' });
    s.run(2);
    // Taskbar set to auto-hide: the work area now reaches the bottom of the screen.
    s.monitors[0] = { ...MONITOR, work: { ...MONITOR.work, height: 1080 } };
    const ys: number[] = [];
    s.run(40, (o) => {
      if (o.activity !== 'jump') ys.push(o.y);
      return false;
    });
    expect(ys.every((y) => y === 1080)).toBe(true);
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: HOME.x, y: 1080, ground: true } });
  });

  it('walks home along the bottom edge of a monitor stacked above another', () => {
    // No taskbar up there: its ground is the top edge of the monitor below (listed first).
    const upper: MonitorArea = {
      bounds: { x: 0, y: -1080, width: 1920, height: 1080 },
      work: { x: 0, y: -1080, width: 1920, height: 1080 },
      scale: 1,
      primary: false,
    };
    const home: Home = { x: 900, y: 0, ground: true };
    const s = sim({ movement: 'stay', home }, { x: 500, y: 0 }, [MONITOR, upper]);
    expect(s.run(20, () => s.saw('arrived-home'))).toBe(true);
    expect(s.saw('poof')).toBe(false);
    expect(s.out()).toMatchObject({ x: 900, y: 0 });
  });

  it('roam-when-idle: roams while you are away and heads home when you return', () => {
    const s = sim({ movement: 'roam-when-idle' });
    s.run(5);
    expect(Math.abs(s.out().x - HOME.x)).toBeLessThan(1);

    s.env.idleSeconds = 3 * 60 + 1;
    const wandered = s.run(60, (o) => Math.abs(o.x - HOME.x) > 50);
    expect(wandered).toBe(true);

    s.env.idleSeconds = 0;
    const home = s.run(90, () => s.saw('arrived-home'));
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
    expect(s.run(5, () => s.saw('landed'))).toBe(true);
    expect(s.out().y).toBe(GROUND);
    expect(s.out().x).toBeCloseTo(900, 0);
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: 900, y: GROUND, ground: true } });
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
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: 700, y: 500, ground: false } });
  });

  it('stay: a pet dropped just above the taskbar snaps onto it, as a ground home', () => {
    const s = sim({ movement: 'stay' });
    s.step();
    s.brain.startDrag();
    s.brain.dragTo({ x: 700, y: GROUND - 5 });
    s.step();
    s.brain.drop({ x: 0, y: 0 });
    s.step();
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: 700, y: GROUND, ground: true } });
  });

  it('lands on a window (without calling it home), then falls when the window goes away', () => {
    const s = sim({ movement: 'roam' });
    perchOn(s);
    expect(s.saw('home-changed')).toBe(false);

    s.env.foregroundWindow = null;
    s.events.length = 0;
    expect(s.run(4, () => s.saw('landed'))).toBe(true);
    expect(s.out().y).toBe(GROUND);
  });

  it('follows a perch when its window moves or resizes', () => {
    const s = sim({ movement: 'roam' });
    perchOn(s);
    const x = s.out().x;

    s.env.foregroundWindow = { ...WINDOW, x: 650, y: 380, width: 900 };
    s.step();
    expect(s.out().y).toBe(380);
    expect(s.out().x).toBeCloseTo(x + 50, 0);
  });

  it('falls instead of teleporting when another window of the same size comes to the front', () => {
    const s = sim({ movement: 'roam' });
    perchOn(s);
    s.events.length = 0;

    s.env.foregroundWindow = { ...WINDOW, id: 2, x: 1000, y: 300 };
    s.step();
    expect(s.out().y).not.toBe(300);
    expect(s.run(4, () => s.saw('landed'))).toBe(true);
    expect(s.out().y).toBe(GROUND);
  });

  it('only counts as perched on (or on the way up to) a window', () => {
    const s = sim({ movement: 'roam' });
    s.env.foregroundWindow = WINDOW;
    // Wait for a run-up towards the window, then interrupt it with a pat.
    const approaching = s.run(300, (o) => o.activity === 'walk' && o.y === GROUND && s.brain.perched);
    expect(approaching).toBe(true);
    s.brain.pat();
    s.env.foregroundWindow = null;
    s.step();
    expect(s.brain.perched).toBe(false);
  });

  it('eats a treat', () => {
    const s = sim({ movement: 'stay' });
    s.step();
    expect(s.brain.treat()).toBe(true);
    s.step();
    expect(s.saw('treat-incoming')).toBe(true);
    expect(s.run(2, (o) => o.anim === 'eat')).toBe(true);
    expect(s.run(3, () => s.saw('ate'))).toBe(true);
  });

  it('finishes its treat when clicked excitedly while eating', () => {
    const s = sim({ movement: 'stay' });
    s.step();
    s.brain.treat();
    s.run(1);
    // Singles and doubles, the fifth click in a row would make it dizzy.
    for (let i = 0; i < 5; i++) {
      s.brain.poke(i % 2 === 1);
      s.step();
    }
    s.run(5);
    expect(s.events.filter((e) => e.type === 'ate')).toHaveLength(1);
  });

  it('still gets its treat when it falls off a window mid-meal', () => {
    const s = sim({ movement: 'roam' });
    perchOn(s);
    s.brain.treat();
    s.env.foregroundWindow = null;
    s.run(8);
    expect(s.saw('ate')).toBe(true);
    expect(s.out().y).toBe(GROUND);
  });

  it('does not poof mid-air, so a dropped pet still lands and makes that home', () => {
    const s = sim({ movement: 'roam' });
    s.step();
    s.brain.startDrag();
    s.brain.dragTo({ x: 900, y: 300 });
    s.step();
    s.brain.drop({ x: 0, y: 0 });
    s.run(0.2);
    expect(s.brain.poofInPlace('swap')).toBe(false);
    expect(s.run(5, () => s.saw('landed'))).toBe(true);
    expect(s.events).toContainEqual({ type: 'home-changed', home: { x: 900, y: GROUND, ground: true } });
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

  it('survives a long, chaotic session across two monitors without getting stuck', () => {
    const s = sim({ movement: 'roam', roamSpeed: 'zoomy' }, HOME, [LEFT, MONITOR]);
    const rng = seeded(42);
    const modes: MovementMode[] = ['roam', 'stay', 'roam-when-idle'];
    let home = HOME;
    let animStart = -1;
    let changedAt = 0;
    for (let i = 0; i < 20 * 60 * 30; i++) {
      if (i % 300 === 0) {
        const r = rng();
        s.env.idleSeconds = r < 0.3 ? 1000 : 0;
        s.env.foregroundWindow =
          r < 0.6 ? { id: 1 + Math.floor(r * 3), x: -1500 + Math.round(r * 2400), y: 300, width: 900, height: 600 } : null;
        const pick = rng();
        if (pick < 0.08) s.brain.treat();
        else if (pick < 0.16) s.brain.poke(pick < 0.12);
        else if (pick < 0.22) s.brain.goHome();
        else if (pick < 0.28) s.brain.summon({ x: pick < 0.25 ? -1500 : 300, y: 500 });
        else if (pick < 0.32) s.brain.appear();
        else if (pick < 0.36) s.brain.poofInPlace('swap');
        else if (pick < 0.4) s.brain.nap();
        else if (pick < 0.44) s.brain.wakeUp();
        else if (pick < 0.54) {
          const movement = modes[Math.floor(rng() * modes.length)];
          s.brain.setConfig(config({ movement, roamSpeed: 'zoomy', px: rng() < 0.5 ? 3 : 4, home }));
        }
      }
      const o = s.step();
      for (const e of o.events) if (e.type === 'home-changed') home = e.home;
      expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true);
      expect(o.x).toBeGreaterThanOrEqual(-1920);
      expect(o.x).toBeLessThanOrEqual(1920);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeLessThanOrEqual(1080);
      // Alive: unless asleep, it moves on to something new every so often.
      if (o.animStart !== animStart || o.activity === 'sleep') {
        animStart = o.animStart;
        changedAt = i;
      }
      expect((i - changedAt) * DT).toBeLessThan(30);
    }
  });

  it('gets dizzy when poked too much', () => {
    const s = sim({ movement: 'stay' });
    s.step();
    for (let i = 0; i < 5; i++) {
      s.brain.poke(false);
      s.step();
    }
    expect(s.saw('dizzy')).toBe(true);
    expect(s.out().shake).toBe(true);
  });
});
