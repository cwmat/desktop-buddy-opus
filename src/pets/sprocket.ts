/**
 * Sprocket, the Pocket Robot.
 *
 * Built from parts: a boxy body with a screen face, an antenna with a status light,
 * stubby arms and legs. `robot()` assembles a pose so animations only describe what
 * changes (bob, light, arm and leg positions, face).
 */
import { anim, blank, patch, recolor, shift, sprite } from './sprite';
import type { Frame, PetDefinition } from './types';

const palette = {
  o: '#2c4468', // outline
  d: '#5f7891', // steel shade
  b: '#9fb8cc', // steel
  l: '#d4e3ee', // steel highlight
  s: '#141d2b', // screen
  e: '#62f3ff', // screen glow (eyes)
  w: '#e8fdff', // eye catchlight
  g: '#2f9fb8', // dim glow (mouth, standby)
  r: '#ff7fae', // screen blush
  a: '#ffa23a', // antenna light
  A: '#fff1a8', // antenna light, flashing
  q: '#8a4a26', // antenna light, off
};

// --- Parts ----------------------------------------------------------------------------

/**
 * 18×16 body, stamped at (7, 12). The screen sits right of centre so Sprocket faces right;
 * a navy glint in its corner sells the glass. The slot on the belly is for coffee.
 */
const BODY = `
  ..oooooooooooooo..
  .ollllllllllllllo.
  olbbsssssssssssbdo
  olbsoossssssssssdo
  olbossssssssssssdo
  olbsssssssssssssdo
  olbsssssssssssssdo
  olbsssssssssssssdo
  olbsssssssssssssdo
  olbsssssssssssssdo
  olbbsssssssssssbdo
  olbbbbbbbbbbbbbbdo
  olbbbbbbbbbossssdo
  olbbbbbbbbbbbbbddo
  .oddddddddddddddo.
  ..oooooooooooooo..
`;

/** Antenna variants, stamped at (7, 6). `a`/`A` are recoloured to switch the light. */
const ANTENNA = {
  up: `
    ....oo.
    ...oAao
    ...oaao
    ....oo.
    .....d.
    .....d.
  `,
  // Lags behind while walking.
  sway: `
    ...oo..
    ..oAao.
    ..oaao.
    ...oo..
    ....d..
    .....d.
  `,
  // Flopped over in standby.
  droop: `
    .......
    .......
    .oo....
    oaao...
    oaaod..
    .oo..d.
  `,
};

/** Mitten arms, stamped at (4, 20) and (25, 20) when hanging. */
const ARM_L = `
  .oo
  olb
  obb
  odd
  .oo
`;
const ARM_R = `
  oo.
  bdo
  bdo
  ddo
  oo.
`;

/**
 * Arms thrown up: the mitten on a short diagonal forearm that plugs into the body's top
 * corner. Stamped at (1, 8) and (24, 8).
 */
const ARM_UP_L = `
  .oo....
  olbo...
  obbo...
  oddo...
  .obdo..
  ..obdo.
  ...obdo
  ....oo.
`;
const ARM_UP_R = `
  ....oo.
  ...obdo
  ...obdo
  ...oddo
  ..obdo.
  .obdo..
  obdo...
  .oo....
`;

// --- Faces (9 wide, stamped on the screen at (13, 15)) ---------------------------------

const FACE = {
  open: `
    .........
    .we...we.
    .ee...ee.
    .ee...ee.
    .........
    ...g.g...
    ....g....
  `,
  blink: `
    .........
    .........
    .........
    .ee...ee.
    .........
    ...g.g...
    ....g....
  `,
  happy: `
    .........
    ..e...e..
    .e.e.e.e.
    .........
    rr.....rr
    ..e...e..
    ...eee...
  `,
  munch: `
    .........
    .we...we.
    .ee...ee.
    .........
    ..eeeee..
    ..e...e..
    ...eee...
  `,
  chew: `
    .........
    ..e...e..
    .e.e.e.e.
    .........
    rr.....rr
    ...eee...
    .........
  `,
  surprised: `
    .we...we.
    .ee...ee.
    .ee...ee.
    .ee...ee.
    .........
    ....e....
    ...e.e...
    ....e....
  `,
  dizzy: `
    .........
    .e.....e.
    ..e...e..
    .e.....e.
    .........
    ...e.e...
    ....e....
  `,
  standby: `
    .........
    .........
    .........
    .gg...gg.
    .........
    .........
    .........
  `,
  calm: `
    .........
    .........
    .we...we.
    .ee...ee.
    .........
    ...g.g...
    ....g....
  `,
};

