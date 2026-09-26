/**
 * Quackers, the Rubber Debug Duck. Profile view facing right; the head, bill,
 * tail and feet are patched onto one body frame so every pose shares the same volume.
 */
import { anim, patch, shift, sprite } from './sprite';
import type { Frame, PetDefinition } from './types';

const body = sprite(`
  ................................
  ................................
  ................................
  ................................
  ................................
  ................................
  ................oooooo..........
  ..............oohhhyyyoo........
  .............ohhhyyyyyyyo.......
  ............ohhyyyyyyyyyyo......
  ............ohyyyyyywkyyyo......
  ............oyyyyyyykkyyyo......
  ............oyyyyyyykkyyyrrrr...
  ............oyyyyyyyyppyyccbbr..
  ...oo.......oyyyyyyyyyyyybbbbbr.
  ...oho......oyyyyyyyyyyyyrrrrrr.
  ...ohyo......oyyyyyyyyyyyBBBr...
  ...oyhyo.....oyyyyyyyyyssrrr....
  ...oyhhyoooooyyyyyyyysssso......
  ...oyhhhhhhhhyyyyyyyyyyssso.....
  ...oyyhhhhyyyyyyyyyyyyyyyyso....
  ...oyyyyyyhhhhhhyyyyyyyyyyso....
  ...oyyyyyhyyyyyysyyyyyyyyyso....
  ...oyyyyysyyyyyysyyyyyyyyyso....
  ...oyyyyyysyyyyysyyyyyyyyyso....
  ...oyyyyyyysssssyyyyyyyyysso....
  ....oyyyyyyyyyyyyssssssssso.....
  .....ossyyyyyyssssssssdddo......
  ......oossssssssssdddddoo.......
  ........ooooooooooooooo.........
  ................................
  ................................
`);

// --- Face & tail parts, stamped at fixed spots on the body --------------------

const EYES = {
  open: `
    ywky
    ykky
    ykky
    ykky
  `,
  blink: `
    yyyy
    yyyy
    ykky
    yyyy
  `,
  shut: `
    yyyy
    yyyy
    kyyk
    ykky
  `,
  happy: `
    yyyy
    ykky
    kyyk
    yyyy
  `,
  wide: `
    ykky
    kwkk
    kkkk
    ykky
  `,
};

/**
 * Open bills leave the front open (background shows between the tips) so they read as
 * a gaping beak rather than a pink box. `open` is a talking/biting gape; `quack` also
 * tips the upper bill up for a big, loud QUACK.
 */
const BILL_OPEN = `
  rrrr__
  ccbbr_
  bbbbbr
  rrrrrr
  rpp___
  rppr__
  rBBBr_
  .rrr__
`;
const BILL_QUACK = `
  rrr___
  ccbrr_
  bbbbbr
  BBBBrr
  rrrr__
  rppp__
  rpp___
  rBBBr_
  .rrr__
`;

/** Lower bill dropped a pixel: a chomp. */
const BILL_CHOMP = `
  rppr
  BBBr
  rrr.
`;

/** Near wing flapped up: its tip pokes above the back, lit along the leading edge. */
const WING_UP = `
  ..oo.......
  .ohho......
  ohyho......
  .oyyhoo....
  .osyyhhoo..
  ..osyyyhhoo
  ...oossssyy
`;
/** Plain body pixels painted over the folded side wing while it is raised. */
const WING_FOLD_HIDDEN = `
  yyyyyyyy
  yyyyyyyy
  yyyyyyyy
  yyyyyyyy
  yyyyyyyy
`;

/** Tail flicked up by a pixel. */
const TAIL_UP = `
  .oo....
  .oho...
  .ohyo..
  .oyhyo.
  .oyhhyo
  .oyhhyy
`;

/** The top pixel is a leg, hidden by the body outline unless the body is lifted. */
const FOOT = `
  .r...
  rbbr.
  rrrrr
`;
const FOOT_DANGLE = `
  .r.
  rbr
  rbr
  rrr
`;

type Eye = keyof typeof EYES;
interface Look {
  eye?: Eye;
  bill?: 'closed' | 'open' | 'chomp' | 'quack';
  tail?: 'down' | 'up';
  wing?: 'down' | 'up';
}

function face({ eye = 'open', bill = 'closed', tail = 'down', wing = 'down' }: Look = {}): Frame {
  let f = patch(body, 19, 9, EYES[eye]);
  if (bill === 'open') f = patch(f, 25, 11, BILL_OPEN);
  if (bill === 'quack') f = patch(f, 25, 10, BILL_QUACK);
  if (bill === 'chomp') f = patch(f, 25, 16, BILL_CHOMP);
  if (tail === 'up') f = patch(f, 2, 13, TAIL_UP);
  if (wing === 'up') f = patch(patch(f, 9, 21, WING_FOLD_HIDDEN), 7, 15, WING_UP);
  return f;
}

/** Drop everything above `row` by one pixel: a 1px squash that keeps the base planted. */
function squash(frame: Frame, row = 20): Frame {
  const lowered = shift(frame, 0, 1);
  return frame.map((line, y) => (y <= row ? lowered[y] : line));
}

type Offset = readonly [number, number];
function withFeet(frame: Frame, back: Offset = [0, 0], front: Offset = [0, 0]): Frame {
  const f = patch(frame, 9 + back[0], 29 + back[1], FOOT);
  return patch(f, 17 + front[0], 29 + front[1], FOOT);
}

