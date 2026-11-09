/**
 * The sync-facing storage surface — odd/tasks/cloud-sync.md T3/T4/T6, specs S1, S4, S5,
 * S6, S7.
 *
 * What these tests prove, and what they deliberately do not:
 *
 * - a local write bumps `rev` and stamps `updatedAt`, so a pushed row can be ordered and
 *   a conflict can be decided;
 * - a row written before the sync columns existed still reads, with defaults;
 * - `applySyncRow` writes a pulled row as received, including the two writes the
 *   app-facing API refuses to make, and nothing it accepts is refused;
 * - a tombstone is hidden from every app-facing read and stays on disk;
 * - the push watermark is in `meta` and survives a reopen;
 * - the queue op commits **with** the row: a sink that fails takes the row down with it.
 *
 * It does not prove the network, the merge rule or RLS — those are `src/cloud/sync.test.ts`
 * and a live Supabase project (see `docs/cloud-sync.md` §6).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createStorage,
  DB_NAME,
  isStorageError,
  META_KEYS,
  OUTBOX_OP_PREFIX,
  type IndexedDbStorage,
  type PendingSyncOp,
  type StoredSyncRow,
  type SyncQueueSink,
} from '../../src/storage';
import { days, exercise, exerciseSession, freshIndexedDb, openRaw, setRecord, T0, workoutSession, type RawDatabase } from './harness';

/** What the synced column of a stored row looks like, as a test asserts it. */
interface StoredSync {
  readonly rev: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
}

interface StoredRow {
  readonly id?: string;
  readonly key?: string;
  readonly sync?: StoredSync;
}

let clock = T0;
let storage: IndexedDbStorage;
let raw: RawDatabase;

beforeEach(async () => {
  freshIndexedDb();
  clock = T0;
  storage = createStorage({ now: () => clock });
  await storage.open();
  raw = await openRaw(DB_NAME);
});

afterEach(() => {
  raw.close();
  storage.close();
});

async function storedRow(store: string, key: string): Promise<StoredRow | undefined> {
  const rows = await raw.all<StoredRow>(store);
  return rows.find((row) => row.id === key || row.key === key);
}

function syncOfRow(row: StoredRow | undefined): StoredSync | undefined {
  return row?.sync;
}

describe('T3 every repository write is stamped', () => {
  it('writes rev 1 on the first save and rev 2 on the second, stamping updatedAt', async () => {
    const library = exercise({ name: 'Sentadilla trasera' });
    await storage.exercises.save(library);

    const first = syncOfRow(await storedRow('exercises', library.id));
    expect(first).toEqual({ rev: 1, updatedAt: T0, deletedAt: null });

    clock = days(1);
    await storage.exercises.save({ ...library, name: 'Sentadilla libre' });

    const second = syncOfRow(await storedRow('exercises', library.id));
    expect(second).toEqual({ rev: 2, updatedAt: days(1), deletedAt: null });

    // The domain read is unchanged by all of this: the app never sees the metadata.
    expect(await storage.exercises.byId(library.id)).toEqual({
      ...library,
      name: 'Sentadilla libre',
    });
  });

  it('stamps a session and each of its exercise sessions in one write', async () => {
    const session = workoutSession({ exercises: [exerciseSession(), exerciseSession()] });
    await storage.sessions.create(session);

    expect(syncOfRow(await storedRow('sessions', session.id))?.rev).toBe(1);
    for (const exerciseRow of session.exercises) {
      expect(syncOfRow(await storedRow('exerciseSessions', exerciseRow.id))?.rev).toBe(1);
    }
  });

  it('stamps the single-row meta records too, and leaves the device-local answer alone', async () => {
    await storage.meta.savePhaseState({ block: 1, passedBlocks: 0 });
    expect(syncOfRow(await storedRow('meta', META_KEYS.phaseState))?.rev).toBe(1);

    await storage.meta.saveStorageAnswer({ persisted: false, checkedAt: T0 });
    // Q-4: a storage answer is this browser's, not the account's. Queuing it would ask a
    // push to send a column that does not exist.
    expect(syncOfRow(await storedRow('meta', META_KEYS.storage))).toBeUndefined();
  });
});

