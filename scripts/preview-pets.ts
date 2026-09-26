/**
 * Render sprite sheets to PNG so pixel art can be reviewed without running the app.
 *
 *   pnpm pets:preview            # every pet + a roster overview
 *   pnpm pets:preview glorp      # just one pet
 *
 * Output goes to previews/ (git-ignored). Each sheet has one row per animation, in the
 * order printed to stdout; frames are shown on a dark and a light background side by
 * side so contrast can be judged against both kinds of desktop.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { PETS } from '../src/pets/index';
import { frameToRGBA, validatePet } from '../src/pets/sprite';
import { SPRITE_SIZE, type Frame, type PetDefinition } from '../src/pets/types';

const SCALE = 6;
const GAP = 6;
const CELL = SPRITE_SIZE * SCALE;
const DARK: [number, number, number] = [30, 30, 46];
const LIGHT: [number, number, number] = [236, 236, 240];
const OUT_DIR = join(process.cwd(), 'previews');

function fill(png: PNG, x0: number, y0: number, w: number, h: number, rgb: readonly number[]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
      png.data[i + 3] = 255;
    }
  }
}

function drawFrame(png: PNG, frame: Frame, pet: PetDefinition, x0: number, y0: number) {
  const rgba = frameToRGBA(frame, pet.palette);
  for (let sy = 0; sy < SPRITE_SIZE; sy++) {
    for (let sx = 0; sx < SPRITE_SIZE; sx++) {
      const s = (sy * SPRITE_SIZE + sx) * 4;
      const a = rgba[s + 3] / 255;
      if (a === 0) continue;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const i = ((y0 + sy * SCALE + dy) * png.width + (x0 + sx * SCALE + dx)) * 4;
          for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(rgba[s + c] * a + png.data[i + c] * (1 - a));
        }
      }
    }
  }
}

function sheet(pet: PetDefinition): PNG {
  const rows = Object.entries(pet.animations).filter(([, a]) => a && a.frames.length);
  const maxFrames = Math.max(...rows.map(([, a]) => a!.frames.length));
  const half = maxFrames * (CELL + GAP) + GAP;
  const png = new PNG({ width: half * 2, height: rows.length * (CELL + GAP) + GAP });
  fill(png, 0, 0, half, png.height, DARK);
  fill(png, half, 0, half, png.height, LIGHT);
  rows.forEach(([, animation], r) => {
    animation!.frames.forEach((frame, f) => {
      const y = GAP + r * (CELL + GAP);
      drawFrame(png, frame, pet, GAP + f * (CELL + GAP), y);
      drawFrame(png, frame, pet, half + GAP + f * (CELL + GAP), y);
    });
  });
  return png;
}

function roster(pets: readonly PetDefinition[]): PNG {
  const width = pets.length * (CELL + GAP) + GAP;
  const png = new PNG({ width, height: 2 * (CELL + GAP) + GAP });
  fill(png, 0, 0, width, CELL + GAP + GAP / 2, DARK);
  fill(png, 0, CELL + GAP + GAP / 2, width, png.height - (CELL + GAP + GAP / 2), LIGHT);
  pets.forEach((pet, i) => {
    const frame = pet.animations.idle.frames[0];
    drawFrame(png, frame, pet, GAP + i * (CELL + GAP), GAP);
    drawFrame(png, frame, pet, GAP + i * (CELL + GAP), 2 * GAP + CELL);
  });
  return png;
}

const only = process.argv[2];
const pets = only ? PETS.filter((p) => p.id === only) : PETS;
if (only && pets.length === 0) {
  console.error(`No pet with id "${only}". Known: ${PETS.map((p) => p.id).join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
let failed = false;
for (const pet of pets) {
  const errors = validatePet(pet);
  if (errors.length) {
    failed = true;
    console.error(`✗ ${pet.id}\n  ${errors.slice(0, 20).join('\n  ')}`);
    continue;
  }
  const file = join(OUT_DIR, `${pet.id}.png`);
  writeFileSync(file, PNG.sync.write(sheet(pet)));
  const order = Object.entries(pet.animations)
    .filter(([, a]) => a && a.frames.length)
    .map(([name, a]) => `${name}(${a!.frames.length})`);
  console.log(`✓ ${pet.id} → ${file}\n  rows: ${order.join(', ')}`);
}
if (!only) {
  const file = join(OUT_DIR, 'roster.png');
  writeFileSync(file, PNG.sync.write(roster(PETS.filter((p) => validatePet(p).length === 0))));
  console.log(`✓ roster → ${file}`);
}
process.exit(failed ? 1 : 0);
