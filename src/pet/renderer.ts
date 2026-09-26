/**
 * Draws the buddy on the pet window's canvas: crisp integer-scaled pixel art plus a bit
 * of procedural life on top of the few hand-drawn frames (bob, hover float, squash &
 * stretch snapped to whole sprite pixels, blink, a soft pixel shadow). Also answers
 * "is this pixel part of the pet?" for click-through hit-testing.
 */
import { frameToRGBA } from '$pets/sprite';
import { SPRITE_SIZE, type AnimationName, type Frame, type PetDefinition } from '$pets/types';
import type { Pose } from './brain';
import type { Layout } from './stage';

interface CompiledFrame {
  image: HTMLCanvasElement;
  flipped: HTMLCanvasElement;
  /** 1 where the pixel is opaque, row-major SPRITE_SIZE². */
  mask: Uint8Array;
}

interface CompiledAnim {
  frames: CompiledFrame[];
  fps: number;
  loop: boolean;
}

/** Where the sprite was last drawn, in window-local physical px. */
export interface SpriteBox {
  /** Horizontal centre of the sprite. */
  cx: number;
  /** Top of the visible art (stable per pet, so bubbles do not jitter with frames). */
  headY: number;
  feetY: number;
  /** Physical px per sprite pixel. */
  px: number;
  facing: 1 | -1;
  /** Centre of the mouth pixel, following flip/squash/lift. */
  mouthX: number;
  mouthY: number;
}

/** Optional animations fall back to required ones. */
const FALLBACK: Partial<Record<AnimationName, AnimationName>> = { fall: 'drag', sit: 'idle', blink: 'idle' };

/**
 * Procedural bob for animations that only have a single frame, so a still frame never
 * looks frozen. Multi-frame animations already move, so they are left alone.
 */
const BOB: Partial<Record<AnimationName, { periodMs: number; px: number }>> = {
  idle: { periodMs: 2400, px: 1 },
  sit: { periodMs: 3200, px: 1 },
  walk: { periodMs: 320, px: 1 },
  happy: { periodMs: 420, px: 2 },
  eat: { periodMs: 260, px: 1 },
  drag: { periodMs: 700, px: 1 },
};

const HOVER_LIFT = 3;
const SHADOW_WIDTH = 20;

export class Renderer {
  box: SpriteBox = { cx: 0, headY: 0, feetY: 0, px: 1, facing: 1, mouthX: 0, mouthY: 0 };

  private readonly ctx: CanvasRenderingContext2D;
  private anims = new Map<AnimationName, CompiledAnim>();
  private hover = false;
  /** First opaque row of the idle frame: where the head is. */
  private headRow = 0;
  /** Mouth in sprite pixels (right-facing). */
  private mouth = { x: 22, y: 16 };
  private layout: Layout | null = null;
  private lastKey = '';
  private nextBlink = 0;
  private blinkUntil = 0;
  private drawn: { frame: CompiledFrame; x: number; y: number; w: number; h: number; flip: boolean } | null =
    null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  setPet(pet: PetDefinition): void {
    this.anims.clear();
    for (const [name, anim] of Object.entries(pet.animations)) {
      if (!anim) continue;
      this.anims.set(name as AnimationName, {
        frames: anim.frames.map((f) => compileFrame(f, pet.palette)),
        fps: anim.fps,
        loop: anim.loop ?? true,
      });
    }
    this.hover = !!pet.traits?.hover;
    const idleMask = this.anims.get('idle')?.frames[0]?.mask;
    this.headRow = idleMask ? firstOpaqueRow(idleMask) : 0;
    // Fallback guess: a little in front of centre, 8 px below the top of the head.
    this.mouth = pet.mouth ?? { x: SPRITE_SIZE / 2 + 6, y: Math.min(SPRITE_SIZE - 1, this.headRow + 8) };
    this.lastKey = '';
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
    this.canvas.width = layout.width;
    this.canvas.height = layout.height;
    // Explicit CSS size (not 100%) so a pending window resize clips instead of blurring.
    this.canvas.style.width = `${layout.width / layout.scale}px`;
    this.canvas.style.height = `${layout.height / layout.scale}px`;
    this.lastKey = '';
  }

