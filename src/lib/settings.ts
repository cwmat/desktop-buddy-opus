/**
 * User settings: the single source of truth for shape, defaults and UI metadata.
 *
 * Rust persists settings as an opaque JSON object and shallow-merges patches, so every
 * consumer must run incoming data through `normalizeSettings` before trusting it.
 * `SETTING_DEFS` drives both the settings window and the command palette — add a field
 * here and it shows up in both.
 */

export type MovementMode = 'stay' | 'roam' | 'roam-when-idle';
export type RoamSpeed = 'slow' | 'normal' | 'zoomy';
export type SpeechLevel = 'off' | 'rare' | 'normal' | 'chatty';
export type Theme = 'system' | 'light' | 'dark';

/** A point on the virtual desktop in physical pixels. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * The buddy's home: its feet anchor. `ground` homes sit on the taskbar edge and follow
 * it when the work area changes (auto-hide, display scaling, docking); other homes are
 * spots the user placed it at and keep their exact y.
 */
export interface Home extends ScreenPoint {
  ground: boolean;
}

export interface Settings {
  /** Active buddy id (see src/pets). */
  petId: string;
  movement: MovementMode;
  roamSpeed: RoamSpeed;
  /** Minutes without keyboard/mouse input before the user counts as idle. */
  idleMinutes: number;
  /** Sprite pixel size in logical px (the buddy is 32 sprite pixels tall). */
  size: number;
  opacity: number;
  showName: boolean;
  alwaysOnTop: boolean;
  hideInFullscreen: boolean;
  clickReactions: boolean;
  cursorAwareness: boolean;
  perchOnWindows: boolean;
  needs: boolean;
  speech: SpeechLevel;
  sleepWhenIdle: boolean;
  clickThrough: boolean;
  launchAtLogin: boolean;
  paletteHotkey: string;
  theme: Theme;
  /**
   * Where the buddy lives: its feet anchor (bottom-centre of the sprite) in physical px.
   * `null` means "not placed yet" — the pet window picks a spot near the taskbar.
   */
  home: Home | null;
}

export const DEFAULT_SETTINGS: Settings = {
  petId: 'quackers',
  movement: 'roam',
  roamSpeed: 'normal',
  idleMinutes: 3,
  size: 3,
  opacity: 1,
  showName: true,
  alwaysOnTop: true,
  hideInFullscreen: true,
  clickReactions: true,
  cursorAwareness: true,
  perchOnWindows: true,
  needs: true,
  speech: 'normal',
  sleepWhenIdle: true,
  clickThrough: false,
  launchAtLogin: false,
  paletteHotkey: 'Alt+Shift+B',
  theme: 'system',
  home: null,
};

export const SIZE_RANGE = { min: 1, max: 8 } as const;

// ---------------------------------------------------------------------------
// UI metadata
// ---------------------------------------------------------------------------

export type SettingSection = 'buddy' | 'behavior' | 'interactions' | 'appearance' | 'system';
export type Platform = 'windows' | 'macos' | 'linux';

export const SECTIONS: { id: SettingSection; label: string; blurb: string }[] = [
  { id: 'buddy', label: 'Buddy', blurb: 'Pick who keeps you company.' },
  { id: 'behavior', label: 'Behavior', blurb: 'Where your buddy goes and when.' },
  { id: 'interactions', label: 'Interactions', blurb: 'Pats, treats and curiosity.' },
  { id: 'appearance', label: 'Appearance', blurb: 'Size, visibility and flair.' },
  { id: 'system', label: 'System', blurb: 'Startup, hotkeys and theme.' },
];

type KeysOfType<T> = { [K in keyof T]-?: T[K] extends boolean ? K : never }[keyof T];
type BooleanKey = KeysOfType<Settings>;

interface DefBase {
  label: string;
  description: string;
  section: SettingSection;
  /** Extra words the search/palette should match on. */
  keywords?: string[];
  /** Restrict to platforms where the feature works. Omit = everywhere. */
  platforms?: Platform[];
}

export interface ToggleDef extends DefBase {
  kind: 'toggle';
  key: BooleanKey;
}

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  description?: string;
}

export interface SelectDef extends DefBase {
  kind: 'select';
  key: 'movement' | 'roamSpeed' | 'speech' | 'theme';
  options: SelectOption[];
}

