/**
 * App-wide events shared by every window (and the Rust tray/hotkey code, which emits
 * the same names — keep `src-tauri/src/events.rs` in sync).
 */
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { normalizeSettings, type SettingSection, type Settings } from './settings';
import { normalizeStats, type StatsMap } from './stats';

export const EVENTS = {
  /** Rust → all windows, after every settings write. Payload: raw settings object. */
  settingsChanged: 'settings://changed',
  /** Anyone → pet window. Payload: `PetAction`. */
  petAction: 'pet://action',
  /** Pet window → others whenever stats change. Payload: raw `StatsMap`. */
  petStats: 'pet://stats',
  /** Rust → settings window: jump to a section. Payload: `{ section }`. */
  settingsNavigate: 'settings://navigate',
  /** Rust → palette window each time it is shown, so it can reset. No payload. */
  paletteOpened: 'palette://opened',
} as const;

export type PetAction =
  | { type: 'treat' }
  | { type: 'pat' }
  /** Head back to the home spot. */
  | { type: 'go-home' }
  /** Come over to wherever the cursor is. */
  | { type: 'summon' }
  | { type: 'nap' }
  | { type: 'wake' }
  /** Say something: a given line, or a random quip. */
  | { type: 'say'; text?: string }
  | { type: 'celebrate' };

export type PetActionType = PetAction['type'];

export const emitPetAction = (action: PetAction) => emit(EVENTS.petAction, action);

export const onPetAction = (cb: (action: PetAction) => void): Promise<UnlistenFn> =>
  listen<PetAction>(EVENTS.petAction, (e) => cb(e.payload));

export const onSettingsChanged = (cb: (settings: Settings) => void): Promise<UnlistenFn> =>
  listen<unknown>(EVENTS.settingsChanged, (e) => cb(normalizeSettings(e.payload)));

export const emitStats = (stats: StatsMap) => emit(EVENTS.petStats, stats);

export const onStats = (cb: (stats: StatsMap) => void): Promise<UnlistenFn> =>
  listen<unknown>(EVENTS.petStats, (e) => cb(normalizeStats(e.payload)));

export const onSettingsNavigate = (cb: (section: SettingSection) => void): Promise<UnlistenFn> =>
  listen<{ section: SettingSection }>(EVENTS.settingsNavigate, (e) => cb(e.payload.section));

export const onPaletteOpened = (cb: () => void): Promise<UnlistenFn> =>
  listen(EVENTS.paletteOpened, () => cb());
