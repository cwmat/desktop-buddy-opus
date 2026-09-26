/**
 * What the pet knows about the outside world: monitors (work areas), the cursor and the
 * environment snapshot from Rust (idle time, foreground window, fullscreen). Each source
 * is polled at its own pace with at most one request in flight.
 */
import { availableMonitors, cursorPosition, primaryMonitor, type Monitor } from '@tauri-apps/api/window';
import { ipc, type EnvironmentSnapshot } from '$lib/ipc';
import type { MonitorArea, Point } from './geometry';

const ENV_MS = 500;
/** While perched, poll faster so the pet keeps up with a window being dragged. */
const ENV_FAST_MS = 125;
const MONITORS_MS = 5000;

export class World {
  monitors: MonitorArea[] = [];
  env: EnvironmentSnapshot = { idleSeconds: null, foregroundWindow: null, fullscreenMonitor: null };
  cursor: Point | null = null;
  fastEnv = false;
  onMonitorsChanged: (() => void) | null = null;

  private cursorBusy = false;
  private lastCursorPoll = -Infinity;

  start(): void {
    void this.pollEnv();
    setInterval(() => void this.refreshMonitors(), MONITORS_MS);
  }

  async refreshMonitors(): Promise<void> {
    try {
      const [all, primary] = await Promise.all([availableMonitors(), primaryMonitor()]);
      const next = all.map((m) => toArea(m, primary));
      if (next.length === 0) next.push(screenFallback());
      if (JSON.stringify(next) === JSON.stringify(this.monitors)) return;
      this.monitors = next;
      this.onMonitorsChanged?.();
    } catch (e) {
      console.warn('[pet] monitor query failed', e);
      if (this.monitors.length === 0) this.monitors = [screenFallback()];
    }
  }

  /** Call every frame; requests a fresh cursor position at most every `everyMs`. */
  pollCursor(now: number, everyMs: number): void {
    if (this.cursorBusy || now - this.lastCursorPoll < everyMs) return;
    this.cursorBusy = true;
    this.lastCursorPoll = now;
    cursorPosition()
      .then((p) => (this.cursor = { x: p.x, y: p.y }))
      .catch(() => {})
      .finally(() => (this.cursorBusy = false));
  }

  private async pollEnv(): Promise<void> {
    try {
      this.env = await ipc.environment();
    } catch {
      // Unsupported or transient: keep the last snapshot.
    }
    setTimeout(() => void this.pollEnv(), this.fastEnv ? ENV_FAST_MS : ENV_MS);
  }
}

function toArea(m: Monitor, primary: Monitor | null): MonitorArea {
  return {
    bounds: { x: m.position.x, y: m.position.y, width: m.size.width, height: m.size.height },
    work: {
      x: m.workArea.position.x,
      y: m.workArea.position.y,
      width: m.workArea.size.width,
      height: m.workArea.size.height,
    },
    scale: m.scaleFactor,
    primary: !!primary && primary.position.x === m.position.x && primary.position.y === m.position.y,
  };
}

/** Last resort if the monitor API fails: the web screen object. */
function screenFallback(): MonitorArea {
  const s = window.devicePixelRatio || 1;
  const { width, height, availWidth, availHeight } = window.screen;
  return {
    bounds: { x: 0, y: 0, width: width * s, height: height * s },
    work: { x: 0, y: 0, width: availWidth * s, height: availHeight * s },
    scale: s,
    primary: true,
  };
}
