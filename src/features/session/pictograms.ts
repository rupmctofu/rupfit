/**
 * The exercise pictograms — one original drawing per concrete variant
 * (odd/tasks/training-flow.md S3, T4).
 *
 * The table is data, not markup: a picture is a head, a handful of body polylines and
 * the gear the variant is done with, on a 120 × 120 grid whose floor is `y = 108`. The
 * renderer (`ExerciseIllustration.tsx`) draws one of these; nothing here knows about
 * React, and nothing here is a photograph or a remote asset.
 *
 * **One key, one variant.** `squat-back` and `squat-front` are two drawings because they
 * are two exercises, `leg-curl-seated` and `leg-curl-lying` are two more, and a row that
 * has no key at all is not given its neighbour's picture: the session and the detail show
 * the equipment icon instead (see `illustrationKey.ts`). A substitute therefore never
 * inherits the drawing of the exercise it replaced.
 *
 * Coordinates are the drawing's data, not design tokens: they are where the bar is.
 */

/** A point on the 120 × 120 pictogram grid. */
export type Point = readonly [number, number];

/** A polyline of the body: torso, an arm, a leg, a foot. */
export type Limb = readonly Point[];

/** The implement the variant is performed with, drawn under the athlete. */
export type Gear =
  | { readonly k: 'bar'; readonly x1: number; readonly x2: number; readonly y: number }
  | { readonly k: 'dumbbell'; readonly x: number; readonly y: number }
  | {
      readonly k: 'slab';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      /** Rotation in degrees around the slab's centre: benches, pads, platforms. */
      readonly rot?: number;
    }
  | { readonly k: 'line'; readonly points: Limb; readonly dashed?: boolean }
  | { readonly k: 'stack'; readonly x: number; readonly y: number }
  | { readonly k: 'disc'; readonly x: number; readonly y: number; readonly r?: number };

export interface Pictogram {
  /** Centre of the head. The figure is a silhouette, never a face. */
  readonly head: Point;
  /** Polylines in draw order. */
  readonly body: readonly Limb[];
  /** Indices of `body` drawn with the heavy stroke: thighs, shins, upper arms. */
  readonly thick?: readonly number[];
  /** The rack, the bar, the bench, the cable. Drawn behind the athlete. */
  readonly gear?: readonly Gear[];
}

const FLOOR = 108;

/** The floor is the only line every picture shares; it is drawn by the renderer. */
export const PICTOGRAM_FLOOR = FLOOR;

