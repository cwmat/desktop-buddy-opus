/**
 * The settings window is a list of rows: generated setting controls, a few one-off
 * action rows, and (in search results) buddies. Sections and search share this model.
 */
import { PETS, type PetDefinition } from '$pets';
import { fuzzyFilter, type SearchFields } from '$lib/fuzzy';
import { ipc } from '$lib/ipc';
import { SECTIONS, defsFor, type Platform, type SettingDef, type SettingSection } from '$lib/settings';

export interface ActionRowDef {
  id: string;
  section: SettingSection;
  label: string;
  description: string;
  keywords: string[];
  button: string;
  danger?: boolean;
  run: () => Promise<unknown>;
}

export type Row =
  | { kind: 'setting'; id: string; section: SettingSection; def: SettingDef }
  | { kind: 'action'; id: string; section: SettingSection; action: ActionRowDef }
  | { kind: 'buddy'; id: string; section: SettingSection; pet: PetDefinition };

export interface RowMatch {
  row: Row;
  /** Matched characters in the row label (empty outside search). */
  indices: number[];
}

export const ACTION_ROWS: ActionRowDef[] = [
  {
    id: 'open-palette',
    section: 'system',
    label: 'Command palette',
    description: 'Every action, buddy and setting, one search away.',
    keywords: ['search', 'commands', 'spotlight', 'launcher'],
    button: 'Open',
    run: () => ipc.showPalette(),
  },
  {
    id: 'quit',
    section: 'system',
    label: 'Quit Desktop Buddy',
    description: 'Close the app. Your buddy will be right here when you come back.',
    keywords: ['exit', 'close', 'stop'],
    button: 'Quit',
    danger: true,
    run: () => ipc.quit(),
  },
];

const settingRow = (def: SettingDef): Row => ({ kind: 'setting', id: `setting:${def.key}`, section: def.section, def });
const actionRow = (action: ActionRowDef): Row => ({ kind: 'action', id: `action:${action.id}`, section: action.section, action });
const buddyRow = (pet: PetDefinition): Row => ({ kind: 'buddy', id: `buddy:${pet.id}`, section: 'buddy', pet });

export const sectionLabel = (id: SettingSection) => SECTIONS.find((s) => s.id === id)?.label ?? id;

export function sectionRows(section: SettingSection, platform: Platform): RowMatch[] {
  return [
    ...defsFor(platform)
      .filter((d) => d.section === section)
      .map(settingRow),
    ...ACTION_ROWS.filter((a) => a.section === section).map(actionRow),
  ].map((row) => ({ row, indices: [] }));
}

function fieldsOf(row: Row): SearchFields {
  const section = sectionLabel(row.section);
  switch (row.kind) {
    case 'setting': {
      const options = row.def.kind === 'select' ? row.def.options.map((o) => o.label) : [];
      return {
        title: row.def.label,
        subtitle: row.def.description,
        keywords: [...(row.def.keywords ?? []), ...options, section],
      };
    }
    case 'action':
      return { title: row.action.label, subtitle: row.action.description, keywords: [...row.action.keywords, section] };
    case 'buddy':
      return { title: row.pet.name, subtitle: row.pet.tagline, keywords: [row.pet.species, 'buddy', 'pet'] };
  }
}

export function searchRows(query: string, platform: Platform): RowMatch[] {
  const rows = [...defsFor(platform).map(settingRow), ...ACTION_ROWS.map(actionRow), ...PETS.map(buddyRow)];
  return fuzzyFilter(query, rows, fieldsOf).map((r) => ({ row: r.item, indices: r.indices }));
}
