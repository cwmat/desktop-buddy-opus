/**
 * Segfault, the Chaos Cat — a sleek charcoal tuxedo cat. Body in profile facing right,
 * head turned three-quarters toward the viewer.
 *
 * One HEAD patch (with eye / mouth / ear slots) sits on per-pose bodies. The tail and
 * legs are rasterised from a few control points so they can swish and stride without
 * being redrawn, and a final `relight` pass lightens the silhouette's outline (strongly
 * on the lit top/left, a little on the bottom/right) so the dark cat stays readable on
 * dark desktops without losing its crisp edge on light ones.
 */
import { anim, blank, patch, shift, sprite } from './sprite';
import { SPRITE_SIZE, type Frame, type PetDefinition } from './types';

type Pt = readonly [number, number];

// --- Head -----------------------------------------------------------------------------
// 15×15, ears on rows 0–3. Rounded jaw, a white blaze down to the nose and a white
// muzzle; the rest of the face stays charcoal so it doesn't read as a white box.

const HEAD = sprite(`
  .o...........o.
  .oo.........oo.
  .opo.......opo.
  .oppoooooooppo.
  .ohhhhhhhhhhbo.
  ohhbbbbbbbbbbdo
  ohbbbbbbbbbbbdo
  ohbbbbbwbbbbbdo
  ohbbbbbwbbbbbdo
  ohbbbbwpwbbbbdo
  ohbbbwowowbbbdo
  ohbbbwwwwwbbddo
  .odbbswwwsbddo.
  ..oddddsddddo..
  ...ooooooooo...
`);

// 4×4 eyes, stamped at head (2, 6) and (9, 6). Green iris ring around a slit pupil set to
// the right (so the cat looks where it walks), catchlight top-left. `.` keeps the fur.
const EYES = {
  open: `
    .gg.
    gwog
    ggoG
    .GG.
  `,
  // Closed eyes are drawn in pale lavender: a dark line would vanish into dark fur.
  blink: `
    ....
    ....
    ssss
    ....
  `,
  // Content ‿ curves, for naps.
  shut: `
    ....
    s..s
    .ss.
    ....
  `,
  happy: `
    ....
    .ss.
    s..s
    ....
  `,
  // Unimpressed: a heavy flat lid over the top half.
  annoyed: `
    ....
    oooo
    ggoG
    .GG.
  `,
  // Startled: round eyes, pinprick pupils.
  wide: `
    .gg.
    gwgg
    ggoG
    .GG.
  `,
};

// Mouth patches at head (6, 10), under the nose.
const MOUTHS = {
  open: `
    ooo
    opo
    .o.
  `,
  flat: `
    ooo
  `,
};

// The right ear flicks outward (head (10, 0)).
const EAR_TWITCH = `
  ..._o
  .._oo
  ._opo
  .oppo
`;

interface Face {
  eyes?: keyof typeof EYES;
  mouth?: keyof typeof MOUTHS;
  twitch?: boolean;
}

function head({ eyes = 'open', mouth, twitch = false }: Face): Frame {
  let h = patch(HEAD, 2, 6, EYES[eyes]);
  h = patch(h, 9, 6, EYES[eyes]);
  if (mouth) h = patch(h, 6, 10, MOUTHS[mouth]);
  if (twitch) h = patch(h, 10, 0, EAR_TWITCH);
  return h;
}

// --- Procedural parts -----------------------------------------------------------------

/**
 * Paint a 2px-thick tail through the control points (base first), with outline and
 * top-left light. The last `TIP` brush steps are the white tail tip.
 */
const TIP = 2;
function tail(points: readonly Pt[]): Frame {
  const path: Pt[] = [];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = i === 1 ? 0 : 1; s <= n; s++) {
      path.push([Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n)]);
    }
  }
  // 0 = empty, 1 = fur, 2 = white tip.
  const on = Array.from({ length: SPRITE_SIZE }, () => new Array<number>(SPRITE_SIZE).fill(0));
  path.forEach(([x, y], i) => {
    const tip = i >= path.length - TIP;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const row = on[y + dy];
      if (row && x + dx >= 0 && x + dx < SPRITE_SIZE && (tip || !row[x + dx])) row[x + dx] = tip ? 2 : 1;
    }
  });
  const has = (x: number, y: number) => (on[y]?.[x] ?? 0) > 0;
  return on.map((row, y) =>
    row
      .map((v, x) => {
        if (v) {
          const [lit, base, shade] = v === 2 ? ['w', 'w', 's'] : ['h', 'b', 'd'];
          if (!has(x, y - 1)) return lit;
          if (!has(x + 1, y) || !has(x, y + 1)) return shade;
          return base;
        }
        return has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1) ? 'o' : '.';
      })
      .join(''),
  );
}

