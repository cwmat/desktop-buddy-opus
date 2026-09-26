/**
 * Spore, the Glowcap Mushroom — a cosy little toadstool whose cap spots glow in the dark.
 *
 * The cap is rasterised from a superellipse dome in its own tilted coordinate space, so it
 * can wobble, tilt and squash while keeping the same volume; the glowing spots ride along
 * in cap space. The stem is a width profile with the face and tiny feet stamped on it, and
 * the cap goes on last so it can hide the neck (or the eyes, when Spore naps).
 */
import { anim, blank, patch } from './sprite';
import { SPRITE_SIZE, type Frame, type PetDefinition } from './types';

const palette = {
  o: '#3b1670', // outline (deep violet)
  d: '#6a36b6', // cap shade + underside
  b: '#9a5ce6', // cap
  h: '#c69cff', // cap rim light
  g: '#a8ffe2', // spot, glowing
  m: '#3fbfa8', // spot, resting glow
  n: '#6a8fcf', // spot, asleep
  c: '#fff1dd', // stem
  s: '#e3c3b3', // stem shade
  k: '#2a1040', // eyes, mouth
  w: '#ffffff', // catchlights, sparkle cores
  p: '#ff9cc6', // blush, tongue
};

// --- Cap --------------------------------------------------------------------------------

/** Dome half-width and height, lip depth under the widest line, and superellipse power. */
const CAP = { a: 11.6, h: 9.2, lip: 2.2, power: 2.3 };

/** Spots in cap space (x right, y up from the widest line); groups 0/1 pulse out of step. */
const SPOTS: { x: number; y: number; group: 0 | 1; art: string[] }[] = [
  { x: -5, y: 5, group: 0, art: ['.xx.', 'xxxx', 'xxxx', '.xx.'] },
  { x: 4.5, y: 6, group: 1, art: ['.xxx', 'xxxx', 'xxx.'] },
  { x: 8.6, y: 2, group: 0, art: ['xx', 'xx'] },
  { x: 0, y: 2, group: 1, art: ['xx', 'xx'] },
  { x: -9, y: 2.6, group: 1, art: ['xx', 'xx'] },
];

interface CapPose {
  /** Pivot: centre of the cap's widest line, in frame pixels. */
  x: number;
  y: number;
  /** Degrees; positive leans the cap forward (clockwise). */
  tilt?: number;
  /** Stretch the dome: >1 taller and narrower, <1 squashed wide. */
  stretch?: number;
  /** Spot colour per group. */
  glow: readonly [string, string];
}

function drawCap(frame: Frame, { x, y, tilt = 0, stretch = 1, glow }: CapPose): Frame {
  const a = CAP.a / Math.sqrt(stretch);
  const h = CAP.h * stretch;
  const t = (tilt * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const local = (px: number, py: number) => {
    const dx = px + 0.5 - x;
    const dy = y - (py + 0.5);
    return [dx * cos - dy * sin, dx * sin + dy * cos] as const;
  };
  const inside = (px: number, py: number) => {
    const [lx, ly] = local(px, py);
    const ny = ly >= 0 ? ly / h : -ly / CAP.lip;
    return (Math.abs(lx) / a) ** CAP.power + ny ** CAP.power <= 1;
  };

  const out = frame.map((row) => row.split(''));
  const dome: boolean[][] = out.map((row) => row.map(() => false));
  for (let py = 0; py < SPRITE_SIZE; py++) {
    for (let px = 0; px < SPRITE_SIZE; px++) {
      if (inside(px, py)) {
        const [lx, ly] = local(px, py);
        if (ly < 0) out[py][px] = 'd';
        else if (!inside(px + 2, py)) out[py][px] = 'd';
        else if (!inside(px - 1, py - 1) || (lx < 0 && !inside(px, py - 1))) out[py][px] = 'h';
        else out[py][px] = 'b';
        dome[py][px] = ly >= 0;
      } else if (inside(px - 1, py) || inside(px + 1, py) || inside(px, py - 1) || inside(px, py + 1)) {
        out[py][px] = 'o';
      }
    }
  }

  // Spots: place each centre in cap space, stamp the (unrotated) shape, clip to the dome.
  for (const spot of SPOTS) {
    const sx = spot.x / Math.sqrt(stretch);
    const sy = spot.y * stretch;
    const cx = x + sx * cos + sy * sin;
    const cy = y - (-sx * sin + sy * cos);
    const left = Math.round(cx - spot.art[0].length / 2);
    const top = Math.round(cy - spot.art.length / 2);
    spot.art.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const px = left + i;
        const py = top + j;
        if (row[i] !== 'x' || !dome[py]?.[px]) continue;
        // Keep a 1px cap border so spots never merge into the outline.
        if (!inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1)) continue;
        out[py][px] = glow[spot.group];
      }
    });
  }
  return out.map((row) => row.join(''));
}

