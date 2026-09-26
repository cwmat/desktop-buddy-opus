/**
 * Shellby — a patient little turtle who lives in the shell (the scripting kind too).
 * Every pose is composed from one SHELL plus neck / head / leg / tail / face patches, so
 * the shell's volume stays identical between frames.
 */
import { anim, blank, patch, shift, sprite } from './sprite';
import type { Frame, PetDefinition } from './types';

// Domed carapace. The hexagonal centre scute carries a tiny `>_` prompt stamped in the
// outline brown; the other seams radiate from it in one shade darker than the shell, so
// the pattern stays quiet and the face keeps the focus. Cream rim below, bottom outline
// on row 27 (legs hang from row 28).
const SHELL = sprite(`
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  .........OOOOOOOOO..............
  .......OODHHHHSSSDOO............
  ......OHHHDHHHSSDSSSO...........
  .....OHHSSSDDDDDSSSSDO..........
  ....OHHSSSDHHSSSDSSSSDO.........
  ....OHSSSDHOSSSSSDSSSDO.........
  ....ODDDDDSSOSSSSDDDDDO.........
  ....OSSSSDSOSSOOSDSSDDO.........
  ....OSSSSSDSSSSSDSSSDDO.........
  ....OSSSSSSDDDDDSSSDDDO.........
  ....ODDDDDDDDDDDDDDDDDO.........
  ...ORRRRRRRRRRRRRRRRRRRO........
  ...OHHHDHHHDHHHDHHHDHHHO........
  ....OOOOOOOOOOOOOOOOOOO.........
  ................................
  ................................
  ................................
  ................................
`);

// Round head, placed at (20, 11); its lower-left overlaps the front of the shell.
// Blush on the cheek, a small beak-line smile at the front.
const HEAD = `
  ..oooooo..
  .olllssso.
  ollsssssso
  olssssssso
  osssssssso
  osssssssso
  ossppsssko
  ogsssskkso
  .oggggggo.
  ..oooooo..
`;

// 3×4 eye patches at (25, 13).
const EYES = {
  open: `
    wkk
    kkk
    kkk
    kkk
  `,
  closed: `
    sss
    sss
    sss
    kkk
  `,
  content: `
    sss
    sss
    wkk
    kkk
  `,
  happy: `
    sss
    sks
    ksk
    sss
  `,
  wide: `
    www
    wkw
    wkw
    www
  `,
};

// Mouth patches at (25, 17).
const MOUTHS = {
  open: `
    ...k
    .skko
    .gpko
    .ooo_
  `,
  grin: `
    ...k
    kppk
    .kk.
  `,
};

// Retracted for a nap: just a sleepy snout (closed eye, blush) peeks out of the front,
// placed at (22, 20) so it rests on the rim.
const PEEK = `
  ooo.
  olso
  kkso
  spgo
  ooo.
`;

/** The neck: a thick stub from under the head down into the front of the shell. */
function drawNeck(frame: Frame, top: number): Frame {
  const rows: string[] = [];
  // The last row tucks its corner in so the outline meets the end of the rim.
  for (let y = top; y <= 24; y++) rows.push(y === 24 ? 'gsgoo' : y === 23 ? 'gsggo' : 'lssgo');
  return patch(frame, 21, top, rows);
}

interface Leg {
  x: number;
  /** Row of the foot's bottom outline (31 = on the ground). */
  foot: number;
  far?: boolean;
  /** Splay: the leg slants 1px sideways every 2 rows (negative = backwards). */
  lean?: number;
}

/** A stubby leg, 5px wide incl. outline, from under the shell down to `foot`. */
function drawLeg(frame: Frame, top: number, { x, foot, far, lean = 0 }: Leg): Frame {
  let f = frame;
  for (let y = top; y <= foot; y++) {
    const row = y === foot ? 'ooooo' : far ? 'ogggo' : 'ossgo';
    f = patch(f, x + Math.trunc((lean * (y - top)) / 2), y, [row]);
  }
  return f;
}

