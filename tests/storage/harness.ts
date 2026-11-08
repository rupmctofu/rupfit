/**
 * Storage test harness.
 *
 * `tests/storage/*` run in the `node` environment (vitest.config.ts) with
 * `fake-indexeddb` as the only database. Nothing here encodes behaviour: the
 * fixtures are literal domain values and the raw reader exists only so a test can
 * look at what the store actually holds, which is the point of an invariant test.
 */

import * as fakeIndexedDb from 'fake-indexeddb';
import { openDB } from 'idb';
import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  ExercisePrescription,
  ExerciseSession,
  PlanDay,
  PlanItem,
  SetRecord,
  UserProfile,
  WorkoutSession,
} from '../../src/storage';
import type { PhaseState, ProgressionRecommendation } from '../../src/core/domain';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixed instant every fixture is anchored on; the store never reads a clock. */
export const T0 = Date.parse('2026-11-08T10:00:00.000Z');

export function days(daysAfter: number): number {
  return T0 + daysAfter * DAY_MS;
}

let counter = 0;

/** Deterministic ids, so a fixture dump is comparable and a diff is readable. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-1-${String(counter).padStart(4, '0')}`;
}

/**
 * A brand new in-memory IndexedDB for one test. Replacing the global factory is
 * how fake-indexeddb isolates tests; every storage instance is created per test so
 * no connection survives across them.
 *
 * `idb` reads `indexedDB`, `IDBRequest`, `IDBTransaction` and friends off the global
 * object at call time, so the whole fake surface is installed here rather than only
 * the factory.
 */
export function freshIndexedDb(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(fakeIndexedDb)) {
    globals[name] = value;
  }
  const factory = new (fakeIndexedDb as unknown as { IDBFactory: new () => unknown }).IDBFactory();
  globals['indexedDB'] = factory;
}

export function prescription(overrides: Partial<ExercisePrescription> = {}): ExercisePrescription {
  return {
    sets: 3,
    repRange: { lowerBound: 6, upperBound: 10 },
    targetRIR: { lowerBound: 1, upperBound: 3 },
    restSeconds: 120,
    ...overrides,
  };
}

export function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: nextId('exercise'),
    name: 'Sentadilla trasera',
    primaryMuscle: 'quadriceps',
    pattern: 'squat',
    equipment: 'barbell',
    loadIncrementKg: 2.5,
    isCustom: false,
    isArchived: false,
    ...overrides,
  };
}

export function recommendation(
  overrides: Partial<ProgressionRecommendation> = {},
): ProgressionRecommendation {
  return {
    suggestedWeightKg: 100,
    suggestedSets: 3,
    suggestedTargetReps: 6,
    action: 'hold',
    reason: 'addRepetition',
    confidence: { level: 'medium', sessionsConsidered: 3 },
    basedOnSessions: 3,
    computedAt: new Date(T0),
    reasonContext: { next: 102.5 },
    ...overrides,
  };
}

export interface SetOptions {
  id?: string;
  index?: number;
  weightKg?: number;
  targetReps?: number;
  actualReps?: number;
  effort?: SetRecord['effort'];
  discomfort?: SetRecord['discomfort'];
  confirmedAt?: number;
}

export function setRecord(options: SetOptions = {}): SetRecord {
  return {
    id: options.id ?? nextId('set'),
    index: options.index ?? 1,
    weightKg: options.weightKg ?? 100,
    targetReps: options.targetReps ?? 6,
    actualReps: options.actualReps ?? 6,
    effort: options.effort ?? null,
    discomfort: options.discomfort ?? null,
    confirmedAt: options.confirmedAt ?? T0,
  };
}

export interface ExerciseSessionOptions {
  id?: string;
  order?: number;
  exerciseId?: string | null;
  exerciseNameSnapshot?: string;
  prescription?: ExercisePrescription;
  recommendation?: ProgressionRecommendation | null;
  decision?: ExerciseSession['decision'];
  recommendedWeightKg?: number | null;
  usedWeightKg?: number | null;
  loadDeltaKg?: number | null;
  sets?: readonly SetRecord[];
  status?: ExerciseSession['status'];
  completedAt?: number | null;
}

