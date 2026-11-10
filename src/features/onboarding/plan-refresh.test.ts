/**
 * odd/tasks/training-program.md L11: a device seeded before the fourth day existed must
 * gain it, and the days the owner already has must come out untouched.
 *
 * Two failures are invisible in a screenshot and are therefore pinned here: a refresh that
 * rewrites a day (which would replace an edited routine, because `plan.save` replaces a
 * day's item list) and a refresh that writes a day whose exercises the library does not
 * hold (the session would have a name and nothing to prescribe).
 */

import { describe, expect, it } from 'vitest';
import type { Exercise, PlanDay, PlanItem, StoragePort } from '../../storage';
import { SEED_EXERCISES, seedPlanDays, type SeedPlanDay } from '../../core/seed';
import {
  missingPrescribedExercises,
  missingSeedDays,
  refreshSeededPlanDays,
} from './plan-refresh';

const SEED_DAYS = seedPlanDays();
const FISICO = SEED_DAYS.find((day) => day.name === 'FÍSICO');
if (FISICO === undefined) throw new Error('the seed lost the fourth day');

/** The three days a device seeded before L11 has. */
const THREE_DAYS = SEED_DAYS.filter((day) => day.id !== FISICO.id);

/**
 * The library rows the fourth day prescribes, in the seed's own order — the order the
 * refresh writes them in, because it filters the seed and never re-sorts it.
 */
const PRESCRIBED = SEED_EXERCISES.filter((row) =>
  FISICO.items.some((item) => item.exerciseId === row.id),
).map((row) => row.id);

interface FakeStore {
  readonly storage: StoragePort;
  readonly written: {
    readonly planDays: string[];
    readonly exercises: string[];
  };
  readonly reads: string[];
}

/**
 * The two repositories the refresh touches, over maps. `refreshSeededPlanDays` takes the
 * port, so the fake only has to be structurally assignable where it is cast.
 */
function fakeStore(options: {
  readonly planDays: readonly PlanDay[];
  readonly exercises: readonly Exercise[];
}): FakeStore {
  const planDays = new Map(options.planDays.map((day) => [day.id, day]));
  const exercises = new Map(options.exercises.map((row) => [row.id, row]));
  const written = { planDays: [] as string[], exercises: [] as string[] };
  const reads: string[] = [];

  const storage = {
    plan: {
      all: () => {
        reads.push('plan');
        return Promise.resolve([...planDays.values()]);
      },
      save: (day: PlanDay) => {
        written.planDays.push(day.id);
        planDays.set(day.id, day);
        return Promise.resolve();
      },
    },
    exercises: {
      all: () => {
        reads.push('exercises');
        return Promise.resolve([...exercises.values()]);
      },
      save: (exercise: Exercise) => {
        written.exercises.push(exercise.id);
        exercises.set(exercise.id, exercise);
        return Promise.resolve();
      },
    },
  } as unknown as StoragePort;

  return { storage, written, reads };
}

/** A stored day with the same id as a seed day but the owner's own items. */
function edited(day: SeedPlanDay): PlanDay {
  const items: PlanItem[] = [
    {
      id: `${day.id}-mine`,
      planDayId: day.id,
      order: 0,
      exerciseId: 'seed-ex-press-banca',
      exerciseNameSnapshot: 'Press banca',
      prescription: {
        sets: 5,
        repRange: { lowerBound: 3, upperBound: 5 },
        targetRIR: { lowerBound: 1, upperBound: 2 },
        restSeconds: 240,
      },
    },
  ];

  return { id: day.id, name: 'MI DÍA', order: 9, items };
}

describe('which seeded days a store is missing', () => {
  it('names only the day that is absent, in rotation order', () => {
    expect(missingSeedDays(THREE_DAYS, SEED_DAYS).map((day) => day.id)).toEqual([FISICO.id]);
  });

  it('names nothing when the store already has every seeded day', () => {
    expect(missingSeedDays(SEED_DAYS, SEED_DAYS)).toEqual([]);
  });

  it('never asks for a day the owner renamed or edited: the id is the identity', () => {
    const renamed = SEED_DAYS.map((day) => (day.id === FISICO.id ? edited(day) : day));
    expect(missingSeedDays(renamed, SEED_DAYS)).toEqual([]);
  });

  it('leaves a day the seed does not know where it is', () => {
    const mine: PlanDay = { id: 'day-mine', name: 'MI DÍA', order: 7, items: [] };
    // Only the missing seed day is named; nothing asks for `day-mine` to change or go.
    expect(missingSeedDays([...THREE_DAYS, mine], SEED_DAYS).map((day) => day.id)).toEqual([
      FISICO.id,
    ]);
  });
});

describe('the exercises a new day needs', () => {
  it('names the seed rows the day prescribes that the library lacks', () => {
    // A store whose library predates the fourth day: none of its four rows exist.
    const legacyLibrary = SEED_EXERCISES.filter((row) => !PRESCRIBED.includes(row.id));

    expect(
      missingPrescribedExercises([FISICO], legacyLibrary, SEED_EXERCISES).map((row) => row.id),
    ).toEqual(PRESCRIBED);
  });

  it('asks for nothing the day does not prescribe, and nothing already stored', () => {
    // `seed-ex-copenhagen` is in the seed but on no day: a missing library row is still the
    // first-run flow's job, not this refresh's.
    const complete = SEED_EXERCISES.filter((row) => row.id !== 'seed-ex-copenhagen');
    expect(missingPrescribedExercises([FISICO], complete, SEED_EXERCISES)).toEqual([]);
  });
});

describe('refreshing the seeded days on launch', () => {
  it('adds the missing day, seeding its exercises first', async () => {
    const store = fakeStore({
      planDays: THREE_DAYS,
      exercises: SEED_EXERCISES.filter((row) => !PRESCRIBED.includes(row.id)),
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(1);

    expect(store.written.exercises).toEqual(PRESCRIBED);
    expect(store.written.planDays).toEqual([FISICO.id]);
  });

  it('never writes a day that already exists, even an edited one', async () => {
    const stored = SEED_DAYS.map((day) => (day.id === FISICO.id ? edited(day) : day));
    const store = fakeStore({ planDays: stored, exercises: SEED_EXERCISES });

    expect(await refreshSeededPlanDays(store.storage)).toBe(0);
    // The one read and no write: a current store costs nothing.
    expect(store.reads).toEqual(['plan']);
    expect(store.written.planDays).toEqual([]);
    expect(store.written.exercises).toEqual([]);
  });

  it('is idempotent: a second launch writes nothing', async () => {
    const first = fakeStore({
      planDays: THREE_DAYS,
      exercises: SEED_EXERCISES.filter((row) => !row.id.startsWith('seed-ex-intervalos')),
    });

    expect(await refreshSeededPlanDays(first.storage)).toBe(1);

    const readsAfterFirst = first.reads.length;
    expect(await refreshSeededPlanDays(first.storage)).toBe(0);
    expect(first.reads.slice(readsAfterFirst)).toEqual(['plan']);
    expect(first.written.planDays).toEqual([FISICO.id]);
  });

  it('does not touch the days that are there when it adds one', async () => {
    const store = fakeStore({
      planDays: THREE_DAYS,
      exercises: SEED_EXERCISES.filter((row) => !row.id.startsWith('seed-ex-intervalos')),
    });

    await refreshSeededPlanDays(store.storage);

    for (const day of THREE_DAYS) expect(store.written.planDays).not.toContain(day.id);
  });
});
