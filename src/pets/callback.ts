/**
 * Callback, the Async Octopus.
 *
 * Built in layers: tentacle fill masks are stamped back-to-front, each with its own 1px
 * outline (so crossing tentacles stay readable), then the mantle is rasterised from a
 * per-row width profile on top (so it can breathe and squash), and the face goes last.
 */
import { anim, blank, flipX, patch, shift, sprite } from './sprite';
import { SPRITE_SIZE, type Frame, type PetDefinition } from './types';

const palette = {
  o: '#7a1a4e', // outline
  d: '#c8418a', // shade
  b: '#f06aa8', // body
  h: '#ff9dcb', // rim light
  c: '#ffd3e6', // underside + suckers
  k: '#2c0b22', // eyes, mouth
  w: '#ffffff', // catchlights
  r: '#ff4d7e', // blush, mouth inside
};

const EMPTY = '.';

/** Pixels next to (4-neighbour) a filled pixel of `mask` that `mask` itself leaves empty. */
function rim(mask: Frame, x: number, y: number): boolean {
  if (mask[y][x] !== EMPTY) return false;
  const near = [mask[y - 1]?.[x], mask[y + 1]?.[x], mask[y][x - 1], mask[y][x + 1]];
  return near.some((ch) => ch !== undefined && ch !== EMPTY);
}

/**
 * Stamp a fill mask with its own outline. `under` keeps the outline off anything already
 * drawn (used for the mantle, so it never cuts a seam across the tentacle roots).
 */
function layer(frame: Frame, mask: Frame, under = false): Frame {
  return frame.map((row, y) =>
    row
      .split('')
      .map((ch, x) => {
        if (mask[y][x] !== EMPTY) return mask[y][x];
        if (rim(mask, x, y) && (!under || ch === EMPTY)) return 'o';
        return ch;
      })
      .join(''),
  );
}

// --- Mantle ------------------------------------------------------------------------

/** Interior width of each mantle row, top to bottom. */
const MANTLE = {
  rest: [6, 10, 14, 16, 18, 18, 20, 20, 20, 20, 20, 20, 20, 18, 16],
  inhale: [6, 10, 14, 16, 18, 18, 20, 20, 20, 20, 20, 20, 20, 20, 18, 16],
  tall: [6, 10, 12, 14, 16, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 16],
  squat: [8, 12, 16, 18, 20, 20, 22, 22, 22, 22, 22, 20, 18],
  squatIn: [8, 12, 16, 18, 20, 20, 22, 22, 22, 22, 22, 22, 20, 18],
  flat: [8, 14, 18, 20, 22, 22, 24, 24, 24, 24, 22],
  flatIn: [8, 12, 16, 20, 22, 22, 22, 24, 24, 24, 24, 22],
} satisfies Record<string, number[]>;

type MantleShape = keyof typeof MANTLE;

/** A wet glint and two pale spots on the back of the mantle. */
const SPOTS = sprite(`
  ...ww
  ..w..
  .....
  .....
  .hh..
  .hh..
  .....
  .....
  hh...
  hh...
`);

/** Like `patch`, but only paints over lit body pixels, so markings follow the mantle's shape. */
function paint(frame: Frame, x0: number, y0: number, art: Frame): Frame {
  return frame.map((row, y) =>
    row
      .split('')
      .map((ch, x) => {
        const p = art[y - y0]?.[x - x0];
        return p && p !== EMPTY && (ch === 'b' || ch === 'h') ? p : ch;
      })
      .join(''),
  );
}

/** Fill-only mantle with its markings: rim light on the upper left, shade down the right. */
function mantle(widths: readonly number[], bottom: number): Frame {
  const h = widths.length;
  const top = bottom - h + 1;
  const leftAt = (y: number) => 16 - widths[y - top] / 2;
  const inside = (x: number, y: number) =>
    y >= top && y <= bottom && x >= leftAt(y) && x < leftAt(y) + widths[y - top];
  const body = Array.from({ length: SPRITE_SIZE }, (_, y) => {
    let row = '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      if (!inside(x, y)) row += EMPTY;
      else if (!inside(x + 2, y)) row += 'd';
      else if (!inside(x - 1, y - 1)) row += 'h';
      else row += 'b';
    }
    return row;
  });
  return paint(body, 8, top + 2, SPOTS);
}

/** Shear the rows above `pivot` sideways, up to `lean` px at `top`: the dome leaning. */
function shear(frame: Frame, lean: number, top: number, pivot: number): Frame {
  return frame.map((row, y) => {
    const dx = y < pivot ? Math.round((lean * (pivot - y)) / (pivot - top)) : 0;
    return dx ? shift([row], dx, 0)[0] : row;
  });
}