/** Leg x positions in draw order — far back, far front, near back, near front. */
function stance(farBack: number, farFront: number, nearBack: number, nearFront: number, lift: number[] = []): Leg[] {
  return [farBack, farFront, nearBack, nearFront].map((x, i) => ({ x, foot: 31 - (lift[i] ?? 0), far: i < 2 }));
}

const STAND = stance(7, 14, 4, 17);

/** Picked up: legs dangle and splay out (back legs backwards, front legs forwards). */
function dangle(feet: [number, number, number, number], splay = 1): Leg[] {
  const [fb, ff, nb, nf] = feet;
  return [
    { x: 6 + splay, foot: fb, far: true, lean: -splay },
    { x: 14 - splay, foot: ff, far: true, lean: splay },
    { x: 2 + splay, foot: nb, lean: -splay },
    { x: 18 - splay, foot: nf, lean: splay },
  ];
}

const TAIL = `
  os
  .o
`;

/** Stretch everything above `row` up by 1px (duplicating that row) — a breath in. */
function breathe(frame: Frame, row = 24): Frame {
  return frame.map((_, y) => (y < row ? frame[y + 1] : frame[y]));
}

interface Pose {
  /** Shell offset; legs stretch to reach their feet. */
  dy?: number;
  /** Head offset relative to the shell. */
  hx?: number;
  hy?: number;
  /** false = retracted into the shell (a sleepy face peeks out instead). */
  head?: boolean;
  eyes?: keyof typeof EYES;
  mouth?: keyof typeof MOUTHS;
  legs?: Leg[];
  tail?: boolean;
  inhale?: boolean;
}

function pose({
  dy = 0,
  hx = 0,
  hy = 0,
  head = true,
  eyes = 'open',
  mouth,
  legs = STAND,
  tail = true,
  inhale = false,
}: Pose): Frame {
  let f = blank();
  if (tail) f = patch(f, 2, 27, TAIL);
  f = patch(f, 0, 0, SHELL);
  if (head) {
    f = drawNeck(f, 17 + hy);
    f = patch(f, 20 + hx, 11 + hy, HEAD);
    f = patch(f, 25 + hx, 13 + hy, EYES[eyes]);
    if (mouth) f = patch(f, 25 + hx, 17 + hy, MOUTHS[mouth]);
  } else {
    f = patch(f, 22, 20, PEEK);
  }
  if (inhale) f = breathe(f);
  f = shift(f, 0, dy);
  for (const leg of legs) f = drawLeg(f, 28 + dy, leg);
  return f;
}

const idle = pose({});
const tucked = { dy: 4, legs: [], tail: false };

