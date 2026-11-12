/**
 * odd/tasks/training-program.md L11 and odd/tasks/match-aware-week.md L7: a device seeded
 * before the fourth day existed must gain it, a device seeded before the fourth day changed
 * must see the change, and the days the owner already has must come out untouched.
 *
 * Three failures are invisible in a screenshot and are therefore pinned here: a refresh that
 * rewrites a day the owner edited (which would replace an edited routine, because `plan.save`
 * replaces a day's item list), a refresh that writes a day whose exercises the library does
 * not hold (the session would have a name and nothing to prescribe), and a rerun that keeps
 * writing.
 */

import { describe, expect, it } from 'vitest';
import type { Exercise, PlanDay, PlanItem, StoragePort } from '../../storage';
import { SEED_EXERCISES, seedPlanDays } from '../../core/seed';
import {
  missingPrescribedExercises,
  missingSeedDays,
  outdatedSeedDays,
  refreshSeededPlanDays,
} from './plan-refresh';

const SEED_DAYS = seedPlanDays();
// The key is the identity: the fourth day kept it when L7 changed its name.
const FISICO_ID = 'seed-day-fisico';
const FISICO = SEED_DAYS.find((day) => day.id === FISICO_ID);
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
  /** The store as it stands after the refresh, by day id. */
  readonly planDays: ReadonlyMap<string, PlanDay>;
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

  return { storage, written, reads, planDays };
}

/** A stored day with the same id as a seed day but the owner's own items. */
function edited(day: { readonly id: string }): PlanDay {
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

function seedNameOf(exerciseId: string): string {
  const row = SEED_EXERCISES.find((exercise) => exercise.id === exerciseId);
  if (row === undefined) throw new Error(`the library lost ${exerciseId}`);
  return row.name;
}

/**
 * The fourth day as the seed wrote it before odd/tasks/match-aware-week.md L7: called
 * `FÍSICO` and holding four slots of generic conditioning, intervals on the treadmill.
 *
 * Written out from the document rather than read from the seed, because the seed no longer
 * has it — and because a device in the wild does.
 */
function legacyFisico(): PlanDay {
  const exerciseIds = [
    'seed-ex-intervalos-cinta',
    'seed-ex-copenhagen-corto',
    'seed-ex-soleo-isometrico',
    'seed-ex-plancha',
  ];
  const items: PlanItem[] = exerciseIds.map((exerciseId, order) => ({
    id: `seed-item-fisico-${String(order + 1)}`,
    planDayId: FISICO_ID,
    order,
    exerciseId,
    exerciseNameSnapshot: seedNameOf(exerciseId),
    prescription: {
      sets: 2,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 5, upperBound: 6 },
      restSeconds: 90,
    },
  }));

  return { id: FISICO_ID, name: 'FÍSICO', order: 3, items };
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

describe('which seeded days a store holds in an earlier shape', () => {
  it('names the day the seed changed in place, once the store has it', () => {
    // L7 renamed the fourth day and gave it a fifth slot. A device seeded before that keeps
    // the day it was written, and `plan.save` replaces a day's items, so the only rows this
    // refresh may rewrite are the ones the seed wrote itself.
    expect(outdatedSeedDays([...THREE_DAYS, legacyFisico()], SEED_DAYS).map((d) => d.id)).toEqual(
      [FISICO.id],
    );
  });

  it('says nothing about a current store, a missing day or a day the owner edited', () => {
    const mine: PlanDay = { id: 'day-mine', name: 'MI DÍA', order: 7, items: [] };

    expect(outdatedSeedDays(SEED_DAYS, SEED_DAYS)).toEqual([]);
    // Missing is the other function's job; a day the owner renamed is nobody's.
    expect(outdatedSeedDays([...THREE_DAYS, mine], SEED_DAYS)).toEqual([]);
    expect(outdatedSeedDays([...THREE_DAYS, edited(legacyFisico())], SEED_DAYS)).toEqual([]);
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

  it('carries the fourth day of L7 to a store that has it as `FÍSICO`', async () => {
    const mine: PlanDay = { id: 'day-mine', name: 'MI DÍA', order: 7, items: [] };
    const store = fakeStore({
      planDays: [...THREE_DAYS, legacyFisico(), mine],
      exercises: SEED_EXERCISES.filter((row) => !PRESCRIBED.includes(row.id)),
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(1);

    // The library first, then the one day: the track intervals are not in the old library.
    expect(store.written.exercises).toEqual(PRESCRIBED);
    expect(store.written.planDays).toEqual([FISICO.id]);
    // The custom day is the owner's: named, never written.
    expect(store.written.planDays).not.toContain(mine.id);
    expect(store.planDays.get(mine.id)).toEqual(mine);

    // The new name and the fifth slot, on the day id history already points at.
    const refreshed = store.planDays.get(FISICO.id);
    expect(refreshed?.name).toBe('PREPARACIÓN FÚTBOL');
    expect(refreshed?.items.map((item) => item.exerciseId)).toEqual(
      FISICO.items.map((item) => item.exerciseId),
    );
    expect(refreshed?.items).toHaveLength(5);

    // And once is enough: the second launch has nothing to do.
    const readsAfterFirst = store.reads.length;
    expect(await refreshSeededPlanDays(store.storage)).toBe(0);
    expect(store.reads.slice(readsAfterFirst)).toEqual(['plan']);
    expect(store.written.planDays).toEqual([FISICO.id]);
  });

  it('leaves the fourth day to the owner the moment they change it', async () => {
    // A day the owner edited is not the seed's to rewrite, even under the old name: the
    // seed's own shape is the only thing that says "this row is mine".
    const touched: PlanDay = { ...legacyFisico(), items: legacyFisico().items.slice(0, 3) };
    const store = fakeStore({
      planDays: [...THREE_DAYS, touched],
      exercises: SEED_EXERCISES,
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(0);
    expect(store.written.planDays).toEqual([]);
    expect(store.planDays.get(FISICO.id)).toEqual(touched);
  });
});
