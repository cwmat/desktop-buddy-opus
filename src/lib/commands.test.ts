import { describe, expect, it, vi } from 'vitest';
import { PETS } from '$pets';
import { buildCommands, searchCommands, type Command, type CommandDeps } from './commands';
import { DEFAULT_SETTINGS, SECTIONS, SIZE_RANGE, type Platform, type Settings } from './settings';

function setup(overrides: Partial<Settings> = {}, platform: Platform = 'windows') {
  const deps: CommandDeps = {
    updateSettings: vi.fn(async () => undefined),
    emitPetAction: vi.fn(async () => undefined),
    openSettings: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
  };
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const commands = buildCommands({ settings, platform, deps });
  const byId = (id: string): Command => {
    const cmd = commands.find((c) => c.id === id);
    if (!cmd) throw new Error(`no command ${id}`);
    return cmd;
  };
  return { deps, commands, byId };
}

describe('buildCommands', () => {
  it('gives every command a unique id', () => {
    const { commands } = setup();
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });

  it('builds pet actions that emit the right PetAction', async () => {
    const { deps, byId } = setup();
    for (const type of ['treat', 'pat', 'go-home', 'summon', 'nap', 'wake', 'say', 'celebrate'] as const) {
      await byId(`action:${type}`).run();
      expect(deps.emitPetAction).toHaveBeenLastCalledWith({ type });
    }
  });

  it('personalises action copy with the active buddy name', () => {
    const pet = PETS[1];
    const { byId } = setup({ petId: pet.id });
    expect(byId('action:pat').title).toBe(`Pat ${pet.name}`);
  });

  it('opens settings, per-section settings and quits', async () => {
    const { deps, byId } = setup();
    await byId('action:settings').run();
    expect(deps.openSettings).toHaveBeenLastCalledWith();
    for (const s of SECTIONS) {
      await byId(`action:settings:${s.id}`).run();
      expect(deps.openSettings).toHaveBeenLastCalledWith(s.id);
    }
    await byId('action:quit').run();
    expect(deps.quit).toHaveBeenCalledOnce();
  });

  it('lists every buddy and marks the current one', async () => {
    const { deps, commands, byId } = setup({ petId: PETS[2].id });
    const buddies = commands.filter((c) => c.group === 'Buddies');
    expect(buddies.map((c) => c.petId)).toEqual(PETS.map((p) => p.id));
    expect(buddies.filter((c) => c.hint === 'current').map((c) => c.petId)).toEqual([PETS[2].id]);
    expect(byId(`buddy:${PETS[0].id}`).subtitle).toBe(PETS[0].species);
    await byId(`buddy:${PETS[0].id}`).run();
    expect(deps.updateSettings).toHaveBeenLastCalledWith({ petId: PETS[0].id });
  });

  it('turns toggles into a single on/off command', async () => {
    const on = setup({ alwaysOnTop: true });
    expect(on.byId('setting:alwaysOnTop').title).toBe('Turn off always on top');
    expect(on.byId('setting:alwaysOnTop').hint).toBe('On');
    await on.byId('setting:alwaysOnTop').run();
    expect(on.deps.updateSettings).toHaveBeenLastCalledWith({ alwaysOnTop: false });

    const off = setup({ clickThrough: false });
    expect(off.byId('setting:clickThrough').title).toBe('Turn on ghost mode');
    expect(off.byId('setting:clickThrough').hint).toBe('Off');
  });

  it('turns selects into one command per option', async () => {
    const { deps, byId } = setup({ movement: 'roam-when-idle' });
    const idle = byId('setting:movement:roam-when-idle');
    expect(idle.title).toBe('Movement: Roam when idle');
    expect(idle.hint).toBe('current');
    expect(byId('setting:movement:stay').hint).toBeUndefined();
    await byId('setting:movement:stay').run();
    expect(deps.updateSettings).toHaveBeenLastCalledWith({ movement: 'stay' });
  });

  it('offers bigger/smaller and every size, respecting the bounds', async () => {
    const mid = setup({ size: 3 });
    expect(mid.byId('setting:size:3').title).toBe('Size: 3×');
    expect(mid.byId('setting:size:3').hint).toBe('current');
    await mid.byId('setting:size:bigger').run();
    expect(mid.deps.updateSettings).toHaveBeenLastCalledWith({ size: 4 });
    await mid.byId('setting:size:smaller').run();
    expect(mid.deps.updateSettings).toHaveBeenLastCalledWith({ size: 2 });
    expect(mid.commands.filter((c) => /^setting:size:\d+$/.test(c.id))).toHaveLength(SIZE_RANGE.max - SIZE_RANGE.min + 1);

    const max = setup({ size: SIZE_RANGE.max });
    expect(max.commands.some((c) => c.id === 'setting:size:bigger')).toBe(false);
    expect(max.commands.some((c) => c.id === 'setting:size:smaller')).toBe(true);
    const min = setup({ size: SIZE_RANGE.min });
    expect(min.commands.some((c) => c.id === 'setting:size:smaller')).toBe(false);
  });

  it('offers opacity and idle presets', async () => {
    const { deps, byId, commands } = setup({ opacity: 0.75, idleMinutes: 5 });
    expect(commands.filter((c) => c.id.startsWith('setting:opacity:')).map((c) => c.title)).toEqual([
      'Opacity: 100%',
      'Opacity: 75%',
      'Opacity: 50%',
    ]);
    expect(byId('setting:opacity:0.75').hint).toBe('current');
    expect(commands.filter((c) => c.id.startsWith('setting:idleMinutes:'))).toHaveLength(6);
    expect(byId('setting:idleMinutes:5').hint).toBe('current');
    await byId('setting:idleMinutes:10').run();
    expect(deps.updateSettings).toHaveBeenLastCalledWith({ idleMinutes: 10 });
  });

  it('sends hotkey changes to the settings window', async () => {
    const { deps, byId } = setup({ paletteHotkey: 'Alt+Shift+B' });
    const cmd = byId('setting:paletteHotkey');
    expect(cmd.title).toBe('Change command palette hotkey…');
    expect(cmd.hint).toBe('Alt+Shift+B');
    await cmd.run();
    expect(deps.openSettings).toHaveBeenLastCalledWith('system');
  });

  it('hides settings that do not apply to the platform', () => {
    const ids = (p: Platform) => setup({}, p).commands.map((c) => c.id);
    expect(ids('windows')).toContain('setting:perchOnWindows');
    expect(ids('macos')).not.toContain('setting:perchOnWindows');
    expect(ids('linux')).not.toContain('setting:hideInFullscreen');
  });
});