// --- Stem & face ------------------------------------------------------------------------

/**
 * Interior width of each stem row, top to bottom. The first three rows sit under the cap
 * (a narrow neck that shows when the cap tilts); the rest is a chubby, rounded body.
 */
const STEM = {
  rest: [10, 10, 12, 12, 14, 16, 16, 16, 16, 16, 16, 14, 12],
  squat: [10, 12, 12, 14, 16, 16, 16, 16, 16, 16, 16, 14],
  tall: [10, 10, 10, 12, 12, 14, 16, 16, 16, 16, 16, 16, 14, 12],
};

// 12px faces stamped at x=11: eyes on the first 4 rows (7 rows above the stem's bottom),
// cheeks and mouth below. The eyes sit right of centre so Spore looks the way it walks.
const EYES = {
  open: `
    ...kk....kk.
    ..kwkk..kwkk
    ..kkkk..kkkk
    ...kk....kk.
  `,
  blink: `
    ............
    ............
    ..kkkk..kkkk
    ............
  `,
  shut: `
    ............
    ............
    ..k..k..k..k
    ...kk....kk.
  `,
  content: `
    ............
    ..kkkk..kkkk
    ..kwkk..kwkk
    ...kk....kk.
  `,
  happy: `
    ............
    ...kk....kk.
    ..k..k..k..k
    ............
  `,
  wide: `
    ...kk....kk.
    ..kwwk..kwwk
    ..kwkk..kwkk
    ...kk....kk.
  `,
};

// Mouth patches at (16, 25), between the eyes.
const MOUTHS = {
  smile: `
    k..k
    .kk.
  `,
  grin: `
    kkkk
    kppk
    .kk.
  `,
  // Kept to three rows so the open mouth never touches the base outline.
  chomp: `
    .kk.
    kppk
    .kk.
  `,
  chew: `
    ....
    .kk.
  `,
  oh: `
    .kk.
    k..k
    .kk.
  `,
  sleep: `
    ....
    .kk.
  `,
};

interface Foot {
  x: number;
  /** Row of the foot's bottom outline (31 = on the ground). */
  sole: number;
  far?: boolean;
}

function drawFoot(frame: Frame, top: number, { x, sole, far }: Foot): Frame {
  const rows: string[] = [];
  for (let y = top; y < sole; y++) rows.push(far || y === top ? 'osso' : 'occo');
  rows.push('.oo.');
  return patch(frame, x, top, rows);
}

/** Far foot first (drawn behind), then the near one; lifts raise a foot off the ground. */
const feet = (far: number, near: number, farLift = 0, nearLift = 0): Foot[] => [
  { x: far, sole: 31 - farLift, far: true },
  { x: near, sole: 31 - nearLift },
];
const STAND = feet(11, 17);

/** A rounded foot poking out in front while sitting on the ground; the far one hides behind. */
const TUCKED = `
  .oooo.
  occcso
  osssso
  .oooo.
`;

/**
 * Spore puffs, in frame pixels: a glowing plus and teal glints. Teal (not the pale glow)
 * for the glints so they still show up on a light desktop.
 */
const PUFF = {
  big: `
    .m.
    mgm
    .m.
  `,
  small: 'm',
};

interface Pose {
  /** Whole-body offset (negative = up); feet stretch to reach their soles. */
  dy?: number;
  stem?: keyof typeof STEM;
  /** Cap offset from its seat on the stem (positive = lower). */
  capDy?: number;
  /** Cap tilt in degrees (positive = forward). */
  tilt?: number;
  /** Cap stretch (>1 tall and narrow, <1 squashed wide). */
  stretch?: number;
  /** Which spot group glows: 0, 1, both, or none (asleep). */
  glow?: keyof typeof GLOW;
  eyes?: keyof typeof EYES;
  mouth?: keyof typeof MOUTHS;
  /** Feet, or 'tucked' when sitting on the ground. */
  feet?: Foot[] | 'tucked';
  /** Glowing spore puffs drawn over everything: [kind, x, y] in frame pixels. */
  puffs?: [keyof typeof PUFF, number, number][];
}