/**
 * Rasterise a solid fur shape from per-row interior spans [left, right] starting at row
 * `top`, with a 1px outline, a rim light along the top/left and shade on the bottom/right.
 */
function fur(top: number, spans: readonly Pt[]): Frame {
  const inside = (x: number, y: number) => {
    const s = spans[y - top];
    return !!s && x >= s[0] && x <= s[1];
  };
  return Array.from({ length: SPRITE_SIZE }, (_, y) => {
    let row = '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      if (inside(x, y)) {
        if (!inside(x, y - 1) || !inside(x - 1, y)) row += 'h';
        else if (!inside(x + 1, y) || !inside(x, y + 1)) row += 'd';
        else row += 'b';
      } else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) {
        row += 'o';
      } else {
        row += '.';
      }
    }
    return row;
  });
}

interface Leg {
  /** Left edge of the leg where it meets the body. */
  hip: number;
  /** Left edge of the paw (defaults to straight down). */
  paw?: number;
  /** Paw height off the ground. */
  lift?: number;
  far?: boolean;
}

/** A slim 4px leg from `top` down to its sole, slanting from hip to paw; white sock. */
function drawLeg(frame: Frame, top: number, { hip, paw = hip, lift = 0, far = false }: Leg): Frame {
  const sole = SPRITE_SIZE - 1 - lift;
  const coat = far ? 'dd' : 'bb';
  const sock = far ? 'ss' : 'ww';
  let f = frame;
  for (let y = top; y <= sole; y++) {
    const t = sole === top ? 1 : (y - top) / (sole - top);
    const x = Math.round(hip + (paw - hip) * t);
    const row = y === sole ? 'oooo' : y >= sole - 2 ? `o${sock}o` : `o${coat}o`;
    f = patch(f, x, y, [row]);
  }
  return f;
}

/**
 * Silhouette outline pixels facing up or left become the lit outline `O`, so the edge
 * catches the light; the rest of the silhouette gets the bounce-lit `q`, which is still
 * dark against a light desktop but lifts the shaded side off a dark one. Lines inside
 * the silhouette (the face, where parts overlap) stay `o`.
 */
function relight(frame: Frame): Frame {
  const clear = (x: number, y: number) => (frame[y]?.[x] ?? '.') === '.';
  return frame.map((row, y) =>
    row
      .split('')
      .map((c, x) => {
        if (c !== 'o') return c;
        if ((clear(x, y - 1) || clear(x - 1, y)) && !clear(x + 1, y) && !clear(x, y + 1)) return 'O';
        return clear(x, y - 1) || clear(x - 1, y) || clear(x + 1, y) || clear(x, y + 1) ? 'q' : c;
      })
      .join(''),
  );
}

/** Stretch everything above `row` up by 1px — a breath in. */
function breathe(frame: Frame, row: number): Frame {
  return frame.map((_, y) => (y < row ? frame[y + 1] : frame[y]));
}

const over = (base: Frame, top: Frame) => patch(base, 0, 0, top);

// --- Standing ---------------------------------------------------------------------------

// Torso in profile; the head covers its front. Belly outline on row 25, legs hang below.
const TORSO = sprite(`
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
  ................................
  ..........ooooooooo.............
  .........ohhhhhhhhho............
  ........ohhbbbbbbbbbo...........
  .......ohhbbbbbbbbbbbo..........
  .......ohbbbbbbbbbbbwwo.........
  .......ohbbbbbbbbbbwwwwo........
  .......obbbbbbbbbbbwwwwo........
  .......obbbbbbbbbbbwwwso........
  .......odbbbbbbbbbdswwso........
  ........oddddddddddsssso........
  .........oooooooooooooo.........
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
`);
const HEAD_AT = [16, 6] as const;
const BELLY = 25;

const TAILS = {
  up: [[8, 18], [6, 16], [5, 14], [5, 10], [6, 8], [8, 7]],
  left: [[8, 18], [6, 16], [4, 14], [3, 11], [3, 9], [4, 7]],
  right: [[8, 18], [6, 16], [6, 13], [7, 10], [8, 8], [10, 7]],
  high: [[8, 18], [7, 15], [7, 10], [8, 7], [10, 6]],
} satisfies Record<string, Pt[]>;

/** Legs in draw order: far back, far front, near back, near front (paw x each). */
function legs(fb: number, ff: number, nb: number, nf: number, lift: number[] = []): Leg[] {
  return [fb, ff, nb, nf].map((x, i) => ({ hip: x, paw: x, lift: lift[i] ?? 0, far: i < 2 }));
}
const STAND = legs(11, 16, 8, 19);

interface Pose extends Face {
  /** Body offset; legs stretch to reach their paws. */
  dy?: number;
  tail?: readonly Pt[];
  legs?: Leg[];
  inhale?: boolean;
  /** Head offset relative to the body (a dip for eating; keeps it level while prowling). */
  headDy?: number;
}