describe('T3 a row written before the sync columns existed', () => {
  it('still reads, and reads with defaults from the sync surface', async () => {
    await raw.put('exercises', {
      id: 'legacy-exercise',
      name: 'Prensa',
      primaryMuscle: 'quadriceps',
      pattern: 'squat',
      equipment: 'machine',
      loadIncrementKg: 5,
      isCustom: false,
      isArchived: 0,
    });

    const library = exercise({ id: 'legacy-exercise', name: 'Prensa' });
    expect((await storage.exercises.byId('legacy-exercise'))?.name).toBe('Prensa');

    const sync = await storage.sync.readSyncRow('exercises', 'legacy-exercise');
    expect(sync?.sync).toEqual({ rev: 0, updatedAt: 0, deletedAt: null });
    expect(sync?.record['name']).toBe('Prensa');
    expect(sync?.record).not.toHaveProperty('sync');

    // The first write of an old row is rev 1, not rev 0: `rev` counts writes.
    await storage.exercises.save(library);
    expect(syncOfRow(await storedRow('exercises', 'legacy-exercise'))?.rev).toBe(1);
  });

  it('is invisible to a sweep that starts after instant zero, until it is written', async () => {
    await raw.put('bodyMeasurements', {
      id: 'legacy-measure',
      date: T0,
      weightKg: 82.5,
      waistCm: null,
      chestCm: null,
      armCm: null,
      thighCm: null,
      hipCm: null,
      bodyFatPercent: null,
      provenance: 'manual',
    });

    expect(await storage.sync.listSyncRows('body_measurements', 0)).toEqual([]);
    expect(await storage.sync.listSyncRows('body_measurements', -1)).toHaveLength(1);
  });
});

