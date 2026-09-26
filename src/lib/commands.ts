/**
 * Everything the command palette can do, derived from the current settings.
 * Framework-free so it can be unit-tested; side effects go through `CommandDeps`.
 */
import { PETS, getPet } from '$pets';
import { emitPetAction, type PetAction } from './events';
import { fuzzyFilter, queryWords, type Ranked } from './fuzzy';
import { ipc, updateSettings } from './ipc';
import {
  SECTIONS,
  defsFor,
  type Platform,
  type RangeDef,
  type SettingDef,
  type SettingSection,
  type Settings,
} from './settings';
import { acceleratorKeys } from './ui/hotkey';
import type { IconName } from './ui/icons';

export type CommandGroup = 'Actions' | 'Buddies' | 'Settings';
export const GROUP_ORDER: readonly CommandGroup[] = ['Actions', 'Buddies', 'Settings'];

/** Special hint values the palette renders as badges. Anything else is shown as-is. */
export const HINT = { current: 'current', on: 'On', off: 'Off' } as const;

export interface Command {
  id: string;
  group: CommandGroup;
  title: string;
  subtitle?: string;
  keywords: string[];
  /** Right-aligned hint: current value, On/Off, "current". */
  hint?: string;
  icon?: IconName;
  /** Buddy commands render that buddy's sprite instead of an icon. */
  petId?: string;
  /** Shown when the query is empty. */
  suggested?: boolean;
  run(): Promise<unknown>;
}

export interface CommandDeps {
  updateSettings(patch: Partial<Settings>): Promise<unknown>;
  emitPetAction(action: PetAction): Promise<unknown>;
  openSettings(section?: SettingSection): Promise<unknown>;
  quit(): Promise<unknown>;
}

const defaultDeps: CommandDeps = {
  updateSettings: (patch) => updateSettings(patch),
  emitPetAction: (action) => emitPetAction(action),
  openSettings: (section) => ipc.openSettings(section),
  quit: () => ipc.quit(),
};

export interface CommandContext {
  settings: Settings;
  platform: Platform;
  deps?: CommandDeps;
}

