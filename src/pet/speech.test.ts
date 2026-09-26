import { describe, expect, it } from 'vitest';
import type { PetLines } from '$pets/types';
import { Chatter, type Bubble } from './speech';

const LINES: PetLines = {
  greet: ['Hi!'],
  idle: ['Musing A', 'Musing B'],
  pat: ['Hehe'],
  treat: ['Yum'],
  hungry: ['Snack?'],
};

describe('Chatter', () => {
  it('gives a mood nudge time to be read after a busy spell', () => {
    const chatter = new Chatter(() => 0.9, LINES);
    chatter.setLevel('chatty', 0);
    chatter.setMood('hungry');
    let now = 0;
    // An hour asleep: both timers come due together.
    for (; now < 3_600_000; now += 1000) chatter.tick(now, false);
    const said: Bubble[] = [];
    for (const end = now + 30_000; now < end; now += 33) {
      const b = chatter.tick(now, true);
      if (b) said.push(b);
    }
    expect(said).toEqual([{ text: 'Snack?', kind: 'say' }]);
  });
});
