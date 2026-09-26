import { describe, expect, it } from 'vitest';
import { acceleratorKeys, recordKey, type KeyLike } from './hotkey';

type Mods = Partial<Omit<KeyLike, 'getModifierState'>> & { altGraph?: boolean };

const press = (code: string, key: string, { altGraph = false, ...mods }: Mods = {}): KeyLike => ({
  code,
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  getModifierState: (name: string) => name === 'AltGraph' && altGraph,
  ...mods,
});

describe('recordKey', () => {
  it('builds accelerators in a stable modifier order', () => {
    expect(recordKey(press('KeyB', 'B', { altKey: true, shiftKey: true }), 'windows')).toEqual({
      kind: 'done',
      accelerator: 'Alt+Shift+B',
    });
    expect(recordKey(press('KeyP', 'P', { ctrlKey: true, shiftKey: true }), 'windows')).toEqual({
      kind: 'done',
      accelerator: 'CommandOrControl+Shift+P',
    });
    expect(recordKey(press('F9', 'F9', { metaKey: true }), 'windows')).toEqual({ kind: 'done', accelerator: 'Super+F9' });
    expect(recordKey(press('ArrowUp', 'ArrowUp', { ctrlKey: true, altKey: true }), 'linux')).toEqual({
      kind: 'done',
      accelerator: 'CommandOrControl+Alt+Up',
    });
  });

  it('maps ⌘ to CommandOrControl on macOS', () => {
    expect(recordKey(press('Space', ' ', { metaKey: true }), 'macos')).toEqual({
      kind: 'done',
      accelerator: 'CommandOrControl+Space',
    });
  });

  it('uses the physical key, not the typed character', () => {
    expect(recordKey(press('Digit1', '!', { ctrlKey: true, shiftKey: true }), 'windows')).toEqual({
      kind: 'done',
      accelerator: 'CommandOrControl+Shift+1',
    });
  });

  it('waits while only modifiers are held', () => {
    expect(recordKey(press('AltLeft', 'Alt', { altKey: true }), 'windows')).toEqual({
      kind: 'partial',
      modifiers: ['Alt'],
    });
  });

  it('cancels on a bare Escape', () => {
    expect(recordKey(press('Escape', 'Escape'), 'windows')).toEqual({ kind: 'cancel' });
  });

  it('requires Ctrl, Alt or Super, except for F-keys', () => {
    expect(recordKey(press('KeyB', 'b'), 'windows').kind).toBe('invalid');
    expect(recordKey(press('KeyB', 'B', { shiftKey: true }), 'windows').kind).toBe('invalid');
    // Shift+editing keys select text, insert newlines or paste: never steal them.
    for (const [code, key] of [
      ['End', 'End'],
      ['ArrowUp', 'ArrowUp'],
      ['Enter', 'Enter'],
      ['Insert', 'Insert'],
      ['Numpad0', '0'],
    ]) {
      expect(recordKey(press(code, key, { shiftKey: true }), 'windows').kind).toBe('invalid');
    }
    expect(recordKey(press('F2', 'F2', { shiftKey: true }), 'windows')).toEqual({ kind: 'done', accelerator: 'Shift+F2' });
    expect(recordKey(press('F9', 'F9'), 'windows')).toEqual({ kind: 'done', accelerator: 'F9' });
    expect(recordKey(press('F24', 'F24'), 'linux')).toEqual({ kind: 'done', accelerator: 'F24' });
    expect(recordKey(press('End', 'End', { ctrlKey: true, shiftKey: true }), 'windows')).toEqual({
      kind: 'done',
      accelerator: 'CommandOrControl+Shift+End',
    });
    expect(recordKey(press('KeyK', 'k', { ctrlKey: true }), 'macos')).toEqual({ kind: 'done', accelerator: 'Control+K' });
  });

  it('ignores AltGr, which Windows reports as Ctrl+Alt', () => {
    const altGr = { ctrlKey: true, altKey: true, altGraph: true };
    expect(recordKey(press('KeyQ', '@', altGr), 'windows').kind).toBe('invalid');
    expect(recordKey(press('AltRight', 'AltGraph', altGr), 'windows')).toEqual({ kind: 'partial', modifiers: [] });
    expect(recordKey(press('F5', 'F5', altGr), 'windows')).toEqual({ kind: 'done', accelerator: 'F5' });
    // A real Ctrl+Alt still works.
    expect(recordKey(press('KeyQ', 'q', { ctrlKey: true, altKey: true }), 'windows')).toEqual({
      kind: 'done',
      accelerator: 'CommandOrControl+Alt+Q',
    });
  });

  it('rejects keys we cannot express', () => {
    expect(recordKey(press('IntlBackslash', '<', { ctrlKey: true }), 'windows').kind).toBe('invalid');
  });
});

describe('acceleratorKeys', () => {
  it('labels keys per platform', () => {
    expect(acceleratorKeys('CommandOrControl+Shift+P', 'windows')).toEqual(['Ctrl', 'Shift', 'P']);
    expect(acceleratorKeys('CommandOrControl+Shift+P', 'macos')).toEqual(['⌘', '⇧', 'P']);
    expect(acceleratorKeys('Super+Alt+Up', 'windows')).toEqual(['Win', 'Alt', '↑']);
    expect(acceleratorKeys('Alt+Shift+KeyB', 'linux')).toEqual(['Alt', 'Shift', 'B']);
    expect(acceleratorKeys('Ctrl+Comma', 'windows')).toEqual(['Ctrl', ',']);
  });
});
