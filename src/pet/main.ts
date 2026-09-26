// SKELETON: draws the active buddy's first idle frame. Replaced by the real pet runtime.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getPet } from '$pets';
import { frameToRGBA } from '$pets/sprite';
import { SPRITE_SIZE } from '$pets/types';
import { loadState } from '$lib/ipc';

const { settings } = await loadState();
const pet = getPet(settings.petId);
const canvas = document.createElement('canvas');
canvas.width = canvas.height = SPRITE_SIZE;
canvas.style.cssText = 'width:96px;height:96px;image-rendering:pixelated';
document.body.style.cssText = 'margin:0;background:transparent';
document.body.append(canvas);
const ctx = canvas.getContext('2d')!;
ctx.putImageData(new ImageData(frameToRGBA(pet.animations.idle.frames[0], pet.palette) as ImageDataArray, SPRITE_SIZE, SPRITE_SIZE), 0, 0);
await getCurrentWindow().show();