describe('T4 the sync surface writes what the app-facing API refuses', () => {
  it('inserts a set whose index does not extend the list, for an existing session', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    const exerciseRow = session.exercises[0]!;

    // The app-facing path refuses this: a confirmed set must extend the list (§5.4).
    await expect(
      storage.sessions.confirmSet(session.id, exerciseRow.id, setRecord({ index: 2 })),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'invalidIndex');
    expect(await raw.count('sets')).toBe(0);

    // The sync path accepts it as received: the row was already decided remotely.
    const pulled: StoredSyncRow = {
      table: 'sets',
      id: 'pulled-set-3',
      sync: { rev: 4, updatedAt: days(2), deletedAt: null },
      record: {
        id: 'pulled-set-3',
        exerciseSessionId: exerciseRow.id,
        sessionId: session.id,
        index: 3,
        weightKg: 102.5,
        targetReps: 6,
        actualReps: 5,
        effort: 2,
        discomfort: null,
        confirmedAt: days(2),
      },
    };
    await storage.sync.applySyncRow('sets', pulled);

    const reloaded = await storage.sessions.byId(session.id);
    expect(reloaded?.exercises[0]?.sets.map((set) => set.index)).toEqual([3]);
    expect(reloaded?.exercises[0]?.sets[0]?.weightKg).toBe(102.5);

    // And the guard is still there for the next app-facing write: no gap is allowed.
    await expect(
      storage.sessions.confirmSet(session.id, exerciseRow.id, setRecord({ index: 5 })),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'invalidIndex');
  });

  it('inserts an exercise session and a finished session that no app write would create', async () => {
    await storage.sync.applySyncRow('sessions', {
      table: 'sessions',
      id: 'pulled-session',
      sync: { rev: 3, updatedAt: days(3), deletedAt: null },
      record: {
        id: 'pulled-session',
        planDayId: 'pulled-plan-day',
        dayNameSnapshot: 'PIERNA',
        scheduledDate: days(3),
        startedAt: days(3),
        endedAt: days(3) + 3_600_000,
        phase: { kind: 'normal' },
        status: 'completed',
        deletionPending: false,
      },
    });
    await storage.sync.applySyncRow('session_exercises', {
      table: 'session_exercises',
      id: 'pulled-exercise-session',
      sync: { rev: 2, updatedAt: days(3), deletedAt: null },
      record: {
        id: 'pulled-exercise-session',
        sessionId: 'pulled-session',
        sessionDate: days(3),
        order: 1,
        exerciseId: 'pulled-exercise',
        exerciseNameSnapshot: 'Prensa',
        prescription: {
          sets: 3,
          repRange: { lowerBound: 6, upperBound: 10 },
          targetRIR: { lowerBound: 1, upperBound: 3 },
          restSeconds: 120,
        },
        recommendation: null,
        decision: null,
        recommendedWeightKg: null,
        usedWeightKg: 120,
        loadDeltaKg: null,
        status: 'done',
        completedAt: days(3) + 3_600_000,
      },
    });

    const history = await storage.sessions.recent(10);
    expect(history.map((entry) => entry.id)).toEqual(['pulled-session']);
    expect(history[0]?.status).toBe('completed');
    expect(history[0]?.exercises[0]?.usedWeightKg).toBe(120);

    // A pulled row is not a local change: pushing it back would echo.
    expect(await storage.sync.queue().allOps()).toEqual([]);
  });

  it('applies the two single-row tables under their fixed meta keys', async () => {
    await storage.sync.applySyncRow('profiles', {
      table: 'profiles',
      id: META_KEYS.profile,
      sync: { rev: 2, updatedAt: days(1), deletedAt: null },
      record: {
        key: META_KEYS.profile,
        value: {
          id: 'pulled-profile',
          displayName: 'Robert',
          massUnit: 'kilograms',
          weightGoal: 'maintain',
          weeklyTrainingDays: 3,
          availableEquipment: ['barbell'],
          autoStartRestTimer: true,
        },
      },
    });

    expect((await storage.profile.read())?.weeklyTrainingDays).toBe(3);
    expect(syncOfRow(await storedRow('meta', META_KEYS.profile))?.rev).toBe(2);

    // The sweep over a single-row table answers that one row, not the queue ops and the
    // watermark that share the `meta` store with it.
    expect((await storage.sync.listSyncRows('profiles', -1)).map((row) => row.id)).toEqual([
      META_KEYS.profile,
    ]);
  });
});

describe('T4/T6 a tombstone hides the row and keeps the bytes', () => {
  it('hides a soft-deleted exercise from every app-facing read', async () => {
    const library = exercise({ name: 'Prensa' });
    await storage.exercises.save(library);

    await storage.sync.applySyncRow('exercises', {
      table: 'exercises',
      id: library.id,
      sync: { rev: 2, updatedAt: days(1), deletedAt: days(1) },
      record: { ...(await storage.sync.readSyncRow('exercises', library.id))!.record },
    });

    expect(await storage.exercises.all()).toEqual([]);
    expect(await storage.exercises.byId(library.id)).toBeUndefined();
    expect(await storage.exercises.byPattern('squat')).toEqual([]);

    // The bytes are still there, with the metadata a merge needs.
    expect(await raw.count('exercises')).toBe(1);
    const kept = await storage.sync.readSyncRow('exercises', library.id);
    expect(kept?.sync.deletedAt).toBe(days(1));
    expect(kept?.record['name']).toBe('Prensa');
  });

  it('hides a soft-deleted session from the history and from resume', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    await storage.sessions.confirmSet(session.id, session.exercises[0]!.id, setRecord());

    const live = await storage.sync.readSyncRow('sessions', session.id);
    await storage.sync.applySyncRow('sessions', {
      table: 'sessions',
      id: session.id,
      sync: { rev: 9, updatedAt: days(4), deletedAt: days(4) },
      record: live!.record,
    });

    expect(await storage.sessions.recent(10)).toEqual([]);
    expect(await storage.sessions.inProgress()).toBeUndefined();
    expect(await storage.sessions.byId(session.id)).toBeUndefined();
    expect(await raw.count('sessions')).toBe(1);
    expect(await raw.count('sets')).toBe(1);
  });
});

