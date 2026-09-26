/**
 * Mouse handling for the overlay. The window ignores the mouse by default so the
 * transparent area never blocks the desktop; we hit-test the polled global cursor
 * against the pet's opaque pixels and only accept mouse events while it is over the pet.
 * Then: click = pat, double-click = celebrate, drag = carry, Ctrl+wheel = resize,
 * right-click = menu.
 */
import type { Point } from './geometry';
import type { Stage } from './stage';

export interface InputHandlers {
  click(double: boolean): void;
  dragStart(): void;
  /** New feet position while carried (physical px). */
  dragMove(anchor: Point): void;
  /** Released; `velocity` in physical px/s for flinging. */
  drop(velocity: Point): void;
  resize(step: 1 | -1): void;
  contextMenu(): void;
}

export interface HitTester {
  hitTest(localX: number, localY: number): boolean;
}

/** CSS px of movement before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
const CLICK_MAX_MS = 450;
const DOUBLE_CLICK_MS = 320;
/** Keep accepting the mouse briefly after the hit-test misses, to avoid edge flicker. */
const HOVER_GRACE_MS = 150;
const VELOCITY_WINDOW_MS = 100;
const WHEEL_STEP_MS = 150;

interface Press {
  id: number;
  clientX: number;
  clientY: number;
  at: number;
  /** Cursor offset from the feet anchor, physical px. */
  grab: Point;
}

export class Input {
  hovered = false;
  dragging = false;

  private press: Press | null = null;
  private samples: { t: number; p: Point }[] = [];
  private lastSample: Point | null = null;
  private lastClick = { at: -Infinity, x: 0, y: 0 };
  private lastHit = -Infinity;
  private lastWheel = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly stage: Stage,
    private readonly hit: HitTester,
    private readonly on: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('lostpointercapture', this.onCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Per frame: follow the cursor while dragging, hit-test, toggle click-through. */
  update(now: number, cursor: Point | null, passThrough: boolean): void {
    if (this.dragging && this.press && cursor) {
      if (cursor !== this.lastSample) {
        this.lastSample = cursor;
        this.samples.push({ t: now, p: cursor });
        while (this.samples.length > 2 && now - this.samples[0].t > VELOCITY_WINDOW_MS) this.samples.shift();
      }
      this.on.dragMove({ x: cursor.x - this.press.grab.x, y: cursor.y - this.press.grab.y });
    }

    if (!passThrough && cursor) {
      const { x, y } = this.stage.position;
      if (this.hit.hitTest(cursor.x - x, cursor.y - y)) this.lastHit = now;
    }
    this.hovered = !passThrough && (this.press !== null || now - this.lastHit < HOVER_GRACE_MS);
    this.stage.setIgnoreCursor(!this.hovered);
    this.el.style.cursor = this.dragging ? 'grabbing' : this.hovered ? 'grab' : '';
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.hovered) return;
    e.preventDefault();
    this.el.setPointerCapture(e.pointerId);
    const dpr = this.stage.layout.scale;
    const { footX, footY } = this.stage.layout;
    this.press = {
      id: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      at: performance.now(),
      grab: { x: e.clientX * dpr - footX, y: e.clientY * dpr - footY },
    };
  };

  private onMove = (e: PointerEvent) => {
    const p = this.press;
    if (!p || this.dragging || e.pointerId !== p.id) return;
    // The window has not moved yet, so client coordinates are stable here.
    if (Math.hypot(e.clientX - p.clientX, e.clientY - p.clientY) <= DRAG_THRESHOLD) return;
    this.dragging = true;
    this.samples = [];
    this.lastSample = null;
    this.on.dragStart();
  };

  private onUp = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (this.dragging) {
      this.dragging = false;
      this.on.drop(this.releaseVelocity());
      return;
    }
    const now = performance.now();
    if (now - p.at > CLICK_MAX_MS) return;
    const double =
      now - this.lastClick.at < DOUBLE_CLICK_MS &&
      Math.hypot(e.clientX - this.lastClick.x, e.clientY - this.lastClick.y) < 8;
    // A double-click consumes the pair, so a triple-click is double + single.
    this.lastClick = double ? { at: -Infinity, x: 0, y: 0 } : { at: now, x: e.clientX, y: e.clientY };
    this.on.click(double);
  };

  private onCancel = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    if (this.dragging) {
      this.dragging = false;
      this.on.drop({ x: 0, y: 0 });
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now - this.lastWheel < WHEEL_STEP_MS || e.deltaY === 0) return;
    this.lastWheel = now;
    this.on.resize(e.deltaY < 0 ? 1 : -1);
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (this.hovered && !this.dragging) this.on.contextMenu();
  };

  private releaseVelocity(): Point {
    const now = performance.now();
    const recent = this.samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
    if (recent.length < 2) return { x: 0, y: 0 };
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? { x: (b.p.x - a.p.x) / dt, y: (b.p.y - a.p.y) / dt } : { x: 0, y: 0 };
  }
}
