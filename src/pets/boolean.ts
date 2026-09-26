/**
 * Boolean, the Binary Ghost. A soft, translucent sheet ghost facing right. The body,
 * face, arms and rippling hem are separate parts stamped together per pose.
 */
import { anim, patch, shift, sprite } from './sprite';
import type { Frame, PetDefinition } from './types';

/** Armless body with only the blush drawn in; the hem (rows 28-31) is stamped on separately. */
const body = sprite(`
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  .............oooooo.............
  ...........oohhhwwwoo...........
  ..........ohhwwwwwwwso..........
  .........ohwwwwwwwwwwso.........
  ........ohwwwwwwwwwwwwso........
  ........ohwwwwwwwwwwwwso........
  .......ohwwwwwwwwwwwwwwso.......
  .......ohwwwwwwwwwwwwwwso.......
  .......owwwwwwwwwwwwwwwso.......
  .......owwwwwwwwwwwwwwwso.......
  .......owwwwwwwwwwwwwwwso.......
  .......owwwwwppwwwwwwwppo.......
  .......owwwwwwwwwwwwwwwso.......
  .......owwwwwwwwwwwwwwwso.......
  .......owwwwwwwwwwwwwwwso.......
  .......owwwwwwwwwwwwwwsso.......
  .......owwwwwwwwwwwwwwsso.......
  .......owwwwwwwwwwwwwwsso.......
  ......oswwwwwwwwwwwwwwsso.......
  ......oswwwwwwwwwwwwwwssso......
  .....osswwwwwwwwwwwwwsssso......
  .....ossssssssssssssssssso......
  ................................
  ................................
  ................................
  ................................
`);

// --- Parts -------------------------------------------------------------------

/** Three scalloped flaps; alternating which ones hang low makes the hem ripple. */
const HEMS = {
  // down-up-down
  a: `
    ossssssosssssosssssso
    ossssso.odddo.ossssso
    .odddo...ooo...odddo.
    ..ooo...........ooo..
  `,
  // up-down-up
  b: `
    osssssosssssssossssso
    .odddo.ossssso.odddo.
    ..ooo...odddo...ooo..
    .........ooo.........
  `,
  // all hanging down: stretched out while dangling
  long: `
    ossssssssssssssssssso
    osssssoosssssoossssso
    .odddo..odddo..odddo.
    ..ooo....ooo....ooo..
  `,
};

/**
 * Tall dark eyes. A white catchlight on an eye corner vanishes into the white sheet (the
 * eye reads as a slanted wedge), so the glint is a soft outline-purple sheen instead.
 * Stamped at row 11; `wide` uses the extra top row to open up when startled.
 */
const EYES = {
  open: `
    .........
    .ok...ok.
    .kk...kk.
    .kk...kk.
    .kk...kk.
  `,
  blink: `
    .........
    .........
    .........
    .kk...kk.
    .........
  `,
  shut: `
    .........
    .........
    .........
    k..k.k..k
    .kk...kk.
  `,
  happy: `
    .........
    .........
    .kk...kk.
    k..k.k..k
    .........
  `,
  wide: `
    .ok...ok.
    .kk...kk.
    .kk...kk.
    .kk...kk.
    .kk...kk.
  `,
};

const MOUTHS = {
  smile: `
    k.k
    .k.
  `,
  open: `
    kkk
    kmk
    .k.
  `,
  oh: `
    .k.
    kmk
    .k.
  `,
  dot: `
    ...
    .k.
  `,
  chomp: `
    ...
    kkk
  `,
};

/** Stubby arms; they replace the body outline where they join so the sheet reads as one piece. */
const ARMS = {
  down: [
    [3, 19, `
      ..oo.
      .ohww
      ohwww
      owssw
      .oooo
    `],
    [24, 19, `
      .oo..
      swso.
      sssso
      sddso
      oooo.
    `],
  ],
  // Raised high and out, joined at the shoulders: a proper "yay!".
  up: [
    [2, 11, `
      .oo....
      ohho...
      ohwwo..
      .owwwo.
      ..owwww
      ...owww
      ....oww
    `],
    [23, 11, `
      ....oo.
      ...owwo
      ..owsso
      .owsdo.
      .ssdo..
      .sdo...
      .so....
    `],
  ],
} as const;

interface Look {
  eyes?: keyof typeof EYES;
  mouth?: keyof typeof MOUTHS;
  arms?: 'down' | 'up';
  hem?: keyof typeof HEMS;
}

function ghost({ eyes = 'open', mouth = 'smile', arms = 'down', hem = 'a' }: Look = {}): Frame {
  let f = patch(body, 5, 28, HEMS[hem]);
  f = patch(f, 14, 11, EYES[eyes]);
  f = patch(f, 17, 17, MOUTHS[mouth]);
  for (const [x, y, part] of ARMS[arms]) f = patch(f, x, y, part);
  return f;
}

/** Shift every row from `row` downwards sideways by dx. */
function sway(frame: Frame, row: number, dx: number): Frame {
  const moved = shift(frame, dx, 0);
  return frame.map((line, y) => (y >= row ? moved[y] : line));
}
/**
 * The lower sheet trails behind while gliding: 1px from just below the arms, plus 1px more
 * for the hem when `strong`. Starting at row 24 keeps the outline stepping 1px at a time.
 */
const trail = (frame: Frame, strong = true) => {
  const f = sway(frame, 24, -1);
  return strong ? sway(f, 28, -1) : f;
};

