/**
 * Typed wrappers for the Rust commands in `src-tauri/src/commands.rs`.
 * Keep the two files in sync: command names are snake_case, argument keys camelCase.
 */
import { invoke } from '@tauri-apps/api/core';
import { normalizeSettings, type Platform, type SettingSection, type Settings } from './settings';
import { normalizeStats, type StatsMap } from './stats';

/** A rectangle on the virtual desktop in physical pixels. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Things the pet window polls (~2×/s) to decide what to do. */
export interface EnvironmentSnapshot {
  /** Seconds since the last keyboard/mouse input anywhere, or null if unsupported. */
  idleSeconds: number | null;
  /**
   * Bounds of the foreground app window (excluding our own windows, the desktop,
   * the taskbar, minimized and maximized windows). null if none or unsupported.
   */
  foregroundWindow: ScreenRect | null;
  /** A fullscreen game/video/presentation is in front. Always false where unsupported. */
  fullscreenActive: boolean;
}

export interface AppInfo {
  platform: Platform;
  version: string;
}

export interface PetSummary {
  id: string;
  name: string;
}

interface StoredState {
  settings: unknown;
  stats: unknown;
}

export async function loadState(): Promise<{ settings: Settings; stats: StatsMap }> {
  const raw = await invoke<StoredState>('load_state');
  return { settings: normalizeSettings(raw.settings), stats: normalizeStats(raw.stats) };
}

/**
 * Shallow-merge `patch` into stored settings, persist, and broadcast
 * `settings://changed`. Rejects (and changes nothing) if e.g. a hotkey is invalid.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return normalizeSettings(await invoke<unknown>('update_settings', { patch }));
}

export const ipc = {
  appInfo: () => invoke<AppInfo>('app_info'),
  saveStats: (stats: StatsMap) => invoke<void>('save_stats', { stats }),
  /** Tell Rust which buddies exist so the tray menu can list them. */
  registerPets: (pets: PetSummary[]) => invoke<void>('register_pets', { pets }),
  environment: () => invoke<EnvironmentSnapshot>('environment_snapshot'),
  /** Re-assert topmost z-order for the pet window (Windows can drop it below the taskbar). */
  keepPetOnTop: () => invoke<void>('keep_pet_on_top'),
  openSettings: (section?: SettingSection) => invoke<void>('open_settings', { section }),
  showPalette: () => invoke<void>('show_palette'),
  hidePalette: () => invoke<void>('hide_palette'),
  quit: () => invoke<void>('quit_app'),
};
