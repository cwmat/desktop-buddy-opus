/**
 * Capybyte — a chunky, unbothered capybara balancing a mandarin on its head.
 * Every pose is composed from one leg-less BODY plus leg / eye / mouth / orange
 * patches, so volume stays identical between frames.
 */
import { anim, patch, shift, sprite } from './sprite';
import type { Frame, PetDefinition } from './types';

// Body without legs; the belly outline sits on row 28 so legs can hang below it.
const BODY = sprite(`
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
  ..................oo............
  .................odbo...........
  .................ooooooooooo....
  ................ohhhhhhhhhbbo...
  ...............ohbbbbbooobbddo..
  ......ooooooooohbbbbbbbwkbbodo..
  ....oohhhhhhhhhbbbbbbbbkkbbbbo..
  ...ohhbbbbbbbbbbbbbbbbbbbbbbbo..
  ...ohbbbbbbbbbbbbbbbbbppbbbbbo..
  ...obbbbbdbbbbbbbbbbbbbbbbobbo..
  ...obbbbbbdbbbbbbbbbbbbbbbbooo..
  ...obbbbbbdbbbbbbbbbbbbbdddddo..
  ...obbbbbbdbbbbbbbbbddooooooo...
  ...obbbbbbdbbbbbbbbdddo.........
  ...obbbbbdbbbbbbbbbdddo.........
  ...oddddddddddddddddddo.........
  ....odddddddddddddddddo.........
  .....oooooooooooooooooo.........
  ................................
  ................................
  ................................
`);

// A small mandarin (with leaf) resting on the head.
const ORANGE = `
  ...gg.
  .oooo.
  olyyyo
  oyyyro
  .orro.
`;
const ORANGE_AT = { x: 21, y: 8 };

// 3×3 eye patches at (22, 15); the default is the signature half-lidded stare.
const EYES = {
  sleepy: `
    ddd
    wkk
    kkk
  `,
  closed: `
    bbb
    bbb
    ooo
  `,
  happy: `
    bob
    obo
    bbb
  `,
  wide: `
    wkk
    kkk
    kkk
  `,
};

// Mouth patches at (25, 21), covering the front of the snout down to the jaw.
const MOUTHS = {
  open: `
    ooooo
    okkpo
    .oppo
    ..oo.
  `,
  chew: `
    ..bbo
    ddooo
  `,
};

interface Leg {
  x: number;
  /** Row of the foot's bottom outline (31 = standing on the ground). */
  foot: number;
  far?: boolean;
}

/** A stubby leg, 5px wide incl. outline, from the belly row down to `foot`. */
function drawLeg(frame: Frame, top: number, { x, foot, far }: Leg): Frame {
  const rows: string[] = [];
  for (let y = top; y < foot; y++) {
    if (far || y === top) rows.push('odddo');
    else rows.push(y === foot - 1 ? 'obbdo' : 'ohbbo');
  }
  rows.push('ooooo');
  return patch(frame, x, top, rows);
}

/**
 * Stretch everything above `row` up by 1px (duplicating that row) — a breath in.
 * The default row sits just below the chin so the face itself never gets stretched.
 */
function breathe(frame: Frame, row = 24): Frame {
  return frame.map((_, y) => (y < row ? frame[y + 1] : frame[y]));
}

/**
 * Leg x positions in draw order — far back, far front, near back, near front — plus
 * optional per-leg lifts off the ground.
 */
function stance(farBack: number, farFront: number, nearBack: number, nearFront: number, lift: number[] = []): Leg[] {
  return [farBack, farFront, nearBack, nearFront].map((x, i) => ({ x, foot: 31 - (lift[i] ?? 0), far: i < 2 }));
}

const STAND = stance(7, 15, 4, 18);

interface Pose {
  /** Body offset; legs stretch to reach their feet. */
  dy?: number;
  eyes?: keyof typeof EYES;
  mouth?: keyof typeof MOUTHS;
  /** Extra lift of the orange above the head. */
  orange?: number;
  legs?: Leg[];
}

function pose({ dy = 0, eyes = 'sleepy', mouth, orange = 0, legs = STAND }: Pose): Frame {
  let f = patch(BODY, 22, 15, EYES[eyes]);
  if (mouth) f = patch(f, 25, 21, MOUTHS[mouth]);
  f = patch(f, ORANGE_AT.x, ORANGE_AT.y - orange, ORANGE);
  f = shift(f, 0, dy);
  for (const leg of legs) f = drawLeg(f, 28 + dy, leg);
  return f;
}

const idle = pose({});
// Loaf: legs tucked away, belly on the ground, one front paw peeking out.
const PAW = `
  .ooo.
  ohbbo
  ooooo
`;
const loaf = (eyes: keyof typeof EYES) => patch(pose({ eyes, dy: 3, legs: [] }), 20, 29, PAW);

