import { describe, expect, it } from 'vitest';
import { aboveFeet, defaultHome, groundHome, monitorAt, type MonitorArea } from './geometry';

// The primary monitor with a 40 px taskbar, and one to its left at negative x whose
// taskbar is a little taller.
const PRIMARY: MonitorArea = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  work: { x: 0, y: 0, width: 1920, height: 1040 },
  scale: 1,
  primary: true,
};
const LEFT: MonitorArea = {
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  work: { x: -1920, y: 0, width: 1920, height: 1032 },
  scale: 1,
  primary: false,
};
// Stacked above the primary, without a taskbar.
const ABOVE: MonitorArea = {
  bounds: { x: 0, y: -1080, width: 1920, height: 1080 },
  work: { x: 0, y: -1080, width: 1920, height: 1080 },
  scale: 1,
  primary: false,
};

describe('defaultHome', () => {
  it('is a ground home on the primary monitor', () => {
    expect(defaultHome([LEFT, PRIMARY])).toEqual({ x: 1632, y: 1040, ground: true });
  });
});

describe('groundHome', () => {
  it('moves a ground home with the taskbar edge', () => {
    const autoHide = { ...PRIMARY, work: { ...PRIMARY.work, height: 1080 } };
    expect(groundHome({ x: 1600, y: 1040, ground: true }, [autoHide])).toEqual({ x: 1600, y: 1080, ground: true });
    expect(groundHome({ x: 1600, y: 1080, ground: true }, [PRIMARY])).toEqual({ x: 1600, y: 1040, ground: true });
  });

  it('leaves a spot home where it is', () => {
    const spot = { x: 700, y: 500, ground: false };
    expect(groundHome(spot, [PRIMARY])).toBe(spot);
  });

  it('treats a home right on the ground as a ground home', () => {
    expect(groundHome({ x: 700, y: 1040, ground: false }, [PRIMARY])).toEqual({ x: 700, y: 1040, ground: true });
  });

  it('uses the ground of the monitor the home is on, also at negative x', () => {
    expect(groundHome({ x: -300, y: 1040, ground: true }, [PRIMARY, LEFT])).toEqual({ x: -300, y: 1032, ground: true });
  });

  it('keeps a home on the bottom edge of the upper monitor there, not on the one below', () => {
    expect(groundHome({ x: 500, y: 0, ground: true }, [PRIMARY, ABOVE])).toEqual({ x: 500, y: 0, ground: true });
  });
});

describe('monitorAt', () => {
  it('finds monitors left of the primary', () => {
    expect(monitorAt([PRIMARY, LEFT], { x: -1, y: 500 })).toBe(LEFT);
    expect(monitorAt([PRIMARY, LEFT], { x: -2500, y: 500 })).toBe(LEFT);
  });

  it('puts feet on a shared edge on the monitor above them', () => {
    expect(monitorAt([PRIMARY, ABOVE], aboveFeet({ x: 500, y: 0 }))).toBe(ABOVE);
  });
});
