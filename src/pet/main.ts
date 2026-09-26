/**
 * Pet overlay window. Wires the pieces together and runs the frame loop:
 *
 *   world (monitors, cursor, environment) ─┐
 *   input (clicks, drags, wheel, menu) ────┼─> brain (behaviour) ─> stage (window position)
 *   actions & settings events ─────────────┘        │             └> renderer + effects
 *                                                   └─ events ─> needs, speech, persistence
 */
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import './pet.css';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import { onPetAction, onSettingsChanged, type PetAction } from '$lib/events';
import { ipc, loadState, updateSettings } from '$lib/ipc';
import { SIZE_RANGE, normalizeSettings, type Settings } from '$lib/settings';
import { PETS, getPet, type PetDefinition } from '$pets';
import { Brain, type BrainConfig, type BrainEvent, type Pose } from './brain';
import { Effects } from './effects';
import { clamp, contains, defaultHome, monitorAt, right, type Point } from './geometry';
import { Input } from './input';
import { showPetMenu } from './menu';
import { Needs } from './needs';
import { Renderer } from './renderer';
import { Chatter, type ChatEvent } from './speech';
import { Stage, computeLayout, type Layout } from './stage';
import { World } from './world';

const KEEP_ON_TOP_MS = 3000;
const PERCH_HOLD_AFTER_MENU_MS = 8000;
const warn = (what: string) => (e: unknown) => console.warn(`[pet] ${what} failed`, e);

// --- DOM ---------------------------------------------------------------------

const root = document.createElement('div');
root.className = 'stage';
const canvas = document.createElement('canvas');
canvas.className = 'sprite';
const fxLayer = document.createElement('div');
fxLayer.className = 'fx';
root.append(canvas, fxLayer);
document.body.append(root);

// --- State & modules ---------------------------------------------------------

// Without saved state the buddy still shows up, just with defaults.
const saved = await loadState().catch((e) => {
  warn('loading state')(e);
  return { settings: normalizeSettings({}), stats: {} };
});
let settings: Settings = saved.settings;
let pet: PetDefinition = getPet(settings.petId);
/** Buddy we are switching to; applied mid-poof. */
let pendingPet: PetDefinition | null = null;
ipc.registerPets(PETS.map(({ id, name }) => ({ id, name }))).catch(warn('registerPets'));

const world = new World();
await world.refreshMonitors();

let layout: Layout = computeLayout(settings.size, await getCurrentWindow().scaleFactor());
const stage = new Stage(layout);
const renderer = new Renderer(canvas);
const effects = new Effects(fxLayer);
const needs = new Needs(saved.stats, pet.id, settings.needs);
const chatter = new Chatter(Math.random, pet.lines);

const onScreen = (p: Point) => world.monitors.some((m) => contains(m.bounds, p, 2));

/** Optimistically adopt a new home, then persist it (Rust broadcasts it back). */
function setHome(home: Point): void {
  settings = { ...settings, home };
  updateSettings({ home }).catch(warn('saving home'));
}

if (!settings.home || !onScreen(settings.home)) setHome(defaultHome(world.monitors));

function brainConfig(): BrainConfig {
  return {
    movement: settings.movement,
    roamSpeed: settings.roamSpeed,
    idleMinutes: settings.idleMinutes,
    sleepWhenIdle: settings.sleepWhenIdle,
    perchOnWindows: settings.perchOnWindows,
    cursorAwareness: settings.cursorAwareness,
    mood: needs.mood,
    home: settings.home,
    scale: layout.scale,
    px: layout.px,
    speed: pet.traits?.speed ?? 1,
  };
}

const brain = new Brain({
  config: brainConfig(),
  start: settings.home ?? defaultHome(world.monitors),
  monitors: world.monitors,
  now: performance.now(),
});

needs.onChange = (mood) => {
  chatter.setMood(mood);
  brain.setConfig(brainConfig());
};
chatter.setMood(needs.mood);
chatter.setLevel(settings.speech, performance.now());

const input = new Input(root, stage, renderer, {
  click: (double) => {
    if (settings.clickReactions) brain.poke(double);
  },
  dragStart: () => brain.startDrag(),
  dragMove: (anchor) => brain.dragTo(anchor),
  drop: (velocity) => brain.drop(velocity),
  resize: (step) => changeSize(settings.size + step),
  contextMenu: () => void openMenu(),
});