// --- Assembly ---------------------------------------------------------------------------

type Light = 'on' | 'flash' | 'off';
const LIGHTS: Record<Light, Record<string, string>> = {
  on: {},
  flash: { a: 'A' },
  off: { a: 'q', A: 'q' },
};

/** An arm's offset from hanging (negative raises it), or 'up' to throw it in the air. */
type Arm = number | 'up';

interface Pose {
  face: string;
  /** Body offset: + sinks toward the ground (legs compress), - rises (legs extend). */
  dy?: number;
  light?: Light;
  antenna?: keyof typeof ANTENNA;
  /** [back, front] arms. */
  arms?: readonly [Arm, Arm];
  /** How far each foot is lifted off the ground, [back, front]. A lifted foot swings forward. */
  feet?: readonly [number, number];
}

/** A stubby leg from under the body down to a foot whose toe points right. */
function leg(frame: Frame, x: number, fromY: number, lift: number): Frame {
  const sole = 31 - lift;
  let rows = '';
  for (let y = fromY; y < sole - 1; y++) rows += 'oddo.\n';
  rows += 'obbbo\nooooo';
  return patch(frame, lift > 0 ? x + 1 : x, fromY, rows);
}

function robot(pose: Pose): Frame {
  const { face, dy = 0, light = 'on', antenna = 'up', arms = [0, 0], feet = [0, 0] } = pose;
  const [back, front] = arms;
  const bodyBottom = 27 + dy;
  let f = blank();
  f = leg(f, 9, bodyBottom + 1, feet[0]);
  f = leg(f, 18, bodyBottom + 1, feet[1]);
  // Raised arms go under the body so its outline caps the shoulder joint.
  if (back === 'up') f = patch(f, 1, 8 + dy, ARM_UP_L);
  if (front === 'up') f = patch(f, 24, 8 + dy, ARM_UP_R);
  f = patch(f, 7, 12 + dy, BODY);
  f = patch(f, 7, 6 + dy, recolor(sprite(ANTENNA[antenna]), LIGHTS[light]));
  if (back !== 'up') f = patch(f, 4, 20 + dy + back, ARM_L);
  if (front !== 'up') f = patch(f, 25, 20 + dy + front, ARM_R);
  return patch(f, 13, 15 + dy, face);
}

// --- Poses ----------------------------------------------------------------------------

const UP = ['up', 'up'] as const;
const FLAIL: Pose = { face: FACE.dizzy, dy: -1, antenna: 'sway' };

