/**
 * The pet window itself: how big it is for the current sprite scale, and moving it so
 * the pet's feet sit on a desktop point. Everything here is physical pixels.
 *
 * The window is larger than the sprite: headroom above for bubbles and effects, some
 * side room for sway/squash, and a sliver below the feet for the shadow.
 */
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { SPRITE_SIZE } from '$pets/types';
import type { Point } from './geometry';

export interface Layout {
  /** Window scale factor (physical px per logical px). */
  scale: number;
  /** Physical px per sprite pixel. */
  px: number;
  /** Side of the sprite box in physical px. */
  sprite: number;
  width: number;
  height: number;
  /** The feet anchor inside the window. */
  footX: number;
  footY: number;
}

export function computeLayout(size: number, scale: number): Layout {
  const px = Math.max(1, Math.round(size * scale));
  const sprite = SPRITE_SIZE * px;
  // Even width so the sprite centre lands on a whole pixel.
  const width = 2 * Math.ceil(Math.max(sprite * 2, 240 * scale) / 2);
  const headroom = Math.round(Math.max(sprite * 1.1, 130 * scale));
  const shadowRoom = 2 * px;
  const height = sprite + headroom + shadowRoom;
  return { scale, px, sprite, width, height, footX: width / 2, footY: height - shadowRoom };
}

const warn = (what: string) => (e: unknown) => console.warn(`[pet] ${what} failed`, e);

export class Stage {
  readonly win = getCurrentWindow();
  layout: Layout;
  /** Top-left of the window as last applied. */
  position: Point = { x: 0, y: 0 };

  private placed = false;
  private wanted: Point | null = null;
  private flushing: Promise<void> | null = null;
  private ignoring: boolean | null = null;

  constructor(layout: Layout) {
    this.layout = layout;
  }

  async resize(layout: Layout): Promise<void> {
    this.layout = layout;
    await this.win.setSize(new PhysicalSize(layout.width, layout.height));
  }

  /**
   * Move the window so the feet land on `anchor`. setPosition is async IPC, so calls are
   * never queued: one is in flight at a time and it always sends the latest position.
   * The returned promise settles once the window has caught up.
   */
  place(anchor: Point): Promise<void> {
    const next = {
      x: Math.round(anchor.x - this.layout.footX),
      y: Math.round(anchor.y - this.layout.footY),
    };
    const target = this.wanted ?? this.position;
    if (!(this.placed && next.x === target.x && next.y === target.y)) this.wanted = next;
    // Called every frame: only start a flush when there is something to send.
    if (this.wanted) this.flushing ??= this.flush().finally(() => (this.flushing = null));
    return this.flushing ?? Promise.resolve();
  }

  /** Forget where we think the window is (e.g. after a DPI change moved it). */
  invalidate(): void {
    this.placed = false;
  }

  setIgnoreCursor(ignore: boolean): void {
    if (ignore === this.ignoring) return;
    this.ignoring = ignore;
    this.win.setIgnoreCursorEvents(ignore).catch((e) => {
      this.ignoring = null; // retry next frame
      warn('setIgnoreCursorEvents')(e);
    });
  }

  setAlwaysOnTop(on: boolean): void {
    this.win.setAlwaysOnTop(on).catch(warn('setAlwaysOnTop'));
  }

  private async flush(): Promise<void> {
    while (this.wanted) {
      const next = this.wanted;
      this.wanted = null;
      if (this.placed && next.x === this.position.x && next.y === this.position.y) continue;
      try {
        await this.win.setPosition(new PhysicalPosition(next.x, next.y));
        this.position = next;
        this.placed = true;
      } catch (e) {
        warn('setPosition')(e);
      }
    }
  }
}
