/** Compiles buddy frames to tiny canvases once, so every <Sprite> can blit them cheaply. */
import { frameToRGBA } from '$pets/sprite';
import { SPRITE_SIZE, type AnimationName, type PetDefinition, type SpriteAnimation } from '$pets/types';

const FALLBACK: Partial<Record<AnimationName, AnimationName>> = { fall: 'drag', sit: 'idle', blink: 'idle' };

/** The requested animation, or the documented fallback when a buddy doesn't have it. */
export function animationFor(pet: PetDefinition, name: AnimationName): SpriteAnimation {
  return pet.animations[name] ?? pet.animations[FALLBACK[name] ?? 'idle'] ?? pet.animations.idle;
}

const cache = new WeakMap<PetDefinition, Map<SpriteAnimation, HTMLCanvasElement[]>>();

export function framesOf(pet: PetDefinition, animation: SpriteAnimation): HTMLCanvasElement[] {
  let perPet = cache.get(pet);
  if (!perPet) cache.set(pet, (perPet = new Map()));
  let frames = perPet.get(animation);
  if (!frames) {
    frames = animation.frames.map((frame) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SPRITE_SIZE;
      const rgba = frameToRGBA(frame, pet.palette);
      canvas.getContext('2d')!.putImageData(new ImageData(rgba as ImageDataArray, SPRITE_SIZE, SPRITE_SIZE), 0, 0);
      return canvas;
    });
    perPet.set(animation, frames);
  }
  return frames;
}
