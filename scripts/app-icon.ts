/**
 * Render a buddy's idle frame as a crisp 1024×1024 app icon source, then feed it to
 * the Tauri icon generator:
 *
 *   pnpm icon            # uses Quackers
 *   pnpm icon glorp      # any pet id
 */
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { getPet } from '../src/pets/index';
import { frameToRGBA } from '../src/pets/sprite';
import { SPRITE_SIZE } from '../src/pets/types';

const SIZE = 1024;
const pet = getPet(process.argv[2] ?? 'quackers');
const rgba = frameToRGBA(pet.animations.idle.frames[0], pet.palette);

// Crop to the opaque bounding box so the buddy fills the icon.
let [minX, minY, maxX, maxY] = [SPRITE_SIZE, SPRITE_SIZE, -1, -1];
for (let y = 0; y < SPRITE_SIZE; y++) {
  for (let x = 0; x < SPRITE_SIZE; x++) {
    if (rgba[(y * SPRITE_SIZE + x) * 4 + 3] === 0) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
}
const side = Math.max(maxX - minX, maxY - minY) + 1 + 2; // 1px margin each side
const scale = Math.floor(SIZE / side);
const offX = Math.floor((SIZE - (maxX - minX + 1) * scale) / 2);
const offY = Math.floor((SIZE - (maxY - minY + 1) * scale) / 2);

const png = new PNG({ width: SIZE, height: SIZE });
for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {
    const s = (y * SPRITE_SIZE + x) * 4;
    if (rgba[s + 3] === 0) continue;
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const i = ((offY + (y - minY) * scale + dy) * SIZE + offX + (x - minX) * scale + dx) * 4;
        png.data.set(rgba.subarray(s, s + 4), i);
      }
    }
  }
}

const out = join(process.cwd(), 'src-tauri', 'icons', 'app-icon.png');
writeFileSync(out, PNG.sync.write(png));
console.log(`✓ ${pet.id} → ${out}`);
execSync(`pnpm tauri icon "${out}"`, { stdio: 'inherit' });
// Desktop-only app: drop the mobile icon sets the generator also emits.
for (const dir of ['android', 'ios']) rmSync(join(process.cwd(), 'src-tauri', 'icons', dir), { recursive: true, force: true });
