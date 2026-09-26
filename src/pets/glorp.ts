/**
 * Glorp, the Semicolon Slime.
 *
 * A slime is all squash and stretch, so instead of hand-drawing every pose the body is
 * generated from a per-row width profile (see `jelly`) and the face, shine and the
 * swallowed semicolon are stamped on top with `patch`. Tweak a profile to reshape a pose.
 */
import { anim, patch, sprite } from './sprite';
import { SPRITE_SIZE, type Frame, type PetDefinition } from './types';

const palette = {
  o: '#1d5a2c', // outline
  d: '#43a33d', // shade
  c: '#52b545', // the swallowed semicolon (Glorp's darker core)
  b: '#8fe36b', // body
  l: '#c3f78e', // rim light
  w: '#f4ffe4', // specular + catchlights
  k: '#123222', // eyes, mouth
  p: '#ff7a93', // tongue
  r: '#ffa7b8', // blush
};

// --- Body -----------------------------------------------------------------------------

interface Pose {
  /** Interior width of each jelly row, top to bottom (even numbers keep it symmetric). */
  widths: readonly number[];
  /** Pixels between the base and the ground (hops). */
  lift?: number;
  /** How far the top leans forward (right) of the base; negative leans back. */
  lean?: number;
  face: string;
  /** Nudges the face down from its default height. */
  faceDy?: number;
  /** Nudges the swallowed semicolon, so it drifts inside the jelly instead of being glued on. */
  core?: number;
}

/**
 * Body profiles. Jelly slumps under its own weight, so resting shapes flare out toward
 * the base like a gumdrop. Volume stays roughly constant so squash reads as squash.
 */
const SHAPE = {
  rest: [8, 14, 18, 20, 20, 22, 22, 22, 22, 24, 24, 24, 24, 24, 26, 26, 26, 26],
  squat: [10, 16, 20, 22, 22, 24, 24, 24, 24, 24, 26, 26, 26, 26, 28, 28, 28],
  tall: [6, 12, 16, 18, 18, 20, 20, 20, 20, 22, 22, 22, 22, 22, 22, 24, 24, 24, 24],
  squash: [12, 18, 22, 24, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28],
  stretch: [8, 12, 14, 16, 16, 18, 18, 18, 18, 18, 20, 20, 20, 20, 20, 20, 20, 20, 18],
  settle: [12, 18, 22, 22, 24, 24, 24, 24, 26, 26, 26, 26, 26, 28, 28, 28],
  puddle: [12, 18, 22, 24, 26, 26, 26, 28, 28, 28, 28, 28, 28],
  puddleIn: [10, 16, 20, 22, 24, 26, 26, 26, 28, 28, 28, 28, 28, 28],
  droop: [4, 4, 6, 6, 8, 10, 14, 18, 20, 22, 24, 24, 24, 24, 24, 24, 22, 18, 12],
  droopLong: [4, 4, 4, 6, 6, 8, 10, 14, 18, 20, 22, 24, 24, 24, 24, 24, 24, 22, 18, 12],
  splat: [12, 18, 22, 24, 26, 26, 26, 26, 24, 22, 20, 16, 10],
  splatWide: [14, 20, 24, 26, 28, 28, 28, 26, 24, 20, 14],
} satisfies Record<string, number[]>;

/**
 * Rasterise a jelly body with a 1px outline. Light comes from the top-left: a rim light
 * along the upper-left edge and an even 2px shade band down the right and along the base
 * (directional, so no pillow shading). The specular shine rides on the upper-left curve.
 */
