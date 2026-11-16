/**
 * `confirmSet` as the one writer of a set: the append of §5.4 and the rewrite a correction
 * needs (odd/tasks/edit-set.md S3, S6).
 *
 * Everything here goes through `createStorage` — the public port — over `fake-indexeddb`,
 * because the rule being pinned is a rule of the *database*: one transaction, one row per
 * slot, and a refusal that leaves the store exactly as it was. No internals, no in-memory
 * double.
 *
 * The two paths of the method are the two things an owner can do to a set list:
 *
 * - **append** — `Registrar serie` writes the next slot; the index must extend the list by
 *   exactly one and a stored id is refused. This is the behaviour the sheet already had.
 * - **rewrite** — `Guardar` of a correction writes a slot that is already stored. Same
 *   session, same exercise, same id, same index; only the four answers change. It can never
 *   append: an index with no stored row goes down the append path, which refuses it unless
 *   it extends the list.
 */

import { describe, expect, it } from 'vitest';
import * as fakeIndexedDb from 'fake-indexeddb';
import { DISCOMFORT, EFFORT } from '../../core/domain';
import {
  createStorage,
  type ExercisePrescription,
  type IndexedDbStorage,
  type SetRecord,
  type WorkoutSession,
} from '../index';

/** Wednesday 4 March 2026, 18:00 local. */
const NOW = new Date(2026, 2, 4, 18, 0, 0).getTime();

const PRESCRIPTION: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 8, upperBound: 10 },
  targetRIR: { lowerBound: 2, upperBound: 3 },
  restSeconds: 180,
};

const SESSION_ID = 'session-correct';
const EXERCISE_SESSION_ID = 'xs-correct';

function storedSet(
  index: number,
  weightKg: number,
  actualReps: number,
  effort: SetRecord['effort'] = EFFORT.correct,
  discomfort: SetRecord['discomfort'] = null,
  confirmedAt = NOW - (4 - index) * 60_000,
): SetRecord {
  return {
    id: `${EXERCISE_SESSION_ID}:${index}`,
    index,
    weightKg,
    targetReps: 8,
    actualReps,
    effort,
    discomfort,
    confirmedAt,
  };
}

function scheduledSession(): WorkoutSession {
  return {
    id: SESSION_ID,
    planDayId: 'plan-day-1',
    dayNameSnapshot: 'MIÉRCOLES / CUERPO COMPLETO',
    scheduledDate: NOW - 30 * 60_000,
    startedAt: null,
    endedAt: null,
    phase: { kind: 'readaptation', week: 2 },
    status: 'scheduled',
    exercises: [
      {
        id: EXERCISE_SESSION_ID,
        order: 1,
        exerciseId: 'ex-peso-muerto',
        exerciseNameSnapshot: 'Peso muerto',
        prescription: PRESCRIPTION,
        recommendation: null,
        decision: null,
        recommendedWeightKg: null,
        usedWeightKg: null,
        loadDeltaKg: null,
        sets: [],
        status: 'pending',
        completedAt: null,
      },
    ],
  };
}

/** A fresh fake IndexedDB per test: the store is the unit under test, not a fixture. */
function freshIndexedDb(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(fakeIndexedDb)) {
    globals[name] = value;
  }
  const factory = new (fakeIndexedDb as unknown as { IDBFactory: new () => unknown }).IDBFactory();
  globals['indexedDB'] = factory;
}

async function openStore(): Promise<IndexedDbStorage> {
  freshIndexedDb();
  const storage = createStorage();
  await storage.open();
  await storage.sessions.create(scheduledSession());
  return storage;
}

/** The stored set list of the one exercise, as the app reads it back. */
async function setsOf(storage: IndexedDbStorage): Promise<readonly SetRecord[]> {
  const stored = await storage.sessions.byId(SESSION_ID);
  return stored?.exercises[0]?.sets ?? [];
}

/** One session with two sets already confirmed at 92,5 kg — the correction's starting point. */
async function withTwoSets(): Promise<IndexedDbStorage> {
  const storage = await openStore();
  await storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, storedSet(1, 92.5, 10));
  await storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, storedSet(2, 92.5, 10));
  return storage;
}

