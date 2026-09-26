/**
 * Ember — a round little pocket dragon with stubby wings and big opinions.
 * Every pose is composed from one feet-less BODY plus tail / wing / feet / face /
 * puff patches, so volume stays identical between frames.
 */
import { anim, blank, patch, shift, sprite } from './sprite';
import type { Frame, PetDefinition } from './types';

// Head + round body with muzzle, fang, eye and cream belly. The bottom outline is
// row 29; feet are stamped over it.
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
  ...............ooooooo..........
  .............oohhhhbbboo........
  ............ohhhhhhbbbbbo.......
  ...........ohhhhbbbbbbbbbo......
  ...........ohhhbbbbwkkbbbo......
  ...........ohhbbbbbkkkbbbooo....
  ...........ohbbbbbbkkkbbbhhho...
  ...........ohbbbbbbppbbbbbbobo..
  ...........obbbbbbbbbbbobbbbbo..
  ...........obbbbbbbbbbbboowooo..
  ..........obbbbbbbbbbccccccco...
  .........obbbbbbbcccccccooooo...
  ........obbbbbbbbccccccco.......
  ........obbbbbbbbcccccccCo......
  ........odbbbbbbbccccccCCo......
  ........oddbbbbbbccccccCCo......
  ........odddbbbbbcccccCCCo......
  .........odddbbbbccccCCCo.......
  ..........odddddddCCCCCo........
  ...........oooooooooooo.........
  ................................
  ................................
`);

// Two back-swept horns; the far one sits a little lower and in shade.
const HORN = `
  oo...
  occo.
  .occo
  ..oCo
`;
const FAR_HORN = `
  oo..
  oCo.
  .oCo
`;

const TAIL = `
  .oo.....
  obdo....
  obo.....
  oboooo..
  .obbbboo
  ..oddddo
  ...oooo.
