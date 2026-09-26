/**
 * A procedurally drawn blob used as a stand-in while a buddy's real art is being made.
 * Real pets should hand-author their frames with the helpers in ./sprite.
 */
import { anim, patch, shift } from './sprite';
import { SPRITE_SIZE, type Frame, type PetDefinition } from './types';

function blob(squash = 0): Frame {
  const rows: string[] = [];
  const cx = 15.5;
  const rx = 10 + squash;
  const ry = 9 - squash;
  const cy = SPRITE_SIZE - ry;
  for (let y = 0; y < SPRITE_SIZE; y++) {
    let row = '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      row += d <= 0.78 ? 'b' : d <= 1 ? 'o' : '.';
    }
    rows.push(row);
  }
  return rows;
}

const EYES_OPEN = `
  k...k
  k...k
`;
const EYES_SHUT = `
  .....
  k...k
`;

export function placeholderPet(opts: {
  id: string;
  name: string;
  species: string;
  body: string;
  outline: string;
}): PetDefinition {
  const withEyes = (f: Frame, eyes = EYES_OPEN) => patch(f, 13, SPRITE_SIZE - 12, eyes);
  const idle = withEyes(blob());
  const squish = withEyes(blob(1));
  const shut = withEyes(blob(), EYES_SHUT);
  return {
    id: opts.id,
    name: opts.name,
    species: opts.species,
    tagline: 'Still being drawn — check back soon!',
    accent: opts.body,
    palette: { b: opts.body, o: opts.outline, k: '#1b1b24' },
    animations: {
      idle: anim(2, [idle, squish]),
      blink: anim(8, [shut]),
      walk: anim(6, [idle, shift(squish, 0, 0)]),
      sleep: anim(1, [shut, withEyes(blob(1), EYES_SHUT)]),
      happy: anim(6, [shift(idle, 0, -2), squish]),
      eat: anim(6, [squish, idle]),
      drag: anim(4, [shift(idle, 0, -1)]),
    },
    lines: {
      greet: ['Hi! I am still being drawn.'],
      idle: ['...'],
      pat: ['Hehe'],
      treat: ['Yum!'],
      hungry: ['Snack?'],
    },
    personality: { debugging: 5, patience: 5, chaos: 5, wisdom: 5, snark: 5 },
  };
}
