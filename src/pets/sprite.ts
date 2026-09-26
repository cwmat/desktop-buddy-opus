/**
 * Helpers for authoring pixel-art frames as text, plus validation and compilation
 * to RGBA. Used by pet definitions, the renderers, tests and the preview script.
 */
import {
  REQUIRED_ANIMATIONS,
  SPRITE_SIZE,
  type Frame,
  type PetDefinition,
  type SpriteAnimation,
} from './types';

export const TRANSPARENT = '.';

function parseRows(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Parse a full frame from a template literal. Indentation and blank lines are ignored,
 * so frames can be written inline:
 *
 *   const idle = sprite(`
 *     ................................
 *     ...
 *   `);
 */
export function sprite(text: string): Frame {
  return parseRows(text);
}

/** A blank (fully transparent) frame. */
export function blank(): Frame {
  return Array.from({ length: SPRITE_SIZE }, () => TRANSPARENT.repeat(SPRITE_SIZE));
}

/** Move a frame by (dx, dy) pixels; uncovered pixels become transparent. */
export function shift(frame: Frame, dx: number, dy: number): Frame {
  return frame.map((_, y) => {
    let row = '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const sy = y - dy;
      const sx = x - dx;
      row += frame[sy]?.[sx] ?? TRANSPARENT;
    }
    return row;
  });
}

/**
 * Stamp a small patch onto a frame at (x, y). Transparent (`.`) patch pixels keep the
 * base pixel; use `_` in a patch to explicitly erase to transparent.
 *
 *   const blink = patch(idle, 12, 14, `
 *     kk.kk
 *   `);
 */
export function patch(frame: Frame, x: number, y: number, patchText: string | Frame): Frame {
  const rows = typeof patchText === 'string' ? parseRows(patchText) : patchText;
  const out = frame.map((row) => row.split(''));
  rows.forEach((prow, py) => {
    for (let px = 0; px < prow.length; px++) {
      const ch = prow[px];
      const ty = y + py;
      const tx = x + px;
      if (ch === TRANSPARENT || !out[ty] || tx < 0 || tx >= SPRITE_SIZE) continue;
      out[ty][tx] = ch === '_' ? TRANSPARENT : ch;
    }
  });
  return out.map((row) => row.join(''));
}

/** Mirror horizontally. */
export function flipX(frame: Frame): Frame {
  return frame.map((row) => row.split('').reverse().join(''));
}

/** Swap palette characters, e.g. `recolor(f, { b: 'B' })`. */
export function recolor(frame: Frame, map: Readonly<Record<string, string>>): Frame {
  return frame.map((row) =>
    row
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join(''),
  );
}

export function anim(fps: number, frames: readonly Frame[], loop = true): SpriteAnimation {
  return { fps, frames, loop };
}

// ---------------------------------------------------------------------------
// Colors & compilation
// ---------------------------------------------------------------------------

export type RGBA = readonly [number, number, number, number];

export function parseColor(hex: string): RGBA {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid color "${hex}" (use #rgb, #rrggbb or #rrggbbaa)`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255];
}

/** Compile a frame to a SPRITE_SIZE² RGBA buffer (row-major, 4 bytes per pixel). */
export function frameToRGBA(frame: Frame, palette: Readonly<Record<string, string>>): Uint8ClampedArray {
  const colors = new Map<string, RGBA>();
  for (const [key, hex] of Object.entries(palette)) colors.set(key, parseColor(hex));
  const data = new Uint8ClampedArray(SPRITE_SIZE * SPRITE_SIZE * 4);
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const row = frame[y] ?? '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const c = colors.get(row[x] ?? TRANSPARENT);
      if (!c) continue;
      data.set(c, (y * SPRITE_SIZE + x) * 4);
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns a list of human-readable problems; empty means the pet is valid. */
export function validatePet(pet: PetDefinition): string[] {
  const errors: string[] = [];
  const where = (a: string, i: number) => `${pet.id}.${a}[${i}]`;

  if (!/^[a-z][a-z0-9-]*$/.test(pet.id)) errors.push(`id "${pet.id}" must be kebab-case`);
  for (const key of Object.keys(pet.palette)) {
    if (key.length !== 1) errors.push(`${pet.id}: palette key "${key}" must be one character`);
    if (key === TRANSPARENT || key === '_') errors.push(`${pet.id}: palette key "${key}" is reserved`);
    try {
      parseColor(pet.palette[key]);
    } catch (e) {
      errors.push(`${pet.id}: ${(e as Error).message}`);
    }
  }
  try {
    parseColor(pet.accent);
  } catch {
    errors.push(`${pet.id}: invalid accent color`);
  }

  for (const name of REQUIRED_ANIMATIONS) {
    if (!pet.animations[name]) errors.push(`${pet.id}: missing required animation "${name}"`);
  }

  for (const [name, animation] of Object.entries(pet.animations)) {
    if (!animation) continue;
    if (!(animation.fps > 0)) errors.push(`${pet.id}.${name}: fps must be > 0`);
    if (animation.frames.length === 0) errors.push(`${pet.id}.${name}: no frames`);
    animation.frames.forEach((frame, i) => {
      if (frame.length !== SPRITE_SIZE) {
        errors.push(`${where(name, i)}: ${frame.length} rows, expected ${SPRITE_SIZE}`);
      }
      frame.forEach((row, y) => {
        if (row.length !== SPRITE_SIZE) {
          errors.push(`${where(name, i)} row ${y}: ${row.length} chars, expected ${SPRITE_SIZE}`);
        }
        for (const ch of row) {
          if (ch !== TRANSPARENT && !(ch in pet.palette)) {
            errors.push(`${where(name, i)} row ${y}: "${ch}" not in palette`);
            break;
          }
        }
      });
    });
  }

  const lines = pet.lines;
  for (const key of ['greet', 'idle', 'pat', 'treat', 'hungry'] as const) {
    if (!lines[key]?.length) errors.push(`${pet.id}: lines.${key} is empty`);
  }
  for (const [key, value] of Object.entries(pet.personality)) {
    if (!(value >= 1 && value <= 10)) errors.push(`${pet.id}: personality.${key} must be 1–10`);
  }
  return errors;
}