const GLOW = {
  0: ['g', 'm'],
  1: ['m', 'g'],
  both: ['g', 'g'],
  none: ['n', 'n'],
} as const;

function pose({
  dy = 0,
  stem = 'rest',
  capDy = 0,
  tilt = 0,
  stretch = 1,
  glow = 0,
  eyes = 'open',
  mouth = 'smile',
  feet: legs = STAND,
  puffs = [],
}: Pose): Frame {
  const widths = STEM[stem];
  const bottom = 28 + dy;
  const top = bottom - widths.length + 1;
  const insideStem = (x: number, y: number) => {
    if (y < top || y > bottom) return false;
    const left = 16 - widths[y - top] / 2;
    return x >= left && x < left + widths[y - top];
  };

  // Stem shading: a 2px band on the right, the row along the base, and the cap's shadow
  // over the top rows (light from the top-left).
  let f: Frame = blank().map((_, y) => {
    let row = '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      if (insideStem(x, y)) {
        row += !insideStem(x + 2, y) || !insideStem(x, y + 1) || y < top + 5 ? 's' : 'c';
      } else if (insideStem(x - 1, y) || insideStem(x + 1, y) || insideStem(x, y - 1) || insideStem(x, y + 1)) {
        row += 'o';
      } else {
        row += '.';
      }
    }
    return row;
  });
  const faceY = bottom - 7;
  f = patch(f, 11, faceY, EYES[eyes]);
  f = patch(f, 11, faceY + 4, 'pp.........p');
  f = patch(f, 16, faceY + 4, MOUTHS[mouth]);
  if (legs === 'tucked') f = patch(f, 21, bottom - 2, TUCKED);
  else for (const foot of legs) f = drawFoot(f, bottom + 1, foot);
  f = drawCap(f, { x: 16, y: top + 1 + capDy, tilt, stretch, glow: GLOW[glow] });
  for (const [kind, x, y] of puffs) f = patch(f, x, y, PUFF[kind]);
  return f;
}

const idle = pose({});
/** Sat down on the ground, feet poking out in front. */
const sitting = (extra: Pose = {}) => pose({ dy: 2, feet: 'tucked', eyes: 'content', ...extra });
/** Hunkered down with the cap pulled over the eyes and the glow turned right down. */
const napping = (stem: keyof typeof STEM) =>
  sitting({ stem, eyes: 'shut', mouth: 'sleep', capDy: 3, glow: 'none' });
/** Airborne legs: the feet travel with the body. */
const hop = (dy: number, spread = 0): Foot[] => [
  { x: 11 - spread, sole: 31 + dy, far: true },
  { x: 17 + spread, sole: 31 + dy },
];