// --- Tentacles ---------------------------------------------------------------------
// Fill masks drawn for a tentacle on the right, curling outward. The root is the two
// pixels at the top-left (raised arms: bottom-left).

const ARM = {
  // Planted, sweeping out into a curl with the sucker side showing.
  hook: sprite(`
    bb....
    bb....
    .bb...
    .bb...
    .bb...
    ..bb..
    ..bb.c
    ..bb.c
    ...bcc
  `),
  // Straight down.
  tall: sprite(`
    bb.
    bb.
    bb.
    bb.
    bb.
    bb.
    bb.
    bb.
    bc.
  `),
  // Fanning out.
  lean: sprite(`
    bb..
    bb..
    bb..
    .bb.
    .bb.
    .bb.
    .bb.
    ..bb
    ..bc
  `),
  // Lifted and curled.
  curl: sprite(`
    bb..
    bb..
    bb..
    bb..
    bb.c
    bb.c
    .bcc
  `),
  // Tip lifting off the ground and curling (idle fidget).
  flick: sprite(`
    bb...
    bb...
    bb...
    .bb..
    .bb..
    .bb.c
    ..bbc
  `),
  // Outer tentacle lifted mid-stride, curl tucked up.
  hookUp: sprite(`
    bb....
    bb....
    .bb...
    .bb..c
    ..bb.c
    ..bbcc
  `),
  // Hanging limp while carried: a lazy S that tapers to a curled tip.
  dangle: sprite(`
    bb.
    bb.
    bb.
    .bb
    .bb
    .bb
    bb.
    b..
    c..
  `),
  // Outer arm hanging while carried: bows out from under the mantle, then hangs limp.
  limp: sprite(`
    bb...
    .bb..
    .bb..
    ..bb.
    ..bb.
    ..bb.
    ..bb.
    ..bb.
    .bb..
    .bc..
    ..c..
  `),
  sway: sprite(`
    bb..
    bb..
    .bb.
    .bb.
    .bb.
    ..bb
    ..bb
    ...b
    ..c.
  `),
  // Curled up beside a sleeping body.
  coil: sprite(`
    bb....
    .bb..c
    .bbbcc
  `),
  // Tucked right under a sleeping body.
  tuck: sprite(`
    bb.
    bbc
    .cc
  `),
  // Hidden under the body.
  none: sprite(`
    .
  `),
  // Splayed along the ground while sitting.
  splay: sprite(`
    bb.....
    bb.....
    .bb....
    ..bb..c
    ..bbb.c
    ...bbcc
  `),
};

/** Raised tentacles, root at the bottom-left; the mantle covers the root so they sprout seamlessly. */
const RAISED = {
  up: sprite(`
    ......c
    .....bc
    .....bb
    ....bb.
    ....bb.
    ...bb..
    ...bb..
    ..bb...
    .bb....
    bb.....
  `),
  out: sprite(`
    .......c
    ......bc
    .....bb.
    ...bbb..
    .bbb....
    bb......
  `),
};

type ArmShape = keyof typeof ARM;
type RaisedShape = keyof typeof RAISED;

/**
 * A tentacle: `shape` curls outward on its side of the body; `shape<` / `shape>` force a
 * direction (walk cycle); `^shape` is a raised arm.
 */
type ArmSpec = ArmShape | `${ArmShape}<` | `${ArmShape}>` | `^${RaisedShape}`;

/** Root x of each tentacle, left to right. */
const ROOTS = [7, 10, 13, 16, 19, 22];
/** The middle pair sits under the body: drawn first, and in shade. */
const BACK = new Set([2, 3]);
const DRAW_ORDER = [2, 3, 1, 4, 0, 5];

/** Mask for tentacle `index` hanging from a mantle whose last row is `bottom`. */
function tentacle(spec: ArmSpec, index: number, bottom: number, grow: number): Frame {
  const left = index < ROOTS.length / 2;
  const rootX = ROOTS[index];
  if (spec.startsWith('^')) {
    // Raised arms sprout from the side, just above the rim.
    const art = RAISED[spec.slice(1) as RaisedShape];
    const s = left ? flipX(art) : art;
    const x = left ? rootX + 2 - s[0].length : rootX;
    return patch(blank(), x, bottom - s.length, s);
  }
  const rootY = bottom + 1;
  const mirror = spec.endsWith('<') ? true : spec.endsWith('>') ? false : left;
  const base = ARM[spec.replace(/[<>]$/, '') as ArmShape];
  // Growing repeats the straight root row, so a raised mantle's tentacles still reach the floor.
  const art = [...Array<string>(Math.max(0, grow)).fill(base[0]), ...base];
  const s = mirror ? flipX(art) : art;
  const x = mirror ? rootX + 2 - s[0].length : rootX;
  const mask = patch(blank(), x, rootY, s);
  return BACK.has(index) ? mask.map((row) => row.replaceAll('b', 'd')) : mask;
}

