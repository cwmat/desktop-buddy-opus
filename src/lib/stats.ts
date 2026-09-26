/**
 * Tamagotchi-lite needs. Gentle by design: values drift down slowly, nothing bad
 * ever happens at zero — your buddy just gets a bit mopey and asks for a snack.
 */

export interface PetStats {
  /** 0–100. Pats, treats and company raise it. */
  happiness: number;
  /** 0–100. Treats raise it; it slowly drifts down. */
  fullness: number;
  treats: number;
  pats: number;
  /** Epoch ms when first adopted (first time this buddy was active). */
  adoptedAt: number;
  /** Epoch ms of the last decay/interaction update. */
  updatedAt: number;
}

export type StatsMap = Record<string, PetStats>;
export type Mood = 'happy' | 'content' | 'hungry' | 'lonely';

const MINUTE = 60_000;
/** Minutes for each stat to drop by one point. */
const FULLNESS_DECAY_MIN = 6;
const HAPPINESS_DECAY_MIN = 9;
/** Offline time beyond this is ignored so a weekend away is not a guilt trip. */
const MAX_DECAY_MS = 8 * 60 * MINUTE;

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function freshStats(now = Date.now()): PetStats {
  return { happiness: 80, fullness: 70, treats: 0, pats: 0, adoptedAt: now, updatedAt: now };
}

export function normalizeStats(raw: unknown, now = Date.now()): StatsMap {
  const out: StatsMap = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const v = value as Record<string, unknown>;
    const n = (x: unknown, fallback: number) =>
      typeof x === 'number' && Number.isFinite(x) ? x : fallback;
    const base = freshStats(now);
    out[id] = {
      happiness: clamp(n(v.happiness, base.happiness)),
      fullness: clamp(n(v.fullness, base.fullness)),
      treats: Math.max(0, Math.floor(n(v.treats, 0))),
      pats: Math.max(0, Math.floor(n(v.pats, 0))),
      adoptedAt: n(v.adoptedAt, now),
      updatedAt: n(v.updatedAt, now),
    };
  }
  return out;
}

/** Apply time-based drift since `stats.updatedAt`. Returns a new object. */
export function decay(stats: PetStats, now = Date.now()): PetStats {
  const elapsed = Math.min(MAX_DECAY_MS, Math.max(0, now - stats.updatedAt));
  const minutes = elapsed / MINUTE;
  return {
    ...stats,
    fullness: clamp(stats.fullness - minutes / FULLNESS_DECAY_MIN),
    happiness: clamp(stats.happiness - minutes / HAPPINESS_DECAY_MIN),
    updatedAt: now,
  };
}

export function feed(stats: PetStats, now = Date.now()): PetStats {
  const s = decay(stats, now);
  return { ...s, fullness: clamp(s.fullness + 25), happiness: clamp(s.happiness + 6), treats: s.treats + 1 };
}

export function pat(stats: PetStats, now = Date.now()): PetStats {
  const s = decay(stats, now);
  return { ...s, happiness: clamp(s.happiness + 4), pats: s.pats + 1 };
}

export function moodOf(stats: PetStats): Mood {
  if (stats.fullness < 30) return 'hungry';
  if (stats.happiness < 30) return 'lonely';
  if (stats.happiness >= 75 && stats.fullness >= 50) return 'happy';
  return 'content';
}