  draw(pose: Pose, now: number): void {
    const layout = this.layout;
    const anim = this.resolve(pose.anim);
    if (!layout || !anim) return;
    const { px, footX, footY } = layout;

    // Never negative, even if a frame's timestamp predates the animation's start.
    const elapsed = Math.max(0, now - pose.animStart);
    let frameIndex = Math.floor((elapsed / 1000) * anim.fps);
    frameIndex = anim.loop ? frameIndex % anim.frames.length : Math.min(frameIndex, anim.frames.length - 1);
    let frame = anim.frames[frameIndex];
    const blinking = this.blink(pose, now);
    if (blinking) frame = this.anims.get('blink')!.frames[0];

    // Offsets in whole sprite pixels keep everything on the pixel grid.
    const squash = Math.round(pose.squash);
    let lift = 0;
    const bob = BOB[pose.anim];
    if (this.hover) {
      lift = HOVER_LIFT + Math.round(Math.sin((now / 2200) * Math.PI * 2) * 1.5);
    } else if (bob && anim.frames.length === 1) {
      lift = now % bob.periodMs < bob.periodMs / 2 ? bob.px : 0;
    }
    const shake = pose.shake ? (Math.floor(now / 60) % 2 ? 1 : -1) : 0;
    const sway = Math.round(pose.sway);
    const flip = pose.facing === -1;

    const air = Math.min(1, pose.lift / (24 * px));
    const shadowScale = (1 - air * 0.65) * (this.hover ? 0.75 : 1);
    const shadowW = 2 * Math.max(2, Math.round((SHADOW_WIDTH * shadowScale) / 2));
    const shadowAlpha = Math.round((0.26 - air * 0.12) * 100) / 100;

    const key = [pose.anim, frameIndex, blinking, flip, squash, lift, shake, sway, pose.visible, shadowW, shadowAlpha].join();
    if (key === this.lastKey) return;
    this.lastKey = key;

    const w = (SPRITE_SIZE + squash) * px;
    const h = (SPRITE_SIZE - squash) * px;
    const cx = footX + (sway + shake) * px;
    const x = Math.round(cx - w / 2);
    const y = footY - h - lift * px;
    // Kept up to date even while hidden: effects (e.g. the poof) anchor on it.
    const cell = w / SPRITE_SIZE;
    const mouthCol = flip ? SPRITE_SIZE - 1 - this.mouth.x : this.mouth.x;
    this.box = {
      cx,
      headY: y + this.headRow * (h / SPRITE_SIZE),
      feetY: footY,
      px,
      facing: pose.facing,
      mouthX: x + (mouthCol + 0.5) * cell,
      mouthY: y + (this.mouth.y + 0.5) * (h / SPRITE_SIZE),
    };

    const ctx = this.ctx;
    ctx.clearRect(0, 0, layout.width, layout.height);
    if (!pose.visible) {
      this.drawn = null;
      return;
    }
    ctx.imageSmoothingEnabled = false;

    // Shadow: a flat 3-row pixel ellipse centred on the feet line.
    ctx.fillStyle = `rgba(20, 16, 36, ${shadowAlpha})`;
    const shadowX = footX + sway * px;
    ctx.fillRect(shadowX - ((shadowW - 4) / 2) * px, footY - 2 * px, (shadowW - 4) * px, px);
    ctx.fillRect(shadowX - (shadowW / 2) * px, footY - px, shadowW * px, px);
    ctx.fillRect(shadowX - ((shadowW - 4) / 2) * px, footY, (shadowW - 4) * px, px);

    ctx.drawImage(flip ? frame.flipped : frame.image, x, y, w, h);
    this.drawn = { frame, x, y, w, h, flip };
  }

  /** Is window-local physical point (lx, ly) on an opaque pixel (± `tolerance` sprite px)? */
  hitTest(lx: number, ly: number, tolerance = 1): boolean {
    const d = this.drawn;
    if (!d) return false;
    const sx = Math.floor(((lx - d.x) / d.w) * SPRITE_SIZE);
    const sy = Math.floor(((ly - d.y) / d.h) * SPRITE_SIZE);
    for (let dy = -tolerance; dy <= tolerance; dy++) {
      for (let dx = -tolerance; dx <= tolerance; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x >= SPRITE_SIZE || y >= SPRITE_SIZE) continue;
        const mx = d.flip ? SPRITE_SIZE - 1 - x : x;
        if (d.frame.mask[y * SPRITE_SIZE + mx]) return true;
      }
    }
    return false;
  }

  private resolve(name: AnimationName): CompiledAnim | undefined {
    return this.anims.get(name) ?? this.anims.get(FALLBACK[name] ?? 'idle') ?? this.anims.get('idle');
  }

  /** Occasional blink while idling, using the optional 'blink' frame. */
  private blink(pose: Pose, now: number): boolean {
    if (pose.anim !== 'idle' || !this.anims.has('blink')) return false;
    if (now >= this.nextBlink) {
      this.blinkUntil = now + 140;
      this.nextBlink = now + 2500 + Math.random() * 4500;
    }
    return now < this.blinkUntil;
  }
}

function compileFrame(frame: Frame, palette: Readonly<Record<string, string>>): CompiledFrame {
  const rgba = frameToRGBA(frame, palette);
  const image = document.createElement('canvas');
  image.width = image.height = SPRITE_SIZE;
  image.getContext('2d')!.putImageData(new ImageData(rgba as ImageDataArray, SPRITE_SIZE, SPRITE_SIZE), 0, 0);

  const flipped = document.createElement('canvas');
  flipped.width = flipped.height = SPRITE_SIZE;
  const fctx = flipped.getContext('2d')!;
  fctx.scale(-1, 1);
  fctx.drawImage(image, -SPRITE_SIZE, 0);

  const mask = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] > 40 ? 1 : 0;
  return { image, flipped, mask };
}

function firstOpaqueRow(mask: Uint8Array): number {
  const i = mask.indexOf(1);
  return i < 0 ? 0 : Math.floor(i / SPRITE_SIZE);
}