/**
 * Drop everything above `row` by one pixel: a soft 1px squash. The default row sits below
 * the arms, so squashing (even twice) never slices an arm and opens a gap in its outline.
 */
function squash(frame: Frame, row = 25): Frame {
  const lowered = shift(frame, 0, 1);
  return frame.map((line, y) => (y <= row ? lowered[y] : line));
}

/** Raise everything above `row` by one pixel (repeating that row): a 1px stretch. */
function stretch(frame: Frame, row = 20): Frame {
  const raised = shift(frame, 0, -1);
  return frame.map((line, y) => (y < row ? raised[y] : line));
}

const lift = (frame: Frame, dy: number) => shift(frame, 0, -dy);

const boolean: PetDefinition = {
  id: 'boolean',
  name: 'Boolean',
  species: 'Binary Ghost',
  tagline: 'Is this haunted? Returns true.',
  accent: '#a996ff',
  mouth: { x: 18, y: 18 },
  // Body tones are ~90% opaque so the desktop faintly shows through; the face stays solid.
  palette: {
    o: '#4d3c9e', // outline
    h: '#ffffffe6', // highlight
    w: '#eeeaffe6', // body
    s: '#cfc6f6e6', // shade
    d: '#aa9deae6', // deep shade
    k: '#2a2050', // eyes & mouth
    p: '#ffa8d2e6', // blush
    m: '#ff7eb0', // tongue
  },
  // The renderer already floats hover pets up and down, so frames never bob the whole
  // sprite on their own (two bobs at different rates look jittery); they ripple and breathe.
  animations: {
    idle: anim(3, [ghost(), ghost({ hem: 'b' }), squash(ghost()), squash(ghost({ hem: 'b' }))]),
    blink: anim(8, [ghost({ eyes: 'blink' })]),
    // Gliding: the lower sheet trails behind, rippling and pulsing.
    walk: anim(7, [
      trail(ghost()),
      trail(ghost({ hem: 'b' })),
      trail(ghost(), false),
      trail(ghost({ hem: 'b' }), false),
    ]),
    sleep: anim(1.5, [
      squash(ghost({ eyes: 'shut', mouth: 'dot' })),
      squash(squash(ghost({ eyes: 'shut', mouth: 'dot', hem: 'b' }))),
    ]),
    happy: anim(8, [
      squash(ghost({ eyes: 'happy', mouth: 'open', arms: 'up' })),
      lift(stretch(ghost({ eyes: 'happy', mouth: 'open', arms: 'up', hem: 'b' })), 3),
      lift(ghost({ eyes: 'happy', mouth: 'open' }), 1),
      ghost({ eyes: 'happy', hem: 'b' }),
    ]),
    eat: anim(7, [
      ghost({ mouth: 'open' }),
      squash(ghost({ eyes: 'happy', mouth: 'chomp', hem: 'b' })),
      ghost({ mouth: 'open' }),
      squash(ghost({ eyes: 'happy', mouth: 'chomp', hem: 'b' })),
    ]),
    // Picked up: stretched long, arms and flaps dangling, the sheet swinging.
    drag: anim(4, [
      lift(stretch(ghost({ eyes: 'wide', mouth: 'oh', hem: 'long' })), 1),
      lift(sway(stretch(stretch(ghost({ eyes: 'wide', mouth: 'oh', hem: 'long' }))), 26, 1), 1),
    ]),
    fall: anim(6, [
      ghost({ eyes: 'wide', mouth: 'oh', arms: 'up', hem: 'a' }),
      ghost({ eyes: 'wide', mouth: 'oh', hem: 'b' }),
    ]),
    sit: anim(2, [squash(ghost()), squash(ghost({ hem: 'b' }))]),
  },
  lines: {
    greet: [
      'Boo! ...Was that too much?',
      "Oh! Hi. I'm here. Truly.",
      'Am I haunting you? Returns true.',
      "Hello! Don't mind me, just lurking.",
    ],
    idle: [
      'Is this haunted? true.',
      "I'm not scared of null. Mostly.",
      'Boo-lean, at your service.',
      "I'm 50% true, 50% false.",
      "Ghosts don't crash. We linger.",
      "I'm very transparent about my feelings.",
      'Undefined? Ooooh, spooky.',
      'I only haunt the finest repos.',
      'Floating point? I just float.',
      "That bug? It's a ghost. Not me.",
      'if (lonely) { haunt(you); }',
    ],
    pat: [
      'Eep! ...Do it again?',
      'You can touch me? true!',
      "Hehe, that's boo-tiful.",
      'My heart went from 0 to 1.',
      'Shy ghost, happy ghost.',
    ],
    treat: [
      'Boo-berry! My favourite.',
      'Yum! Condition: satisfied.',
      'happy = true;',
      'Spook-tacular snack!',
      'Not a ghost of a doubt: tasty.',
    ],
    hungry: [
      'Hungry? Evaluates to very true.',
      'My tummy returns null.',
      "I'm feeling a little hollow.",
      'Snack? Please? No pressure.',
    ],
    sleepy: ['Fading out for a bit...', 'Setting awake = false.', 'Going idle, like a good process.'],
    wake: ['awake = true! Boo!', 'Oh! I rematerialised.', 'Back from the other side.'],
    drag: ['Eep! Where are we floating?', "Put me down! ...Gently?", 'Ghost in transit!', "Careful, I'm mostly air!"],
  },
  personality: { debugging: 6, patience: 7, chaos: 4, wisdom: 6, snark: 3 },
  traits: { hover: true },
};

export default boolean;
