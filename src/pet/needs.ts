/**
 * Tamagotchi-lite stats for the active buddy: gentle decay over time, treats and pats,
 * throttled persistence, and a live broadcast so the settings window stays in sync.
 * With needs switched off nothing decays and moods are ignored, but treats and pats
 * still count.
 */
import { emitStats } from '$lib/events';
import { ipc } from '$lib/ipc';
import { decay, feed, freshStats, moodOf, pat, type Mood, type PetStats, type StatsMap } from '$lib/stats';

const DECAY_EVERY_MS = 60_000;
/** Background changes (decay) are saved at most about this often... */
const SAVE_IDLE_MS = 45_000;
/** ...interactions a little after they happen. */
const SAVE_SOON_MS = 2_000;

export class Needs {
  onChange: ((mood: Mood | null) => void) | null = null;

  private stats: StatsMap;
  private petId: string;
  private enabled: boolean;
  private lastDecay = Date.now();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDueAt = Infinity;

  constructor(stats: StatsMap, petId: string, enabled: boolean) {
    this.stats = stats;
    this.petId = petId;
    this.enabled = enabled;
    this.activate();
  }

  get mood(): Mood | null {
    return this.enabled ? moodOf(this.current) : null;
  }

  private get current(): PetStats {
    return this.stats[this.petId] ?? freshStats();
  }

  setPet(petId: string): void {
    if (petId === this.petId) return;
    this.petId = petId;
    this.activate();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    // Restart the clock so time spent with needs off does not count against the buddy.
    this.update((s, now) => ({ ...s, updatedAt: now }), SAVE_IDLE_MS);
  }

  feed(): void {
    this.update((s, now) => (this.enabled ? feed(s, now) : { ...s, treats: s.treats + 1 }), SAVE_SOON_MS);
  }

  pat(): void {
    this.update((s, now) => (this.enabled ? pat(s, now) : { ...s, pats: s.pats + 1 }), SAVE_SOON_MS);
  }

  tick(now: number): void {
    if (now - this.lastDecay < DECAY_EVERY_MS) return;
    this.lastDecay = now;
    if (this.enabled) this.update((s, t) => decay(s, t), SAVE_IDLE_MS);
  }

  /** Make sure the active buddy has stats and catch up on time spent away. */
  private activate(): void {
    const existing = this.stats[this.petId];
    this.update((s, now) => (!existing ? freshStats(now) : this.enabled ? decay(s, now) : s), SAVE_SOON_MS);
  }

  private update(fn: (s: PetStats, now: number) => PetStats, saveIn: number): void {
    this.stats = { ...this.stats, [this.petId]: fn(this.current, Date.now()) };
    void emitStats(this.stats).catch(() => {});
    this.scheduleSave(saveIn);
    this.onChange?.(this.mood);
  }

  private scheduleSave(delay: number): void {
    const due = Date.now() + delay;
    if (due >= this.saveDueAt) return; // an earlier save is already on its way
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveDueAt = due;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveDueAt = Infinity;
      ipc.saveStats(this.stats).catch((e) => console.warn('[pet] saving stats failed', e));
    }, delay);
  }
}