export interface RangeDef extends DefBase {
  kind: 'range';
  key: 'size' | 'opacity' | 'idleMinutes';
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

export interface HotkeyDef extends DefBase {
  kind: 'hotkey';
  key: 'paletteHotkey';
}

export type SettingDef = ToggleDef | SelectDef | RangeDef | HotkeyDef;

export const SETTING_DEFS: SettingDef[] = [
  // Behavior
  {
    kind: 'select',
    key: 'movement',
    section: 'behavior',
    label: 'Movement',
    description: 'Stay put, wander the screen, or only wander while you are away.',
    keywords: ['roam', 'walk', 'wander', 'move', 'idle', 'stay', 'home'],
    options: [
      { value: 'stay', label: 'Stay put', description: 'Hangs out wherever you drop it.' },
      { value: 'roam', label: 'Roam freely', description: 'Wanders around while you work.' },
      {
        value: 'roam-when-idle',
        label: 'Roam when idle',
        description: 'Explores while you are away, then heads home when you return.',
      },
    ],
  },
  {
    kind: 'select',
    key: 'roamSpeed',
    section: 'behavior',
    label: 'Roaming speed',
    description: 'How quickly your buddy gets around.',
    keywords: ['speed', 'fast', 'slow', 'walk'],
    options: [
      { value: 'slow', label: 'Leisurely' },
      { value: 'normal', label: 'Normal' },
      { value: 'zoomy', label: 'Zoomies' },
    ],
  },
  {
    kind: 'range',
    key: 'idleMinutes',
    section: 'behavior',
    label: 'Idle after',
    description: 'How long without input before you count as away (for roaming and naps).',
    keywords: ['away', 'afk', 'timeout', 'inactive'],
    min: 1,
    max: 30,
    step: 1,
    format: (v) => `${v} min`,
  },
  {
    kind: 'toggle',
    key: 'perchOnWindows',
    section: 'behavior',
    label: 'Perch on windows',
    description: 'While roaming, hop up and walk along the top of the window you are using.',
    keywords: ['window', 'climb', 'sit', 'titlebar'],
    platforms: ['windows'],
  },
  {
    kind: 'toggle',
    key: 'sleepWhenIdle',
    section: 'behavior',
    label: 'Nap when you are away',
    description: 'Curls up for a snooze after a while without input.',
    keywords: ['sleep', 'nap', 'zzz', 'idle'],
  },
  // Interactions
  {
    kind: 'toggle',
    key: 'clickReactions',
    section: 'interactions',
    label: 'React to clicks',
    description: 'Click your buddy for a pat. It will let you know how it feels about that.',
    keywords: ['pat', 'pet', 'click', 'poke'],
  },
  {
    kind: 'toggle',
    key: 'cursorAwareness',
    section: 'interactions',
    label: 'Notice the cursor',
    description: 'Looks toward your cursor and perks up when it comes close.',
    keywords: ['mouse', 'look', 'follow', 'curious'],
  },
  {
    kind: 'toggle',
    key: 'needs',
    section: 'interactions',
    label: 'Hunger & happiness',
    description: 'Tamagotchi-lite: treats and pats keep your buddy content. Never punishing.',
    keywords: ['tamagotchi', 'hunger', 'food', 'treat', 'mood', 'stats'],
  },
  {
    kind: 'select',
    key: 'speech',
    section: 'interactions',
    label: 'Chattiness',
    description: 'How often your buddy pipes up with a speech bubble.',
    keywords: ['talk', 'bubble', 'quips', 'speech', 'quiet'],
    options: [
      { value: 'off', label: 'Silent' },
      { value: 'rare', label: 'Rarely' },
      { value: 'normal', label: 'Sometimes' },
      { value: 'chatty', label: 'Chatty' },
    ],
  },
  // Appearance
  {
    kind: 'range',
    key: 'size',
    section: 'appearance',
    label: 'Size',
    description: 'Pixel scale of your buddy. Tip: Ctrl + scroll over it to resize.',
    keywords: ['scale', 'zoom', 'bigger', 'smaller', 'resize'],
    min: SIZE_RANGE.min,
    max: SIZE_RANGE.max,
    step: 1,
    format: (v) => `${v}×`,
  },
  {
    kind: 'range',
    key: 'opacity',
    section: 'appearance',
    label: 'Opacity',
    description: 'Make your buddy a little see-through.',
    keywords: ['transparent', 'fade', 'alpha'],
    min: 0.3,
    max: 1,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    kind: 'toggle',
    key: 'showName',
    section: 'appearance',
    label: 'Name tag on hover',
    description: 'Shows your buddy’s name when you hover over it.',
    keywords: ['label', 'name', 'tag'],
  },
  {
    kind: 'toggle',
    key: 'alwaysOnTop',
    section: 'appearance',
    label: 'Always on top',
    description: 'Keep your buddy above other windows.',
    keywords: ['overlay', 'top', 'front', 'z-order'],
  },
  {
    kind: 'toggle',
    key: 'hideInFullscreen',
    section: 'appearance',
    label: 'Hide during fullscreen',
    description: 'Steps aside while games, videos or presentations are fullscreen.',
    keywords: ['game', 'video', 'presentation', 'fullscreen', 'focus'],
    platforms: ['windows'],
  },
  {
    kind: 'toggle',
    key: 'clickThrough',
    section: 'appearance',
    label: 'Ghost mode',
    description: 'Clicks pass straight through your buddy. Handy while gaming or drawing.',
    keywords: ['click through', 'ignore mouse', 'passthrough'],
  },
  // System
  {
    kind: 'toggle',
    key: 'launchAtLogin',
    section: 'system',
    label: 'Launch at login',
    description: 'Start Desktop Buddy when you sign in.',
    keywords: ['startup', 'autostart', 'boot'],
  },
  {
    kind: 'hotkey',
    key: 'paletteHotkey',
    section: 'system',
    label: 'Command palette hotkey',
    description: 'Global shortcut that opens the command palette from anywhere.',
    keywords: ['shortcut', 'keyboard', 'palette', 'search'],
  },
  {
    kind: 'select',
    key: 'theme',
    section: 'system',
    label: 'Theme',
    description: 'Colors for the settings and palette windows.',
    keywords: ['dark', 'light', 'appearance', 'color'],
    options: [
      { value: 'system', label: 'Match system' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },
];

export function defsFor(platform: Platform): SettingDef[] {
  return SETTING_DEFS.filter((d) => !d.platforms || d.platforms.includes(platform));
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickOption<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function home(value: unknown): Home | null {
  if (!isRecord(value)) return null;
  const { x, y, ground } = value;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x: Math.round(x), y: Math.round(y), ground: ground === true }
    : null;
}

/** Coerce anything (stored JSON, event payloads) into a valid `Settings`. */
export function normalizeSettings(raw: unknown): Settings {
  const r = isRecord(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    petId: typeof r.petId === 'string' && r.petId ? r.petId : d.petId,
    movement: pickOption(r.movement, ['stay', 'roam', 'roam-when-idle'], d.movement),
    roamSpeed: pickOption(r.roamSpeed, ['slow', 'normal', 'zoomy'], d.roamSpeed),
    idleMinutes: Math.round(num(r.idleMinutes, d.idleMinutes, 1, 30)),
    size: Math.round(num(r.size, d.size, SIZE_RANGE.min, SIZE_RANGE.max)),
    opacity: num(r.opacity, d.opacity, 0.3, 1),
    showName: bool(r.showName, d.showName),
    alwaysOnTop: bool(r.alwaysOnTop, d.alwaysOnTop),
    hideInFullscreen: bool(r.hideInFullscreen, d.hideInFullscreen),
    clickReactions: bool(r.clickReactions, d.clickReactions),
    cursorAwareness: bool(r.cursorAwareness, d.cursorAwareness),
    perchOnWindows: bool(r.perchOnWindows, d.perchOnWindows),
    needs: bool(r.needs, d.needs),
    speech: pickOption(r.speech, ['off', 'rare', 'normal', 'chatty'], d.speech),
    sleepWhenIdle: bool(r.sleepWhenIdle, d.sleepWhenIdle),
    clickThrough: bool(r.clickThrough, d.clickThrough),
    launchAtLogin: bool(r.launchAtLogin, d.launchAtLogin),
    paletteHotkey:
      typeof r.paletteHotkey === 'string' && r.paletteHotkey.trim() ? r.paletteHotkey : d.paletteHotkey,
    theme: pickOption(r.theme, ['system', 'light', 'dark'], d.theme),
    home: home(r.home),
  };
}