function jelly({ widths, lift = 0, lean = 0, face, faceDy = 0, core = 0 }: Pose): Frame {
  const h = widths.length;
  const bottom = SPRITE_SIZE - 2 - lift; // last jelly row; the outline sits below it
  const top = bottom - h + 1;
  // Leaning shears the jelly: the base stays put and each row above slides a bit further.
  const skew = (y: number) => Math.round((lean * (bottom - y)) / (h - 1));
  const leftAt = (y: number) => 16 - widths[y - top] / 2 + skew(y);
  const inside = (x: number, y: number) =>
    y >= top && y <= bottom && x >= leftAt(y) && x < leftAt(y) + widths[y - top];

  let frame: Frame = Array.from({ length: SPRITE_SIZE }, (_, y) => {
    let row = '';
    for (let x = 0; x < SPRITE_SIZE; x++) {
      if (inside(x, y)) {
        if (!inside(x + 2, y) || !inside(x, y + 2)) row += 'd';
        else if (!inside(x - 1, y - 1)) row += 'l';
        else row += 'b';
      } else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) {
        row += 'o';
      } else {
        row += '.';
      }
    }
    return row;
  });

  // The shine sits just under the first row wide enough to hold it (lower on droopy poses);
  // flat poses get a shorter one so it doesn't crowd the face and the semicolon.
  const shineY = top + widths.findIndex((w) => w >= 14);
  const shine = h < 16 ? SHINE.slice(0, 3) : SHINE;
  frame = patch(frame, leftAt(shineY + 1) + 2, shineY, shine);
  frame = patch(frame, leftAt(bottom - 4) + 4, bottom - 8 + core, SEMICOLON);
  // Anchor the face to the base: when the jelly squashes, the top moves more than the eyes.
  const faceY = bottom - Math.round(h * 0.64) + faceDy;
  return patch(frame, 13 + skew(faceY + 2), faceY, face);
}

const SHINE = sprite(`
  ..wwww
  .www..
  .ww...
  .w....
`);

const SEMICOLON = `
  cc
  cc
  ..
  cc
  .c
  c.
`;

// --- Faces ----------------------------------------------------------------------------
// 10px wide, stamped with the left eye at x=14 (right of centre) so Glorp looks right.
// Eyes sit in rows 0-3 with the mouth below; cheeks (r) go in the outer columns.

const FACE = {
  open: `
    .wk....wk.
    .kk....kk.
    .kk....kk.
    .kk....kk.
    rr......rr
    ...k..k...
    ....kk....
  `,
  blink: `
    ..........
    ..........
    .kk....kk.
    ..........
    rr......rr
    ...k..k...
    ....kk....
  `,
  happy: `
    ..........
    ..k....k..
    .k.k..k.k.
    ..........
    rr.kkkk.rr
    ...kppk...
    ....kk....
  `,
  determined: `
    ..........
    ..........
    .wk....wk.
    .kk....kk.
    rr......rr
    ....kk....
  `,
  chompOpen: `
    .wk....wk.
    .kk....kk.
    .kk....kk.
    ..........
    ...kkkk...
    ..kkkkkk..
    ..kkppkk..
    ...kkkk...
  `,
  // Blissful chewing: ^^ eyes while the mouth alternates between a grin and a munch.
  chomp: `
    ..........
    ..k....k..
    .k.k..k.k.
    ..........
    rr.k..k.rr
    ....kk....
  `,
  chew: `
    ..........
    ..k....k..
    .k.k..k.k.
    ..........
    rr..kk..rr
    ....kk....
  `,
  surprised: `
    .wk....wk.
    .kk....kk.
    .kk....kk.
    .kk....kk.
    ..........
    ....kk....
    ...k..k...
    ....kk....
  `,
  asleep: `
    ..........
    ..........
    ..........
    .kk....kk.
    ..........
    ....kk....
  `,
  content: `
    ..........
    ..........
    .wk....wk.
    .kk....kk.
    rr......rr
    ...k..k...
    ....kk....
  `,
};

// --- Poses ----------------------------------------------------------------------------

const rest = jelly({ widths: SHAPE.rest, face: FACE.open });