export default {
  id: 'spore',
  name: 'Spore',
  species: 'Glowcap Mushroom',
  tagline: 'Glows in the dark. Grows on you.',
  accent: '#c94be0',
  mouth: { x: 17, y: 26 },
  palette,
  animations: {
    // Planted and breathing while the two spot groups take turns glowing.
    idle: anim(2.5, [idle, pose({ stem: 'tall' }), pose({ stem: 'tall', glow: 1 }), pose({ glow: 1 })]),
    blink: anim(8, [pose({ eyes: 'blink' })]),
    // Bouncy waddle: spring up as a foot swings forward, squash down as it lands, while
    // the heavy cap rocks on the stem. Planted feet slide back as Spore moves forward.
    // The spots pulse per step.
    walk: anim(7, [
      pose({ dy: -1, tilt: -5, feet: feet(11, 19, 0, 1) }),
      pose({ stem: 'squat', tilt: 4, feet: feet(10, 18) }),
      pose({ dy: -1, tilt: -5, glow: 1, feet: feet(13, 17, 1, 0) }),
      pose({ stem: 'squat', tilt: 4, glow: 1, feet: feet(12, 17) }),
    ]),
    sit: anim(2, [sitting(), sitting({ stem: 'tall', glow: 1 })]),
    sleep: anim(1.5, [napping('rest'), napping('squat')]),
    // Boing! Squash, spring up with the cap trailing, puff glowing spores at the top that
    // keep drifting up and apart as Spore comes back down.
    happy: anim(8, [
      pose({ stem: 'squat', stretch: 0.85, glow: 'both', eyes: 'happy', mouth: 'grin' }),
      pose({ dy: -2, stem: 'tall', capDy: 1, stretch: 1.1, eyes: 'happy', mouth: 'grin', feet: hop(-2) }),
      pose({
        dy: -4,
        capDy: -1,
        glow: 'both',
        eyes: 'happy',
        mouth: 'grin',
        feet: hop(-4, 1),
        puffs: [
          ['big', 1, 3],
          ['big', 27, 1],
          ['small', 8, 0],
          ['small', 21, 0],
        ],
      }),
      pose({
        dy: -2,
        glow: 1,
        eyes: 'happy',
        mouth: 'grin',
        feet: hop(-2),
        puffs: [
          ['small', 1, 1],
          ['big', 28, 0],
          ['small', 6, 0],
          ['small', 23, 1],
        ],
      }),
    ]),
    // Open wide, munch, nibble, munch. No food drawn: the renderer drops the treat in.
    eat: anim(6, [
      pose({ stem: 'tall', mouth: 'grin' }),
      pose({ stem: 'squat', eyes: 'happy', mouth: 'chew' }),
      pose({ eyes: 'happy', mouth: 'chomp', glow: 1 }),
      pose({ stem: 'squat', eyes: 'happy', mouth: 'chew', glow: 1 }),
    ]),
    // Scooped up: the cap swings on its neck while the tiny feet dangle out of step.
    drag: anim(4, [
      pose({ dy: -1, stem: 'tall', tilt: -12, eyes: 'wide', mouth: 'oh', feet: feet(11, 17, 1, 0) }),
      pose({ dy: -1, stem: 'tall', tilt: 8, eyes: 'wide', mouth: 'oh', feet: feet(12, 18, 0, 1) }),
    ]),
    // Flailing: the cap flaps and the feet kick out of step.
    fall: anim(8, [
      pose({ dy: -2, capDy: -1, tilt: -8, glow: 'both', eyes: 'wide', mouth: 'oh', feet: feet(10, 18, 1, 3) }),
      pose({ dy: -2, capDy: -1, tilt: 6, glow: 'both', eyes: 'wide', mouth: 'oh', feet: feet(11, 19, 3, 1) }),
    ]),
  },
  lines: {
    greet: [
      'Hi! I brought my own night light.',
      'Spore here. Vibes: bioluminescent.',
      "Dark mode? Oh, we'll get along great.",
      'Sprouted just in time to say hello.',
    ],
    idle: [
      'Mycelium: the original internet.',
      'Dark mode is my natural habitat.',
      "I'm a fun-gi. It's in my spec.",
      'My spores live in the cloud. Literally.',
      'Low light, high spirits.',
      'Decomposing problems, one log at a time.',
      'Slow growth is still growth.',
      'Glowing quietly in the background.',
      'Uptime: several damp seasons.',
      'The roots say hi. Peer to peer.',
      'Shh. The forest is still buffering.',
    ],
    pat: [
      'Ooh, my spots went all sparkly.',
      'Cap pats are my love language.',
      'Glow level: plus one.',
      'Soft cap, softer heart.',
      'Hehe. That tickles my gills.',
    ],
    treat: [
      'Nom! Tastes like a rainy forest.',
      'Nutrients received. Thank you!',
      'Yum. My spots feel brighter already.',
      'Sharing the crumbs with my roots.',
      'Mmm. Five-star compost.',
    ],
    hungry: [
      'My glow is getting a little dim...',
      'Running low on nutrients.',
      'Spots on battery saver. Snack?',
      'Even a crumb helps a shroom.',
    ],
    sleepy: ['Dimming the spots... night night.', 'Cap down. Do not disturb.', 'Going dormant for a bit.'],
    wake: ['Sprouted back up!', 'Glow restored. Morning!', 'Did it rain? I feel refreshed.'],
    drag: [
      "Whoa! I'm not rooted after all!",
      'Uprooted! Gently, please!',
      'Careful, the cap is load-bearing!',
      'Wheee! Spore cloud incoming!',
    ],
  },
  personality: { debugging: 4, patience: 7, chaos: 5, wisdom: 6, snark: 4 },
  traits: { speed: 0.85 },
} satisfies PetDefinition;