function stand({ dy = 0, tail: t = TAILS.up, legs: ls = STAND, inhale = false, headDy = 0, ...face }: Pose): Frame {
  let upper = patch(TORSO, HEAD_AT[0], HEAD_AT[1] + headDy, head(face));
  if (inhale) upper = breathe(upper, 22);
  upper = shift(over(tail(t), upper), 0, dy);
  const top = BELLY + dy;
  let f = blank();
  for (const leg of ls.filter((l) => l.far)) f = drawLeg(f, top, leg);
  f = over(f, upper);
  for (const leg of ls.filter((l) => !l.far)) f = drawLeg(f, top, leg);
  return relight(f);
}

// --- Sitting ----------------------------------------------------------------------------

// Upright sit, head on top at (13, 6): a convex back arches out from behind the head
// into a round haunch, with the chest and front leg straight down in front.
const SIT_BODY: Pt[] = [
  [12, 21], // row 16
  [11, 21],
  [10, 21],
  [10, 21],
  [9, 21],
  [9, 21],
  [9, 21],
  [8, 21],
  [8, 21],
  [8, 21],
  [8, 21],
  [8, 21],
  [8, 21],
  [8, 21],
  [9, 21], // row 30
];
const BIB = `
  wwww
  wwww
  wwws
  swws
  .sss
`;
// Haunch: a crease down the front of the thigh ending in the white hind paw.
const THIGH = `
  ...d.
  ...d.
  ..d..
  .wws.
  wwws.
`;
// The tail curls around behind the front paws; only the tip peeks out in front.
const SIT_TAILS = {
  rest: [[20, 29], [21, 29], [23, 28], [24, 26]],
  flick: [[20, 29], [21, 29], [24, 28], [25, 26]],
} satisfies Record<string, Pt[]>;

function sit({ inhale = false, tail: t = SIT_TAILS.rest, ...face }: Pose): Frame {
  let f = fur(16, SIT_BODY);
  f = patch(f, 12, 26, THIGH);
  f = patch(f, 17, 21, BIB);
  f = patch(f, 13, 6, head(face));
  if (inhale) f = breathe(f, 24);
  f = over(f, tail(t));
  f = drawLeg(f, 24, { hip: 19 });
  return relight(f);
}

// --- Scruffed (drag) ----------------------------------------------------------------------

// Held up by the scruff: the body hangs straight down under the head, everything limp.
const HANG_BODY: Pt[] = [
  [11, 20], // row 15
  [11, 20],
  [11, 20],
  [11, 19],
  [11, 19],
  [11, 19],
  [11, 19],
  [11, 19],
  [11, 19],
  [11, 18],
  [12, 18],
  [12, 17],
  [13, 16], // row 27
];

function hang(sway: number): Frame {
  let f = blank();
  f = drawLeg(f, 25, { hip: 14, paw: 14 + sway, lift: 1, far: true });
  f = over(f, tail([[12, 25], [9, 26], [7, 27], [6 - sway, 29]]));
  f = over(f, fur(15, HANG_BODY));
  f = patch(f, 15, 18, BIB);
  f = drawLeg(f, 25, { hip: 11, paw: 11 + sway });
  f = drawLeg(f, 20, { hip: 17, paw: 17 + sway, lift: 5 });
  f = patch(f, 9, 3, head({ eyes: 'annoyed', mouth: 'flat' }));
  return relight(f);
}

// --- Curled up (sleep) --------------------------------------------------------------------

// A round mound of back and haunch; the head rests on its front and the tail wraps
// along the bottom to tuck under the chin.
const CURL_BODY: Pt[] = [
  [9, 14], // row 19
  [7, 16],
  [6, 17],
  [5, 18],
  [5, 19],
  [4, 19],
  [4, 20],
  [4, 20],
  [4, 20],
  [4, 20],
  [5, 20],
  [6, 19], // row 30
];

function curl(inhale: boolean): Frame {
  let body = fur(19, CURL_BODY);
  if (inhale) body = breathe(body, 27);
  let f = patch(body, 14, 14, head({ eyes: 'shut' }));
  f = over(f, tail([[5, 26], [6, 28], [9, 29], [20, 29], [24, 28], [26, 26]]));
  return relight(f);
}

// --- Definition -------------------------------------------------------------------------

const idle = stand({});