export const PICTOGRAMS = {
  /* --------------------------------------------------------------- squat */
  'squat-back': {
    head: [60, 28],
    body: [
      [[60, 36], [60, 62]],
      [[58, 42], [42, 42]],
      [[62, 42], [78, 42]],
      [[60, 62], [47, 82], [46, 106]],
      [[60, 62], [73, 82], [74, 106]],
      [[46, 106], [36, 106]],
      [[74, 106], [84, 106]],
    ],
    thick: [3, 4],
    gear: [{ k: 'bar', x1: 30, x2: 90, y: 40 }],
  },
  'squat-front': {
    head: [60, 28],
    body: [
      [[60, 36], [60, 62]],
      [[58, 42], [44, 46]],
      [[62, 42], [76, 46]],
      [[60, 62], [47, 82], [46, 106]],
      [[60, 62], [73, 82], [74, 106]],
      [[46, 106], [36, 106]],
      [[74, 106], [84, 106]],
    ],
    thick: [3, 4],
    gear: [{ k: 'bar', x1: 32, x2: 88, y: 44 }],
  },
  'squat-goblet': {
    head: [60, 28],
    body: [
      [[60, 36], [60, 62]],
      [[58, 44], [52, 50]],
      [[62, 44], [68, 50]],
      [[60, 62], [47, 82], [46, 106]],
      [[60, 62], [73, 82], [74, 106]],
      [[46, 106], [36, 106]],
      [[74, 106], [84, 106]],
    ],
    thick: [3, 4],
    gear: [{ k: 'dumbbell', x: 60, y: 50 }],
  },
  'squat-bodyweight': {
    head: [60, 28],
    body: [
      [[60, 36], [60, 62]],
      [[58, 44], [32, 48]],
      [[62, 44], [88, 48]],
      [[60, 62], [47, 82], [46, 106]],
      [[60, 62], [73, 82], [74, 106]],
      [[46, 106], [36, 106]],
      [[74, 106], [84, 106]],
    ],
    thick: [3, 4],
  },
  'hack-squat': {
    head: [58, 32],
    body: [
      [[60, 40], [62, 60]],
      [[58, 46], [42, 48]],
      [[62, 46], [78, 48]],
      [[62, 60], [52, 80], [50, 104]],
      [[62, 60], [70, 80], [74, 104]],
      [[50, 104], [40, 104]],
      [[74, 104], [84, 104]],
    ],
    thick: [3, 4],
    gear: [
      { k: 'slab', x: 28, y: 18, w: 5, h: 86 },
      { k: 'slab', x: 88, y: 18, w: 5, h: 86 },
      { k: 'slab', x: 70, y: 38, w: 46, h: 8, rot: 100 },
      { k: 'slab', x: 38, y: 104, w: 44, h: 5 },
    ],
  },
  'leg-press': {
    head: [44, 44],
    body: [
      [[46, 52], [42, 76]],
      [[48, 56], [32, 60]],
      [[42, 76], [78, 66], [88, 84]],
      [[88, 84], [88, 74]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 26, y: 40, w: 8, h: 44 },
      { k: 'slab', x: 88, y: 62, w: 6, h: 36 },
      { k: 'slab', x: 20, y: 100, w: 80, h: 5 },
    ],
  },
  /* ----------------------------------------------------- leg curl, calves */
  'leg-curl-seated': {
    head: [50, 42],
    body: [
      [[50, 50], [46, 78]],
      [[48, 54], [36, 62]],
      [[46, 78], [74, 80], [76, 58]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 34, y: 50, w: 7, h: 32 },
      { k: 'slab', x: 36, y: 82, w: 36, h: 6 },
      { k: 'disc', x: 80, y: 52, r: 5 },
      { k: 'stack', x: 96, y: 84 },
    ],
  },
  'leg-curl-lying': {
    head: [30, 84],
    body: [
      [[38, 90], [64, 90]],
      [[40, 88], [34, 102]],
      [[64, 90], [88, 90], [80, 64]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 26, y: 94, w: 66, h: 6 },
      { k: 'disc', x: 80, y: 58, r: 5 },
    ],
  },
  'nordic-curl': {
    head: [72, 50],
    body: [
      [[68, 58], [54, 76]],
      [[62, 66], [84, 86]],
      [[54, 76], [42, 96], [22, 98]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 14, y: 92, w: 8, h: 14 },
      { k: 'slab', x: 28, y: 104, w: 72, h: 4 },
    ],
  },
  'copenhagen-knee': {
    head: [34, 58],
    body: [
      [[42, 66], [64, 78]],
      [[44, 72], [44, 102]],
      [[64, 78], [84, 62]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 82, y: 52, w: 16, h: 8 },
      { k: 'slab', x: 86, y: 60, w: 8, h: 46 },
    ],
  },
  'calf-raise-machine': {
    head: [60, 28],
    body: [
      [[60, 36], [60, 66]],
      [[58, 42], [44, 44]],
      [[62, 42], [76, 44]],
      [[60, 66], [58, 92], [50, 104]],
      [[60, 66], [62, 92], [70, 104]],
    ],
    thick: [3, 4],
    gear: [
      { k: 'slab', x: 42, y: 38, w: 36, h: 7 },
      { k: 'slab', x: 30, y: 18, w: 5, h: 88 },
      { k: 'slab', x: 86, y: 18, w: 5, h: 88 },
      { k: 'slab', x: 36, y: 104, w: 46, h: 5 },
    ],
  },
  'calf-raise-seated': {
    head: [48, 40],
    body: [
      [[48, 48], [44, 76]],
      [[46, 54], [34, 62]],
      [[44, 76], [64, 80], [68, 96], [82, 98]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 32, y: 80, w: 32, h: 6 },
      { k: 'slab', x: 46, y: 70, w: 22, h: 7 },
      { k: 'slab', x: 80, y: 94, w: 14, h: 5 },
      { k: 'slab', x: 24, y: 102, w: 80, h: 5 },
    ],
  },
  'calf-raise-dumbbell': {
    head: [60, 30],
    body: [
      [[60, 38], [60, 70]],
      [[58, 46], [58, 80]],
      [[60, 70], [58, 94], [50, 104]],
      [[60, 70], [62, 94], [70, 104]],
    ],
    thick: [2, 3],
    gear: [
      { k: 'dumbbell', x: 58, y: 84 },
      { k: 'slab', x: 38, y: 104, w: 44, h: 5 },
    ],
  },
  'calf-raise-press': {
    head: [40, 46],
    body: [
      [[42, 54], [38, 78]],
      [[44, 58], [32, 62]],
      [[38, 78], [64, 70], [82, 80], [88, 70]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 22, y: 42, w: 8, h: 42 },
      { k: 'slab', x: 88, y: 58, w: 6, h: 36 },
      { k: 'slab', x: 18, y: 100, w: 80, h: 5 },
    ],
  },
  /* ---------------------------------------------------------------- hinge */
  'deadlift-barbell': {
    head: [70, 42],
    body: [
      [[66, 50], [52, 74]],
      [[62, 56], [60, 84]],
      [[52, 74], [50, 96], [54, 106]],
    ],
    thick: [2],
    gear: [{ k: 'bar', x1: 24, x2: 94, y: 86 }],
  },
  'rdl-barbell': {
    head: [72, 44],
    body: [
      [[68, 52], [56, 76]],
      [[64, 58], [62, 80]],
      [[56, 76], [56, 96], [60, 106]],
    ],
    thick: [2],
    gear: [{ k: 'bar', x1: 26, x2: 92, y: 78 }],
  },
  /* ----------------------------------------------------------------- push */
  'bench-press': {
    head: [36, 74],
    body: [
      [[44, 78], [74, 78]],
      [[52, 76], [50, 56]],
      [[64, 76], [66, 56]],
      [[74, 78], [88, 70], [92, 100]],
    ],
    thick: [3],
    gear: [
      { k: 'slab', x: 28, y: 84, w: 62, h: 7 },
      { k: 'slab', x: 34, y: 84, w: 5, h: 22 },
      { k: 'slab', x: 78, y: 84, w: 5, h: 22 },
      { k: 'bar', x1: 30, x2: 92, y: 54 },
    ],
  },
  'incline-press-barbell': {
    head: [40, 56],
    body: [
      [[44, 64], [60, 86]],
      [[48, 62], [48, 42]],
      [[56, 64], [64, 42]],
      [[60, 86], [72, 104]],
    ],
    thick: [3],
    gear: [
      { k: 'slab', x: 32, y: 60, w: 52, h: 7, rot: -38 },
      { k: 'bar', x1: 24, x2: 96, y: 38 },
    ],
  },
  'incline-press-dumbbell': {
    head: [40, 56],
    body: [
      [[44, 64], [60, 86]],
      [[48, 62], [44, 40]],
      [[56, 64], [68, 40]],
      [[60, 86], [72, 104]],
    ],
    thick: [3],
    gear: [
      { k: 'slab', x: 32, y: 60, w: 52, h: 7, rot: -38 },
      { k: 'dumbbell', x: 44, y: 38 },
      { k: 'dumbbell', x: 68, y: 38 },
    ],
  },
  'chest-press-machine': {
    head: [42, 54],
    body: [
      [[42, 62], [38, 82]],
      [[46, 60], [74, 58]],
      [[38, 82], [68, 84], [72, 104]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 24, y: 46, w: 7, h: 40 },
      { k: 'slab', x: 32, y: 86, w: 36, h: 6 },
      { k: 'slab', x: 84, y: 40, w: 5, h: 64 },
      { k: 'slab', x: 72, y: 52, w: 12, h: 6 },
    ],
  },
  'push-up': {
    head: [28, 82],
    body: [
      [[36, 88], [66, 94]],
      [[38, 92], [32, 104]],
      [[66, 94], [98, 104]],
    ],
    thick: [2],
  },
  'shoulder-press-barbell': {
    head: [60, 30],
    body: [
      [[60, 38], [60, 70]],
      [[58, 44], [50, 32]],
      [[62, 44], [70, 32]],
      [[60, 70], [54, 104]],
      [[60, 70], [66, 104]],
    ],
    thick: [3, 4],
    gear: [{ k: 'bar', x1: 34, x2: 86, y: 26 }],
  },
  'shoulder-press-dumbbell': {
    head: [56, 42],
    body: [
      [[56, 50], [52, 80]],
      [[56, 56], [44, 34]],
      [[58, 56], [70, 34]],
      [[52, 80], [74, 82], [78, 102]],
    ],
    thick: [3],
    gear: [
      { k: 'dumbbell', x: 44, y: 32 },
      { k: 'dumbbell', x: 70, y: 32 },
      { k: 'slab', x: 36, y: 50, w: 7, h: 32 },
      { k: 'slab', x: 42, y: 84, w: 34, h: 6 },
    ],
  },
  'shoulder-press-machine': {
    head: [58, 48],
    body: [
      [[58, 56], [54, 82]],
      [[58, 60], [46, 36]],
      [[58, 60], [70, 36]],
      [[54, 82], [72, 84], [74, 104]],
    ],
    thick: [3],
    gear: [
      { k: 'slab', x: 28, y: 24, w: 5, h: 82 },
      { k: 'slab', x: 86, y: 24, w: 5, h: 82 },
      { k: 'slab', x: 40, y: 32, w: 12, h: 6 },
      { k: 'slab', x: 68, y: 32, w: 12, h: 6 },
      { k: 'slab', x: 42, y: 86, w: 32, h: 6 },
    ],
  },
  /* ----------------------------------------------------------------- pull */
  'row-barbell': {
    head: [70, 42],
    body: [
      [[66, 50], [54, 72]],
      [[60, 56], [60, 70]],
      [[62, 56], [64, 70]],
      [[54, 72], [52, 96], [56, 106]],
    ],
    thick: [3],
    gear: [{ k: 'bar', x1: 26, x2: 92, y: 70 }],
  },
  'row-machine': {
    head: [54, 50],
    body: [
      [[54, 58], [46, 82]],
      [[56, 62], [76, 66]],
      [[46, 84], [70, 86], [72, 104]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 38, y: 48, w: 7, h: 34 },
      { k: 'slab', x: 36, y: 88, w: 32, h: 6 },
      { k: 'slab', x: 84, y: 38, w: 5, h: 66 },
      { k: 'slab', x: 72, y: 60, w: 12, h: 6 },
    ],
  },
  'row-cable': {
    head: [56, 50],
    body: [
      [[56, 58], [50, 82]],
      [[58, 62], [76, 66]],
      [[50, 84], [74, 84], [76, 104]],
    ],
    thick: [2],
    gear: [
      { k: 'slab', x: 42, y: 86, w: 32, h: 6 },
      { k: 'slab', x: 80, y: 90, w: 5, h: 16 },
      { k: 'line', points: [[76, 66], [26, 84]] },
      { k: 'stack', x: 22, y: 84 },
    ],
  },
  'row-band': {
    head: [70, 42],
    body: [
      [[66, 50], [54, 72]],
      [[60, 56], [62, 70]],
      [[54, 72], [52, 96], [56, 106]],
    ],
    thick: [2],
    gear: [
      { k: 'line', points: [[62, 70], [98, 58]], dashed: true },
      { k: 'slab', x: 94, y: 52, w: 6, h: 10 },
    ],
  },
  'lat-pulldown': {
    head: [56, 46],
    body: [
      [[56, 54], [52, 80]],
      [[56, 58], [42, 32]],
      [[56, 58], [70, 32]],
      [[52, 82], [76, 82], [76, 104]],
    ],
    thick: [3],
    gear: [
      { k: 'bar', x1: 34, x2: 78, y: 28 },
      { k: 'slab', x: 44, y: 84, w: 32, h: 6 },
      { k: 'slab', x: 74, y: 76, w: 18, h: 7 },
      { k: 'slab', x: 28, y: 104, w: 72, h: 4 },
    ],
  },
  'assisted-pull-up': {
    head: [60, 44],
    body: [
      [[60, 52], [60, 74]],
      [[60, 54], [44, 22]],
      [[60, 54], [76, 22]],
      [[60, 74], [52, 94]],
      [[60, 74], [70, 94]],
    ],
    thick: [3, 4],
    gear: [
      { k: 'bar', x1: 34, x2: 86, y: 20 },
      { k: 'slab', x: 30, y: 20, w: 5, h: 86 },
      { k: 'slab', x: 86, y: 20, w: 5, h: 86 },
      { k: 'slab', x: 46, y: 88, w: 28, h: 7 },
    ],
  },
  'pull-up': {
    head: [60, 44],
    body: [
      [[60, 52], [60, 74]],
      [[60, 54], [44, 22]],
      [[60, 54], [76, 22]],
      [[60, 74], [58, 104]],
      [[60, 74], [64, 104]],
    ],
    thick: [3, 4],
    gear: [{ k: 'bar', x1: 32, x2: 88, y: 20 }],
  },
  /* ------------------------------------------------------- arms and core */
  'lateral-raise-dumbbell': {
    head: [60, 30],
    body: [
      [[60, 38], [60, 72]],
      [[58, 44], [36, 44]],
      [[62, 44], [84, 44]],
      [[60, 72], [54, 104]],
      [[60, 72], [66, 104]],
    ],
    thick: [3, 4],
    gear: [
      { k: 'dumbbell', x: 36, y: 44 },
      { k: 'dumbbell', x: 84, y: 44 },
    ],
  },
  'lateral-raise-cable': {
    head: [60, 30],
    body: [
      [[60, 38], [60, 72]],
      [[58, 44], [36, 44]],
      [[60, 72], [54, 104]],
      [[60, 72], [66, 104]],
    ],
    thick: [2, 3],
    gear: [
      { k: 'disc', x: 36, y: 44, r: 3 },
      { k: 'line', points: [[36, 44], [96, 78]] },
      { k: 'stack', x: 96, y: 78 },
    ],
  },
  'curl-barbell': {
    head: [60, 30],
    body: [
      [[60, 38], [60, 72]],
      [[58, 44], [52, 60]],
      [[62, 44], [68, 60]],
      [[60, 72], [54, 104]],
      [[60, 72], [66, 104]],
    ],
    thick: [3, 4],
    gear: [{ k: 'bar', x1: 44, x2: 76, y: 60 }],
  },
  'curl-dumbbell': {
    head: [60, 30],
    body: [
      [[60, 38], [60, 72]],
      [[58, 44], [52, 60]],
      [[62, 44], [68, 60]],
      [[60, 72], [54, 104]],
      [[60, 72], [66, 104]],
    ],
    thick: [3, 4],
    gear: [
      { k: 'dumbbell', x: 52, y: 60 },
      { k: 'dumbbell', x: 68, y: 60 },
    ],
  },
  'curl-cable': {
    head: [58, 30],
    body: [
      [[58, 38], [58, 72]],
      [[56, 44], [52, 60]],
      [[58, 72], [52, 104]],
      [[58, 72], [64, 104]],
    ],
    thick: [2, 3],
    gear: [
      { k: 'slab', x: 96, y: 24, w: 5, h: 82 },
      { k: 'line', points: [[52, 60], [96, 88]] },
      { k: 'stack', x: 92, y: 84 },
    ],
  },
  'triceps-pushdown': {
    head: [56, 32],
    body: [
      [[56, 40], [56, 74]],
      [[58, 46], [72, 52], [74, 66]],
      [[56, 74], [50, 104]],
      [[56, 74], [62, 104]],
    ],
    thick: [2, 3],
    gear: [
      { k: 'slab', x: 96, y: 18, w: 5, h: 88 },
      { k: 'line', points: [[96, 24], [74, 66]] },
      { k: 'stack', x: 92, y: 82 },
    ],
  },
  'triceps-overhead-dumbbell': {
    head: [56, 46],
    body: [
      [[56, 54], [52, 84]],
      [[58, 58], [58, 34], [44, 42]],
      [[52, 84], [72, 86], [74, 104]],
    ],
    thick: [2],
    gear: [
      { k: 'dumbbell', x: 44, y: 38 },
      { k: 'slab', x: 36, y: 54, w: 7, h: 32 },
      { k: 'slab', x: 42, y: 88, w: 34, h: 6 },
    ],
  },
  'face-pull': {
    head: [50, 34],
    body: [
      [[50, 42], [50, 74]],
      [[52, 48], [70, 44]],
      [[50, 74], [44, 104]],
      [[50, 74], [56, 104]],
    ],
    thick: [2, 3],
    gear: [
      { k: 'slab', x: 94, y: 16, w: 5, h: 90 },
      { k: 'line', points: [[94, 22], [72, 44]] },
      { k: 'stack', x: 90, y: 80 },
      { k: 'disc', x: 70, y: 44, r: 3 },
    ],
  },
} as const satisfies Record<string, Pictogram>;

export type IllustrationKey = keyof typeof PICTOGRAMS;