// --- Reacting to the brain ---------------------------------------------------

const chat = (event: ChatEvent) => effects.bubble(chatter.react(event));

function handle(e: BrainEvent): void {
  switch (e.type) {
    case 'patted':
      effects.hearts(2);
      needs.pat();
      chat('pat');
      break;
    case 'dizzy':
      effects.emote('!!');
      chat('dizzy');
      break;
    case 'celebrate':
      effects.sparkles();
      break;
    case 'treat-incoming':
      effects.treat(e.ms);
      break;
    case 'eat-start':
      effects.crumbs(e.ms);
      break;
    case 'ate':
      needs.feed();
      effects.hearts(1);
      chat('treat');
      break;
    case 'fell-asleep':
      effects.hideBubble();
      chat('sleepy');
      break;
    case 'woke':
      if (e.grumpy) effects.emote('anger');
      chat(e.grumpy ? 'grumpy' : 'wake');
      break;
    case 'notice':
      effects.emote(Math.random() < 0.6 ? '!' : '?');
      break;
    case 'drag-start':
      chat('drag');
      break;
    case 'landed':
      if (e.impact > 0.4) effects.dust();
      break;
    case 'poof':
      effects.poof();
      if (e.phase === 'in' && e.tag === 'swap' && pendingPet) applyPet(pendingPet);
      if (e.phase === 'in' && (e.tag === 'swap' || e.tag === 'appear')) chat('greet');
      break;
    case 'home-changed':
      setHome(e.home);
      break;
    case 'hop':
    case 'arrived-home':
      break;
  }
}

function act(action: PetAction): void {
  switch (action.type) {
    case 'treat':
      brain.treat();
      break;
    case 'pat':
      brain.pat();
      break;
    case 'go-home':
      brain.goHome();
      break;
    case 'summon':
      cursorPosition()
        .then((p) => brain.summon({ x: p.x, y: p.y }))
        .catch(() => world.cursor && brain.summon(world.cursor));
      break;
    case 'nap':
      brain.nap();
      break;
    case 'wake':
      brain.wakeUp();
      break;
    case 'say':
      effects.bubble(chatter.say(action.text));
      break;
    case 'celebrate':
      brain.celebrate();
      break;
  }
}

// --- Settings ----------------------------------------------------------------

function applySettings(next: Settings): void {
  const prev = settings;
  settings = next;
  if (!next.home || !onScreen(next.home)) setHome(defaultHome(world.monitors));

  const nextPet = getPet(next.petId);
  if (nextPet.id !== (pendingPet ?? pet).id) swapPet(nextPet);
  if (next.size !== prev.size) void relayout(layout.scale);
  if (next.alwaysOnTop !== prev.alwaysOnTop) stage.setAlwaysOnTop(next.alwaysOnTop);
  if (next.speech !== prev.speech) chatter.setLevel(next.speech, performance.now());
  needs.setEnabled(next.needs);
  brain.setConfig(brainConfig());
  updateOpacity();
}

function swapPet(next: PetDefinition): void {
  pendingPet = next;
  // Poof, and swap sprites while hidden (see the 'poof' event). No poof mid-drag or while paused.
  if (input.dragging || suppressed) applyPet(next);
  else brain.poofInPlace('swap');
}

function applyPet(next: PetDefinition): void {
  pet = next;
  pendingPet = null;
  renderer.setPet(next);
  effects.setPet(next.name, next.accent);
  chatter.setLines(next.lines);
  needs.setPet(next.id);
  brain.setConfig(brainConfig());
}

function changeSize(size: number): void {
  const next = clamp(size, SIZE_RANGE.min, SIZE_RANGE.max);
  if (next !== settings.size) updateSettings({ size: next }).catch(warn('resize'));
}

/** Resize the window for the current size/scale, keeping the feet where they are. */
async function relayout(scale: number): Promise<void> {
  layout = computeLayout(settings.size, scale);
  renderer.setLayout(layout);
  effects.setLayout(layout);
  brain.setConfig(brainConfig());
  await stage.resize(layout).catch(warn('setSize'));
  stage.invalidate();
  await stage.place(brain.position);
}

let suppressed = false;

function updateOpacity(): void {
  // Fullscreen apps: fade out but stay visible, since hidden webviews throttle timers.
  root.style.opacity = suppressed ? '0' : String(settings.opacity);
}