describe('T3 the push watermark', () => {
  it('is stored in meta, only moves forward, and survives a reopen', async () => {
    expect(await storage.sync.readPushWatermark('sets')).toBeNull();

    await storage.sync.writePushWatermark('sets', days(2));
    expect(await storage.sync.readPushWatermark('sets')).toBe(days(2));

    // A re-push must not rewind a table.
    await storage.sync.writePushWatermark('sets', days(1));
    expect(await storage.sync.readPushWatermark('sets')).toBe(days(2));

    const metaRow = await storedRow('meta', META_KEYS.syncWatermarks);
    expect(metaRow).toBeDefined();

    storage.close();
    raw.close();
    storage = createStorage({ now: () => clock });
    await storage.open();
    raw = await openRaw(DB_NAME);

    expect(await storage.sync.readPushWatermark('sets')).toBe(days(2));
    expect(await storage.sync.readPushWatermark('sessions')).toBeNull();
  });
});

describe('T3 the queue op commits with the row', () => {
  it('is present after a completed write, in the op shape the sync service consumes', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);

    const ops: readonly PendingSyncOp[] = await storage.sync.queue().allOps();
    const ids = ops.map((op) => op.id);
    expect(ids).toContain(`sessions:${session.id}:1`);
    expect(ids).toContain(`session_exercises:${session.exercises[0]!.id}:1`);
    expect(ops.every((op) => op.op === 'upsert' && op.attempts === 0 && op.lastError === null)).toBe(
      true,
    );

    const metaKeys = (await raw.all<StoredRow>('meta')).map((row) => row.key);
    expect(metaKeys).toContain(`${OUTBOX_OP_PREFIX}sessions:${session.id}:1`);
  });

  it('queues a deletion as a delete op, never as a silent removal', async () => {
    const library = exercise({ id: 'custom-exercise' });
    await storage.exercises.save(library);
    await storage.exercises.remove(library.id);

    const ops = await storage.sync.queue().allOps();
    const deletion = ops.find((op) => op.table === 'exercises' && op.op === 'delete');
    expect(deletion?.rowId).toBe(library.id);
    expect(deletion?.rev).toBe(2);
    expect(await raw.count('exercises')).toBe(0);
  });

  it('leaves neither row nor op behind when the queue write fails', async () => {
    // A sink that fails stands in for a crash between the two writes: because the op is
    // written with the row's own transaction, the abort takes the row with it.
    const refusing: SyncQueueSink = {
      enqueue: () => Promise.reject(new Error('the queue is unavailable')),
    };
    storage.close();
    raw.close();
    storage = createStorage({ now: () => clock, queue: refusing });
    await storage.open();
    raw = await openRaw(DB_NAME);

    const session = workoutSession({ exercises: [exerciseSession()] });
    await expect(storage.sessions.create(session)).rejects.toThrow();

    expect(await raw.count('sessions')).toBe(0);
    expect(await raw.count('exerciseSessions')).toBe(0);
    expect(
      (await raw.all<StoredRow>('meta')).filter((row) => String(row.key).startsWith(OUTBOX_OP_PREFIX)),
    ).toEqual([]);
  });

  it('serves the queue contract the sync service drains: putOps, removeOps, one op per row', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);

    const queue = storage.sync.queue();
    const ops = await queue.allOps();
    // Every op is stamped with the instant its row was written, so age ordering is real.
    expect(ops.every((op) => op.queuedAt === T0)).toBe(true);

    // The retry counter is the queue's to advance; the store just persists it.
    const target = ops[0]!;
    await queue.putOps([{ ...target, attempts: 2, lastError: 'offline' }]);
    const retried = (await queue.allOps()).find((op) => op.id === target.id);
    expect(retried?.attempts).toBe(2);
    expect(retried?.lastError).toBe('offline');

    // An acknowledged op leaves the store; nothing else is touched.
    await queue.removeOps([target.id]);
    const remaining = await queue.allOps();
    expect(remaining.map((op) => op.id)).not.toContain(target.id);
    expect(remaining).toHaveLength(ops.length - 1);
  });
});