describe('searchCommands', () => {
  const { commands } = setup();

  it('shows suggestions for an empty query: actions, then buddies, then settings', () => {
    const sections = searchCommands(commands, '  ');
    expect(sections.map((s) => s.group)).toEqual(['Actions', 'Buddies', 'Settings']);
    expect(sections[0].items[0].item.id).toBe('action:treat');
    expect(sections[1].items).toHaveLength(PETS.length);
    const settings = sections[2].items.map((r) => r.item.id);
    expect(settings).toContain('setting:movement:roam-when-idle');
    expect(settings.length).toBeLessThan(10);
  });

  it('puts the best match first', () => {
    const top = (q: string) => searchCommands(commands, q)[0].items[0].item.id;
    expect(top('treat')).toBe('action:treat');
    expect(top('roam idle')).toBe('setting:movement:roam-when-idle');
    expect(top('bigger')).toBe('setting:size:bigger');
    expect(top('ghost')).toBe('setting:clickThrough');
    expect(top(PETS[3].name.toLowerCase())).toBe(`buddy:${PETS[3].id}`);
  });

  it('matches keywords', () => {
    const ids = searchCommands(commands, 'feed').flatMap((s) => s.items.map((r) => r.item.id));
    expect(ids[0]).toBe('action:treat');
  });

  it('returns nothing for gibberish', () => {
    expect(searchCommands(commands, 'qqzzxx')).toEqual([]);
  });
});
