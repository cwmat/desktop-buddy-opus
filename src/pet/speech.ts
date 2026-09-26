/**
 * What the buddy says and when. Reactions to events (greet, pat, treat...) fire with a
 * per-event chance; idle musings and mood nudges run on timers scaled by the chattiness
 * setting. Pure logic: returns bubbles for effects.ts to show.
 */
import type { SpeechLevel } from '$lib/settings';
import type { Mood } from '$lib/stats';
import type { PetLines } from '$pets/types';
import type { Rng } from './brain';

export interface Bubble {
  text: string;
  /** 'think' draws a thought bubble (little dots instead of a tail). */
  kind: 'say' | 'think';
  icon?: 'treat' | 'heart';
}

export type ChatEvent = 'greet' | 'pat' | 'treat' | 'wake' | 'grumpy' | 'drag' | 'sleepy' | 'dizzy';

const CHANCE: Record<ChatEvent, number> = {
  greet: 1,
  pat: 0.3,
  treat: 0.7,
  wake: 0.8,
  grumpy: 0.7,
  drag: 0.3,
  sleepy: 0.5,
  dizzy: 0.6,
};

/** Seconds between idle musings. */
const IDLE_GAP: Record<Exclude<SpeechLevel, 'off'>, [number, number]> = {
  rare: [360, 600],
  normal: [120, 240],
  chatty: [40, 90],
};
/** Mood nudges are rarer than musings; scaled per level. */
const MOOD_GAP: [number, number] = [240, 420];
const MOOD_SCALE: Record<Exclude<SpeechLevel, 'off'>, number> = { rare: 2, normal: 1, chatty: 0.6 };

/** Generic lines for moments a buddy has no lines of its own for. */
const FALLBACK = {
  wake: ['*yawn*', 'Mm? I’m up!'],
  sleepy: ['*yawn*', 'Nap time...'],
  drag: ['Wheee!', 'Whoa!'],
  grumpy: ['Hmph!', 'I was napping...', 'Five more minutes...'],
  dizzy: ['Whoa, easy!', 'Too many pokes!', '@_@'],
  lonely: ['Psst... pat me?', 'Hey! Over here!', 'Notice me?'],
};

export class Chatter {
  private level: SpeechLevel = 'normal';
  private lines: PetLines;
  private mood: Mood | null = null;
  private nextIdle = Infinity;
  private nextMood = Infinity;
  private lastText = '';

  constructor(
    private readonly rng: Rng,
    lines: PetLines,
  ) {
    this.lines = lines;
  }

  setLevel(level: SpeechLevel, now: number): void {
    if (level === this.level && this.nextIdle !== Infinity) return;
    this.level = level;
    this.schedule(now);
  }

  setLines(lines: PetLines): void {
    this.lines = lines;
  }

  setMood(mood: Mood | null): void {
    this.mood = mood;
  }

  /** A line in reaction to something that just happened (maybe). */
  react(event: ChatEvent): Bubble | null {
    if (this.level === 'off' || this.rng() >= CHANCE[event]) return null;
    const l = this.lines;
    const pool: Record<ChatEvent, string[] | undefined> = {
      greet: l.greet,
      pat: l.pat,
      treat: l.treat,
      wake: l.wake ?? FALLBACK.wake,
      grumpy: FALLBACK.grumpy,
      drag: l.drag ?? FALLBACK.drag,
      sleepy: l.sleepy ?? FALLBACK.sleepy,
      dizzy: FALLBACK.dizzy,
    };
    return this.line(pool[event]);
  }

  /** Explicit request (palette/tray "say"): always answers, whatever the chattiness. */
  say(text?: string): Bubble {
    const t = text?.trim();
    return t ? { text: t, kind: 'say' } : (this.line(this.lines.idle) ?? { text: '...', kind: 'say' });
  }

  /** Timers: idle musings and mood nudges. `canChat` is false while busy or asleep. */
  tick(now: number, canChat: boolean): Bubble | null {
    if (this.level === 'off') return null;
    if (!canChat) {
      // Do not blurt everything out the moment it is free again.
      this.nextIdle = Math.max(this.nextIdle, now + 15_000);
      this.nextMood = Math.max(this.nextMood, now + 15_000);
      return null;
    }
    if (now >= this.nextMood) {
      this.nextMood = now + this.gap(MOOD_GAP) * MOOD_SCALE[this.level];
      const nudge = this.moodNudge();
      if (nudge) return nudge;
    }
    if (now >= this.nextIdle) {
      this.nextIdle = now + this.gap(IDLE_GAP[this.level]);
      return this.line(this.lines.idle);
    }
    return null;
  }

  private moodNudge(): Bubble | null {
    if (this.mood === 'hungry') {
      return this.rng() < 0.5 ? { text: '', kind: 'think', icon: 'treat' } : this.line(this.lines.hungry);
    }
    if (this.mood === 'lonely') return this.line(FALLBACK.lonely);
    return null;
  }

  private schedule(now: number): void {
    if (this.level === 'off') {
      this.nextIdle = this.nextMood = Infinity;
      return;
    }
    this.nextIdle = now + this.gap(IDLE_GAP[this.level]);
    this.nextMood = now + this.gap(MOOD_GAP) * MOOD_SCALE[this.level] * 0.5;
  }

  private gap([min, max]: [number, number]): number {
    return (min + (max - min) * this.rng()) * 1000;
  }

  /** A random line from `pool`, avoiding an immediate repeat. */
  private line(pool: string[] | undefined): Bubble | null {
    if (!pool?.length) return null;
    let text = pool[Math.floor(this.rng() * pool.length)];
    if (text === this.lastText && pool.length > 1) text = pool[(pool.indexOf(text) + 1) % pool.length];
    this.lastText = text;
    return { text, kind: 'say' };
  }
}
