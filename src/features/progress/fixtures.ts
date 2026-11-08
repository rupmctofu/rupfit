/**
 * The progress fixtures: stored rows, built with the storage shapes themselves.
 *
 * Nothing here is a private copy of a domain type: a fixture that drifts from
 * `WorkoutSession` or `BodyMeasurement` stops compiling, which is the point. The
 * numbers follow the approved renders (`progreso-12w`, `progreso-single`,
 * `peso-gaps`, `historial`) so the tests pin the same arithmetic the owner sees.
 *
 * Test support only: no screen imports this file.
 */

import { EFFORT, type Effort } from '../../core/domain';
import type {
  BodyMeasurement,
  ExercisePrescription,
  ExerciseSession,
  ExerciseStatus,
  Provenance,
  SessionStatus,
  SetRecord,
  TrainingPhase,
  WorkoutSession,
} from '../../storage';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/** Monday 4 November 2024, 09:00 local. The week the renders are drawn in. */
export function at(year: number, monthIndex: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, monthIndex, day, hour, minute, 0, 0).getTime();
}

export const SQUAT = { id: 'ex-sentadilla', name: 'Sentadilla trasera' } as const;
export const BENCH = { id: 'ex-press-banca', name: 'Press de banca' } as const;

const DEFAULT_PRESCRIPTION: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 6, upperBound: 8 },
  targetRIR: { lowerBound: 1, upperBound: 2 },
  restSeconds: 180,
};

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

/** Fixture ids are deterministic per call order, so a test can name the first set. */
export function resetIds(): void {
  counter = 0;
}

export interface SetOptions {
  readonly weightKg: number;
  readonly actualReps: number;
  readonly effort?: Effort | null;
  readonly targetReps?: number;
  readonly confirmedAt: number;
  readonly index?: number;
  readonly id?: string;
}

export function set(options: SetOptions): SetRecord {
  return {
    id: options.id ?? nextId('set'),
    index: options.index ?? 1,
    weightKg: options.weightKg,
    targetReps: options.targetReps ?? 8,
    actualReps: options.actualReps,
    effort: options.effort === undefined ? EFFORT.correct : options.effort,
    discomfort: null,
    confirmedAt: options.confirmedAt,
  };
}

export interface ExerciseOptions {
  readonly exerciseId?: string | null;
  readonly name?: string;
  readonly sets?: readonly SetRecord[];
  readonly status?: ExerciseStatus;
  readonly prescription?: ExercisePrescription;
  readonly completedAt?: number | null;
  readonly id?: string;
}

export function exerciseSession(options: ExerciseOptions = {}): ExerciseSession {
  const sets = options.sets ?? [];
  return {
    id: options.id ?? nextId('exercise'),
    order: 0,
    exerciseId: options.exerciseId === undefined ? SQUAT.id : options.exerciseId,
    exerciseNameSnapshot: options.name ?? SQUAT.name,
    prescription: options.prescription ?? DEFAULT_PRESCRIPTION,
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    sets,
    status: options.status ?? 'done',
    completedAt: options.completedAt === undefined ? null : options.completedAt,
  };
}

export interface SessionOptions {
  readonly id?: string;
  readonly dayName?: string;
  readonly scheduledDate: number;
  readonly startedAt?: number | null;
  readonly endedAt?: number | null;
  readonly status?: SessionStatus;
  readonly exercises?: readonly ExerciseSession[];
  readonly phase?: TrainingPhase;
}

export function session(options: SessionOptions): WorkoutSession {
  const startedAt = options.startedAt === undefined ? options.scheduledDate : options.startedAt;
  const endedAt = options.endedAt === undefined ? startedAt : options.endedAt;
  return {
    id: options.id ?? nextId('session'),
    planDayId: 'plan-day-1',
    dayNameSnapshot: options.dayName ?? 'Sentadilla / Pierna',
    scheduledDate: options.scheduledDate,
    startedAt,
    endedAt,
    phase: options.phase ?? { kind: 'normal' },
    status: options.status ?? 'completed',
    exercises: options.exercises ?? [],
  };
}

export interface MeasurementOptions {
  readonly id?: string;
  readonly date: number;
  readonly weightKg: number | null;
  readonly provenance?: Provenance;
}

export function measurement(options: MeasurementOptions): BodyMeasurement {
  return {
    id: options.id ?? nextId('measurement'),
    date: options.date,
    weightKg: options.weightKg,
    waistCm: null,
    chestCm: null,
    armCm: null,
    thighCm: null,
    hipCm: null,
    bodyFatPercent: null,
    provenance: options.provenance ?? 'manual',
  };
}