const sprocket: PetDefinition = {
  id: 'sprocket',
  name: 'Sprocket',
  species: 'Pocket Robot',
  tagline: 'Runs on coffee and passing unit tests.',
  accent: '#62d6f0',
  mouth: { x: 18, y: 20 },
  palette,
  traits: { speed: 1.1 },
  animations: {
    // A quiet hum: settle one pixel, and the status light blinks off once per cycle.
    idle: anim(3, [
      robot({ face: FACE.open }),
      robot({ face: FACE.open }),
      robot({ face: FACE.open, dy: 1 }),
      robot({ face: FACE.open, dy: 1, light: 'off' }),
    ]),
    blink: anim(8, [robot({ face: FACE.blink })]),
    // Trundling steps: rise on each lifted foot, arms swing, antenna lags behind.
    walk: anim(8, [
      robot({ face: FACE.open, dy: 1 }),
      robot({ face: FACE.open, antenna: 'sway', arms: [1, -1], feet: [0, 2] }),
      robot({ face: FACE.open, dy: 1 }),
      robot({ face: FACE.open, antenna: 'sway', arms: [-1, 1], feet: [2, 0] }),
    ]),
    // Standby: sat down, antenna flopped, the light pulsing slowly.
    sleep: anim(1.5, [
      robot({ face: FACE.standby, dy: 2, antenna: 'droop', light: 'off' }),
      robot({ face: FACE.standby, dy: 2, antenna: 'droop' }),
    ]),
    // Crouch with fists pumped, then leap with both arms in the air.
    happy: anim(8, [
      robot({ face: FACE.happy, dy: 1, arms: [-3, -3], light: 'flash' }),
      shift(robot({ face: FACE.happy, arms: UP }), 0, -2),
      shift(robot({ face: FACE.happy, arms: UP, light: 'flash' }), 0, -3),
      shift(robot({ face: FACE.happy, arms: UP }), 0, -1),
    ]),
    eat: anim(6, [
      robot({ face: FACE.munch, arms: [-3, -3] }),
      robot({ face: FACE.chew, dy: 1, arms: [-2, -2], light: 'flash' }),
      robot({ face: FACE.munch, arms: [-3, -3] }),
      robot({ face: FACE.chew, dy: 1, arms: [-2, -2] }),
    ]),
    // Lifted: legs stretch out and kick, arms dangle, light flashing in alarm.
    drag: anim(4, [
      shift(robot({ face: FACE.surprised, dy: -2, arms: [1, 0], light: 'flash' }), 0, -1),
      shift(robot({ face: FACE.surprised, dy: -2, arms: [0, 1], feet: [1, 0] }), 0, -1),
    ]),
    // Flailing: arms windmill, the antenna streams behind.
    fall: anim(8, [
      shift(robot({ ...FLAIL, arms: ['up', -3], light: 'flash' }), 0, -2),
      shift(robot({ ...FLAIL, arms: [-3, 'up'], feet: [1, 0] }), 0, -2),
    ]),
    sit: anim(2, [
      robot({ face: FACE.calm, dy: 2 }),
      robot({ face: FACE.calm, dy: 2, light: 'off' }),
    ]),
  },
  lines: {
    greet: [
      'Beep boop! Sprocket reporting in.',
      'Systems nominal. Hello, friend!',
      'Booted up and ready to help!',
      'All tests green. Hi there!',
    ],
    idle: [
      'Running unit tests... all green!',
      'Coffee level: optimal.',
      'Did you remember to commit?',
      'I dream in well-typed functions.',
      'Beep. That means hello.',
      'Refactoring my thoughts...',
      'Calculating fun... 100%.',
      'My antenna picks up good vibes.',
      'Brb, defragmenting.',
      'I love a tidy stack trace.',
      'assert(friend === you) // passes',
      'You hydrate. I will caffeinate.',
    ],
    pat: [
      'Beep! Affection detected.',
      'Happiness module: +1.',
      'My circuits feel all warm.',
      'Pat received. Logging joy.',
      'Boop acknowledged!',
    ],
    treat: [
      'Coffee?! Coffee! Thank you!',
      'Fuel accepted. Efficiency up!',
      'nom.exe completed successfully.',
      'Tests pass faster already.',
      'Recharging with gratitude.',
    ],
    hungry: [
      'Battery low. Snack, please?',
      'Coffee reserves at 3%...',
      'Low power mode engaged...',
      'Would compile better with a snack.',
    ],
    sleepy: ['Entering standby mode...', 'Saving state. Goodnight.', 'Powering down gently...'],
    wake: ['Rebooting... hello again!', 'Standby over. Ready!', 'Good morning! Tests pending.'],
    drag: [
      'Whoa! Altitude increasing!',
      'Gyroscope confused!',
      'Please mind the antenna!',
      'Wheee! Logging this flight.',
    ],
  },
  personality: { debugging: 9, patience: 8, chaos: 2, wisdom: 6, snark: 3 },
};

export default sprocket;
