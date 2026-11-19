/**
 * The prescription catch-up over the real store (`odd/tasks/backlog-closeout.md` S2).
 *
 * The fake port in `plan-refresh.test.ts` cannot see what IndexedDB does through
 * `plan.save`: it replaces a day's whole item list and deletes the rows the list does not
 * name (`src/storage/repositories/plan.ts`). So the rule that brings a device's stored
 * prescriptions up to date is pinned here, where a delete or a renumbering would show.
 *
 * The fixture is written from the numbers the release before the catch-up shipped, not
 * from today's seed: a store in the wild holds those, and today's numbers would make the
 * test pass by doing nothing.
 */

import { describe, expect, it } from 'vitest';
import * as fakeIndexedDb from 'fake-indexeddb';
import {
  createStorage,
  type ExercisePrescription,
  type PlanDay,
  type PlanItem,
  type StoragePort,
} from '../../storage';
import { seedPlanDays } from '../../core/seed';
import { refreshSeededPlanDays } from './plan-refresh';

/** The strength column before the catch-up: three sets, `8-10`, to failure, `180 s`. */
const OLD_STRENGTH: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 8, upperBound: 10 },
  targetRIR: { lowerBound: 0, upperBound: 0 },
  restSeconds: 180,
  role: 'strength',
};

/** The squat's own override: the same row, one rep in reserve. */
const OLD_SQUAT: ExercisePrescription = {
  ...OLD_STRENGTH,
  targetRIR: { lowerBound: 1, upperBound: 1 },
};

/** The hypertrophy column: same numbers, the compound rest interval. */
const OLD_HYPERTROPHY: ExercisePrescription = {
  ...OLD_STRENGTH,
  restSeconds: 120,
  role: 'hypertrophy',
};

/** The accessory column: two sets, `8-10`, to failure, the isolation rest interval. */
const OLD_ACCESSORY: ExercisePrescription = {
  sets: 2,
  repRange: { lowerBound: 8, upperBound: 10 },
  targetRIR: { lowerBound: 0, upperBound: 0 },
  restSeconds: 90,
  role: 'accessory',
};

/** A brand new in-memory IndexedDB for one test, so no store survives into the next. */
function freshIndexedDb(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(fakeIndexedDb)) globals[name] = value;
  globals['indexedDB'] = new (
    fakeIndexedDb as unknown as { IDBFactory: new () => unknown }
  ).IDBFactory();
}

/** The four days as the previous release stored them, through `plan.save`. */
async function storeOf(days: readonly PlanDay[]): Promise<StoragePort> {
  freshIndexedDb();
  const storage = createStorage();
  await storage.open();
  for (const day of days) await storage.plan.save(day);
  return storage;
}

function previousPrescriptionOf(item: PlanItem): ExercisePrescription | undefined {
  if (item.exerciseId === 'seed-ex-sentadilla-trasera') return { ...OLD_SQUAT };
  switch (item.prescription.role) {
    case 'strength':
      return { ...OLD_STRENGTH };
    case 'hypertrophy':
      return { ...OLD_HYPERTROPHY };
    case 'accessory':
      return { ...OLD_ACCESSORY };
    default:
      return undefined;
  }
}

/** Today's seed day, with the lifting rows carrying the previous release's numbers. */
function previousReleaseDays(): readonly PlanDay[] {
  return seedPlanDays().map((day) => ({
    ...day,
    items: day.items.map((item) => {
      const old = previousPrescriptionOf(item);
      return old === undefined ? { ...item } : { ...item, prescription: old };
    }),
  }));
}

function todayPrescriptionOf(itemId: string): ExercisePrescription | undefined {
  for (const day of seedPlanDays()) {
    for (const item of day.items) if (item.id === itemId) return item.prescription;
  }
  return undefined;
}

const LIFTING = new Set(['strength', 'hypertrophy', 'accessory']);

