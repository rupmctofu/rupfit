/**
 * Invariants I-1..I-5, I-7..I-12 of docs/data-model.md §6, exercised through the
 * port only: nothing here reaches for an IndexedDB handle except to look at what is
 * on disk after the fact (the whole point of an invariant test).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createStorage,
  DB_NAME,
  deleteSessionConfirmation,
  isStorageError,
  type StoragePort,
} from '../../src/storage';
import {
  activity,
  days,
  exercise,
  exerciseSession,
  freshIndexedDb,
  measurement,
  nextId,
  openRaw,
  phaseState,
  planDay,
  planItem,
  prescription,
  recommendation,
  setRecord,
  T0,
  userProfile,
  workoutSession,
  type RawDatabase,
} from './harness';

let storage: StoragePort;
let raw: RawDatabase;

beforeEach(async () => {
  freshIndexedDb();
  storage = createStorage();
  await storage.open();
  raw = await openRaw(DB_NAME);
});

afterEach(() => {
  raw.close();
  storage.close();
});

describe('I-1 a set never exists without its exercise session', () => {
  it('cascades a session delete over exercise sessions and sets in one transaction', async () => {
    const session = workoutSession({ exercises: [exerciseSession(), exerciseSession({ order: 2 })] });
    await storage.sessions.create(session);
    const [first, second] = session.exercises;
    await storage.sessions.confirmSet(session.id, first!.id, setRecord({ index: 1 }));
    await storage.sessions.confirmSet(session.id, first!.id, setRecord({ index: 2 }));
    await storage.sessions.confirmSet(session.id, second!.id, setRecord({ index: 1 }));

    expect(await raw.count('sets')).toBe(3);
    expect(await raw.count('exerciseSessions')).toBe(2);

    await storage.sessions.markDeletionPending(session.id);
    await storage.sessions.delete(session.id, {
      confirmation: deleteSessionConfirmation(session.dayNameSnapshot),
    });

    expect(await raw.count('sets')).toBe(0);
    expect(await raw.count('exerciseSessions')).toBe(0);
    expect(await raw.count('sessions')).toBe(0);

    const orphans = await storage.scanOrphans();
    expect(orphans.setsWithoutExerciseSession).toBe(0);
    expect(orphans.exerciseSessionsWithoutSession).toBe(0);
  });

  it('writes nothing when the parent exercise session does not belong to the session', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);

    await expect(
      storage.sessions.confirmSet(session.id, 'not-an-exercise-session', setRecord()),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'notFound');

    expect(await raw.count('sets')).toBe(0);
    expect(await storage.scanOrphans()).toEqual({
      setsWithoutExerciseSession: 0,
      exerciseSessionsWithoutSession: 0,
      planItemsWithoutPlanDay: 0,
    });
  });
});

describe('I-2 a stored recommendation is never recomputed or rewritten', () => {
  it('keeps the frozen recommendation through confirm, decision and finish', async () => {
    const frozen = recommendation();
    const session = workoutSession({
      exercises: [exerciseSession({ recommendation: frozen, recommendedWeightKg: 100 })],
    });
    await storage.sessions.create(session);
    const exerciseSessionId = session.exercises[0]!.id;

    await storage.sessions.confirmSet(session.id, exerciseSessionId, setRecord());
    await storage.sessions.recordDecision({
      exerciseSessionId,
      decision: { kind: 'accepted' },
      recommendedWeightKg: 100,
      previousWeightKg: null,
    });
    await storage.sessions.finish(session.id, 'completed', days(0) + 3600_000);

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.recommendation).toEqual(frozen);
  });

  it('refuses to create a second row with the same id, so a start cannot overwrite a frozen session', async () => {
    const original = workoutSession({
      exercises: [exerciseSession({ recommendation: recommendation({ suggestedWeightKg: 90 }) })],
    });
    await storage.sessions.create(original);

    const replacement = workoutSession({
      id: original.id,
      exercises: [exerciseSession({ recommendation: recommendation({ suggestedWeightKg: 200 }) })],
    });

    await expect(storage.sessions.create(replacement)).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'conflict',
    );
    expect((await storage.sessions.byId(original.id))?.exercises[0]?.recommendation?.suggestedWeightKg).toBe(90);
  });
});

describe('I-3 every stored mass is kilograms', () => {
  it('stores no unit field anywhere and keeps the kilogram number unchanged', async () => {
    const library = exercise({ loadIncrementKg: 2.5 });
    await storage.exercises.save(library);

    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    await storage.sessions.confirmSet(
      session.id,
      session.exercises[0]!.id,
      setRecord({ weightKg: 102.5 }),
    );
    await storage.measurements.save(measurement({ weightKg: 82.4 }));

    for (const store of ['exercises', 'sessions', 'exerciseSessions', 'sets', 'bodyMeasurements']) {
      const rows = await raw.all<Record<string, unknown>>(store);
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          expect(key).not.toMatch(/unit|pound|lb\b|stone/i);
        }
      }
    }

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.sets[0]?.weightKg).toBe(102.5);
    expect(reloaded?.exercises[0]?.usedWeightKg).toBe(102.5);
  });
});

describe('I-4 history survives exercise rename, archive and delete', () => {
  it('reads the name snapshot after the library entry is renamed and archived', async () => {
    const library = exercise({ name: 'Sentadilla trasera' });
    await storage.exercises.save(library);
    const session = workoutSession({
      exercises: [exerciseSession({ exerciseId: library.id, exerciseNameSnapshot: library.name })],
    });
    await storage.sessions.create(session);

    await storage.exercises.save({ ...library, name: 'Sentadilla libre' });
    await storage.exercises.setArchived(library.id, true);

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.exerciseNameSnapshot).toBe('Sentadilla trasera');
    expect(reloaded?.exercises[0]?.exerciseId).toBe(library.id);
  });

  it('nulls the exercise id on deletion and keeps the snapshot name', async () => {
    const library = exercise({ name: 'Remo en polea', isCustom: true });
    await storage.exercises.save(library);
    const session = workoutSession({
      exercises: [exerciseSession({ exerciseId: library.id, exerciseNameSnapshot: library.name })],
    });
    await storage.sessions.create(session);

    await storage.exercises.remove(library.id);

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.exerciseId).toBeNull();
    expect(reloaded?.exercises[0]?.exerciseNameSnapshot).toBe('Remo en polea');
    expect(await storage.exercises.byId(library.id)).toBeUndefined();
  });
});

describe('I-5 a session with confirmed sets is deleted explicitly, never silently', () => {
  it('requires the pending flag first', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    await storage.sessions.confirmSet(session.id, session.exercises[0]!.id, setRecord());

    await expect(
      storage.sessions.delete(session.id, {
        confirmation: deleteSessionConfirmation(session.dayNameSnapshot),
      }),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'conflict');

    expect(await storage.sessions.byId(session.id)).toBeDefined();
  });

  it('requires the typed confirmation, which is the day name', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    await storage.sessions.markDeletionPending(session.id);

    expect(await storage.sessions.pendingDeletionIds()).toEqual([session.id]);

    await expect(
      storage.sessions.delete(session.id, { confirmation: 'borrar' }),
    ).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'confirmationRequired',
    );
    expect(await storage.sessions.byId(session.id)).toBeDefined();

    await storage.sessions.delete(session.id, {
      confirmation: deleteSessionConfirmation(session.dayNameSnapshot),
    });
    expect(await storage.sessions.byId(session.id)).toBeUndefined();
  });

  it('stops offering a pending-deletion session as resume or as the next session', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    await storage.sessions.confirmSet(session.id, session.exercises[0]!.id, setRecord());

    expect((await storage.sessions.inProgress())?.id).toBe(session.id);

    await storage.sessions.markDeletionPending(session.id);

    expect(await storage.sessions.inProgress()).toBeUndefined();
    expect(await storage.sessions.nextScheduledOnOrAfter(T0 - 1)).toBeUndefined();
  });
});

describe('I-7 unanswered effort and discomfort stay null', () => {
  it('preserves an unanswered set as null and an answered 0 as 0', async () => {
    const session = workoutSession({
      exercises: [exerciseSession(), exerciseSession({ order: 2 })],
    });
    await storage.sessions.create(session);
    const [first, second] = session.exercises;

    await storage.sessions.confirmSet(
      session.id,
      first!.id,
      setRecord({ index: 1, effort: null, discomfort: null }),
    );
    await storage.sessions.confirmSet(
      session.id,
      second!.id,
      setRecord({ index: 1, effort: 0, discomfort: 0 }),
    );

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.sets[0]?.effort).toBeNull();
    expect(reloaded?.exercises[0]?.sets[0]?.discomfort).toBeNull();
    expect(reloaded?.exercises[1]?.sets[0]?.effort).toBe(0);
    expect(reloaded?.exercises[1]?.sets[0]?.discomfort).toBe(0);
  });
});

describe('I-8 the load delta is computed and stored once, with the decision', () => {
  it('stores zero when the recommendation was accepted', async () => {
    const session = workoutSession({
      exercises: [exerciseSession({ recommendation: recommendation({ suggestedWeightKg: 100 }) })],
    });
    await storage.sessions.create(session);

    const updated = await storage.sessions.recordDecision({
      exerciseSessionId: session.exercises[0]!.id,
      decision: { kind: 'accepted' },
      recommendedWeightKg: 100,
      previousWeightKg: null,
    });

    expect(updated.usedWeightKg).toBe(100);
    expect(updated.loadDeltaKg).toBe(0);
  });

  it('stores the signed difference for a manual weight', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);

    const updated = await storage.sessions.recordDecision({
      exerciseSessionId: session.exercises[0]!.id,
      decision: { kind: 'manual', kg: 95 },
      recommendedWeightKg: 100,
      previousWeightKg: null,
    });

    expect(updated.usedWeightKg).toBe(95);
    expect(updated.loadDeltaKg).toBe(-5);
  });

  it('stores the previous weight for a repeated load', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);

    const updated = await storage.sessions.recordDecision({
      exerciseSessionId: session.exercises[0]!.id,
      decision: { kind: 'repeated' },
      recommendedWeightKg: 102.5,
      previousWeightKg: 100,
    });

    expect(updated.usedWeightKg).toBe(100);
    expect(updated.loadDeltaKg).toBe(-2.5);
  });

  it('leaves the delta null when there was no recommendation to differ from', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);

    const updated = await storage.sessions.recordDecision({
      exerciseSessionId: session.exercises[0]!.id,
      decision: { kind: 'manual', kg: 60 },
      recommendedWeightKg: null,
      previousWeightKg: null,
    });

    expect(updated.usedWeightKg).toBe(60);
    expect(updated.loadDeltaKg).toBeNull();
  });

  it('refuses a second decision for the same exercise session and keeps the first', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    const exerciseSessionId = session.exercises[0]!.id;

    await storage.sessions.recordDecision({
      exerciseSessionId,
      decision: { kind: 'manual', kg: 95 },
      recommendedWeightKg: 100,
      previousWeightKg: null,
    });

    await expect(
      storage.sessions.recordDecision({
        exerciseSessionId,
        decision: { kind: 'manual', kg: 120 },
        recommendedWeightKg: 100,
        previousWeightKg: null,
      }),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'conflict');

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.usedWeightKg).toBe(95);
    expect(reloaded?.exercises[0]?.loadDeltaKg).toBe(-5);
  });
});

describe('I-9 at most one session is in progress', () => {
  it('rejects the second start inside the transaction and leaves the loser untouched', async () => {
    const first = workoutSession({ exercises: [exerciseSession()] });
    const second = workoutSession({
      scheduledDate: days(1),
      exercises: [exerciseSession()],
    });
    await storage.sessions.create(first);
    await storage.sessions.create(second);

    await storage.sessions.confirmSet(first.id, first.exercises[0]!.id, setRecord({ index: 1 }));

    await expect(
      storage.sessions.confirmSet(second.id, second.exercises[0]!.id, setRecord({ index: 1 })),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'conflict');

    expect((await storage.sessions.byId(second.id))?.status).toBe('scheduled');
    expect(await raw.count('sets')).toBe(1);
    expect((await storage.sessions.inProgress())?.id).toBe(first.id);
  });

  it('holds across two connections, which is the Safari tab plus the installed app', async () => {
    const first = workoutSession({ exercises: [exerciseSession()] });
    const second = workoutSession({ scheduledDate: days(1), exercises: [exerciseSession()] });
    await storage.sessions.create(first);
    await storage.sessions.create(second);

    const other = createStorage();
    try {
      await other.open();
      const results = await Promise.allSettled([
        storage.sessions.confirmSet(first.id, first.exercises[0]!.id, setRecord({ index: 1 })),
        other.sessions.confirmSet(second.id, second.exercises[0]!.id, setRecord({ index: 1 })),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const inProgress = await storage.sessions.inProgress();
      expect(inProgress?.status).toBe('inProgress');
    } finally {
      other.close();
    }
  });
});

describe('I-10 a body measurement carries at least one measure', () => {
  it('rejects an all-null measurement and stores nothing', async () => {
    const empty = measurement({
      weightKg: null,
      waistCm: null,
      chestCm: null,
      armCm: null,
      thighCm: null,
      hipCm: null,
      bodyFatPercent: null,
    });

    await expect(storage.measurements.save(empty)).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'invalid',
    );
    expect(await raw.count('bodyMeasurements')).toBe(0);
  });

  it('accepts a measurement with a single measure', async () => {
    await storage.measurements.save(
      measurement({ weightKg: null, waistCm: 84, date: days(-3) }),
    );
    const stored = await storage.measurements.all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.waistCm).toBe(84);
  });
});

describe('I-11 re-importing the same bridge sample never duplicates', () => {
  it('lets many manual activities share the store because the unique index skips them', async () => {
    await storage.activities.save(activity({ externalSampleId: null }));
    await storage.activities.save(activity({ externalSampleId: null }));

    expect(await raw.count('activities')).toBe(2);
  });

  it('rejects a second row with the same externalSampleId, keeping the first', async () => {
    const sampleId = 'health-2026-11-08-walk';
    const first = activity({ externalSampleId: sampleId, activeEnergyKcal: 200 });
    await storage.activities.save(first);

    await expect(
      storage.activities.save(
        activity({ id: nextId('activity'), externalSampleId: sampleId, activeEnergyKcal: 999 }),
      ),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'duplicate');

    const rows = await storage.activities.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.activeEnergyKcal).toBe(200);
  });

  it('enforces uniqueness in the index itself, not only in the repository', async () => {
    await raw.put('activities', {
      id: 'a-1',
      date: T0,
      kind: 'cardio',
      durationSeconds: 600,
      activeEnergyKcal: 100,
      provenance: 'imported',
      externalSampleId: 'sample-1',
    });

    await expect(
      raw.put('activities', {
        id: 'a-2',
        date: T0,
        kind: 'cardio',
        durationSeconds: 700,
        activeEnergyKcal: 120,
        provenance: 'imported',
        externalSampleId: 'sample-1',
      }),
    ).rejects.toThrow();

    expect(await raw.count('activities')).toBe(1);
  });
});

describe('I-12 a confirmed set is committed before it is reported', () => {
  it('leaves nothing behind when the in-transaction guard refuses the write', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    const exerciseSessionId = session.exercises[0]!.id;

    // The guard rejects the write after the row has been staged inside the same
    // transaction, which is exactly the "interrupted before complete" case.
    await expect(
      storage.sessions.confirmSet(session.id, exerciseSessionId, setRecord({ index: 4 })),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'invalidIndex');

    expect(await raw.count('sets')).toBe(0);
    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.status).toBe('scheduled');
    expect(reloaded?.startedAt).toBeNull();
    expect(reloaded?.exercises[0]?.status).toBe('pending');
  });

  it('leaves nothing behind when the transaction is aborted after the write', async () => {
    const aborted = await openRaw(DB_NAME);
    try {
      const db = await import('idb').then((module) => module.openDB(DB_NAME));
      try {
        const tx = db.transaction(['sets'], 'readwrite');
        await tx.objectStore('sets').put({
          id: 'aborted-set',
          exerciseSessionId: 'any',
          sessionId: 'any',
          index: 1,
          weightKg: 100,
          targetReps: 6,
          actualReps: 6,
          effort: null,
          discomfort: null,
          confirmedAt: T0,
        } as never);
        tx.abort();
        await tx.done.catch(() => undefined);
      } finally {
        db.close();
      }
      expect(await aborted.count('sets')).toBe(0);
    } finally {
      aborted.close();
    }
  });

  it('resolves only once another connection can already read the set', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    const exerciseSessionId = session.exercises[0]!.id;

    await storage.sessions.confirmSet(session.id, exerciseSessionId, setRecord({ index: 1 }));

    const observer = createStorage();
    try {
      await observer.open();
      const observed = await observer.sessions.byId(session.id);
      expect(observed?.exercises[0]?.sets).toHaveLength(1);
    } finally {
      observer.close();
    }
  });
});

describe('§5.4 the remaining transaction contracts', () => {
  it('extends a set list only by one, in order', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    const exerciseSessionId = session.exercises[0]!.id;

    await storage.sessions.confirmSet(session.id, exerciseSessionId, setRecord({ index: 1 }));
    const afterFirst = await storage.sessions.byId(session.id);
    expect(afterFirst?.status).toBe('inProgress');
    expect(afterFirst?.startedAt).toBe(T0);

    await storage.sessions.confirmSet(session.id, exerciseSessionId, setRecord({ index: 2 }));
    await expect(
      storage.sessions.confirmSet(session.id, exerciseSessionId, setRecord({ index: 2 })),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'invalidIndex');

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.sets.map((set) => set.index)).toEqual([1, 2]);
  });

  it('refuses sets handed to create: only confirmSet writes them', async () => {
    const session = workoutSession({
      exercises: [exerciseSession({ sets: [setRecord()] })],
    });
    await expect(storage.sessions.create(session)).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'invalid',
    );
    expect(await raw.count('sessions')).toBe(0);
  });

  it('finishes a session only from inProgress, and stamps the exercises', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);

    await expect(storage.sessions.finish(session.id, 'completed', days(0) + 1000)).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'invalidTransition',
    );

    await storage.sessions.confirmSet(session.id, session.exercises[0]!.id, setRecord());
    const finished = await storage.sessions.finish(session.id, 'partial', days(0) + 1000);

    expect(finished.status).toBe('partial');
    expect(finished.endedAt).toBe(days(0) + 1000);
    expect(finished.exercises[0]?.status).toBe('skipped');
    expect(finished.exercises[0]?.completedAt).toBe(days(0) + 1000);

    await expect(
      storage.sessions.finish(session.id, 'completed', days(0) + 2000),
    ).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'invalidTransition',
    );
  });
});

describe('the queries the indexes exist for', () => {
  it('finds the next scheduled session on or after a date and the most recent ones', async () => {
    const past = workoutSession({ scheduledDate: days(-2), exercises: [exerciseSession()] });
    const next = workoutSession({ scheduledDate: days(2), exercises: [exerciseSession()] });
    const later = workoutSession({ scheduledDate: days(5), exercises: [exerciseSession()] });
    await storage.sessions.create(past);
    await storage.sessions.create(next);
    await storage.sessions.create(later);

    expect((await storage.sessions.nextScheduledOnOrAfter(days(0)))?.id).toBe(next.id);
    expect(await storage.sessions.nextScheduledOnOrAfter(days(3))).toEqual(later);

    const recent = await storage.sessions.recent(2);
    expect(recent.map((session) => session.id)).toEqual([later.id, next.id]);
  });

  it('lists the library active first and query by movement pattern', async () => {
    const active = exercise({ name: 'Sentadilla', isArchived: false, pattern: 'squat' });
    const archived = exercise({ name: 'Zercher', isArchived: true, pattern: 'squat' });
    const press = exercise({ name: 'Press banca', pattern: 'horizontalPush' });
    await storage.exercises.save(archived);
    await storage.exercises.save(press);
    await storage.exercises.save(active);

    const library = await storage.exercises.all();
    expect(library.map((entry) => entry.isArchived)).toEqual([false, false, true]);

    const squats = await storage.exercises.byPattern('squat');
    expect(squats.map((entry) => entry.id).sort()).toEqual([active.id, archived.id].sort());
  });

  it('renders a plan day in order and cascades its items on removal', async () => {
    const day = planDay({ name: 'PIERNA', order: 1 });
    const third = planItem({ planDayId: day.id, order: 3 });
    const first = planItem({ planDayId: day.id, order: 1 });
    await storage.plan.save({ ...day, items: [third, first] });

    const reloaded = await storage.plan.byId(day.id);
    expect(reloaded?.items.map((item) => item.order)).toEqual([1, 3]);

    const days2 = await storage.plan.all();
    expect(days2.map((entry) => entry.id)).toEqual([day.id]);

    await storage.plan.remove(day.id);
    expect(await storage.plan.all()).toEqual([]);
    expect(await raw.count('planItems')).toBe(0);
  });

  it('reads a measurement window from the date index', async () => {
    await storage.measurements.save(measurement({ date: days(-10), weightKg: 83 }));
    await storage.measurements.save(measurement({ date: days(-2), weightKg: 82.4 }));
    await storage.measurements.save(measurement({ date: days(0), weightKg: 82.1 }));

    const window = await storage.measurements.between(days(-7), days(0));
    expect(window.map((row) => row.weightKg)).toEqual([82.4, 82.1]);
  });

  it('round trips the profile and the single-row meta values', async () => {
    const profile = userProfile();
    await storage.profile.save(profile);
    expect(await storage.profile.read()).toEqual(profile);

    await storage.meta.savePhaseState(phaseState({ block: 2, passedBlocks: 1 }));
    expect(await storage.meta.readPhaseState()).toEqual(phaseState({ block: 2, passedBlocks: 1 }));

    await storage.meta.saveStorageAnswer({ persisted: false, checkedAt: T0 });
    expect(await storage.meta.readStorageAnswer()).toEqual({ persisted: false, checkedAt: T0 });
  });

  it('keeps the optional phase values absent rather than undefined', async () => {
    await storage.meta.savePhaseState(phaseState());
    const rawRow = (await raw.all<Record<string, unknown>>('meta')).find(
      (row) => row['key'] === 'phaseState',
    );
    expect(rawRow).toBeDefined();
    expect('role' in (rawRow ?? {})).toBe(false);
    expect('scheduledSessionsPerWeek' in (rawRow ?? {})).toBe(false);
    expect(await storage.meta.readPhaseState()).toEqual(phaseState());
  });

  it('keeps the prescription of a frozen exercise session exactly as prescribed', async () => {
    const frozen = prescription({ sets: 4, restSeconds: 90 });
    const session = workoutSession({ exercises: [exerciseSession({ prescription: frozen })] });
    await storage.sessions.create(session);

    expect((await storage.sessions.byId(session.id))?.exercises[0]?.prescription).toEqual(frozen);
  });
});
