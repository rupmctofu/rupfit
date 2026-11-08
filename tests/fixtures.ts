/**
 * Test fixtures. Literal values only, except the property tests in
 * tests/properties.test.ts (docs/progression-engine.md §11).
 *
 * Nothing here encodes expected engine behaviour: expectations live in the test
 * files and come from the specification.
 */

import {
  NORMAL_PHASE,
  repRange,
  type ColdStartInput,
  type Discomfort,
  type Effort,
  type Exercise,
  type ExerciseOutcome,
  type ExercisePrescription,
  type PhaseState,
  type ProgressionInput,
  type SetOutcome,
} from '../src/core/domain';

/** Injected instant used by every test: the engine never reads a clock. */
export const NOW = new Date('2026-11-08T10:00:00.000Z');

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBefore(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

export interface SetOptions {
  targetReps?: number;
  effort?: Effort | null;
  discomfort?: Discomfort | null;
}

/** An answered set: `effort` and `discomfort` stay `null` unless stated (I-7). */
export function makeSet(actualReps: number, options: SetOptions = {}): SetOutcome {
  return {
    targetReps: options.targetReps ?? 6,
    actualReps,
    effort: options.effort ?? null,
    discomfort: options.discomfort ?? null,
  };
}

export function makeSets(actualReps: readonly number[], options: SetOptions = {}): SetOutcome[] {
  return actualReps.map((reps) => makeSet(reps, options));
}

export interface OutcomeOptions {
  weightKg: number;
  reps?: readonly number[];
  effort?: Effort | null;
  discomfort?: Discomfort | null;
  recommendedWeightKg?: number | null;
  date?: Date;
  sets?: readonly SetOutcome[];
}

export function makeOutcome(options: OutcomeOptions): ExerciseOutcome {
  const sets = options.sets ?? makeSets(options.reps ?? [6, 6, 6, 6], {
    effort: options.effort ?? null,
    discomfort: options.discomfort ?? null,
  });

  return {
    date: options.date ?? NOW,
    weightKg: options.weightKg,
    recommendedWeightKg: options.recommendedWeightKg ?? null,
    sets,
  };
}

export function barbellExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'exercise-barbell-deadlift',
    name: 'Peso muerto',
    primaryMuscle: 'hamstrings',
    pattern: 'hinge',
    equipment: 'barbell',
    loadIncrementKg: 2.5,
    isCustom: false,
    isArchived: false,
    ...overrides,
  };
}

export function bodyweightExercise(overrides: Partial<Exercise> = {}): Exercise {
  return barbellExercise({
    id: 'exercise-bodyweight-pushup',
    name: 'Flexiones',
    primaryMuscle: 'chest',
    pattern: 'horizontalPush',
    equipment: 'bodyweight',
    loadIncrementKg: 0,
    ...overrides,
  });
}

export function dumbbellExercise(overrides: Partial<Exercise> = {}): Exercise {
  return barbellExercise({
    id: 'exercise-dumbbell-press',
    name: 'Press mancuernas',
    primaryMuscle: 'shoulders',
    pattern: 'verticalPush',
    equipment: 'dumbbell',
    loadIncrementKg: 2,
    ...overrides,
  });
}

export function machineExercise(overrides: Partial<Exercise> = {}): Exercise {
  return barbellExercise({
    id: 'exercise-machine-legpress',
    name: 'Prensa',
    primaryMuscle: 'quadriceps',
    pattern: 'squat',
    equipment: 'machine',
    loadIncrementKg: 5,
    ...overrides,
  });
}

export interface PrescriptionOptions {
  sets?: number;
  bottom?: number;
  top?: number;
  targetRIR?: readonly [number, number];
  restSeconds?: number;
}

/** Default prescription of §11: 4 sets, 6–10 reps. */
export function makePrescription(options: PrescriptionOptions = {}): ExercisePrescription {
  const [rirLower, rirUpper] = options.targetRIR ?? [2, 3];

  return {
    sets: options.sets ?? 4,
    repRange: repRange(options.bottom ?? 6, options.top ?? 10),
    targetRIR: repRange(rirLower, rirUpper),
    restSeconds: options.restSeconds ?? 120,
  };
}

export const NORMAL_STATE: PhaseState = { block: 1, passedBlocks: 0 };

export function makeInput(overrides: Partial<ProgressionInput> = {}): ProgressionInput {
  return {
    exercise: barbellExercise(),
    prescription: makePrescription(),
    phase: NORMAL_PHASE,
    phaseState: NORMAL_STATE,
    history: [],
    coldStart: null,
    ...overrides,
  };
}

export function calibration(knownWorkingWeightKg: number, knownReps: number): ColdStartInput {
  return { knownWorkingWeightKg, knownReps };
}

/** Effort buckets and phase helpers, re-exported so test bodies read as domain language. */
export { DISCOMFORT, EFFORT, NORMAL_PHASE, readaptationPhase } from '../src/core/domain';
