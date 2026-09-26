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
import { cursorPosition } from '@tauri-apps/api/window';
import { onPetAction, onSettingsChanged, type PetAction } from '$lib/events';
import { ipc, loadState, updateSettings } from '$lib/ipc';
import { SIZE_RANGE, normalizeSettings, type Home, type Settings } from '$lib/settings';
import { PETS, getPet, type PetDefinition } from '$pets';
import { Brain, type Activity, type BrainConfig, type BrainEvent, type Pose } from './brain';
import { Effects } from './effects';
import { aboveFeet, clamp, contains, defaultHome, groundHome, monitorAt, right, type Point } from './geometry';
import { Input } from './input';
import { showPetMenu } from './menu';
import { Needs } from './needs';
import { Renderer } from './renderer';
import { Chatter, type ChatEvent } from './speech';
import { Stage, computeLayout, type Layout } from './stage';
import { World } from './world';

const KEEP_ON_TOP_MS = 3000;
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

const onScreen = (p: Point) => world.monitors.some((m) => contains(m.bounds, p, 2));

/** Optimistically adopt a new home, then persist it (Rust broadcasts it back). */
function setHome(home: Home): void {
  settings = { ...settings, home };
  updateSettings({ home }).catch(warn('saving home'));
}

/**
 * Fit home to the current monitors: a home on a monitor that went away moves to the
 * default, and a ground home follows the taskbar edge. Returns true if it changed.
 */
function settleHome(): boolean {
  const home = settings.home;
  const next = home && onScreen(home) ? groundHome(home, world.monitors) : defaultHome(world.monitors);
  if (home && next.x === home.x && next.y === home.y && next.ground === home.ground) return false;
  setHome(next);
  return true;
}

settleHome();
const start = settings.home ?? defaultHome(world.monitors);

// Sized for the monitor the pet starts on (the window moves there before it is shown).
let layout: Layout = computeLayout(settings.size, monitorAt(world.monitors, aboveFeet(start)).scale);
const stage = new Stage(layout);
const renderer = new Renderer(canvas);
const effects = new Effects(fxLayer);
const needs = new Needs(saved.stats, pet.id, settings.needs);
const chatter = new Chatter(Math.random, pet.lines);

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
  start,
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
  settleHome();

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
  // Poof, and swap sprites while hidden (see the 'poof' event). No poof mid-drag, mid-air or while paused.
  if (input.dragging || suppressed || !brain.poofInPlace('swap')) applyPet(next);
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
    // The popup made the pet window the active one: give the keyboard back to the user's app.
    ipc.restoreForeground().catch(() => {});
  }
}

// --- Frame loop --------------------------------------------------------------
//
// The pet runs all day, so it should cost next to nothing while nothing happens: display
// rate only while something moves or the cursor is close, otherwise a calm ~10 Hz.

/** Activities with nothing quick on screen (their animations run at 1-3 fps). */
const CALM = new Set<Activity>(['idle', 'sit', 'sleep', 'waking']);
const CALM_FRAME_MS = 80;
/** Cursor polling near the pet: hover hit-testing must keep up so clicks never fall through. */
const CURSOR_NEAR_MS = 33;
/** Elsewhere: just often enough to see the cursor coming. */
const CURSOR_FAR_MS = 150;

let pose: Pose | null = null;
let lastTime = performance.now();
let lastFrameAt = 0;

/** Hover hit-testing (unless click-through) and cursor awareness need the cursor. */
const needCursor = () => !suppressed && (!settings.clickThrough || settings.cursorAwareness);

/** On or carrying the pet, or within about a window's size of its window. */
function cursorNear(): boolean {
  if (input.hovered || input.dragging) return true;
  const c = world.cursor;
  if (!c || !needCursor()) return false;
  const { width, height } = stage.layout;
  return contains({ ...stage.position, width, height }, c, width);
}

/** Worth drawing at display rate: something moves quickly, or the cursor is close. */
function busy(): boolean {
  if (suppressed) return false;
  if (menuOpen || cursorNear()) return true;
  return !!pose && !(CALM.has(pose.activity) && pose.squash === 0 && !pose.shake);
}

function frame(now: number): void {
  // rAF and the keep-alive timer take their timestamps differently: keep time monotonic.
  now = Math.max(now, lastTime);
  const dt = clamp((now - lastTime) / 1000, 0, 0.1);
  lastTime = now;
  lastFrameAt = now;

  const wasSuppressed = suppressed;
  // Only step aside when the fullscreen app is on *our* monitor.
  const fullscreen = world.env.fullscreenMonitor;
  suppressed = settings.hideInFullscreen && !!fullscreen && contains(fullscreen, aboveFeet(brain.position));
  if (suppressed !== wasSuppressed) updateOpacity();

  if (input.dragging) world.pollCursor(now, 0);
  else if (needCursor()) world.pollCursor(now, cursorNear() ? CURSOR_NEAR_MS : CURSOR_FAR_MS);
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
    const work = monitorAt(world.monitors, aboveFeet(pose)).work;
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
  try {
    frame(now);
  } finally {
    // Always ask for the next frame, so an exception in this one cannot stop the pet. Paced
    // by the pose just computed, so a hop that starts now gets display rate from its start.
    if (busy()) requestAnimationFrame(loop);
    else setTimeout(() => requestAnimationFrame(loop), CALM_FRAME_MS);
  }
}

// --- Start -------------------------------------------------------------------

renderer.setPet(pet);
renderer.setLayout(layout);
effects.setPet(pet.name, pet.accent);
effects.setLayout(layout);
updateOpacity();
stage.setIgnoreCursor(true);
stage.setAlwaysOnTop(settings.alwaysOnTop);
world.onMonitorsChanged = () => {
  // A monitor went away with our home on it, or the taskbar moved under a ground home.
  const lost = !settings.home || !onScreen(settings.home);
  if (!settleHome()) return;
  brain.setMonitors(world.monitors);
  brain.setConfig(brainConfig());
  if (lost) brain.goHome();
};
// Listen before the first move: landing on a monitor with another scale fires this.
await stage.win.onScaleChanged(({ payload }) => {
  void world.refreshMonitors();
  void relayout(payload.scaleFactor);
});
await stage.resize(layout).catch(warn('setSize'));
await stage.place(brain.position);
// In case the window ended up on another monitor than planned.
const windowScale = await stage.win.scaleFactor().catch(() => layout.scale);
if (windowScale !== layout.scale) await relayout(windowScale);
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

await onSettingsChanged(applySettings);
await onPetAction(act);

setInterval(() => {
  // Windows can drop topmost windows below the taskbar; re-assert now and then.
  if (settings.alwaysOnTop && !suppressed && !menuOpen) ipc.keepPetOnTop().catch(() => {});
}, KEEP_ON_TOP_MS);
