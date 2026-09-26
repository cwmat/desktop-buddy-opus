/**
 * Turning key presses into Tauri global-shortcut accelerators ("Alt+Shift+B",
 * "CommandOrControl+Shift+P", "Super+F9") and accelerators back into keycap labels.
 * Uses `KeyboardEvent.code` so shortcuts don't depend on the keyboard layout.
 */
import type { Platform } from '$lib/settings';

export type KeyLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'getModifierState'
>;

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph']);

/** `code` values that map to accelerator key names verbatim (or renamed). */
const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: 'Minus',
  Equal: 'Equal',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Backslash: 'Backslash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Backquote: 'Backquote',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
};

const PUNCTUATION_LABELS: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

export function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

/**
 * Modifier names in accelerator order. Ctrl is "CommandOrControl" so it maps to ⌘ on macOS.
 * AltGr is ignored: Windows reports it as Ctrl+Alt, but it's how many layouts type
 * characters (AltGr+Q is @ on German keyboards), so it must not count as a shortcut modifier.
 */
export function modifiersOf(e: KeyLike, platform: Platform): string[] {
  const mods: string[] = [];
  const altGr = platform !== 'macos' && e.getModifierState('AltGraph');
  if (platform === 'macos') {
    if (e.metaKey) mods.push('CommandOrControl');
    if (e.ctrlKey) mods.push('Control');
  } else if (e.ctrlKey && !altGr) {
    mods.push('CommandOrControl');
  }
  if (e.altKey && !altGr) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (platform !== 'macos' && e.metaKey) mods.push('Super');
  return mods;
}

export type RecordResult =
  | { kind: 'cancel' }
  /** Only modifiers held so far. */
  | { kind: 'partial'; modifiers: string[] }
  | { kind: 'invalid'; reason: string }
  | { kind: 'done'; accelerator: string };

export function recordKey(e: KeyLike, platform: Platform): RecordResult {
  const mods = modifiersOf(e, platform);
  if (e.key === 'Escape' && mods.length === 0) return { kind: 'cancel' };
  if (MODIFIER_KEYS.has(e.key)) return { kind: 'partial', modifiers: mods };

  const key = keyFromCode(e.code);
  if (!key) return { kind: 'invalid', reason: 'That key can’t be used in a shortcut. Try a letter, number or F-key.' };
  // Shared with src-tauri/src/hotkey.rs: F-keys may go alone (or with Shift); anything
  // else needs Ctrl/Alt/Super, since Shift+key or a bare key is normal typing and editing.
  const mainMods = mods.filter((m) => m !== 'Shift');
  if (mainMods.length === 0 && !/^F\d+$/.test(key)) {
    const names = platform === 'macos' ? '⌘, ⌥ or ⌃' : platform === 'windows' ? 'Ctrl, Alt or Win' : 'Ctrl, Alt or Super';
    return { kind: 'invalid', reason: `Add ${names} (or use an F-key) so normal typing still works.` };
  }
  return { kind: 'done', accelerator: [...mods, key].join('+') };
}

const MAC_LABELS: Record<string, string> = {
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  command: '⌘',
  cmd: '⌘',
  super: '⌘',
  meta: '⌘',
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
};

const PC_LABELS: Record<string, string> = {
  commandorcontrol: 'Ctrl',
  cmdorctrl: 'Ctrl',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
};

const KEY_LABELS: Record<string, string> = {
  ...PUNCTUATION_LABELS,
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↵',
  Plus: '+',
};

/** "CommandOrControl+Shift+P" -> ["Ctrl", "Shift", "P"] (or ["⌘", "⇧", "P"] on macOS). */
export function acceleratorKeys(accelerator: string, platform: Platform): string[] {
  return accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (platform === 'macos' && MAC_LABELS[lower]) return MAC_LABELS[lower];
      if (platform !== 'macos') {
        if (PC_LABELS[lower]) return PC_LABELS[lower];
        if (['super', 'meta', 'command', 'cmd'].includes(lower)) return platform === 'windows' ? 'Win' : 'Super';
      }
      const key = part.replace(/^Key(?=[A-Z]$)/, '').replace(/^Digit(?=\d$)/, '');
      return KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
    });
}
