/**
 * DOM overlay above the canvas: speech/thought bubbles, name tag, emotes, hearts, Zzz,
 * treats, crumbs, sparkles and poof clouds. Particles are one-shot elements animated
 * by CSS (pet.css) that remove themselves when done. Positions are CSS px inside the
 * pet window, derived from the renderer's sprite box.
 */
import type { Pose } from './brain';
import type { SpriteBox } from './renderer';
import type { Layout } from './stage';
import type { Bubble } from './speech';

export type Emote = '!' | '?' | '!!' | 'anger';

/** Visible area (the monitor's work area) in window-local CSS px. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
}

// Tiny pixel icons, drawn as crisp SVG rects. `.` is transparent.
const INK = '#1b1b24';
const ICONS = {
  heart: {
    colors: { k: INK, r: '#ff4d6d', w: '#ffc2d1' },
    rows: ['.kkk.kkk.', 'kwrrkrrrk', 'krrrrrrrk', 'krrrrrrrk', '.krrrrrk.', '..krrrk..', '...krk...', '....k....'],
  },
  treat: {
    colors: { k: '#3b2414', t: '#e8a95b', d: '#6b3e1f', h: '#f6cf8f' },
    rows: ['..kkkk..', '.khhttk.', 'khtdttdk', 'kttttttk', 'ktdttdtk', 'ktttdttk', '.kttttk.', '..kkkk..'],
  },
  sparkle: {
    colors: { y: '#ffd84d', w: '#ffffff' },
    rows: ['..y..', '..y..', 'yywyy', '..y..', '..y..'],
  },
  puff: {
    colors: { k: '#8d8da6', w: '#ffffff', g: '#d9d9e6' },
    rows: ['.kkkk.', 'kwwwwk', 'kwwwwk', 'kwwwgk', 'kwwggk', '.kkkk.'],
  },
  anger: {
    colors: { r: '#e5484d' },
    rows: ['.rr.rr.', '.r...r.', 'rr...rr', '.......', 'rr...rr', '.r...r.', '.rr.rr.'],
  },
  tail: {
    colors: { k: INK, w: '#ffffff' },
    rows: ['kwwwwwk', '.kwwwk.', '..kwk..', '...k...'],
  },
  dotBig: {
    colors: { k: INK, w: '#ffffff' },
    rows: ['.kk.', 'kwwk', 'kwwk', '.kk.'],
  },
  dotSmall: {
    colors: { k: INK, w: '#ffffff' },
    rows: ['.k.', 'kwk', '.k.'],
  },
} satisfies Record<string, { colors: Record<string, string>; rows: string[] }>;

type IconName = keyof typeof ICONS;

const svgCache = new Map<IconName, string>();

function iconSvg(name: IconName): string {
  let svg = svgCache.get(name);
  if (!svg) {
    const { rows, colors } = ICONS[name];
    const palette = colors as Record<string, string>;
    let rects = '';
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const fill = palette[ch];
        if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
      });
    });
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${rects}</svg>`;
    svgCache.set(name, svg);
  }
  return svg;
}

/** An element holding a pixel icon, `pixel` CSS px per icon pixel. */
function icon(name: IconName, pixel: number, className = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = `icon ${className}`.trim();
  el.innerHTML = iconSvg(name);
  const { rows } = ICONS[name];
  el.style.width = `${rows[0].length * pixel}px`;
  el.style.height = `${rows.length * pixel}px`;
  return el;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const MAX_BUBBLE_WIDTH = 210;

export class Effects {
  private readonly anchor: HTMLElement;
  private readonly bubbleEl: HTMLElement;
  private readonly nameEl: HTMLElement;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private layout: Layout | null = null;
  /** CSS px per icon pixel: follows the pet's size, within readable bounds. */
  private fxPx = 2;
  private box: SpriteBox | null = null;
  private nextZ = 0;
  private crumbsUntil = 0;
  private nextCrumb = 0;
  private lastAnchor = '';
  private bounds: Bounds = { left: -Infinity, right: Infinity, top: -Infinity };

  constructor(private readonly root: HTMLElement) {
    this.anchor = document.createElement('div');
    this.anchor.className = 'anchor';
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'bubble';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'nametag';
    this.anchor.append(this.bubbleEl, this.nameEl);
    root.append(this.anchor);
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
    const spritePx = layout.px / layout.scale;
    this.fxPx = Math.min(5, Math.max(2, Math.round(spritePx * 0.75)));
  }

  setPet(name: string, accent: string): void {
    this.nameEl.textContent = name;
    this.root.style.setProperty('--accent', accent);
  }

  /**
   * Per frame: keep anchors on the pet and run the looping effects (Zzz, crumbs).
   * `bounds` is the monitor's work area in window CSS px, so bubbles near a screen edge
   * slide inwards instead of being cut off.
   */
  update(now: number, pose: Pose, box: SpriteBox, showName: boolean, bounds: Bounds): void {
    this.box = box;
    this.bounds = bounds;
    const named = showName && pose.visible;
    this.nameEl.classList.toggle('show', named);
    this.anchor.classList.toggle('named', named);
    // Edges only matter while something is showing (saves layout work while walking).
    const showing = named || this.bubbleEl.classList.contains('show');
    const key = showing ? [box.cx, box.headY, bounds.left, bounds.right, bounds.top, named].join() : `${box.cx},${box.headY}`;
    if (key !== this.lastAnchor) {
      this.lastAnchor = key;
      this.placeAnchor();
    }

    if (pose.sleeping && now >= this.nextZ) {
      this.nextZ = now + 1100;
      this.zzz();
    }
    if (now < this.crumbsUntil && now >= this.nextCrumb) {
      this.nextCrumb = now + 280;
      this.crumbBurst();
    }
  }

  bubble(b: Bubble | null): void {
    if (!b) return;
    const el = this.bubbleEl;
    el.replaceChildren();
    el.className = `bubble ${b.kind}`;
    if (b.icon) el.append(icon(b.icon, this.fxPx + 1));
    if (b.text) el.append(document.createTextNode(b.text));
    if (b.kind === 'say') {
      el.append(icon('tail', 2, 'tail'));
    } else {
      el.append(icon('dotBig', 2, 'dot big'), icon('dotSmall', 2, 'dot small'));
    }
    // Restart the pop-in animation.
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.placeAnchor();
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    const ms = 2600 + b.text.length * 55;
    this.bubbleTimer = setTimeout(() => this.hideBubble(), ms);
  }

  hideBubble(): void {
    this.bubbleEl.classList.remove('show');
    this.placeAnchor();
  }

  emote(kind: Emote): void {
    const box = this.box;
    if (!box) return;
    let el: HTMLElement;
    if (kind === 'anger') {
      el = icon('anger', this.fxPx + 1, 'emote anger');
    } else {
      el = document.createElement('div');
      el.className = `emote${kind === '!!' ? ' alarm' : ''}`;
      el.textContent = kind;
    }
    // Beside the top of the head, in front: clear of the name tag and bubble above.
    const p = this.css(box.px);
    this.spawn(el, this.css(box.cx) + box.facing * p * 12, this.css(box.headY) + p * 5);
  }

  hearts(count: number): void {
    const box = this.box;
    if (!box) return;
    for (let i = 0; i < count; i++) {
      const el = icon('heart', this.fxPx, 'heart');
      el.style.setProperty('--dx', `${rand(-18, 18)}px`);
      el.style.animationDelay = `${i * 140}ms`;
      this.spawn(el, this.css(box.cx) + rand(-10, 10), this.css(box.headY));
    }
  }

  sparkles(): void {
    const box = this.box;
    if (!box) return;
    const size = this.css(box.px) * 32;
    for (let i = 0; i < 7; i++) {
      const el = icon('sparkle', this.fxPx, 'sparkle');
      el.style.animationDelay = `${Math.round(rand(0, 350))}ms`;
      this.spawn(el, this.css(box.cx) + rand(-0.6, 0.6) * size, this.css(box.feetY) - rand(0.1, 1.1) * size);
    }
  }

  /** A treat falls from the top of the window into the pet's mouth over `ms`. */
  treat(ms: number): void {
    const box = this.box;
    if (!box) return;
    const mouth = this.mouth(box);
    const el = icon('treat', this.fxPx + 1, 'treat');
    el.style.setProperty('--from', `${-mouth.y + 4}px`);
    el.style.animationDuration = `${ms}ms`;
    this.spawn(el, mouth.x, mouth.y);
  }

  crumbs(ms: number): void {
    this.crumbsUntil = performance.now() + ms;
    this.nextCrumb = 0;
  }

  poof(): void {
    const box = this.box;
    if (!box) return;
    const size = this.css(box.px) * 32;
    const cx = this.css(box.cx);
    const cy = this.css(box.feetY) - size * 0.4;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rand(-0.3, 0.3);
      const dist = size * rand(0.35, 0.6);
      const el = icon('puff', this.fxPx + 1, 'puff');
      el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.7}px`);
      this.spawn(el, cx + Math.cos(angle) * size * 0.12, cy + Math.sin(angle) * size * 0.1);
    }
  }

  /** Little dust puffs at the feet after a hard landing. */
  dust(): void {
    const box = this.box;
    if (!box) return;
    const size = this.css(box.px) * 32;
    for (const dir of [-1, 1]) {
      const el = icon('puff', this.fxPx, 'puff small');
      el.style.setProperty('--dx', `${dir * size * 0.45}px`);
      el.style.setProperty('--dy', `${-size * 0.08}px`);
      this.spawn(el, this.css(box.cx) + dir * size * 0.2, this.css(box.feetY) - this.fxPx * 2);
    }
  }

  private zzz(): void {
    const box = this.box;
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'zzz';
    el.textContent = 'z';
    el.style.setProperty('--dx', `${box.facing * 22}px`);
    this.spawn(el, this.css(box.cx) + box.facing * this.css(box.px) * 6, this.css(box.headY) + 4);
  }

  private crumbBurst(): void {
    const box = this.box;
    if (!box) return;
    const mouth = this.mouth(box);
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.className = 'crumb';
      el.style.width = el.style.height = `${this.fxPx}px`;
      el.style.setProperty('--dx', `${box.facing * rand(4, 16)}px`);
      el.style.setProperty('--dy', `${rand(10, 22)}px`);
      this.spawn(el, mouth.x, mouth.y + 4);
    }
  }

  private mouth(box: SpriteBox): { x: number; y: number } {
    return { x: this.css(box.mouthX), y: this.css(box.mouthY) };
  }

  /**
   * Centre the bubble/name tag over the head, kept inside both the window and the
   * monitor's work area: squeezed and slid sideways near a screen edge (the tail keeps
   * pointing at the pet), pushed down over the pet at the very top.
   */
  private placeAnchor(): void {
    const box = this.box;
    const layout = this.layout;
    if (!box || !layout) return;
    const cx = this.css(box.cx);
    const lo = Math.max(this.bounds.left, 0) + 4;
    const hi = Math.min(this.bounds.right, layout.width / layout.scale) - 4;
    const top = Math.max(this.bounds.top, 0) + 4;
    this.anchor.style.maxWidth = `${Math.max(100, Math.min(MAX_BUBBLE_WIDTH, hi - lo))}px`;

    const width = this.anchor.offsetWidth;
    const height = this.anchor.offsetHeight;
    const x = width > 0 && hi - lo >= width ? Math.min(hi - width / 2, Math.max(lo + width / 2, cx)) : cx;
    const y = Math.max(this.css(box.headY) - 6, top + height);
    const tailRoom = Math.max(0, this.bubbleEl.offsetWidth / 2 - 10);
    this.anchor.style.left = `${x}px`;
    this.anchor.style.top = `${y}px`;
    this.anchor.style.setProperty('--dx', `${Math.max(-tailRoom, Math.min(tailRoom, cx - x))}px`);
  }

  private spawn(el: HTMLElement, x: number, y: number): void {
    el.classList.add('fx-item');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Safety net in case an animation never ends (e.g. the page is throttled).
    setTimeout(() => el.remove(), 4000);
    this.root.append(el);
  }

  private css(physical: number): number {
    return physical / (this.layout?.scale ?? 1);
  }
}
