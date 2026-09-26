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

/** An app window the pet may perch on. `id` tells windows of the same size apart. */
export interface ForegroundWindow extends ScreenRect {
  id: number;
}

/** Things the pet window polls (~2×/s) to decide what to do. */
export interface EnvironmentSnapshot {
  /** Seconds since the last keyboard/mouse input anywhere, or null if unsupported. */
  idleSeconds: number | null;
  /**
   * The app window the user is working in (excluding minimized and maximized windows).
   * While one of our own windows or a taskbar is in front, this is still the last such
   * app window, so a perched pet doesn't fall off when the user opens the palette or
   * tray. The desktop ("Show desktop") counts as nothing to perch on. null if none or
   * unsupported.
   */
  foregroundWindow: ForegroundWindow | null;
  /**
   * Bounds of the monitor where a fullscreen game/video/presentation is in front, so only
   * a pet on that monitor steps aside. null if none or unsupported.
   */
  fullscreenMonitor: ScreenRect | null;
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
  /**
   * After the pet's context menu closes: if the pet window took the foreground, hand it
   * back to the app the user was working in. No-op otherwise (e.g. the palette opened).
   */
  restoreForeground: () => invoke<void>('restore_foreground'),
  openSettings: (section?: SettingSection) => invoke<void>('open_settings', { section }),
  showPalette: () => invoke<void>('show_palette'),
  hidePalette: () => invoke<void>('hide_palette'),
  quit: () => invoke<void>('quit_app'),
};