// --- Faces -------------------------------------------------------------------------
// 12 wide, stamped with the near eye at x=14 so Callback looks right. Big round eyes on
// rows 0-4, cheeks and mouth below.

const FACE = {
  open: `
    ..kk....kk..
    .kwkk..kwkk.
    .kkkk..kkkk.
    .kkkk..kkkk.
    ..kk....kk..
    rr..k..k..rr
    .....kk.....
  `,
  blink: `
    ............
    ............
    ............
    .kkkk..kkkk.
    ............
    rr..k..k..rr
    .....kk.....
  `,
  happy: `
    ............
    ..kk....kk..
    .k..k..k..k.
    ............
    ............
    rr..kkkk..rr
    ....krrk....
    .....kk.....
  `,
  // A round "o" mouth, wide open for the treat.
  chomp: `
    ..kk....kk..
    .kwkk..kwkk.
    .kkkk..kkkk.
    .kkkk..kkkk.
    ..kk....kk..
    rr...kk...rr
    ....kkkk....
    ....krrk....
    .....kk.....
  `,
  // Blissful munching.
  chew: `
    ............
    ..kk....kk..
    .k..k..k..k.
    ............
    ............
    rr.k.kk.k.rr
    ....k..k....
  `,
  // Startled: a little "o" of surprise, no blush.
  wide: `
    ..kk....kk..
    .kwkk..kwkk.
    .kkkk..kkkk.
    .kkkk..kkkk.
    ..kk....kk..
    .....kk.....
    ....k..k....
    .....kk.....
  `,
  asleep: `
    ............
    ............
    ............
    .k..k..k..k.
    ..kk....kk..
    rr........rr
    .....kk.....
  `,
};

type FaceName = keyof typeof FACE;

// --- Poses -------------------------------------------------------------------------

interface Pose {
  arms: readonly ArmSpec[];
  mantle?: MantleShape;
  face?: FaceName;
  /** Raise (+) or lower (−) the mantle. */
  lift?: number;
  /**
   * Rows added to every tentacle (or to each, left to right); defaults to `lift` so they
   * still reach the floor.
   */
  stretch?: number | readonly number[];
  /** Top of the mantle leans forward (+) or back (−). */
  lean?: number;
  /** Whole-sprite hop off the ground. */
  hop?: number;
}

function octo({
  arms,
  mantle: shape = 'rest',
  face = 'open',
  lift = 0,
  stretch = lift,
  lean = 0,
  hop = 0,
}: Pose): Frame {
  const bottom = 21 - lift;
  let f = blank();
  for (const i of DRAW_ORDER) {
    const grow = typeof stretch === 'number' ? stretch : stretch[i];
    f = layer(f, tentacle(arms[i], i, bottom, grow));
  }
  const widths = MANTLE[shape];
  const faceY = bottom - 8;
  // Lean pivots at eye level, so only the dome sways and the face stays put.
  f = layer(f, shear(mantle(widths, bottom), lean, bottom - widths.length + 1, faceY), true);
  f = patch(f, 13, faceY, FACE[face]);
  return hop ? shift(f, 0, -hop) : f;
}

const REST: ArmSpec[] = ['hook', 'lean', 'curl', 'curl', 'lean', 'hook'];
/** Idle fidget: one front tip lifts and curls. */
const FIDGET: ArmSpec[] = ['hook', 'lean', 'curl', 'curl', 'flick', 'hook'];

/** Asleep: slumped flat, arms curled underneath with only the tips peeking out. */
const NAP: ArmSpec[] = ['coil', 'tuck', 'none', 'none', 'tuck>', 'coil'];
const nap = (mantle: MantleShape) => octo({ arms: NAP, mantle, face: 'asleep', lift: -6, stretch: 0 });
/** Sitting: settled low, arms splayed along the floor. */
const lounge = (mantle: MantleShape) =>
  octo({ arms: ['splay', 'splay', 'tuck', 'tuck', 'splay', 'splay'], mantle, lift: -3, stretch: 0 });
/** Carried: the mantle stretches tall and every arm hangs, each to its own length. */
const dangling = (arms: ArmSpec[], stretch: number[]) =>
  octo({ arms, mantle: 'tall', face: 'wide', lift: 4, stretch });

// Walk: alternate tentacles curl up while their neighbours reach out and plant, then
// swap; in between, the mantle rises on the push and trails a little behind.
const STEP_A: ArmSpec[] = ['hook', 'curl', 'tall', 'curl', 'lean>', 'hookUp'];
const STEP_B: ArmSpec[] = ['hookUp', 'lean', 'curl', 'tall', 'curl', 'hook'];
const PUSH: ArmSpec[] = ['hook', 'flick', 'curl', 'curl', 'flick', 'hook'];