export default {
  id: 'capybyte',
  name: 'Capybyte',
  species: 'Chill Capybara',
  tagline: 'Zen, moisturised, and balancing a mandarin since boot.',
  accent: '#c08552',
  mouth: { x: 27, y: 21 },
  palette: {
    o: '#4a2713',
    d: '#955c34',
    b: '#c4874f',
    h: '#e6b47c',
    k: '#2a160c',
    w: '#fff6e6',
    p: '#e98f7b',
    y: '#ffa12e',
    r: '#e2631b',
    l: '#ffd873',
    g: '#79c24a',
  },
  animations: {
    idle: anim(2, [idle, breathe(idle)]),
    blink: anim(8, [pose({ eyes: 'closed' })]),
    // Slow diagonal-pair trot (near-back + far-front swing together); the orange lags
    // a beat behind each bob. Near/far legs are kept 0 or ≥3px apart — a 1px offset
    // reads as a doubled outline instead of a second leg.
    walk: anim(5, [
      pose({ legs: stance(8, 14, 3, 19), orange: 1 }),
      pose({ legs: stance(7, 15, 4, 18, [0, 1, 1, 0]), dy: -1 }),
      pose({ legs: stance(3, 19, 6, 16), orange: 1 }),
      pose({ legs: stance(7, 15, 4, 18, [1, 0, 0, 1]), dy: -1 }),
    ]),
    sit: anim(2, [loaf('sleepy'), breathe(loaf('sleepy'), 27)]),
    sleep: anim(1, [loaf('closed'), breathe(loaf('closed'), 27)]),
    // Capybyte stays chill; the orange does the celebrating.
    happy: anim(7, [
      pose({ eyes: 'happy', orange: 3 }),
      pose({ eyes: 'happy', orange: 6, dy: -1 }),
      pose({ eyes: 'happy', orange: 3 }),
      pose({ eyes: 'happy', dy: 1 }),
    ]),
    eat: anim(6, [
      pose({ mouth: 'open' }),
      pose({ mouth: 'chew', eyes: 'happy' }),
      pose({ mouth: 'open' }),
      pose({ mouth: 'chew', eyes: 'closed' }),
    ]),
    // Scooped up: legs hang long and limp, swaying a pixel; orange startled off its perch.
    drag: anim(3, [
      pose({ eyes: 'wide', orange: 1, dy: -2, legs: stance(8, 14, 5, 17, [2, 2, 0, 0]) }),
      pose({ eyes: 'wide', orange: 2, dy: -2, legs: stance(9, 15, 6, 18, [2, 2, 0, 0]) }),
    ]),
    fall: anim(6, [
      pose({ eyes: 'wide', orange: 4, dy: -3, legs: stance(6, 16, 2, 20, [2, 2, 3, 3]) }),
      pose({ eyes: 'wide', orange: 5, dy: -3, legs: stance(7, 15, 3, 19, [1, 1, 2, 2]) }),
    ]),
  },
  lines: {
    greet: [
      'Oh, hey. Saved you a warm spot.',
      'Capybyte online. Vibes: nominal.',
      "Hello. Let's take it slow today.",
      'Hi. The orange missed you too.',
    ],
    idle: [
      'Your build can wait. Breathe.',
      'Low CPU. High vibes.',
      "I'm not idle. I'm meditating.",
      'Merge conflicts? Just friends arguing.',
      'Hot tub. Orange. No notifications.',
      'Stay hydrated. Stay moisturised.',
      'I run on citrus and good intentions.',
      'Git blame no one. Especially you.',
      'Latency is just patience, really.',
      'One tab at a time, friend.',
      'The orange stays. The orange knows.',
    ],
    pat: [
      'Mmm. Acceptable.',
      'Five stars. Would be patted again.',
      'Ah, yes. Right there.',
      'Chill level: incremented.',
      'Pat received. Vibes synced.',
    ],
    treat: [
      'Crunchy. Zen. Delicious.',
      'Nom. A true hot-path optimisation.',
      'Snack cached. Thank you.',
      'Tastes like a clean build.',
      'Worth the wait. Most things are.',
    ],
    hungry: [
      'A small snack would be lovely.',
      'Running low on crunchy bits.',
      'Hungry, but not in a hurry.',
      'Feeding me is async. No rush.',
    ],
    sleepy: ['Loaf mode: engaging.', 'Nap time. The orange keeps watch.', 'Going idle. Properly idle.'],
    wake: ['Mm. Back already? Nice.', 'Rebooted. Still chill.', 'Slept like a pure function.'],
    drag: [
      'Whoa. Okay. Going with the flow.',
      "This is fine. I'm fine.",
      'Please mind the orange.',
      'Airborne and unbothered.',
    ],
  },
  personality: { debugging: 5, patience: 10, chaos: 1, wisdom: 9, snark: 3 },
  traits: { speed: 0.8 },
} satisfies PetDefinition;