describe('rewriting a set that is already stored (S3, S6)', () => {
  it('changes the answers of that slot and keeps its id, its index and its instant', async () => {
    const storage = await withTwoSets();
    const before = await setsOf(storage);

    try {
      const corrected: SetRecord = {
        ...storedSet(1, 92.5, 10),
        weightKg: 95,
        actualReps: 8,
        effort: EFFORT.easy,
        discomfort: DISCOMFORT.mild,
      };
      await storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, corrected);

      const after = await setsOf(storage);
      expect(after).toHaveLength(2);
      expect(after[0]).toEqual(corrected);
      // Identity is the set's, not the write's: the same row, corrected.
      expect(after[0]?.id).toBe(before[0]?.id);
      expect(after[0]?.index).toBe(1);
      expect(after[0]?.confirmedAt).toBe(before[0]?.confirmedAt);
      expect(after[0]?.targetReps).toBe(before[0]?.targetReps);
    } finally {
      storage.close();
    }
  });

  it('leaves every other set, and the exercise around them, untouched', async () => {
    const storage = await withTwoSets();
    const beforeSession = await storage.sessions.byId(SESSION_ID);
    const before = await setsOf(storage);

    try {
      await storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, {
        ...storedSet(2, 92.5, 10),
        weightKg: 90,
        actualReps: 9,
        effort: EFFORT.hard,
      });

      const afterSession = await storage.sessions.byId(SESSION_ID);
      const after = await setsOf(storage);

      // Set 1 is the very same value it was: same kilos, same reps, same instant.
      expect(after[0]).toEqual(before[0]);
      expect(after).toHaveLength(2);
      // A correction is not a start and not a decision: the session keeps its instant and
      // its status, and the exercise keeps the load it was decided at (I-8).
      expect(afterSession?.status).toBe('inProgress');
      expect(afterSession?.startedAt).toBe(beforeSession?.startedAt);
      expect(afterSession?.exercises[0]?.decision).toEqual(beforeSession?.exercises[0]?.decision);
      expect(afterSession?.exercises[0]?.usedWeightKg).toBe(
        beforeSession?.exercises[0]?.usedWeightKg,
      );
      expect(afterSession?.exercises[0]?.loadDeltaKg).toBe(
        beforeSession?.exercises[0]?.loadDeltaKg,
      );
    } finally {
      storage.close();
    }
  });

  it('survives a reload and still closes the session afterwards', async () => {
    const storage = await withTwoSets();

    try {
      await storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, {
        ...storedSet(1, 92.5, 10),
        weightKg: 100,
        actualReps: 6,
      });
      // The rows are committed, not held in a transaction: a second read sees them.
      const reread = await setsOf(storage);
      expect(reread[0]?.weightKg).toBe(100);
      expect(reread[0]?.actualReps).toBe(6);

      const closed = await storage.sessions.finish(SESSION_ID, 'partial', NOW);
      expect(closed.status).toBe('partial');
      expect((await setsOf(storage))[0]?.weightKg).toBe(100);
    } finally {
      storage.close();
    }
  });
});

describe('what the writer refuses (S5, S6)', () => {
  it('refuses to rewrite a set of a session that is not open', async () => {
    const storage = await withTwoSets();

    try {
      await storage.sessions.finish(SESSION_ID, 'completed', NOW);
      const before = await setsOf(storage);

      await expect(
        storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, {
          ...storedSet(1, 92.5, 10),
          weightKg: 120,
        }),
      ).rejects.toMatchObject({ code: 'invalidTransition' });

      // Nothing moved: the closed session keeps exactly the sets it closed with.
      expect(await setsOf(storage)).toEqual(before);
      expect((await storage.sessions.byId(SESSION_ID))?.status).toBe('completed');
    } finally {
      storage.close();
    }
  });

  it('refuses a slot outside the stored range, and writes nothing', async () => {
    const storage = await withTwoSets();

    try {
      const before = await setsOf(storage);

      for (const index of [0, -1, 5, 7]) {
        await expect(
          storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, {
            ...storedSet(index, 92.5, 10),
            weightKg: 120,
          }),
          `slot ${String(index)}`,
        ).rejects.toMatchObject({ code: 'invalidIndex' });
      }

      expect(await setsOf(storage)).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it('refuses a correction that would append a second row for a set that already exists', async () => {
    const storage = await withTwoSets();

    try {
      const before = await setsOf(storage);

      // The id of set 1, sent at the next index: a correction may never move a set.
      await expect(
        storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, {
          ...storedSet(1, 92.5, 10),
          index: 3,
          weightKg: 120,
        }),
      ).rejects.toMatchObject({ code: 'duplicate' });

      expect(await setsOf(storage)).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it('refuses a second set at an index that is already taken, which is not a correction', async () => {
    const storage = await withTwoSets();

    try {
      const before = await setsOf(storage);

      // A different set, sent at a slot that is occupied: a new id at an existing index is
      // a second confirmation, never a rewrite of somebody else's row.
      await expect(
        storage.sessions.confirmSet(SESSION_ID, EXERCISE_SESSION_ID, {
          ...storedSet(2, 92.5, 10),
          id: 'a-different-set',
          weightKg: 120,
        }),
      ).rejects.toMatchObject({ code: 'invalidIndex' });

      expect(await setsOf(storage)).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it('still appends the next slot, which is what `Registrar serie` sends', async () => {
    const storage = await withTwoSets();

    try {
      await storage.sessions.confirmSet(
        SESSION_ID,
        EXERCISE_SESSION_ID,
        storedSet(3, 97.5, 7, EFFORT.hard),
      );

      const after = await setsOf(storage);
      expect(after.map((set) => set.index)).toEqual([1, 2, 3]);
      expect(after[2]?.weightKg).toBe(97.5);
    } finally {
      storage.close();
    }
  });
});
