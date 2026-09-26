/**
 * Browser-preview stand-in for the Rust backend, so `vite` alone can render the
 * settings and palette windows. Only imported in dev when not running inside Tauri
 * (see each window's main.ts), so it never ships.
 *
 * In the devtools console: `devEmit('settings://navigate', { section: 'system' })`,
 * `devEmit('palette://opened')`.
 */
import { emit, listen } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { PETS } from '$pets';
import { EVENTS, type PetAction } from './events';
import type { AppInfo } from './ipc';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';
import { feed, freshStats, pat, type StatsMap } from './stats';

const HOUR = 3_600_000;

function sampleStats(): StatsMap {
  const now = Date.now();
  const stats: StatsMap = {};
  PETS.slice(0, 3).forEach((pet, i) => {
    stats[pet.id] = {
      ...freshStats(now - (i + 2) * 24 * HOUR),
      happiness: [86, 52, 24][i],
      fullness: [64, 22, 71][i],
      treats: [42, 7, 13][i],
      pats: [128, 19, 3][i],
      updatedAt: now,
    };
  });
  return stats;
}

export function installDevMock(label: 'settings' | 'palette'): void {
  let settings: Settings = { ...DEFAULT_SETTINGS, home: { x: 1700, y: 1040, ground: true } };
  let stats = sampleStats();
  const info: AppInfo = { platform: 'windows', version: '0.1.0-dev' };

  mockWindows(label, 'pet', 'settings', 'palette');
  mockIPC(
    (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      switch (cmd) {
        case 'load_state':
          return { settings, stats };
        case 'update_settings': {
          const patch = a.patch as Partial<Settings>;
          // Mimic Rust refusing a shortcut it can't register.
          if (patch.paletteHotkey?.includes('Super+L')) {
            throw 'Couldn’t register Super+L — it’s reserved by Windows.';
          }
          settings = normalizeSettings({ ...settings, ...patch });
          void emit(EVENTS.settingsChanged, settings);
          return settings;
        }
        case 'app_info':
          return info;
        case 'hide_palette':
          // There's no hotkey in a browser: "press" it again shortly so the panel comes back.
          setTimeout(() => void emit(EVENTS.paletteOpened), 800);
          return null;
        default:
          // Window plugin calls (setTheme, onFocusChanged…) and fire-and-forget commands.
          console.debug('[dev-mock]', cmd, args);
          return null;
      }
    },
    { shouldMockEvents: true },
  );

  // Pretend to be the pet window so treats/pats update the gallery live.
  void listen<PetAction>(EVENTS.petAction, ({ payload }) => {
    const id = settings.petId;
    const current = stats[id] ?? freshStats();
    if (payload.type === 'treat') stats = { ...stats, [id]: feed(current) };
    else if (payload.type === 'pat') stats = { ...stats, [id]: pat(current) };
    else return;
    void emit(EVENTS.petStats, stats);
  });

  Object.assign(window, { devEmit: emit });
  if (label === 'palette') {
    // The real window is transparent over the desktop; fake a wallpaper behind it.
    document.documentElement.style.background = 'linear-gradient(135deg, #3a4a7a, #6f4a7d 55%, #c0786a)';
    // Rust shows the palette on the hotkey; here it's "shown" once the app has mounted.
    setTimeout(() => void emit(EVENTS.paletteOpened), 100);
  }
}
