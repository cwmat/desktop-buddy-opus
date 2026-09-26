/**
 * Owlgorithm, the Night Owl. A round ball of indigo fluff in a three-quarter view facing
 * right: the face disc and belly sit a pixel right of centre. Every pose is one BODY with
 * ear tufts, eyes, beak, wings and feet stamped on top, so volume stays constant.
 */
import { anim, blank, flipX, patch, sprite } from './sprite';
import type { Frame, PetDefinition } from './types';

// Eyes, beak, tufts, wings and feet are patched on. The bottom outline is row 29.
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
  .......oooooooooooooooooo.......
  ......ohhhhhhbbbbbbbbbbbdo......
  .....ohbbbccccccbbccccccbdo.....
  .....ohbbccccccccccccccccdo.....
  .....ohbbccccccccccccccccdo.....
  .....obbbccccccccccccccccdo.....
  .....obbbccccccccccccccccdo.....
  ....obbbbccccccccccccccccddo....
  ....obbbbccccccccccccccCCddo....
  ....obbbbbccccccccccccCCbddo....
  ....obbbbbbbCCCCCCCCCCbbbddo....
  ....obbbbbbbbbbbbbbbbbbbbddo....
  ....obbbbbbbbccccccccbbbbddo....
  ....obbbbbbbccCcCcccccbbbddo....
  ....obbbbbbccccCccccccCbbddo....
  ....odbbbbbcccccccCcCcCbbddo....
  .....odbbbbccCcCcccCcCCbddo.....
  ......oddbbcccCccccCCCdddo......
  .......ooddCCCCCCCCCCddoo.......
  .........oooooooooooooo.........
  ................................
  ................................
`);

// --- Face -------------------------------------------------------------------------------

// 6×6 eye patches, stamped at (10, 13) and (18, 13).
const EYES = {
  open: `
    .oooo.
    oeeeeo
    oewkeo
    oekkeo
    offffo
    .oooo.
  `,
  // Eyes on the road while walking.
  ahead: `
    .oooo.
    oeeeeo
    oeewko
    oeekko
    offffo
    .oooo.
  `,
  // Startled: pinprick pupils.
  wide: `
    .oooo.
    oweeeo
    oeekeo
    oeeeeo
    offffo
    .oooo.
  `,
  // Sleepy lid halfway down.
  half: `
    .oooo.
    oCCCCo
    oooooo
    oekkeo
    offffo
    .oooo.
  `,
  happy: `
    ......
    ..oo..
    .o..o.
    o....o
    ......
    ......
  `,
  closed: `
    ......
    ......
    ......
    o....o
    .oooo.
    ......
  `,
};

// Beak patches at (16, 16).
const BEAKS = {
  shut: `
    ff
    fF
    .F
  `,
  open: `
    ff
    kk
    kk
    fF
  `,
};

// Ear tufts stamped at x 7 (far) and 22 (near); the last row lands on row 10 and blends
// into the head. `perk` is alert, `flat` is tucked down for naps.
const TUFTS = {
  up: { y: 8, far: ['oo.', 'oho', 'ohb'], near: ['.oo', 'obo', 'bdo'] },
  perk: { y: 7, far: ['oo.', 'oho', 'oho', 'ohb'], near: ['.oo', 'obo', 'obo', 'bdo'] },
  flat: { y: 9, far: ['ooo', 'ohb'], near: ['ooo', 'bdo'] },
};
type TuftState = keyof typeof TUFTS;

// --- Wings ------------------------------------------------------------------------------

// Folded against the sides: the far wing shows broad, the near one as a sliver.
const FOLD_FAR = `
  .ooo..
  ohhbo.
  ohbbdo
  ohbddo
  obbddo
  obdddo
  obdddo
  obddo.
  odddo.
  oddo..
  .odo..
`;
const FOLD_NEAR = `
  ...oo.
  ..obdo
  .obbdo
  .obddo
  .obddo
  .obddo
  .odddo
  ..odo.
  ...o..