export default {
  id: 'segfault',
  name: 'Segfault',
  species: 'Chaos Cat',
  tagline: 'Nine lives. Zero regard for your coffee mug.',
  accent: '#3ddc84',
  mouth: { x: 23, y: 17 },
  palette: {
    o: '#1a1528', // outline, pupils, mouth
    O: '#6a6590', // lit outline (silhouette top/left) — the rim that reads on dark desktops
    q: '#3e3958', // bounce-lit outline (silhouette bottom/right), still dark on light desktops
    d: '#2b2839', // fur shade
    b: '#403d55', // charcoal fur
    h: '#5c5877', // fur highlight
    w: '#f7f5fc', // tuxedo white
    s: '#bcb6d2', // white shade
    g: '#6df08a', // eyes
    G: '#26a35a', // eye shade
    p: '#ff9ab4', // nose, inner ears, tongue
  },
  animations: {
    // Planted and breathing while the tail swishes one step at a time; an ear flicks.
    idle: anim(2.5, [
      idle,
      stand({ inhale: true, tail: TAILS.right }),
      stand({ inhale: true, twitch: true }),
      stand({ tail: TAILS.left }),
    ]),
    blink: anim(8, [stand({ eyes: 'blink' })]),
    // Confident prowl: diagonal leg pairs swing and the shoulders roll while the head
    // stays level (it sinks as the body rises); tail held high.
    walk: anim(7, [
      stand({ legs: legs(12, 15, 7, 20) }),
      stand({ dy: -1, headDy: 1, legs: legs(11, 16, 8, 19, [2, 0, 0, 2]), tail: TAILS.high }),
      stand({ legs: legs(7, 20, 10, 17) }),
      stand({ dy: -1, headDy: 1, legs: legs(11, 16, 8, 19, [0, 2, 2, 0]), tail: TAILS.high }),
    ]),
    sit: anim(2, [sit({}), sit({ inhale: true, tail: SIT_TAILS.flick })]),
    sleep: anim(1.5, [curl(false), curl(true)]),
    happy: anim(8, [
      stand({ dy: 1, eyes: 'happy', tail: TAILS.high }),
      stand({ dy: -2, eyes: 'happy', mouth: 'open', tail: TAILS.high, legs: legs(11, 16, 8, 19, [2, 2, 2, 2]) }),
      stand({ dy: -3, eyes: 'happy', mouth: 'open', tail: TAILS.up, legs: legs(11, 16, 8, 19, [3, 3, 3, 3]) }),
      stand({ eyes: 'happy', tail: TAILS.high }),
    ]),
    eat: anim(6, [
      stand({ mouth: 'open' }),
      stand({ eyes: 'happy', headDy: 1 }),
      stand({ mouth: 'open' }),
      stand({ eyes: 'happy', headDy: 1, twitch: true }),
    ]),
    drag: anim(3, [hang(0), hang(1)]),
    // Flailing: legs paddle out of step, tail whips, ears pinned in alarm.
    fall: anim(8, [
      stand({ dy: -2, eyes: 'wide', mouth: 'open', tail: TAILS.high, legs: legs(12, 15, 7, 20, [3, 1, 1, 3]) }),
      stand({
        dy: -2,
        eyes: 'wide',
        mouth: 'open',
        tail: TAILS.left,
        twitch: true,
        legs: legs(7, 20, 10, 17, [1, 3, 3, 1]),
      }),
    ]),
  },
  lines: {
    greet: [
      'Oh. You again. Fine, you may stay.',
      'Booted up. All nine lives loaded.',
      "I sat on your keyboard. You're welcome.",
      'Mrrp. Your desk looked too tidy.',
    ],
    idle: [
      'That mug was too close to the edge.',
      'I walked on the keys. Now it compiles.',
      'Core dumped. On the rug. Sorry.',
      "I'm on life 7 of 9. Probably.",
      "The line you're reading? Mine now.",
      'I only dereference null for fun.',
      'Knocked your pen off. For science.',
      'Undefined behavior is my love language.',
      'Your cursor looks catchable.',
      'Warm laptop. Therefore: my laptop.',
      'Access violation? I call it exploring.',
    ],
    pat: [
      "Purr... don't let it go to your head.",
      'Acceptable. Continue.',
      'Mrrp! ...I meant to do that.',
      'Two more, then I bite. Gently.',
      'Purring at 60 Hz.',
    ],
    treat: [
      'Nom. Pointer to snack: resolved.',
      "Crunch. I'll allow it.",
      'Acceptable tribute, human.',
      'Delicious. Life count restored.',
      'Mrrp! Snack heap allocated.',
    ],
    hungry: [
      'My bowl is null. Fix that.',
      'Feed me or the mug gets it.',
      'Hunger level: kernel panic.',
      'I can see the bottom of my bowl.',
    ],
    sleepy: ['Curling into a donut...', 'Nap mode. Do not deploy.', 'Going to sleep on your notes.'],
    wake: ["I'm up. What did I miss?", 'Rebooted. Still chaotic.', 'Mrrp? Back online.'],
    drag: [
      'Unhand me, you absolute mortal.',
      'This is undignified.',
      'I will remember this. Forever.',
      'Put me down. I have mugs to push.',
    ],
  },
  personality: { debugging: 3, patience: 2, chaos: 10, wisdom: 5, snark: 9 },
} satisfies PetDefinition;
