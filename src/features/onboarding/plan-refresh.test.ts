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
import type {
  Exercise,
  ExercisePrescription,
  PlanDay,
  PlanItem,
  StoragePort,
} from '../../storage';
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
  /** The library as it stands after the refresh, by exercise id. */
  readonly exercises: ReadonlyMap<string, Exercise>;
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

  return { storage, written, reads, planDays, exercises };
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
 * The fourth day as the seed wrote it before odd/tasks/five-day-plan.md S1: called
 * `PREPARACIÓN FÚTBOL`, with the track interval, the assisted Nordic, the short Copenhagen,
 * the held soleus and the front plank.
 *
 * Written out from the document rather than read from the seed, because the seed no longer
 * has it — and because a device in the wild does.
 */
function legacyPreparation(): PlanDay {
  const exerciseIds = [
    'seed-ex-intervalos-pista',
    'seed-ex-nordic-asistido',
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
    prescription:
      order === 0
        ? {
            sets: 2,
            repRange: { lowerBound: 1, upperBound: 1 },
            targetRIR: { lowerBound: 4, upperBound: 5 },
            restSeconds: 120,
            role: 'conditioning',
            durationSeconds: 120,
          }
        : {
            sets: 2,
            repRange: { lowerBound: 6, upperBound: 8 },
            targetRIR: { lowerBound: 5, upperBound: 6 },
            restSeconds: 90,
            role: 'preventive',
          },
  }));

  return { id: FISICO_ID, name: 'PREPARACIÓN FÚTBOL', order: 3, items };
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
  it('names every day the seed changed in place, once the store has it', () => {
    // L7 renamed the fourth day and gave it a fifth slot, and five-day-plan S1 replaced
    // that day again. A device seeded before either change keeps the day it was written,
    // and `plan.save` replaces a day's items, so the only rows this refresh may rewrite
    // are the ones the seed wrote itself.
    expect(outdatedSeedDays([...THREE_DAYS, legacyFisico()], SEED_DAYS).map((d) => d.id)).toEqual(
      [FISICO.id],
    );
    expect(
      outdatedSeedDays([...THREE_DAYS, legacyPreparation()], SEED_DAYS).map((d) => d.id),
    ).toEqual([FISICO.id]);
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

  it('carries the fourth day of S1 to a store that has it as `FÍSICO`', async () => {
    const mine: PlanDay = { id: 'day-mine', name: 'MI DÍA', order: 7, items: [] };
    const store = fakeStore({
      planDays: [...THREE_DAYS, legacyFisico(), mine],
      exercises: SEED_EXERCISES.filter((row) => !PRESCRIBED.includes(row.id)),
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(1);

    // The library first, then the one day: the mobility rows are not in the old library.
    expect(store.written.exercises).toEqual(PRESCRIBED);
    expect(store.written.planDays).toEqual([FISICO.id]);
    // The custom day is the owner's: named, never written.
    expect(store.written.planDays).not.toContain(mine.id);
    expect(store.planDays.get(mine.id)).toEqual(mine);

    // The new name and the seven slots, on the day id history already points at.
    const refreshed = store.planDays.get(FISICO.id);
    expect(refreshed?.name).toBe('MOVILIDAD Y CORE');
    expect(refreshed?.items.map((item) => item.exerciseId)).toEqual(
      FISICO.items.map((item) => item.exerciseId),
    );
    expect(refreshed?.items).toHaveLength(7);

    // And once is enough: the second launch has nothing to do.
    const readsAfterFirst = store.reads.length;
    expect(await refreshSeededPlanDays(store.storage)).toBe(0);
    expect(store.reads.slice(readsAfterFirst)).toEqual(['plan']);
    expect(store.written.planDays).toEqual([FISICO.id]);
  });

  it('carries the mobility day to a store that still has `PREPARACIÓN FÚTBOL`', async () => {
    // The store this release actually meets: a device seeded after L7, holding the track
    // interval and the four preventive rows under the old name.
    const store = fakeStore({
      planDays: [...THREE_DAYS, legacyPreparation()],
      exercises: SEED_EXERCISES.filter((row) => !PRESCRIBED.includes(row.id)),
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(1);

    expect(store.written.exercises).toEqual(PRESCRIBED);
    expect(store.written.planDays).toEqual([FISICO.id]);
    const refreshed = store.planDays.get(FISICO.id);
    expect(refreshed?.name).toBe('MOVILIDAD Y CORE');
    expect(refreshed?.items.map((item) => item.exerciseId)).toEqual(
      FISICO.items.map((item) => item.exerciseId),
    );
    expect(refreshed?.items).toHaveLength(7);
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

/* ------------------------------------------- the closing walk (incline-walk S5) */

const WALK_EXERCISE_ID = 'seed-ex-caminata-inclinada';

/**
 * The four seeded days as the release before odd/tasks/incline-walk.md wrote them: the
 * seed's own rows, in the seed's own order, with no closing walk.
 *
 * Written out by removing the walk from the seed on purpose — a device in the wild holds
 * exactly those rows, ids included, because that is what the previous release wrote.
 */
function daysBeforeWalk(): readonly PlanDay[] {
  return SEED_DAYS.map((day) => ({
    ...day,
    items: day.items.filter((item) => item.exerciseId !== WALK_EXERCISE_ID),
  }));
}

/** The stored day's last row, when it is the walk. */
function closingWalk(day: PlanDay | undefined): PlanItem | undefined {
  const last = day?.items.at(-1);
  return last?.exerciseId === WALK_EXERCISE_ID ? last : undefined;
}

/** The walk as the seed prescribes it: one entry of twenty minutes, nothing else. */
const WALK_PRESCRIPTION = {
  sets: 1,
  repRange: { lowerBound: 1, upperBound: 1 },
  targetRIR: { lowerBound: 4, upperBound: 5 },
  restSeconds: 0,
  role: 'conditioning',
  durationSeconds: 1200,
} as const;

/** A day as an earlier release wrote it: only the name and the exercise order matter here. */
function dayOf(
  id: string,
  name: string,
  order: number,
  exerciseIds: readonly string[],
): PlanDay {
  return {
    id,
    name,
    order,
    items: exerciseIds.map((exerciseId, index) => ({
      id: `${id}-item-${String(index + 1)}`,
      planDayId: id,
      order: index,
      exerciseId,
      exerciseNameSnapshot: seedNameOf(exerciseId),
      prescription: {
        sets: 3,
        repRange: { lowerBound: 8, upperBound: 10 },
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: 120,
      },
    })),
  };
}

/**
 * The four days as the release before odd/tasks/three-lift-plan.md S2 wrote them: the bare
 * names, the Romanian deadlift on day one and no conventional deadlift anywhere in the
 * plan.
 *
 * Written out from the previous table rather than read from the seed, because the seed no
 * longer has them — and because a device in the wild does.
 */
function previousReleaseDays(): readonly PlanDay[] {
  return [
    dayOf('seed-day-leg', 'PIERNA', 0, [
      'seed-ex-sentadilla-trasera',
      'seed-ex-peso-muerto-rumano',
      'seed-ex-prensa',
      'seed-ex-curl-femoral-sentado',
      'seed-ex-nordic-asistido',
      'seed-ex-copenhagen-adaptado',
      'seed-ex-gemelos',
      'seed-ex-soleo-sentado',
      'seed-ex-caminata-inclinada',
    ]),
    dayOf('seed-day-torso-a', 'TORSO A', 1, [
      'seed-ex-press-banca',
      'seed-ex-remo-barra',
      'seed-ex-jalon-pecho',
      'seed-ex-press-hombro',
      'seed-ex-elevaciones-laterales',
      'seed-ex-curl-barra',
      'seed-ex-extensiones-triceps',
      'seed-ex-caminata-inclinada',
    ]),
    dayOf('seed-day-torso-b', 'TORSO B', 2, [
      'seed-ex-press-banca-inclinado',
      'seed-ex-remo-maquina',
      'seed-ex-dominadas-asistidas',
      'seed-ex-press-hombro-maquina',
      'seed-ex-face-pull',
      'seed-ex-curl-polea',
      'seed-ex-extension-triceps-mancuerna',
      'seed-ex-caminata-inclinada',
    ]),
    dayOf(FISICO_ID, 'MOVILIDAD Y CORE', 3, [
      'seed-ex-movilidad-cadera-90-90',
      'seed-ex-movilidad-toracica-cuadrupedia',
      'seed-ex-plancha',
      'seed-ex-plancha-lateral',
      'seed-ex-bird-dog',
      'seed-ex-copenhagen-adaptado',
      'seed-ex-caminata-inclinada',
    ]),
  ];
}

describe('the three-lift rename', () => {
  it('rewrites the three strength days of the previous release under the same ids', async () => {
    // odd/tasks/three-lift-plan.md S9: the ids are the identity. A session closed on
    // `seed-day-leg` keeps pointing at that day, and the day now says what it trains. The
    // fourth day is not rewritten because S7 left it exactly as it was.
    const store = fakeStore({
      planDays: previousReleaseDays(),
      exercises: [...SEED_EXERCISES],
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(3);

    expect(store.written.planDays).toEqual(
      SEED_DAYS.filter((day) => day.id !== FISICO_ID).map((day) => day.id),
    );
    for (const day of SEED_DAYS) {
      const refreshed = store.planDays.get(day.id);
      expect(refreshed?.name, day.id).toBe(day.name);
      expect(
        refreshed?.items.map((item) => item.exerciseId),
        day.id,
      ).toEqual(day.items.map((item) => item.exerciseId));
    }
  });

  it('leaves a day the owner edited alone, and rewrites the two it did not', async () => {
    // S10: the test is exact. A day that differs in name, count or order is the owner's.
    const before = previousReleaseDays();
    const [leg, ...rest] = before;
    if (leg === undefined) throw new Error('the previous release lost its first day');
    const mine = edited(leg);
    const store = fakeStore({
      planDays: [mine, ...rest],
      exercises: [...SEED_EXERCISES],
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(2);
    expect(store.planDays.get(leg.id)).toEqual(mine);
  });
});

describe('the closing walk of the seeded days', () => {
  it('gives a store that already has the four days the walk, once, at the end of each', async () => {
    // S1 and S5: the twenty minutes land on the plan a device already holds, as the last
    // row of every seeded day, without rewriting anything that was there.
    const before = daysBeforeWalk();
    const store = fakeStore({
      planDays: before,
      exercises: SEED_EXERCISES.filter((row) => row.id !== WALK_EXERCISE_ID),
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(4);

    // S3: the exercise the plan now names is the library row that already exists, seeded
    // before the plan rows because a day cannot be written before the rows it names.
    expect(store.written.exercises).toEqual([WALK_EXERCISE_ID]);
    expect(store.written.planDays).toEqual(SEED_DAYS.map((day) => day.id));

    for (const day of before) {
      const refreshed = store.planDays.get(day.id);
      expect(closingWalk(refreshed)?.prescription, day.id).toEqual(WALK_PRESCRIPTION);
      // Nothing moved: the owner's rows keep their ids, their order and their numbers.
      expect(refreshed?.items.slice(0, day.items.length), day.id).toEqual(day.items);
      expect(refreshed?.items, day.id).toHaveLength(day.items.length + 1);
    }
  });

  it('adds it once: the launch after it has nothing to do', async () => {
    const store = fakeStore({ planDays: daysBeforeWalk(), exercises: [...SEED_EXERCISES] });

    expect(await refreshSeededPlanDays(store.storage)).toBe(4);

    const readsAfterFirst = store.reads.length;
    expect(await refreshSeededPlanDays(store.storage)).toBe(0);
    // One read and no write: a store that already ends in the walk costs nothing.
    expect(store.reads.slice(readsAfterFirst)).toEqual(['plan']);
    expect(store.written.planDays).toHaveLength(4);
  });

  it('never gives the walk to a day the seed did not write', async () => {
    const mine = edited({ id: 'day-mine' });
    const store = fakeStore({
      planDays: [...daysBeforeWalk(), mine],
      exercises: [...SEED_EXERCISES],
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(4);

    expect(store.written.planDays).not.toContain(mine.id);
    expect(store.planDays.get(mine.id)).toEqual(mine);
  });

  it('appends the walk and rewrites nothing: ids, order and numbers stay', async () => {
    // The owner's own numbers on a seeded day survive the append. The refresh may add one
    // row; it may not touch the ones history was trained against.
    const [leg] = daysBeforeWalk();
    if (leg === undefined) throw new Error('the seed lost the leg day');
    const [first, ...rest] = leg.items;
    if (first === undefined) throw new Error('the leg day lost its strength lift');
    const editedLeg: PlanDay = {
      ...leg,
      items: [
        { ...first, prescription: { ...first.prescription, sets: 5, restSeconds: 240 } },
        ...rest,
      ],
    };
    const store = fakeStore({
      planDays: [editedLeg, ...daysBeforeWalk().slice(1)],
      exercises: [...SEED_EXERCISES],
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(4);

    const refreshed = store.planDays.get(editedLeg.id);
    expect(refreshed?.items.slice(0, editedLeg.items.length)).toEqual(editedLeg.items);
    expect(refreshed?.name).toBe(editedLeg.name);
    expect(refreshed?.order).toBe(editedLeg.order);
  });

  it('does not revive an archived walk row, and still closes the days with it', async () => {
    const archived: Exercise = {
      ...SEED_EXERCISES.filter((row) => row.id === WALK_EXERCISE_ID)[0]!,
      isArchived: true,
    };
    const store = fakeStore({
      planDays: daysBeforeWalk(),
      exercises: SEED_EXERCISES.map((row) => (row.id === WALK_EXERCISE_ID ? archived : row)),
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(4);

    // The library refresh's rule holds here too: the owner's isArchived decision wins.
    expect(store.written.exercises).toEqual([]);
    expect(store.exercises.get(WALK_EXERCISE_ID)?.isArchived).toBe(true);
    expect(closingWalk(store.planDays.get(FISICO.id))).toBeDefined();
  });

  it('writes a missing day once, and closes the three it found, in one launch', async () => {
    const store = fakeStore({
      planDays: daysBeforeWalk().slice(0, 3),
      exercises: SEED_EXERCISES.filter((row) => row.id !== WALK_EXERCISE_ID),
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(4);
    expect([...store.written.planDays].sort()).toEqual(
      SEED_DAYS.map((day) => day.id).sort(),
    );
  });
});

/* ------------------------------ three sets of eight (prescription-3x8 S3) */

const SQUAT_EXERCISE_ID = 'seed-ex-sentadilla-trasera';
const PRESS_BANCA_EXERCISE_ID = 'seed-ex-press-banca';

/**
 * The prescription the release before this one wrote on each lifting column, at block 1.
 *
 * Read off `git show HEAD:src/core/engine/readaptation.ts` and `HEAD:src/core/seed/plan.ts`:
 * `strength` and `hypertrophy` carried `3 × 8–10` at RIR 0, `accessory` `2 × 8–10` at RIR 0,
 * and the squat overrode the RIR to 1 in the seed row. The rest intervals are §7's
 * (180 / 120 / 90 s), which this release does not change.
 *
 * Written out here rather than read from the seed, because the seed no longer has them —
 * and because a device in the wild does.
 */
const PREVIOUS_STRENGTH: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 8, upperBound: 10 },
  targetRIR: { lowerBound: 0, upperBound: 0 },
  restSeconds: 180,
  role: 'strength',
};
const PREVIOUS_HYPERTROPHY: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 8, upperBound: 10 },
  targetRIR: { lowerBound: 0, upperBound: 0 },
  restSeconds: 120,
  role: 'hypertrophy',
};
const PREVIOUS_ACCESSORY: ExercisePrescription = {
  sets: 2,
  repRange: { lowerBound: 8, upperBound: 10 },
  targetRIR: { lowerBound: 0, upperBound: 0 },
  restSeconds: 90,
  role: 'accessory',
};
/** The squat's own override: the strength column plus one repetition in reserve. */
const PREVIOUS_SQUAT: ExercisePrescription = {
  ...PREVIOUS_STRENGTH,
  targetRIR: { lowerBound: 1, upperBound: 1 },
};

/** What this release prescribes on a strength day: three sets of eight at 1 RIR. */
const TODAYS_STRENGTH: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 8, upperBound: 8 },
  targetRIR: { lowerBound: 1, upperBound: 1 },
  restSeconds: 180,
  role: 'strength',
};

/**
 * The store a device seeded by the previous release holds.
 *
 * The day ids, names and item ids are the ones that release wrote — the three-lift rename
 * predates it — so the only thing that changed is the numbers this release rewrites. The
 * preventive and conditioning rows are copied as the seed has them, because that release
 * prescribed them exactly like this one still does (S6, S7).
 */
function previousReleaseStore(): readonly PlanDay[] {
  return SEED_DAYS.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      const role = item.prescription.role;
      if (role === 'strength') {
        return {
          ...item,
          prescription: {
            ...(item.exerciseId === SQUAT_EXERCISE_ID ? PREVIOUS_SQUAT : PREVIOUS_STRENGTH),
          },
        };
      }
      if (role === 'hypertrophy') {
        return { ...item, prescription: { ...PREVIOUS_HYPERTROPHY } };
      }
      if (role === 'accessory') {
        return { ...item, prescription: { ...PREVIOUS_ACCESSORY } };
      }
      return item;
    }),
  }));
}

/** Is this row one of the three columns this release rewrites? */
function isLifting(role: string | undefined): boolean {
  return role === 'strength' || role === 'hypertrophy' || role === 'accessory';
}

function dayById(days: readonly PlanDay[], id: string): PlanDay {
  const day = days.find((row) => row.id === id);
  if (day === undefined) throw new Error(`the store lost ${id}`);
  return day;
}

function itemOf(day: PlanDay | undefined, id: string): PlanItem | undefined {
  return day?.items.find((row) => row.id === id);
}

function itemOfExercise(day: PlanDay, exerciseId: string): PlanItem {
  const item = day.items.find((row) => row.exerciseId === exerciseId);
  if (item === undefined) throw new Error(`${day.id} lost ${exerciseId}`);
  return item;
}

describe('the three sets of eight on the stored lifting rows', () => {
  it('brings the strength, hypertrophy and accessory rows up to the numbers of this release', async () => {
    const before = previousReleaseStore();
    const store = fakeStore({ planDays: before, exercises: [...SEED_EXERCISES] });

    // The three lifting days. The mobility day is preventive and conditioning, and this
    // release has nothing to say about it.
    expect(await refreshSeededPlanDays(store.storage)).toBe(3);
    expect(store.written.planDays).toEqual([
      'seed-day-leg',
      'seed-day-torso-a',
      'seed-day-torso-b',
    ]);

    let checked = 0;
    for (const day of SEED_DAYS) {
      for (const seedItem of day.items) {
        const role = seedItem.prescription.role;
        if (!isLifting(role)) continue;
        checked += 1;
        // S3 and S4: three sets of eight at 1 RIR, on every lifting row of the three days.
        expect(itemOf(store.planDays.get(day.id), seedItem.id)?.prescription, seedItem.id).toEqual(
          {
            ...TODAYS_STRENGTH,
            restSeconds: seedItem.prescription.restSeconds,
            role,
          },
        );
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('gives the squat the row the press has, with its identity untouched', async () => {
    const before = previousReleaseStore();
    const squatBefore = itemOfExercise(dayById(before, 'seed-day-leg'), SQUAT_EXERCISE_ID);
    const store = fakeStore({ planDays: before, exercises: [...SEED_EXERCISES] });

    await refreshSeededPlanDays(store.storage);

    const squat = itemOf(store.planDays.get('seed-day-leg'), squatBefore.id);
    const press = itemOf(store.planDays.get('seed-day-torso-a'), 'seed-item-torso-a-1');
    // S5: the squat stopped being a special case, so it reads the column like the press.
    expect(squat?.prescription).toEqual(TODAYS_STRENGTH);
    expect(squat?.prescription).toEqual(press?.prescription);
    // Only the prescription changes: the row keeps saying what it is and where it lives.
    expect(squat).toEqual({ ...squatBefore, prescription: TODAYS_STRENGTH });
  });

  it('leaves a row the owner edited alone, whichever field they changed', async () => {
    const edits: readonly {
      readonly name: string;
      readonly edit: (prescription: ExercisePrescription) => ExercisePrescription;
    }[] = [
      { name: 'sets', edit: (p) => ({ ...p, sets: p.sets + 1 }) },
      { name: 'repRange', edit: (p) => ({ ...p, repRange: { lowerBound: 6, upperBound: 8 } }) },
      { name: 'targetRIR', edit: (p) => ({ ...p, targetRIR: { lowerBound: 2, upperBound: 3 } }) },
      { name: 'restSeconds', edit: (p) => ({ ...p, restSeconds: 240 }) },
      { name: 'role', edit: (p) => ({ ...p, role: 'hypertrophy' }) },
    ];

    for (const { name, edit } of edits) {
      const before = previousReleaseStore();
      const leg = dayById(before, 'seed-day-leg');
      const squatBefore = itemOfExercise(leg, SQUAT_EXERCISE_ID);
      const mine = edit(squatBefore.prescription);
      const touched: PlanDay = {
        ...leg,
        items: leg.items.map((item) =>
          item.id === squatBefore.id ? { ...item, prescription: mine } : item,
        ),
      };
      const store = fakeStore({
        planDays: before.map((day) => (day.id === leg.id ? touched : day)),
        exercises: [...SEED_EXERCISES],
      });

      await refreshSeededPlanDays(store.storage);

      // The day was written — the other rows of it moved — so this is not a test that
      // passes because nothing happened.
      expect(store.written.planDays, name).toContain(leg.id);
      const untouchedPress = itemOf(store.planDays.get(leg.id), 'seed-item-leg-2');
      expect(untouchedPress?.prescription, name).toEqual({
        ...TODAYS_STRENGTH,
        role: 'hypertrophy',
        restSeconds: PREVIOUS_HYPERTROPHY.restSeconds,
      });

      // The test is exact on purpose: a row that differs in any field is the owner's.
      const after = itemOf(store.planDays.get(leg.id), squatBefore.id);
      expect(after?.prescription, name).toEqual(mine);
      expect(after, name).toEqual({ ...squatBefore, prescription: mine });
    }
  });

  it('leaves a custom day alone, even when its numbers look like the old ones', async () => {
    const mine: PlanDay = {
      id: 'day-mine',
      name: 'MI DÍA',
      order: 7,
      items: [
        {
          id: 'day-mine-1',
          planDayId: 'day-mine',
          order: 0,
          exerciseId: PRESS_BANCA_EXERCISE_ID,
          exerciseNameSnapshot: 'Press banca',
          prescription: { ...PREVIOUS_STRENGTH },
        },
        {
          // The id carries the seed's prefix, but the day it lives on is not the seed's.
          id: 'seed-item-mine-1',
          planDayId: 'day-mine',
          order: 1,
          exerciseId: SQUAT_EXERCISE_ID,
          exerciseNameSnapshot: 'Sentadilla trasera',
          prescription: { ...PREVIOUS_SQUAT },
        },
      ],
    };
    const store = fakeStore({
      planDays: [...previousReleaseStore(), mine],
      exercises: [...SEED_EXERCISES],
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(3);

    expect(store.written.planDays).not.toContain(mine.id);
    expect(store.planDays.get(mine.id)).toEqual(mine);
  });

  it('leaves the preventive and conditioning rows byte-identical', async () => {
    const before = previousReleaseStore();
    const store = fakeStore({ planDays: before, exercises: [...SEED_EXERCISES] });

    // The lifting rows move in the same launch, so a store that keeps its preventive and
    // conditioning rows is a decision and not a refresh that did nothing.
    expect(await refreshSeededPlanDays(store.storage)).toBe(3);

    let checked = 0;
    for (const day of before) {
      for (const item of day.items) {
        const role = item.prescription.role;
        // S6 and S7: untouched by this release, in the numbers and in the profile.
        if (role !== 'preventive' && role !== 'conditioning') continue;
        checked += 1;
        expect(JSON.stringify(itemOf(store.planDays.get(day.id), item.id)), `${day.id}`).toBe(
          JSON.stringify(item),
        );
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is idempotent: the launch after it writes nothing', async () => {
    const store = fakeStore({
      planDays: previousReleaseStore(),
      exercises: [...SEED_EXERCISES],
    });

    expect(await refreshSeededPlanDays(store.storage)).toBe(3);

    const readsAfterFirst = store.reads.length;
    const writtenAfterFirst = [...store.written.planDays];
    expect(await refreshSeededPlanDays(store.storage)).toBe(0);
    // One read and no write: a store already carrying today's numbers costs nothing.
    expect(store.reads.slice(readsAfterFirst)).toEqual(['plan']);
    expect(store.written.planDays).toEqual(writtenAfterFirst);
  });
});