const callback: PetDefinition = {
  id: 'callback',
  name: 'Callback',
  species: 'Async Octopus',
  tagline: 'Eight arms, non-blocking. Always calls back.',
  accent: '#f06aa8',
  mouth: { x: 18, y: 19 },
  palette,
  animations: {
    idle: anim(3, [
      octo({ arms: REST }),
      octo({ arms: REST, mantle: 'inhale' }),
      octo({ arms: FIDGET, mantle: 'inhale' }),
      octo({ arms: FIDGET }),
    ]),
    blink: anim(8, [octo({ arms: REST, face: 'blink' })]),
    walk: anim(7, [
      octo({ arms: STEP_A, lean: 1 }),
      octo({ arms: PUSH, lift: 1, lean: -1 }),
      octo({ arms: STEP_B, lean: 1 }),
      octo({ arms: PUSH, lift: 1, lean: -1 }),
    ]),
    sleep: anim(1.5, [nap('flat'), nap('flatIn')]),
    // A happy hop with every arm waving: out, up, up, out.
    happy: anim(8, [
      octo({ arms: ['^out', 'lean', 'curl', 'curl', 'lean', '^out'], face: 'happy' }),
      octo({ arms: ['^up', 'dangle', 'curl', 'curl', 'dangle', '^up'], face: 'happy', hop: 2 }),
      octo({ arms: ['^up', 'sway', 'curl', 'curl', 'sway', '^up'], face: 'happy', hop: 3 }),
      octo({ arms: ['^out', 'lean', 'curl', 'curl', 'lean', '^out'], face: 'happy', hop: 1 }),
    ]),
    // Round "o" mouth for the treat, then blissful munching.
    eat: anim(6, [
      octo({ arms: REST, face: 'chomp', mantle: 'inhale' }),
      octo({ arms: REST, face: 'chew' }),
      octo({ arms: REST, face: 'chomp', mantle: 'inhale' }),
      octo({ arms: FIDGET, face: 'chew' }),
    ]),
    // Picked up: the arms hang long and swing a little.
    drag: anim(4, [
      dangling(['limp', 'dangle', 'curl', 'curl', 'dangle>', 'limp'], [2, 5, 2, 3, 4, 1]),
      dangling(['limp', 'dangle>', 'curl', 'curl', 'dangle', 'limp'], [1, 4, 3, 2, 5, 2]),
    ]),
    // Flailing: the outer arms windmill out of step while the rest kick.
    fall: anim(8, [
      octo({ arms: ['^up', 'flick', 'curl', 'curl', 'sway', '^out'], face: 'wide', stretch: 0 }),
      octo({ arms: ['^out', 'sway', 'curl', 'curl', 'flick', '^up'], face: 'wide', stretch: 0 }),
    ]),
    sit: anim(2, [lounge('squat'), lounge('squatIn')]),
  },
  lines: {
    greet: [
      'Hi! I promised I would. Resolved!',
      'You called? I called back!',
      'Oh, hello! I was awaiting you.',
      'All my arms say hi. Individually.',
    ],
    idle: [
      'Juggling six tasks. Seven. Eight.',
      "I'll get back to you. I always do.",
      'Non-blocking, but very huggable.',
      'await snack(); // any moment now',
      'My to-do list has tentacles.',
      'Three hearts, zero race conditions.',
      'Nested callbacks? I call that a hug.',
      'Every arm runs its own thread.',
      'Pending... pending... resolved!',
      'Blue blood, pink attitude.',
      'Ink is just dark mode for water.',
    ],
    pat: [
      'Pat received. Calling back: hug!',
      'Eee! All my arms are wiggling.',
      'That resolved my whole mood.',
      'A sucker for pats. Eight of them.',
      'Queued that pat. Processing... yay!',
    ],
    treat: [
      'Nom! Promise fulfilled.',
      'Snack resolved successfully!',
      'Worth the await!',
      'Eight-arm approved. Delicious.',
      'Nom nom. Returning: gratitude.',
    ],
    hungry: [
      'Awaiting snack... still awaiting...',
      'My tummy threw an unhandled rejection.',
      'Snack pending. Please resolve?',
      'All eight arms are hungry.',
    ],
    sleepy: [
      'Going idle. Will call back later.',
      'Suspending all tasks. Night!',
      'Curling up in my ink blanket...',
    ],
    wake: ['Resumed! Where were we?', "Back! Told you I'd call back.", 'Nap resolved. Arms online.'],
    drag: [
      'Whoa! Unexpected context switch!',
      'My arms are dangling! All of them!',
      "Gently, please, I'm squishy!",
      'Wheee! Async travel!',
    ],
  },
  personality: { debugging: 7, patience: 6, chaos: 6, wisdom: 7, snark: 5 },
};

export default callback;
