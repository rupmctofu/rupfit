/**
 * Domain value types — Rupfit (docs/data-model.md §2).
 *
 * Plain, serialisable values: no classes, no I/O, no framework types. The same
 * declarations are usable from a browser service worker, a Node test or a future
 * IndexedDB mapper without adaptation.
 */

export const MUSCLE_GROUPS = [
  'quadriceps',
  'hamstrings',
  'glutes',
  // Adductors are their own group: Copenhagen planks and the football work target them,
  // and calling them `core` hid the one adaptation the programme is built around.
  'adductors',
  'calves',
  'lowerBack',
  'chest',
  'shoulders',
  'triceps',
  'lats',
  'upperBack',
  'biceps',
  'forearms',
  'core',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'horizontalPush',
  'verticalPush',
  'horizontalPull',
  'verticalPull',
  'isolation',
  'core',
  // The fourth gym day's own family (odd/tasks/training-program.md L11): intervals. A
  // treadmill or a bike is not a squat and not an isolation, and calling it `core` would
  // put it in the muscle pickers where it does not belong. Additive: an old row cannot
  // have this value, and a row that has it cannot be read by a build older than this one.
  'conditioning',
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band'] as const;

export type Equipment = (typeof EQUIPMENT_TYPES)[number];

/**
 * Effort is a coarse RIR bucket (docs/data-model.md §2). The ordering matters:
 * a lower number means fewer reps in reserve, i.e. a harder set. Raw RIR is never
 * stored, and `null` means unanswered (invariant I-7) — it is never coerced.
 */
export const EFFORT = {
  failure: 0,
  hard: 1,
  correct: 2,
  easy: 3,
} as const;

export type Effort = (typeof EFFORT)[keyof typeof EFFORT];

/** Discomfort as reported by the user; `null` means unanswered (invariant I-7). */
export const DISCOMFORT = {
  none: 0,
  mild: 1,
  pain: 2,
} as const;

export type Discomfort = (typeof DISCOMFORT)[keyof typeof DISCOMFORT];

/** Inclusive integer range, the counterpart of `ClosedRange<Int>` in the model. */
export interface RepRange {
  readonly lowerBound: number;
  readonly upperBound: number;
}

export function repRange(lowerBound: number, upperBound: number): RepRange {
  return { lowerBound, upperBound };
}

export function rangeContains(range: RepRange, value: number): boolean {
  return value >= range.lowerBound && value <= range.upperBound;
}

export function clampToRange(value: number, range: RepRange): number {
  return Math.min(Math.max(value, range.lowerBound), range.upperBound);
}

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Confidence labels a recommendation; it never changes the recommended number
 * (docs/progression-engine.md §10).
 */
export interface Confidence {
  readonly level: ConfidenceLevel;
  readonly sessionsConsidered: number;
}