`;

// Stubby bat wings: `d` bones, cream membrane.
const WINGS = {
  rest: `
    oo......
    odoo....
    oCddoo..
    .oCCddo.
    .oCCCCdo
    ..oCoCCo
    ...o.oo.
  `,
  up: `
    .o....
    odo...
    oCdo..
    oCCdo.
    oCCCdo
    oCoCCo
    .o.oo.
  `,
  // Folded low and relaxed, for naps.
  droop: `
    .....ooo
    ...ooddo
    .ooCCCdo
    oCCCCCdo
    .oCoCCo.
    ..o.oo..
  `,
};
const WING_AT = { rest: [3, 13], up: [5, 10], droop: [3, 16] } as const;

// 3×3 eye patches at (19, 14).
const EYES = {
  open: `
    wkk
    kkk
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
    www
    wkw
    www
  `,
};

// Mouth patches at (23, 18).
const MOUTHS = {
  open: `
    o......
    .oowooo
    okkkkko
    occcco.
    .oooo..
  `,
  grin: `
    .......
    ooowoo.
    .okkko.
    ..ooo..
  `,
};

// Puffs rising from the nostril; drawn over everything.
const PUFFS = {
  flame: {
    x: 25,
    y: 10,
    art: `
      ..y..
      .yy..
      .yfy.
      yfffy
      .yfy.
    `,
  },
  smoke: {
    x: 26,
    y: 9,
    art: `
      .ss.
      ssss
      .ss.
    `,
  },
  wisp: {
    x: 27,
    y: 12,
    art: `
      .s
      s.
      .s
    `,
  },
};

interface Foot {
  x: number;
  /** Row of the foot's bottom outline (31 = on the ground). */
  sole: number;
  far?: boolean;
}

function drawFoot(frame: Frame, top: number, { x, sole, far }: Foot): Frame {
  const rows: string[] = ['odddo'];
  for (let y = top + 1; y < sole; y++) rows.push(far ? 'odddo' : 'obbbo');
  rows.push('ooooo');
  return patch(frame, x, top, rows);
}

/**
 * Stretch everything above `row` up by 1px (duplicating that row) — a breath in.
 * Applied to the body layer only, so the tail tip isn't stretched into a blob.
 */
function breathe(frame: Frame, row = 22): Frame {
  return frame.map((_, y) => (y < row ? frame[y + 1] : frame[y]));
}

/** Far (shaded) foot drawn first, then the near one; lifts raise a foot off the ground. */
const stance = (far: number, near: number, farLift = 0, nearLift = 0): Foot[] => [
  { x: far, sole: 31 - farLift, far: true },
  { x: near, sole: 31 - nearLift },
];
const STAND = stance(11, 17);

interface Pose {
  /** Body offset; feet stretch to reach the ground. */
  dy?: number;
  wing?: keyof typeof WINGS;
  eyes?: keyof typeof EYES;
  mouth?: keyof typeof MOUTHS;
  puff?: keyof typeof PUFFS;
  feet?: Foot[];
  /** Tail lift for a little flick. */
  tail?: number;
  /** Breathe in: the chest swells and everything above it rises 1px. */
  inhale?: boolean;
}

function pose({
  dy = 0,
  wing = 'rest',
  eyes = 'open',
  mouth,
  puff,
  feet = STAND,
  tail = 0,
  inhale = false,
}: Pose): Frame {
  let body = patch(BODY, 13, 8, FAR_HORN);
  body = patch(body, 16, 7, HORN);
  body = patch(body, 19, 14, EYES[eyes]);
  if (mouth) body = patch(body, 23, 18, MOUTHS[mouth]);
  const [wx, wy] = WING_AT[wing];
  body = patch(body, wx, wy, WINGS[wing]);
  if (inhale) body = breathe(body);
  // The tail goes underneath the body.
  let f = patch(patch(blank(), 1, 22 - tail, TAIL), 0, 0, body);
  f = shift(f, 0, dy);
  for (const foot of feet) f = drawFoot(f, 29 + dy, foot);
  if (puff) f = patch(f, PUFFS[puff].x, PUFFS[puff].y + dy, PUFFS[puff].art);
  return f;
}

const idle = pose({});
const nap = (extra: Pose = {}) => pose({ eyes: 'closed', wing: 'droop', dy: 2, feet: [], ...extra });

export default {
  id: 'ember',
  name: 'Ember',
  species: 'Pocket Dragon',
  tagline: 'Tiny wings. Big opinions. Mildly flammable.',
  accent: '#ff6b3d',
  mouth: { x: 26, y: 20 },
  palette: {
    o: '#6b1a12',
    d: '#c2372a',
    b: '#ff6b3d',
    h: '#ff9a5c',
    c: '#ffe3b0',
    C: '#f0b878',
    k: '#2a0c0a',
    w: '#ffffff',
    y: '#ffa531',
    f: '#ffe066',
    s: '#b5afc4',
    p: '#ffa3a0',
  },
  animations: {
    idle: anim(3, [idle, pose({ inhale: true }), pose({ inhale: true }), pose({ tail: 1 })]),
    blink: anim(8, [pose({ eyes: 'closed' })]),
    // Stompy little steps: hop a foot up, then land with a 1px squash while the tail
    // lags behind; the wings flap for balance.
    walk: anim(8, [
      pose({ dy: -1, wing: 'up', feet: stance(11, 18, 0, 2) }),
      pose({ dy: 1, tail: 1, feet: stance(11, 18) }),
      pose({ dy: -1, wing: 'up', feet: stance(12, 17, 2, 0) }),
      pose({ dy: 1, tail: 1, feet: stance(12, 17) }),
    ]),
    sit: anim(2, [pose({ dy: 2, feet: [] }), pose({ dy: 2, feet: [], inhale: true })]),
    sleep: anim(1.5, [nap(), nap({ puff: 'wisp', inhale: true })]),
    happy: anim(8, [
      pose({ dy: -2, wing: 'up', eyes: 'happy', mouth: 'grin', feet: stance(11, 17, 1, 1) }),
      pose({ dy: -3, wing: 'up', eyes: 'happy', mouth: 'grin', puff: 'flame', feet: stance(11, 17, 2, 2) }),
      pose({ dy: -1, wing: 'rest', eyes: 'happy', puff: 'smoke' }),
      pose({ wing: 'rest', eyes: 'happy' }),
    ]),
    eat: anim(7, [
      pose({ mouth: 'open' }),
      pose({ eyes: 'happy' }),
      pose({ mouth: 'open' }),
      pose({ eyes: 'happy', puff: 'smoke' }),
    ]),
    drag: anim(6, [
      pose({ dy: -1, eyes: 'wide', wing: 'up', mouth: 'grin', tail: -1, feet: stance(12, 16) }),
      pose({ dy: -1, eyes: 'wide', wing: 'rest', mouth: 'grin', tail: -1, feet: stance(12, 16) }),
    ]),
    // Flailing: wings flap and the feet kick out of step.
    fall: anim(8, [
      pose({ eyes: 'wide', wing: 'up', feet: stance(10, 18, 1, 2) }),
      pose({ eyes: 'wide', wing: 'rest', tail: 1, feet: stance(10, 18, 2, 1) }),
    ]),
  },
  lines: {
    greet: [
      "Rawr! (That's 'hello' in Dragon.)",
      "Ember online. Everything's toasty.",
      "Oh good, you're here. I have opinions.",
      'Hi! I kept your CPU warm for you.',
    ],
    idle: [
      'Tabs. Obviously. Fight me.',
      'I could compile that faster. With fire.',
      'Is it hot in here, or is it me? Me.',
      'Hoarding: gold, gems, semicolons.',
      'Legacy code? I know a quick fix. Fwoosh.',
      'Tiny wings. Big deploys.',
      'I have 99 opinions. All correct.',
      'Dark mode is just a cozy cave.',
      'Warning: may contain sparks.',
      'Rust? I prefer my metals molten.',
      "That bug won't survive my glare.",
    ],
    pat: [
      "Hehe, careful, I'm warm!",
      "More pats. That's an order.",
      "Purr-rawr. Don't tell anyone.",
      'Okay, fine, that was nice.',
      'My scales approve.',
    ],
    treat: [
      'Chomp! Flame-grilled. Perfect.',
      'Nom. Tastes like victory.',
      'Fuel acquired. Opinions recharged.',
      'Crispy! Just how I like it.',
      'Delicious. You may keep your fingers.',
    ],
    hungry: [
      "My fire's getting low...",
      'Snack. Now. Please. Rawr.',
      'Feed me or I start refactoring.',
      'Running on fumes. Literal fumes.',
    ],
    sleepy: ['Banking the embers... night.', 'Curling up. Wake me for deploys.', 'Low-power mode. Still warm.'],
    wake: ["I'm up! Who touched my hoard?", 'Rawr. Rebooted and fired up.', 'Reignited!'],
    drag: [
      'Unhand me! ...okay, wheee!',
      'Flap flap flap flap!',
      "I have wings! They're decorative!",
      "Put me down, I'm a dragon!",
    ],
  },
  personality: { debugging: 6, patience: 2, chaos: 8, wisdom: 4, snark: 9 },
} satisfies PetDefinition;