export function exerciseSession(options: ExerciseSessionOptions = {}): ExerciseSession {
  return {
    id: options.id ?? nextId('exerciseSession'),
    order: options.order ?? 1,
    exerciseId: options.exerciseId ?? null,
    exerciseNameSnapshot: options.exerciseNameSnapshot ?? 'Sentadilla trasera',
    prescription: options.prescription ?? prescription(),
    recommendation: options.recommendation ?? null,
    decision: options.decision ?? null,
    recommendedWeightKg: options.recommendedWeightKg ?? null,
    usedWeightKg: options.usedWeightKg ?? null,
    loadDeltaKg: options.loadDeltaKg ?? null,
    sets: options.sets ?? [],
    status: options.status ?? 'pending',
    completedAt: options.completedAt ?? null,
  };
}

export interface WorkoutSessionOptions {
  id?: string;
  planDayId?: string;
  dayNameSnapshot?: string;
  scheduledDate?: number;
  startedAt?: number | null;
  endedAt?: number | null;
  status?: WorkoutSession['status'];
  exercises?: readonly ExerciseSession[];
}

export function workoutSession(options: WorkoutSessionOptions = {}): WorkoutSession {
  return {
    id: options.id ?? nextId('session'),
    planDayId: options.planDayId ?? 'plan-1-0001',
    dayNameSnapshot: options.dayNameSnapshot ?? 'SENTADILLA / PIERNA',
    scheduledDate: options.scheduledDate ?? T0,
    startedAt: options.startedAt ?? null,
    endedAt: options.endedAt ?? null,
    phase: { kind: 'normal' },
    status: options.status ?? 'scheduled',
    exercises: options.exercises ?? [exerciseSession()],
  };
}

export function planItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: nextId('planItem'),
    planDayId: 'plan-1-0001',
    order: 1,
    exerciseId: 'exercise-1-0001',
    exerciseNameSnapshot: 'Sentadilla trasera',
    prescription: prescription(),
    ...overrides,
  };
}

export function planDay(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    id: nextId('planDay'),
    name: 'SENTADILLA / PIERNA',
    order: 1,
    items: [],
    ...overrides,
  };
}

export function measurement(overrides: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return {
    id: nextId('measurement'),
    date: T0,
    weightKg: 82.4,
    waistCm: null,
    chestCm: null,
    armCm: null,
    thighCm: null,
    hipCm: null,
    bodyFatPercent: null,
    provenance: 'manual',
    ...overrides,
  };
}

export function activity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: nextId('activity'),
    date: T0,
    kind: 'cardio',
    durationSeconds: 1800,
    activeEnergyKcal: 220,
    provenance: 'manual',
    externalSampleId: null,
    ...overrides,
  };
}

export function userProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: nextId('profile'),
    displayName: 'Robert',
    massUnit: 'kilograms',
    weightGoal: 'maintain',
    weeklyTrainingDays: 3,
    availableEquipment: ['barbell', 'dumbbell'],
    autoStartRestTimer: true,
    ...overrides,
  };
}

export function phaseState(overrides: Partial<PhaseState> = {}): PhaseState {
  return { block: 1, passedBlocks: 0, ...overrides };
}

/* ------------------------------------------------------------------ raw reads */

/**
 * A raw view of the database, used only to assert what is on disk: store names,
 * index metadata, row counts and stored rows. The production code exposes no
 * handle upward; this is the test's own connection.
 */
export interface RawDatabase {
  storeNames(): string[];
  keyPath(store: string): unknown;
  indexNames(store: string): string[];
  indexMetadata(store: string): { name: string; keyPath: unknown; unique: boolean }[];
  count(store: string): Promise<number>;
  all<T>(store: string): Promise<T[]>;
  put(store: string, value: unknown): Promise<void>;
  close(): void;
}

export async function openRaw(name: string): Promise<RawDatabase> {
  const db = await openDB(name);
  return {
    storeNames: () => Array.from(db.objectStoreNames as unknown as Iterable<string>),
    keyPath: (store) => {
      const tx = db.transaction(store as never);
      return tx.store.keyPath as unknown;
    },
    indexNames: (store) => {
      const tx = db.transaction(store as never);
      return Array.from(tx.store.indexNames as unknown as Iterable<string>);
    },
    indexMetadata: (store) => {
      const tx = db.transaction(store as never);
      return Array.from(tx.store.indexNames as unknown as Iterable<string>).map((indexName) => {
        const index = tx.store.index(indexName as never);
        return {
          name: indexName,
          keyPath: index.keyPath as unknown,
          unique: index.unique,
        };
      });
    },
    count: async (store) => (await db.count(store as never)) as unknown as number,
    all: async <T>(store: string) => (await db.getAll(store as never)) as unknown as T[],
    put: async (store, value) => {
      await db.put(store as never, value as never);
    },
    close: () => db.close(),
  };
}
