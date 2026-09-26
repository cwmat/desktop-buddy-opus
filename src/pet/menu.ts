/**
 * Native right-click menu for the buddy. Rebuilt on every open so check marks and
 * labels reflect the current settings; the previous menu is released then.
 */
import { Menu } from '@tauri-apps/api/menu';
import type { PetAction } from '$lib/events';
import { ipc } from '$lib/ipc';
import { SETTING_DEFS, SIZE_RANGE, type MovementMode, type Settings } from '$lib/settings';
import { PETS } from '$pets';

export interface MenuContext {
  settings: Settings;
  sleeping: boolean;
  act: (action: PetAction) => void;
  update: (patch: Partial<Settings>) => void;
}

const movementDef = SETTING_DEFS.find((d) => d.kind === 'select' && d.key === 'movement');
const MOVEMENT_OPTIONS = movementDef?.kind === 'select' ? movementDef.options : [];

let previous: Menu | null = null;

/** Build and pop up the menu at the cursor. Resolves once the menu has closed. */
export async function showPetMenu(ctx: MenuContext): Promise<void> {
  const { settings: s, act, update } = ctx;
  // Stable ids ("pet:*"), the menu's own included, keep Rust's handler table from growing
  // (a new handler replaces the old one) and stay clear of tray ids.
  const menu = await Menu.new({
    id: 'pet:menu',
    items: [
      { id: 'pet:treat', text: 'Give a treat', action: () => act({ type: 'treat' }) },
      { id: 'pet:pat', text: 'Pat', action: () => act({ type: 'pat' }) },
      { item: 'Separator' },
      {
        id: 'pet:buddy',
        text: 'Buddy',
        items: PETS.map((p) => ({
          id: `pet:buddy:${p.id}`,
          text: `${p.name} (${p.species})`,
          checked: p.id === s.petId,
          action: () => update({ petId: p.id }),
        })),
      },
      {
        id: 'pet:movement',
        text: 'Movement',
        items: MOVEMENT_OPTIONS.map((o) => ({
          id: `pet:movement:${o.value}`,
          text: o.label,
          checked: o.value === s.movement,
          action: () => update({ movement: o.value as MovementMode }),
        })),
      },
      {
        id: 'pet:size',
        text: 'Size',
        items: [
          {
            id: 'pet:size:up',
            text: 'Bigger',
            enabled: s.size < SIZE_RANGE.max,
            action: () => update({ size: Math.min(SIZE_RANGE.max, s.size + 1) }),
          },
          {
            id: 'pet:size:down',
            text: 'Smaller',
            enabled: s.size > SIZE_RANGE.min,
            action: () => update({ size: Math.max(SIZE_RANGE.min, s.size - 1) }),
          },
        ],
      },
      { item: 'Separator' },
      { id: 'pet:home', text: 'Call home', action: () => act({ type: 'go-home' }) },
      {
        id: 'pet:nap',
        text: ctx.sleeping ? 'Wake up' : 'Take a nap',
        action: () => act({ type: ctx.sleeping ? 'wake' : 'nap' }),
      },
      {
        id: 'pet:ghost',
        text: 'Ghost mode (click-through)',
        checked: s.clickThrough,
        action: () => update({ clickThrough: !s.clickThrough }),
      },
      { item: 'Separator' },
      { id: 'pet:palette', text: 'Command palette…', action: () => void ipc.showPalette() },
      { id: 'pet:settings', text: 'Settings…', action: () => void ipc.openSettings() },
      { item: 'Separator' },
      { id: 'pet:quit', text: 'Quit Desktop Buddy', action: () => void ipc.quit() },
    ],
  });
  const stale = previous;
  previous = menu;
  void stale?.close().catch(() => {});
  await menu.popup();
}