const glorp: PetDefinition = {
  id: 'glorp',
  name: 'Glorp',
  species: 'Semicolon Slime',
  tagline: 'Swallowed your missing semicolon. No regrets.',
  accent: '#8fe36b',
  mouth: { x: 18, y: 23 },
  palette,
  animations: {
    // Jiggle: settle down and wide, back to rest, then wobble up tall. The semicolon
    // drifts a pixel out of step with the body, like something floating in jelly.
    idle: anim(3, [
      rest,
      jelly({ widths: SHAPE.squat, face: FACE.open }),
      jelly({ widths: SHAPE.rest, face: FACE.open, core: -1 }),
      jelly({ widths: SHAPE.tall, face: FACE.open, core: -1 }),
    ]),
    blink: anim(8, [jelly({ widths: SHAPE.rest, face: FACE.blink })]),
    // Boing: squash to wind up, launch leaning into the hop, float, then drop. The
    // semicolon lags the motion (sinks on take-off, floats up on the way down).
    walk: anim(8, [
      jelly({ widths: SHAPE.squash, lean: -1, face: FACE.determined }),
      jelly({ widths: SHAPE.stretch, lift: 2, lean: 2, face: FACE.open, core: 1 }),
      jelly({ widths: SHAPE.rest, lift: 4, lean: 1, face: FACE.open }),
      jelly({ widths: SHAPE.tall, lift: 1, face: FACE.open, core: -1 }),
    ]),
    // Melts into a puddle and breathes.
    sleep: anim(1.5, [
      jelly({ widths: SHAPE.puddle, face: FACE.asleep, core: 1 }),
      jelly({ widths: SHAPE.puddleIn, face: FACE.asleep, core: 1 }),
    ]),
    happy: anim(8, [
      jelly({ widths: SHAPE.squash, face: FACE.happy }),
      jelly({ widths: SHAPE.stretch, lift: 3, face: FACE.happy }),
      jelly({ widths: SHAPE.rest, lift: 5, face: FACE.happy }),
      jelly({ widths: SHAPE.stretch, lift: 2, face: FACE.happy }),
    ]),
    eat: anim(6, [
      jelly({ widths: SHAPE.tall, face: FACE.chompOpen }),
      jelly({ widths: SHAPE.squash, face: FACE.chomp }),
      jelly({ widths: SHAPE.squat, face: FACE.chew }),
      jelly({ widths: SHAPE.squash, face: FACE.chomp }),
    ]),
    // Picked up by the scruff: the top stays put while the jelly sags and bounces below it.
    drag: anim(4, [
      jelly({ widths: SHAPE.droop, lift: 2, face: FACE.surprised, faceDy: 4 }),
      jelly({ widths: SHAPE.droopLong, lift: 1, face: FACE.surprised, faceDy: 5 }),
    ]),
    // Wobbles like a dropped pancake of jelly.
    fall: anim(6, [
      jelly({ widths: SHAPE.splat, lift: 5, face: FACE.surprised, core: -1 }),
      jelly({ widths: SHAPE.splatWide, lift: 6, face: FACE.surprised }),
    ]),
    sit: anim(2, [
      jelly({ widths: SHAPE.squat, face: FACE.content }),
      jelly({ widths: SHAPE.settle, face: FACE.content }),
    ]),
  },
  lines: {
    greet: [
      'Blorp! Glorp is here!',
      'Hi hi hi! Got any semicolons?',
      'Wobbling in to say hello.',
      'Glorp online. Jiggle mode: on.',
    ],
    idle: [
      'Semicolons taste like crunchy commas.',
      'I am 98% jelly, 2% syntax.',
      'Is optional chaining a snack?',
      'I ate a bug once. Tasted like prod.',
      'Linting is just tickling for code.',
      'Boing. Boing. Boing.',
      'Your code looks delicious today.',
      'Garbage collector? I am a goo collector.',
      'Whitespace: zero calories, all flavor.',
      'I jiggle, therefore I am.',
      'Merge conflicts are just spicy.',
      'Found a semicolon. It is mine now.',
    ],
    pat: [
      'Hehe, squishy!',
      'Wobble wobble!',
      'Blorp! Again!',
      'That tickles my core.',
      'Now 12% more jiggly.',
    ],
    treat: [
      'NOM. Tastes like semicolons!',
      'Absorbed. Delicious.',
      'Glorp approves this snack.',
      'Nom nom nom... blorp.',
      'I can see it in my tummy!',
    ],
    hungry: [
      'Feed me a semicolon?',
      'My jelly is getting thin...',
      'I could eat a whole stack trace.',
      'Snack? Any snack? Even a bug?',
    ],
    sleepy: ['Going puddle mode...', 'Settling into a nap blob.', 'Jiggle... slower...'],
    wake: ['Boing! I am awake!', 'Re-jiggling...', 'Un-puddling complete!'],
    drag: [
      'Wheee! I am stretchy!',
      'Careful, I drip!',
      'Up we gooo!',
      'Not the goo! ...Okay, the goo.',
    ],
  },
  personality: { debugging: 4, patience: 3, chaos: 9, wisdom: 3, snark: 5 },
};

export default glorp;