export function buildCommands({ settings, platform, deps = defaultDeps }: CommandContext): Command[] {
  return [...actionCommands(getPet(settings.petId).name, deps), ...buddyCommands(settings, deps), ...settingCommands(settings, platform, deps)];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionCommands(name: string, deps: CommandDeps): Command[] {
  const petAction = (
    action: PetAction,
    icon: IconName,
    title: string,
    subtitle: string,
    keywords: string[],
  ): Command => ({
    id: `action:${action.type}`,
    group: 'Actions',
    title,
    subtitle,
    icon,
    keywords,
    suggested: true,
    run: () => deps.emitPetAction(action),
  });

  return [
    petAction({ type: 'treat' }, 'treat', 'Give a treat', `${name} gets a tasty snack`, ['feed', 'food', 'snack', 'eat', 'cookie', 'hungry']),
    petAction({ type: 'pat' }, 'pat', `Pat ${name}`, 'A little head pat goes a long way', ['pet', 'love', 'click', 'happy', 'pat']),
    petAction({ type: 'go-home' }, 'home', 'Call home', `${name} heads back to its spot`, ['return', 'back', 'home', 'recall']),
    petAction({ type: 'summon' }, 'summon', 'Come here', `${name} walks over to your cursor`, ['summon', 'follow', 'cursor', 'mouse']),
    petAction({ type: 'nap' }, 'nap', 'Take a nap', `${name} curls up for a snooze`, ['sleep', 'rest', 'zzz']),
    petAction({ type: 'wake' }, 'wake', 'Wake up', `Rise and shine, ${name}!`, ['awake', 'morning', 'up']),
    petAction({ type: 'say' }, 'say', 'Say something', `${name} shares a thought`, ['talk', 'speak', 'quip', 'chat', 'bubble']),
    petAction({ type: 'celebrate' }, 'celebrate', 'Celebrate', `${name} does a happy dance`, ['party', 'dance', 'yay', 'hooray', 'ship', 'done']),
    {
      id: 'action:settings',
      group: 'Actions',
      title: 'Open settings',
      subtitle: 'Tweak everything about Desktop Buddy',
      icon: 'settings',
      keywords: ['preferences', 'options', 'config'],
      suggested: true,
      run: () => deps.openSettings(),
    },
    ...SECTIONS.map(
      (s): Command => ({
        id: `action:settings:${s.id}`,
        group: 'Actions',
        title: `Settings: ${s.label}`,
        subtitle: s.blurb,
        icon: s.id,
        keywords: ['preferences', 'options', 'open'],
        run: () => deps.openSettings(s.id),
      }),
    ),
    {
      id: 'action:quit',
      group: 'Actions',
      title: 'Quit Desktop Buddy',
      subtitle: `${name} will be here when you get back`,
      icon: 'quit',
      keywords: ['exit', 'close', 'stop'],
      run: () => deps.quit(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Buddies
// ---------------------------------------------------------------------------

function buddyCommands(settings: Settings, deps: CommandDeps): Command[] {
  const activeId = getPet(settings.petId).id;
  return PETS.map((pet) => ({
    id: `buddy:${pet.id}`,
    group: 'Buddies',
    title: `Switch to ${pet.name}`,
    subtitle: pet.species,
    keywords: [pet.name, pet.species, 'buddy', 'pet', 'swap', 'change'],
    hint: pet.id === activeId ? HINT.current : undefined,
    petId: pet.id,
    suggested: true,
    run: () => deps.updateSettings({ petId: pet.id }),
  }));
}

// ---------------------------------------------------------------------------
// Settings (derived from SETTING_DEFS so new settings show up automatically)
// ---------------------------------------------------------------------------

const SETTING_ICONS: Partial<Record<keyof Settings, IconName>> = {
  movement: 'behavior',
  roamSpeed: 'speed',
  idleMinutes: 'clock',
  speech: 'speech',
  theme: 'theme',
  size: 'size',
  opacity: 'opacity',
  paletteHotkey: 'keyboard',
  showName: 'eye',
  clickThrough: 'ghost',
};

/** Handy values offered for ranges where listing every step would be noise. */
const RANGE_PRESETS: Partial<Record<RangeDef['key'], number[]>> = {
  opacity: [1, 0.75, 0.5],
  idleMinutes: [1, 3, 5, 10, 15, 30],
};

/** Settings commands shown with an empty query (by id or id prefix). */
const SUGGESTED_SETTINGS = ['setting:movement:', 'setting:size:bigger', 'setting:size:smaller', 'setting:clickThrough'];

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const sameValue = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function settingCommands(settings: Settings, platform: Platform, deps: CommandDeps): Command[] {
  const commands = defsFor(platform).flatMap((def) => defCommands(def, settings, platform, deps));
  for (const cmd of commands) {
    cmd.suggested = SUGGESTED_SETTINGS.some((id) => (id.endsWith(':') ? cmd.id.startsWith(id) : cmd.id === id));
  }
  return commands;
}

function defCommands(def: SettingDef, settings: Settings, platform: Platform, deps: CommandDeps): Command[] {
  const section = SECTIONS.find((s) => s.id === def.section)?.label ?? def.section;
  const base = {
    group: 'Settings' as const,
    keywords: [def.label, ...(def.keywords ?? []), section],
    icon: SETTING_ICONS[def.key],
  };
  const set = (patch: Partial<Settings>) => () => deps.updateSettings(patch);

  switch (def.kind) {
    case 'toggle': {
      const on = settings[def.key];
      return [
        {
          ...base,
          id: `setting:${def.key}`,
          title: `Turn ${on ? 'off' : 'on'} ${lowerFirst(def.label)}`,
          subtitle: def.description,
          hint: on ? HINT.on : HINT.off,
          icon: base.icon ?? (on ? 'toggle-on' : 'toggle-off'),
          keywords: [...base.keywords, 'toggle', on ? 'disable' : 'enable'],
          run: set({ [def.key]: !on }),
        },
      ];
    }
    case 'select':
      return def.options.map((option) => ({
        ...base,
        id: `setting:${def.key}:${option.value}`,
        title: `${def.label}: ${option.label}`,
        subtitle: option.description ?? def.description,
        hint: settings[def.key] === option.value ? HINT.current : undefined,
        icon: base.icon ?? 'sliders',
        keywords: [...base.keywords, option.value],
        run: set({ [def.key]: option.value } as Partial<Settings>),
      }));
    case 'range':
      return rangeCommands(def, settings[def.key], base, set);
    case 'hotkey':
      return [
        {
          ...base,
          id: `setting:${def.key}`,
          title: `Change ${lowerFirst(def.label)}…`,
          subtitle: def.description,
          // Keycap labels, like everywhere else ("Ctrl + Shift + P", not "CommandOrControl+Shift+P").
          hint: acceleratorKeys(settings[def.key], platform).join(' + '),
          icon: base.icon ?? 'keyboard',
          keywords: [...base.keywords, 'record', 'rebind'],
          run: () => deps.openSettings(def.section),
        },
      ];
  }
}

function rangeCommands(
  def: RangeDef,
  value: number,
  base: { group: 'Settings'; keywords: string[]; icon?: IconName },
  set: (patch: Partial<Settings>) => () => Promise<unknown>,
): Command[] {
  const commands: Command[] = [];
  const icon = base.icon ?? 'sliders';

  // Size gets relative steps too: "Bigger" is what people actually type.
  if (def.key === 'size') {
    if (value + def.step <= def.max) {
      commands.push({
        ...base,
        id: 'setting:size:bigger',
        title: `${def.label}: Bigger`,
        subtitle: `${def.format(value)} → ${def.format(value + def.step)}`,
        icon: 'grow',
        keywords: [...base.keywords, 'bigger', 'larger', 'grow', 'increase'],
        run: set({ size: value + def.step }),
      });
    }
    if (value - def.step >= def.min) {
      commands.push({
        ...base,
        id: 'setting:size:smaller',
        title: `${def.label}: Smaller`,
        subtitle: `${def.format(value)} → ${def.format(value - def.step)}`,
        icon: 'shrink',
        keywords: [...base.keywords, 'smaller', 'tiny', 'shrink', 'decrease'],
        run: set({ size: value - def.step }),
      });
    }
  }

  const presets =
    RANGE_PRESETS[def.key] ??
    Array.from({ length: Math.floor((def.max - def.min) / def.step) + 1 }, (_, i) => def.min + i * def.step);
  for (const preset of presets) {
    commands.push({
      ...base,
      id: `setting:${def.key}:${preset}`,
      title: `${def.label}: ${def.format(preset)}`,
      subtitle: def.description,
      hint: sameValue(preset, value) ? HINT.current : undefined,
      icon,
      run: set({ [def.key]: preset }),
    });
  }
  return commands;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface CommandSection {
  group: CommandGroup;
  items: Ranked<Command>[];
}

/**
 * Empty query: suggested commands in fixed group order. Otherwise: fuzzy-ranked, grouped,
 * with groups ordered by their best match so the top result is always first.
 */
export function searchCommands(commands: readonly Command[], query: string): CommandSection[] {
  const empty = queryWords(query).length === 0;
  const ranked = empty
    ? commands.filter((c) => c.suggested).map((item) => ({ item, score: 0, indices: [] }))
    : fuzzyFilter(query, commands, (c) => c);

  const byGroup = new Map<CommandGroup, Ranked<Command>[]>();
  if (empty) GROUP_ORDER.forEach((g) => byGroup.set(g, []));
  for (const r of ranked) {
    const list = byGroup.get(r.item.group) ?? [];
    list.push(r);
    byGroup.set(r.item.group, list);
  }
  return [...byGroup]
    .filter(([, items]) => items.length > 0)
    .map(([group, items]) => ({ group, items }));
}