describe('the prescription catch-up through the real store (S2)', () => {
  it('brings every lifting row up to date and deletes, renumbers or renames nothing', async () => {
    const before = previousReleaseDays();
    const storage = await storeOf(before);

    // The three strength days are rewritten; the mobility day is already today's.
    expect(await refreshSeededPlanDays(storage)).toBe(3);

    const after = await storage.plan.all();
    expect(after).toHaveLength(before.length);

    for (const day of before) {
      const stored = after.find((candidate) => candidate.id === day.id);
      expect(stored, day.id).toBeDefined();
      if (stored === undefined) continue;

      // Identity is the store's: same rows, same ids, same order, same snapshots.
      expect(
        stored.items.map((item) => [item.id, item.planDayId, item.order, item.exerciseNameSnapshot]),
        day.id,
      ).toEqual(
        day.items.map((item) => [item.id, item.planDayId, item.order, item.exerciseNameSnapshot]),
      );

      for (const item of day.items) {
        const row = stored.items.find((candidate) => candidate.id === item.id);
        expect(row, item.id).toBeDefined();
        if (row === undefined) continue;
        if (LIFTING.has(item.prescription.role ?? '')) {
          expect(row.prescription, item.id).toEqual(todayPrescriptionOf(item.id));
        }
      }
    }
  });

  it('leaves the preventive and conditioning rows byte-identical, and really does work', async () => {
    const storage = await storeOf(previousReleaseDays());

    expect(await refreshSeededPlanDays(storage)).toBe(3);

    const after = await storage.plan.all();
    for (const day of previousReleaseDays()) {
      const stored = after.find((candidate) => candidate.id === day.id);
      for (const item of day.items) {
        if (LIFTING.has(item.prescription.role ?? '')) continue;
        const row = stored?.items.find((candidate) => candidate.id === item.id);
        expect(JSON.stringify(row), item.id).toBe(JSON.stringify(item));
      }
    }
  });

  it('rewrites a strength row the owner put at 1 RIR, keeping its rest and role', async () => {
    // The documented collision (`odd/tasks/prescription-3x8.md` L9): the squat's old row and
    // a strength row an owner set to 1 RIR are the same six fields, so the catch-up cannot
    // tell them apart and rewrites both to today's numbers. What it must not do is move the
    // rest interval or the profile, or the wrong row would be "fixed".
    const days = previousReleaseDays();
    const leg = days.find((day) => day.id === 'seed-day-torso-a');
    if (leg === undefined) throw new Error('the previous release lost its second day');
    const press = leg.items.find((item) => item.exerciseId === 'seed-ex-press-banca');
    if (press === undefined) throw new Error('the second day lost its press');
    const edited: PlanDay = {
      ...leg,
      items: leg.items.map((item) =>
        item.id === press.id ? { ...item, prescription: { ...OLD_SQUAT } } : item,
      ),
    };
    const store = await storeOf(days.map((day) => (day.id === leg.id ? edited : day)));

    await refreshSeededPlanDays(store);

    const stored = (await store.plan.all()).find((day) => day.id === leg.id);
    const row = stored?.items.find((item) => item.id === press.id);
    expect(row?.prescription).toEqual(todayPrescriptionOf(press.id));
    expect(row?.prescription.role).toBe('strength');
    expect(row?.prescription.restSeconds).toBe(180);
  });

  it('keeps a row the owner pruned, and still catches up on the rest of the day', async () => {
    const store = await storeOf(previousReleaseDays());
    const leg = (await store.plan.all()).find((day) => day.id === 'seed-day-leg');
    if (leg === undefined) throw new Error('the store lost the first day');
    const prunedId = 'seed-item-leg-6';

    await store.plan.save({ ...leg, items: leg.items.filter((item) => item.id !== prunedId) });
    await refreshSeededPlanDays(store);

    const after = (await store.plan.all()).find((day) => day.id === 'seed-day-leg');
    expect(after?.items.map((item) => item.id)).not.toContain(prunedId);
    const squatted = after?.items.find((item) => item.id === 'seed-item-leg-1');
    expect(squatted?.prescription).toEqual(todayPrescriptionOf('seed-item-leg-1'));
  });

  it('does nothing on the launch after it', async () => {
    const store = await storeOf(previousReleaseDays());

    expect(await refreshSeededPlanDays(store)).toBe(3);
    const settled = await store.plan.all();

    expect(await refreshSeededPlanDays(store)).toBe(0);
    expect(await store.plan.all()).toEqual(settled);
  });

  it('leaves a custom day, a custom row and a renamed day alone', async () => {
    const days = previousReleaseDays();
    const mine: PlanDay = {
      id: 'day-mine',
      name: 'MI DÍA',
      order: 9,
      items: [
        {
          id: 'item-mine-1',
          planDayId: 'day-mine',
          order: 0,
          exerciseId: 'seed-ex-press-banca',
          exerciseNameSnapshot: 'Press banca',
          prescription: { ...OLD_STRENGTH },
        },
      ],
    };
    const renamed = days
      .filter((day) => day.id === 'seed-day-torso-b')
      .map((day) => ({ ...day, name: 'MI PESO MUERTO' }));
    const store = await storeOf([...days, mine, ...renamed]);

    await refreshSeededPlanDays(store);

    const after = await store.plan.all();
    expect(after.find((day) => day.id === 'day-mine')).toEqual(mine);
    // A renamed day is the owner's: it keeps its previous numbers and its name.
    const kept = after.find((day) => day.id === 'seed-day-torso-b');
    expect(kept?.name).toBe('MI PESO MUERTO');
    expect(kept?.items[0]?.prescription).toEqual(OLD_STRENGTH);
  });

  it('fills a missing library row before it writes the day that names it', async () => {
    // The catch-up writes plan rows, so the exercises they name must exist first or the day
    // would point at nothing. Asserted on the result, not on a count: every exercise a
    // rewritten day names is in the library afterwards.
    const store = await storeOf(previousReleaseDays());

    await refreshSeededPlanDays(store);

    const known = new Set((await store.exercises.all()).map((exercise) => exercise.id));
    const written = (await store.plan.all()).filter((day) => day.id !== 'seed-day-fisico');
    for (const day of written) {
      for (const item of day.items) {
        if (item.exerciseId === null) continue;
        expect(known.has(item.exerciseId), `${day.id}: ${item.exerciseId}`).toBe(true);
      }
    }
  });
});