// --- Context menu ------------------------------------------------------------

let menuOpen = false;

async function openMenu(): Promise<void> {
  if (menuOpen) return;
  menuOpen = true;
  // The menu (and our window, afterwards) takes the foreground; keep perches steady meanwhile.
  world.holdForeground(60_000);
  try {
    // No setFocus() needed even though the overlay is unfocusable: the native popup
    // brings its owner to the front itself (allowed, since we just got the click).
    await showPetMenu({
      settings,
      sleeping: brain.sleeping,
      act,
      update: (patch) => void updateSettings(patch).catch(warn('update settings')),
    });
  } catch (e) {
    warn('context menu')(e);
  } finally {
    menuOpen = false;
    world.holdForeground(PERCH_HOLD_AFTER_MENU_MS);
  }
}

// --- Frame loop --------------------------------------------------------------

let pose: Pose | null = null;
let lastTime = performance.now();
let lastFrameAt = 0;

function frame(now: number): void {
  const dt = clamp((now - lastTime) / 1000, 0, 0.1);
  lastTime = now;
  lastFrameAt = now;

  const wasSuppressed = suppressed;
  // Only step aside when the fullscreen app is on *our* monitor.
  const fullscreen = world.env.fullscreenMonitor;
  suppressed = settings.hideInFullscreen && !!fullscreen && contains(fullscreen, brain.position);
  if (suppressed !== wasSuppressed) updateOpacity();

  // ~30 Hz for hover hit-testing and cursor awareness, every frame while carrying.
  const needCursor = !suppressed && (!settings.clickThrough || settings.cursorAwareness);
  world.pollCursor(now, input.dragging ? 0 : needCursor ? 33 : 250);
  input.update(now, world.cursor, settings.clickThrough || suppressed);

  // Paused while fullscreen or while the menu is open (the pet waits for your choice).
  if (!suppressed && !menuOpen) {
    const out = brain.tick({ now, dt, cursor: world.cursor, env: world.env, monitors: world.monitors });
    pose = out;
    for (const e of out.events) handle(e);
    void stage.place(out);
    const bubble = chatter.tick(now, brain.relaxed && !input.dragging);
    if (bubble) effects.bubble(bubble);
  }
  if (pose) {
    renderer.draw(pose, now);
    const work = monitorAt(world.monitors, pose).work;
    const bounds = {
      left: (work.x - stage.position.x) / layout.scale,
      right: (right(work) - stage.position.x) / layout.scale,
      top: (work.y - stage.position.y) / layout.scale,
    };
    effects.update(now, pose, renderer.box, settings.showName && input.hovered && !input.dragging, bounds);
  }
  needs.tick(Date.now());
  world.fastEnv = brain.perched;
}

function loop(now: number): void {
  frame(now);
  requestAnimationFrame(loop);
}

// --- Start -------------------------------------------------------------------

renderer.setPet(pet);
renderer.setLayout(layout);
effects.setPet(pet.name, pet.accent);
effects.setLayout(layout);
updateOpacity();
stage.setIgnoreCursor(true);
stage.setAlwaysOnTop(settings.alwaysOnTop);
await stage.resize(layout).catch(warn('setSize'));
await stage.place(brain.position);
brain.appear();
frame(performance.now());
await stage.win.show();
requestAnimationFrame(loop);
// rAF can stall while the window is occluded; keep the pet alive at a low rate anyway.
setInterval(() => {
  const now = performance.now();
  if (now - lastFrameAt > 200) frame(now);
}, 250);

world.start();
world.onMonitorsChanged = () => {
  // A monitor went away with our home on it: move in somewhere that exists.
  if (settings.home && onScreen(settings.home)) return;
  setHome(defaultHome(world.monitors));
  brain.setConfig(brainConfig());
  brain.goHome();
};

await onSettingsChanged(applySettings);
await onPetAction(act);
await stage.win.onScaleChanged(({ payload }) => {
  void world.refreshMonitors();
  void relayout(payload.scaleFactor);
});

setInterval(() => {
  // Windows can drop topmost windows below the taskbar; re-assert now and then.
  if (settings.alwaysOnTop && !suppressed && !menuOpen) ipc.keepPetOnTop().catch(() => {});
}, KEEP_ON_TOP_MS);
