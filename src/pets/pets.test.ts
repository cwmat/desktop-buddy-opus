import { describe, expect, it } from 'vitest';
import { PETS, getPet } from './index';
import { patch, shift, sprite, validatePet } from './sprite';
import { SPRITE_SIZE } from './types';

describe('pet roster', () => {
  it('has unique ids', () => {
    const ids = PETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PETS.map((p) => [p.id, p] as const))('%s is a valid pet', (_id, pet) => {
    expect(validatePet(pet)).toEqual([]);
  });

  it.each(PETS.map((p) => [p.id, p] as const))('%s stands on the bottom row', (_id, pet) => {
    const idle = pet.animations.idle.frames[0];
    expect(idle[SPRITE_SIZE - 1].replaceAll('.', '').length).toBeGreaterThan(0);
  });

  it('falls back to the first pet for unknown ids', () => {
    expect(getPet('nope').id).toBe(PETS[0].id);
  });
});

describe('sprite helpers', () => {
  const tiny = sprite(Array.from({ length: SPRITE_SIZE }, (_, y) => (y === 0 ? 'a' : '.').padEnd(SPRITE_SIZE, '.')).join('\n'));

  it('shifts with transparent fill', () => {
    const moved = shift(tiny, 1, 1);
    expect(moved[0]).toBe('.'.repeat(SPRITE_SIZE));
    expect(moved[1][1]).toBe('a');
  });

  it('patches, keeping base under "." and erasing with "_"', () => {
    const p = patch(tiny, 0, 0, 'b.\n_b');
    expect(p[0].slice(0, 2)).toBe('b.');
    expect(p[1].slice(0, 2)).toBe('.b');
  });
});
