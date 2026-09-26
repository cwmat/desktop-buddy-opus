/** Every frame is a SPRITE_SIZE × SPRITE_SIZE grid. Feet touch the bottom row. */
export const SPRITE_SIZE = 32;

/** Rows of palette characters, top to bottom. `.` is transparent. */
export type Frame = readonly string[];

export interface SpriteAnimation {
  frames: readonly Frame[];
  /** Frames per second. */
  fps: number;
  /** Default true. Non-looping animations hold their last frame. */
  loop?: boolean;
}

/** Animations every buddy must provide. */
export const REQUIRED_ANIMATIONS = ['idle', 'walk', 'sleep', 'happy', 'eat', 'drag'] as const;
/**
 * Optional extras; the renderer falls back when missing:
 * - blink: 1 frame flashed briefly at random while idle (fallback: no blink)
 * - fall:  airborne after being dropped (fallback: drag)
 * - sit:   calm resting pose between walks (fallback: idle)
 */
export const OPTIONAL_ANIMATIONS = ['blink', 'fall', 'sit'] as const;

export type RequiredAnimation = (typeof REQUIRED_ANIMATIONS)[number];
export type OptionalAnimation = (typeof OPTIONAL_ANIMATIONS)[number];
export type AnimationName = RequiredAnimation | OptionalAnimation;

export type PetAnimations = Record<RequiredAnimation, SpriteAnimation> &
  Partial<Record<OptionalAnimation, SpriteAnimation>>;

/** Things the buddy says in speech bubbles. Keep lines short (≤ ~40 chars). */
export interface PetLines {
  /** On launch or when switched to. */
  greet: string[];
  /** Random musings while hanging out. */
  idle: string[];
  /** After a pat (click). */
  pat: string[];
  /** After eating a treat. */
  treat: string[];
  /** When fullness is low. */
  hungry: string[];
  /** Just before a nap. */
  sleepy?: string[];
  /** Waking up. */
  wake?: string[];
  /** When picked up / dragged. */
  drag?: string[];
}

/** Flavor stats shown on the buddy card, 1–10. Purely for fun. */
export interface Personality {
  debugging: number;
  patience: number;
  chaos: number;
  wisdom: number;
  snark: number;
}

export interface PetTraits {
  /** Walk speed multiplier (1 = normal). */
  speed?: number;
  /** Floats a little above the ground instead of standing on it (ghosts etc.). */
  hover?: boolean;
}

export interface PetDefinition {
  /** Stable kebab-case id, used in settings and file names. */
  id: string;
  name: string;
  /** Short species label, e.g. "Rubber Debug Duck". */
  species: string;
  /** One-line bio for the buddy card. */
  tagline: string;
  /** UI accent color (#rrggbb) used on the buddy card. */
  accent: string;
  /** Single-character keys → #rgb / #rrggbb / #rrggbbaa. `.` is reserved for transparent. */
  palette: Readonly<Record<string, string>>;
  animations: PetAnimations;
  lines: PetLines;
  personality: Personality;
  traits?: PetTraits;
  /**
   * Where the mouth is, in sprite pixels of the (right-facing) idle pose. Treats and
   * crumbs aim here. Omit to use a rough guess (front of the head).
   */
  mouth?: { x: number; y: number };
}