`;

// Spread wings, drawn over the body's sides for the left and mirrored for the right.
const SPREAD = {
  up: {
    x: 0,
    y: 9,
    art: `
      oo.......
      oho......
      ohbo.....
      ohbbo....
      obbbbo...
      odbbbbo..
      oddbbbbo.
      .oddbbbbo
      .oddddbbo
      .ododddbo
      ..o.oddo.
      .....oo..
    `,
  },
  out: {
    x: 0,
    y: 15,
    art: `
      ....oooo.
      ..oohhhbo
      .ohhbbbbo
      ohbbbbdbo
      obbddddbo
      oddoddodo
      odo.odo..
      .o...o...
    `,
  },
};
type WingState = 'fold' | keyof typeof SPREAD;

function spreadLayer(state: keyof typeof SPREAD): Frame {
  const { x, y, art } = SPREAD[state];
  const left = patch(blank(), x, y, art);
  return patch(left, 0, 0, flipX(left));
}

// --- Feet -------------------------------------------------------------------------------

const FEET = {
  // Planted, stubby toes forward.
  stand: ['.fF.', 'ffFf'],
  // Hanging below the fluff when airborne.
  dangle: ['.fF.', '.fF.', 'fFfF'],
};

// --- Poses ------------------------------------------------------------------------------

interface Pose {
  /** Body offset in px. */
  dx?: number;
  dy?: number;
  eyes?: keyof typeof EYES;
  beak?: keyof typeof BEAKS;
  wings?: WingState;
  tufts?: TuftState;
  /** Curious head tilt: the far eye and tuft rise, the near tuft drops; the beak stays put. */
  tilt?: boolean;
  /** Breathe in: the chest swells and everything above it rises 1px. */
  inhale?: boolean;
  /** Sink the head into the fluff by this many px (squash). */
  sink?: number;
  /**
   * stand: planted on the ground whatever the body does; hop: tucked under the body as
   * it leaves the ground; dangle: hanging below it; tuck: hidden in the fluff.
   */
  feet?: 'stand' | 'hop' | 'dangle' | 'tuck';
  /** Per-foot lift in px [far, near] while standing. */
  lift?: [number, number];
}

/** Duplicate the row at `row` so everything above rises 1px. */
function breathe(frame: Frame, row = 22): Frame {
  return frame.map((_, y) => (y < row ? frame[y + 1] : frame[y]));
}

/** Drop the head n px into the fluff: the collar (row 21) and then the belly top vanish. */
function sinkHead(frame: Frame, n: number): Frame {
  const row = 20 + n;
  return frame.map((_, y) => (y <= row ? (frame[y - n] ?? '.'.repeat(32)) : frame[y]));
}

function pose({
  dx = 0,
  dy = 0,
  eyes = 'open',
  beak = 'shut',
  wings = 'fold',
  tufts = 'up',
  tilt = false,
  inhale = false,
  sink = 0,
  feet = 'stand',
  lift = [0, 0],
}: Pose): Frame {
  const t = tilt ? 1 : 0;
  const far = TUFTS[tilt ? 'perk' : tufts];
  const near = TUFTS[tilt ? 'flat' : tufts];
  let body = patch(BODY, 7, far.y, far.far);
  body = patch(body, 22, near.y, near.near);
  body = patch(body, 10, 13 - t, EYES[eyes]);
  body = patch(body, 18, 13, EYES[eyes]);
  body = patch(body, 16, 16, BEAKS[beak]);
  if (wings === 'fold') {
    body = patch(body, 4, 16, FOLD_FAR);
    body = patch(body, 22, 19, FOLD_NEAR);
  } else {
    body = patch(body, 0, 0, spreadLayer(wings));
  }
  if (sink) body = sinkHead(body, sink);
  if (inhale) body = breathe(body);

  let f = blank();
  if (feet !== 'tuck') {
    const art = feet === 'dangle' ? FEET.dangle : FEET.stand;
    const top = feet === 'stand' ? 30 : 30 + dy;
    const [farLift, nearLift] = feet === 'stand' ? lift : [0, 0];
    f = patch(f, 11, top - farLift, art);
    f = patch(f, 18, top - nearLift, art);
  }
  return patch(f, dx, dy, body);
}

const idle = pose({});

export default {
  id: 'owlgorithm',
  name: 'Owlgorithm',
  species: 'Night Owl',
  tagline: 'Up all night. Gently judging your Big-O.',
  accent: '#5a68c8',
  mouth: { x: 17, y: 17 },
  palette: {
    o: '#232a66', // outline
    d: '#3b4799', // shade
    b: '#5a68c8', // plumage
    h: '#8795ea', // lit edge
    c: '#f6ecd2', // face disc, belly
    C: '#d8c29a', // cream shade, feather marks
    e: '#ffc93c', // iris
    f: '#ff9a3c', // beak, feet, lower iris
    F: '#c2551f', // beak & feet shade
    k: '#1b1433', // pupils, open beak
    w: '#ffffff', // catchlights
  },
  animations: {
    // A slow, blink-ready stare: breathe in, cock the head while holding it, settle.
    idle: anim(2, [idle, pose({ inhale: true }), pose({ inhale: true, tilt: true }), pose({ tilt: true })]),
    blink: anim(8, [pose({ eyes: 'closed' })]),
    // Owls hop: a squashed weight shift onto one foot, a little hop, the other foot, hop.
    walk: anim(7, [
      pose({ dx: -1, sink: 1, lift: [0, 1], eyes: 'ahead' }),
      pose({ dy: -2, feet: 'hop', eyes: 'ahead' }),
      pose({ dx: 1, sink: 1, lift: [1, 0], eyes: 'ahead' }),
      pose({ dy: -2, feet: 'hop', eyes: 'ahead' }),
    ]),
    // Settled into the fluff with half-closed, gently judging eyes.
    sit: anim(2, [
      pose({ dy: 2, sink: 1, feet: 'tuck', eyes: 'half' }),
      pose({ dy: 2, sink: 1, feet: 'tuck', eyes: 'half', inhale: true }),
    ]),
    // Head sunk deep into the fluff, tufts down.
    sleep: anim(1.5, [
      pose({ dy: 2, sink: 2, feet: 'tuck', eyes: 'closed', tufts: 'flat' }),
      pose({ dy: 2, sink: 2, feet: 'tuck', eyes: 'closed', tufts: 'flat', inhale: true }),
    ]),
    happy: anim(8, [
      pose({ eyes: 'happy', wings: 'out' }),
      pose({ dy: -2, feet: 'hop', eyes: 'happy', wings: 'up', tufts: 'perk' }),
      pose({ dy: -3, feet: 'hop', eyes: 'happy', wings: 'up', tufts: 'perk' }),
      pose({ dy: -1, feet: 'hop', eyes: 'happy', wings: 'out' }),
    ]),
    // Beak up and open, then a blissful head-bobbing chomp.
    eat: anim(7, [
      pose({ beak: 'open', inhale: true }),
      pose({ eyes: 'happy', sink: 1 }),
      pose({ beak: 'open', inhale: true }),
      pose({ eyes: 'happy' }),
    ]),
    // Scooped up: wings flared, tufts on end, eyes like saucers, feet dangling.
    drag: anim(6, [
      pose({ dy: -2, feet: 'dangle', eyes: 'wide', wings: 'out', tufts: 'perk' }),
      pose({ dy: -2, feet: 'dangle', eyes: 'wide', wings: 'up', tufts: 'perk' }),
    ]),
    // Flapping for dear life on the way down.
    fall: anim(8, [
      pose({ dy: -1, feet: 'dangle', eyes: 'wide', wings: 'up', tufts: 'perk' }),
      pose({ dy: -2, feet: 'dangle', eyes: 'wide', wings: 'out', tufts: 'perk' }),
    ]),
  },
  lines: {
    greet: [
      'Whooo is ready to ship? You are.',
      'Evening! Prime coding hours.',
      'Owlgorithm online. Eyes: very open.',
      'Hoo-hoo! I brought my wise face.',
    ],
    idle: [
      'That loop looks O(n²). Just saying.',
      'Nested loops? Whooo approved this?',
      'I prefer my trees balanced.',
      '2 a.m. is when the real code happens.',
      'Night shift: me, you, and the linter.',
      'Log n. Now that is a lovely curve.',
      'Sleep is just a very long await.',
      'Wise owl tip: name things clearly.',
      'Every branch leads somewhere. Mostly.',
      'Staring contest with the cursor: 1-0.',
      'Whooo wrote this? Oh. Past you.',
    ],
    pat: [
      "Hoo! That's the spot.",
      'Fluff: fully optimized.',
      'Constant-time contentment.',
      'Mmm. Ruffle approved.',
      'Carry on. Gently.',
    ],
    treat: [
      'Nom. A well-balanced snack.',
      'Crunchy! Best served after midnight.',
      'Consumed in O(1). Delicious.',
      'Hoot hoot! Much appreciated.',
      'Fuel for the night shift.',
    ],
    hungry: [
      'My tummy is throwing exceptions.',
      'Snack? Just a small one? Hoo?',
      'Hunger complexity: O(tummy).',
      'Running low on midnight snacks.',
    ],
    sleepy: ['Sunrise already? Time to roost.', 'Tucking in. Wake me at 2 a.m.', 'Entering fluff mode...'],
    wake: ['Hoo? Is it night yet?', 'Awake! Eyes loaded, wisdom cached.', 'Rebooting owl... done.'],
    drag: [
      'Hoo! Unexpected flight path!',
      "I'm usually the one who flies!",
      'This route is not optimal!',
      'Please land me on a sturdy branch.',
    ],
  },
  personality: { debugging: 8, patience: 7, chaos: 2, wisdom: 10, snark: 6 },
} satisfies PetDefinition;