function dangling(frame: Frame, swing = 0): Frame {
  const f = patch(frame, 10, 28, FOOT_DANGLE);
  return patch(f, 17 + swing, 28, FOOT_DANGLE);
}

// --- Poses ------------------------------------------------------------------

const stand = withFeet(face());
/** Settled down onto the feet, which disappear under the body. */
const sitting = (look?: Look) => shift(face(look), 0, 2);
/** Mid-hop: feet come along with the body. */
const airborne = (look: Look, lift: number) => shift(withFeet(face(look)), 0, -lift);
/** Dozing: sat down and slumped a pixel or two lower than `sit`, so naps read as naps. */
const dozing = (slump: number) => {
  let f = sitting({ eye: 'shut' });
  for (let i = 0; i < slump; i++) f = squash(f, 22);
  return f;
};

const quackers: PetDefinition = {
  id: 'quackers',
  name: 'Quackers',
  species: 'Rubber Debug Duck',
  tagline: 'Explain it slowly. I already know the bug.',
  accent: '#ffc83d',
  mouth: { x: 27, y: 15 },
  palette: {
    o: '#8c4400', // body outline
    h: '#fff3a6', // body highlight
    y: '#ffd23f', // body
    s: '#f2a81d', // body shade
    d: '#d9820f', // body deep shade
    c: '#ffb866', // bill highlight
    b: '#ff8a1f', // bill & feet
    B: '#e0610f', // bill shade
    r: '#8a2c06', // bill & feet outline
    k: '#2b1d33', // eye
    w: '#ffffff', // catchlight
    p: '#ff9e80', // blush & mouth
  },
  animations: {
    idle: anim(3, [stand, withFeet(squash(face())), stand, withFeet(face({ tail: 'up' }))]),
    blink: anim(8, [withFeet(face({ eye: 'blink' }))]),
    // Waddle: the body rises as the planted leg straightens and the other foot swings forward.
    walk: anim(7, [
      withFeet(shift(face({ tail: 'up' }), 0, -1), [0, 0], [2, -1]),
      withFeet(face()),
      withFeet(shift(face({ tail: 'up' }), 0, -1), [2, -1], [0, 0]),
      withFeet(face()),
    ]),
    sleep: anim(1.5, [dozing(1), dozing(2)]),
    // Crouch, hop with a quack and a wing flap, tail flicks on the way down, land.
    happy: anim(8, [
      withFeet(squash(face({ eye: 'happy' }))),
      airborne({ eye: 'happy', bill: 'quack', wing: 'up' }, 3),
      airborne({ eye: 'happy', bill: 'quack', tail: 'up' }, 2),
      withFeet(face({ eye: 'happy' })),
    ]),
    eat: anim(7, [
      withFeet(face({ bill: 'open' })),
      withFeet(squash(face({ eye: 'happy' }))),
      withFeet(face({ bill: 'chomp', tail: 'up' })),
      withFeet(squash(face({ eye: 'happy' }))),
    ]),
    drag: anim(4, [
      dangling(shift(face({ eye: 'wide', bill: 'open' }), 0, -2)),
      dangling(shift(face({ eye: 'wide', bill: 'open', tail: 'up' }), 0, -2), 1),
    ]),
    // Flailing: the wing flaps while the feet kick.
    fall: anim(6, [
      dangling(shift(face({ eye: 'wide', bill: 'quack', wing: 'up' }), 0, -2), -1),
      dangling(shift(face({ eye: 'wide', bill: 'quack', tail: 'up' }), 0, -2), 1),
    ]),
    sit: anim(2, [sitting(), squash(sitting(), 22)]),
  },
  lines: {
    greet: [
      'Quack! Walk me through it.',
      'Rubber duck, reporting for debug duty.',
      'Hi! What are we breaking today?',
      'Back again? I kept your bugs warm.',
    ],
    idle: [
      'Explain it to me. Line by line.',
      "I'm listening. Intently. Squeakily.",
      'Have you read the error out loud?',
      'It is always a typo. Always.',
      'Off by one? Just a hunch.',
      "I'm not judging. Mostly.",
      'Commit early, quack often.',
      'I float. Unlike your last deploy.',
      'Did you check the logs? Quack.',
      "Sip some water. I'll hold the bug.",
      'console.log is my love language.',
    ],
    pat: [
      'Squeak! That tickles.',
      'Quack! Right there!',
      "You're doing great, by the way.",
      'Pat received. PR approved.',
      'Hehe. Squeaky clean.',
    ],
    treat: [
      'Crumbs! My favourite data type.',
      'Nom. Tastes like a fixed bug.',
      'Delicious. Zero warnings.',
      'Snack received. Morale: 200 OK.',
      'Quack-tastic!',
    ],
    hungry: [
      'Could a duck get a snack?',
      'My tummy threw an exception.',
      'Low on crumbs. Please advise.',
      "Feed me and I'll find the bug.",
    ],
    sleepy: ['Paddling off to dreamland...', 'Brb, garbage collecting.', 'Just resting my eyes. Quack.'],
    wake: ['Quack! Was I compiling?', 'Fresh as a new branch.', 'Mm? Did the tests pass?'],
    drag: ['Whoa! Mind the bill!', "Wheee, I'm airborne!", 'Quack?! Where are we going?', 'Careful, I squeak!'],
  },
  personality: { debugging: 10, patience: 9, chaos: 2, wisdom: 8, snark: 5 },
};

export default quackers;