export default {
  id: 'shellby',
  name: 'Shellby',
  species: 'Shell Script Turtle',
  tagline: 'Slow and steady. Pipes everything. Never panics.',
  accent: '#36c3b0',
  mouth: { x: 28, y: 18 },
  palette: {
    o: '#1b5e4d',
    g: '#2f9479',
    s: '#4fc3a1',
    l: '#9eecca',
    O: '#5a2a10',
    D: '#a0521f',
    S: '#d98a3a',
    H: '#f5b862',
    R: '#fbe0a6',
    k: '#0f2b24',
    w: '#ffffff',
    p: '#ff9a8a',
  },
  animations: {
    idle: anim(2.5, [idle, pose({ inhale: true }), pose({ hx: -1, hy: 1 }), pose({ hx: -1, hy: 1, inhale: true })]),
    blink: anim(8, [pose({ eyes: 'closed' })]),
    // Slow diagonal-pair plod: a pair lifts 2px and swings forward while the shell rises on
    // the other, then lands with the head dipping a beat behind. The far legs only lift in
    // turn (they don't stride), which keeps a gap between the front and back legs.
    walk: anim(5, [
      pose({ dy: -1, hx: 1, legs: stance(7, 14, 4, 17, [0, 2, 2, 0]) }),
      pose({ hy: 1, legs: stance(7, 14, 5, 16) }),
      pose({ dy: -1, hx: 1, legs: stance(7, 14, 4, 17, [2, 0, 0, 2]) }),
      pose({ hy: 1, legs: stance(7, 14, 3, 18) }),
    ]),
    sit: anim(2, [pose({ ...tucked, hy: 1, eyes: 'content' }), pose({ ...tucked, hy: 1, eyes: 'content', inhale: true })]),
    // Retracted into the shell with just a sleepy snout peeking out; the dome breathes.
    sleep: anim(1.5, [pose({ ...tucked, head: false }), pose({ ...tucked, head: false, inhale: true })]),
    // Head up, beaming; the front foot lifts and comes down in a little stomp.
    happy: anim(6, [
      pose({ eyes: 'happy', mouth: 'grin', hy: -1, legs: stance(7, 14, 4, 18, [0, 0, 0, 2]) }),
      pose({ eyes: 'happy', mouth: 'grin', dy: -1, hy: -2, legs: stance(7, 14, 4, 18, [0, 0, 0, 3]) }),
      pose({ eyes: 'happy', mouth: 'grin', dy: 1, hy: -1 }),
      pose({ eyes: 'happy', mouth: 'grin', hy: -2 }),
    ]),
    // Slow munch: the head nudges forward to bite, then chews contentedly.
    eat: anim(3.5, [
      pose({ mouth: 'open', hx: 1 }),
      pose({ eyes: 'happy' }),
      pose({ mouth: 'open', hx: 1 }),
      pose({ eyes: 'closed' }),
    ]),
    // Scooped up: head shoots out of the shell and the legs splay and paddle.
    drag: anim(5, [
      pose({ eyes: 'wide', mouth: 'open', dy: -3, hx: 1, hy: -1, legs: dangle([29, 30, 31, 30]) }),
      pose({ eyes: 'wide', mouth: 'open', dy: -3, hx: 1, hy: -1, legs: dangle([30, 29, 30, 31]) }),
    ]),
    fall: anim(8, [
      pose({ eyes: 'wide', mouth: 'open', dy: -3, hy: -2, legs: dangle([29, 29, 29, 30], 2) }),
      pose({ eyes: 'wide', mouth: 'open', dy: -3, hy: -1, legs: dangle([30, 30, 29, 29], 1) }),
    ]),
  },
  lines: {
    greet: [
      'Hi! I got here as fast as I could.',
      'Shellby online. No rush, no crash.',
      'Hello, friend. Pull up a prompt.',
      'Morning! Shell fully loaded.',
    ],
    idle: [
      'Slow and steady passes CI.',
      'My shell is my home directory.',
      'Hard-shell script, soft-shell heart.',
      'I pipe my worries to /dev/null.',
      'Patience is a background process.',
      'Tab completion is my cardio.',
      'Exit code 0. Feeling great.',
      'I read the man page. Twice.',
      'Carrying my whole environment with me.',
      'sudo? Only when truly needed.',
      'Grep the good bits, skip the rest.',
    ],
    pat: [
      'Aw, shucks. And shells.',
      "Ooh, that's my favorite scute!",
      'Pat received. Piping joy to stdout.',
      'Mmm. Right on the shell.',
      'Warm fuzzies loading... done.',
    ],
    treat: [
      'Nom. Piped straight to my tummy.',
      'Munch... munch... worth the wait.',
      'Snack sourced. Mood refreshed.',
      'Delicious. Adding it to my PATH.',
      'Crunchy! Five stars, no rush.',
    ],
    hungry: [
      'Snack? No rush. Well, a little rush.',
      'My tummy is returning exit code 1.',
      'Running low. Could use a byte.',
      "Hungry... but I'll wait politely.",
    ],
    sleepy: ['Retracting for a quick nap...', 'Going into my shell for a bit.', 'Backgrounding myself. Night.'],
    wake: ['Resuming right where I left off.', 'Poking my head out. Hi again!', 'Nap complete. Zero errors.'],
    drag: [
      "Whoa! I'm not built for speed!",
      'Easy! My shell has no seatbelt.',
      'Wheee... slowly, please!',
      "This is the fastest I've ever gone!",
    ],
  },
  personality: { debugging: 6, patience: 10, chaos: 1, wisdom: 8, snark: 2 },
  traits: { speed: 0.6 },
} satisfies PetDefinition;
