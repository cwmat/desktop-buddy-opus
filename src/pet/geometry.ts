/**
 * Plain geometry for the pet runtime. Everything is in PHYSICAL pixels on the virtual
 * desktop. No Tauri imports so the brain (and its tests) can use it.
 */
import type { ScreenRect } from '$lib/ipc';

export interface Point {
  x: number;
  y: number;
}

export type Rect = ScreenRect;

/** One display: full bounds plus the work area (bounds minus taskbar/docks). */
export interface MonitorArea {
  bounds: Rect;
  work: Rect;
  scale: number;
  primary: boolean;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const right = (r: Rect) => r.x + r.width;
export const bottom = (r: Rect) => r.y + r.height;

/** Inclusive on the bottom/right edge (plus `slack`) so a pet standing on the edge still counts. */
export function contains(r: Rect, p: Point, slack = 0): boolean {
  return p.x >= r.x - slack && p.x <= right(r) + slack && p.y >= r.y - slack && p.y <= bottom(r) + slack;
}

/** The monitor whose bounds contain `p`, else the closest one. */
export function monitorAt(monitors: readonly MonitorArea[], p: Point): MonitorArea {
  const hit = monitors.find((m) => contains(m.bounds, p));
  if (hit) return hit;
  let best = monitors[0];
  let bestDist = Infinity;
  for (const m of monitors) {
    const cx = clamp(p.x, m.bounds.x, right(m.bounds));
    const cy = clamp(p.y, m.bounds.y, bottom(m.bounds));
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/** Default home: on the taskbar of the primary monitor, ~85% of the way across. */
export function defaultHome(monitors: readonly MonitorArea[]): Point {
  const m = monitors.find((mon) => mon.primary) ?? monitors[0];
  return { x: Math.round(m.work.x + m.work.width * 0.85), y: bottom(m.work) };
}
