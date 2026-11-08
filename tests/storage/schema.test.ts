/**
 * §5.1 stores and indexes, §5.3 opening/versioning, §5.5 nothing precomputed (I-6),
 * §10 deletion, and the orphan scan of I-1.
 *
 * The expected table below is copied from docs/data-model.md §5.1 and is the only
 * statement of what the schema is; the implementation is compared against it, not
 * the other way round.
 */

import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createStorage,
  DB_NAME,
  DB_VERSION,
  defaultDatabaseFactory,
  DELETE_ALL_CONFIRMATION,
  isStorageError,
  SCHEMA,
  type DatabaseFactory,
  type DatabaseHandlers,
  type StoragePort,
} from '../../src/storage';
import {
  exercise,
  exerciseSession,
  freshIndexedDb,
  openRaw,
  setRecord,
  T0,
  workoutSession,
  type RawDatabase,
} from './harness';

/** docs/data-model.md §5.1, transcribed by hand. */
const EXPECTED_STORES = [
  {
    name: 'meta',
    keyPath: 'key',
    indexes: [],
  },
  {
    name: 'exercises',
    keyPath: 'id',
    indexes: [
      { name: 'by_archived', keyPath: 'isArchived', unique: false },
      { name: 'by_pattern', keyPath: 'pattern', unique: false },
    ],
  },
  {
    name: 'planDays',
    keyPath: 'id',
    indexes: [{ name: 'by_order', keyPath: 'order', unique: false }],
  },
  {
    name: 'planItems',
    keyPath: 'id',
    indexes: [{ name: 'by_planDay_order', keyPath: ['planDayId', 'order'], unique: false }],
  },
  {
    name: 'sessions',
    keyPath: 'id',
    indexes: [
      { name: 'by_status', keyPath: 'status', unique: false },
      { name: 'by_scheduledDate', keyPath: 'scheduledDate', unique: false },
    ],
  },
  {
    name: 'exerciseSessions',
    keyPath: 'id',
    indexes: [
      { name: 'by_session_order', keyPath: ['sessionId', 'order'], unique: false },
      { name: 'by_exercise_date', keyPath: ['exerciseId', 'sessionDate'], unique: false },
    ],
  },
  {
    name: 'sets',
    keyPath: 'id',
    indexes: [{ name: 'by_exerciseSession_index', keyPath: ['exerciseSessionId', 'index'], unique: false }],
  },
  {
    name: 'bodyMeasurements',
    keyPath: 'id',
    indexes: [{ name: 'by_date', keyPath: 'date', unique: false }],
  },
  {
    name: 'activities',
    keyPath: 'id',
    indexes: [
      { name: 'by_date', keyPath: 'date', unique: false },
      { name: 'by_externalSampleId', keyPath: 'externalSampleId', unique: true },
    ],
  },
] as const;

/**
 * The v1 schema as shipped, written out again here on purpose: it stands in for a
 * database created by an earlier build, so a change to the implementation's table
 * cannot quietly change the fixture.
 */
async function createLegacyV1Database(): Promise<void> {
  const db = await openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('meta', { keyPath: 'key' });
      const exercises = database.createObjectStore('exercises', { keyPath: 'id' });
      exercises.createIndex('by_archived', 'isArchived');
      exercises.createIndex('by_pattern', 'pattern');
      const planDays = database.createObjectStore('planDays', { keyPath: 'id' });
      planDays.createIndex('by_order', 'order');
      const planItems = database.createObjectStore('planItems', { keyPath: 'id' });
      planItems.createIndex('by_planDay_order', ['planDayId', 'order']);
      const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('by_status', 'status');
      sessions.createIndex('by_scheduledDate', 'scheduledDate');
      const exerciseSessions = database.createObjectStore('exerciseSessions', { keyPath: 'id' });
      exerciseSessions.createIndex('by_session_order', ['sessionId', 'order']);
      exerciseSessions.createIndex('by_exercise_date', ['exerciseId', 'sessionDate']);
      const sets = database.createObjectStore('sets', { keyPath: 'id' });
      sets.createIndex('by_exerciseSession_index', ['exerciseSessionId', 'index']);
      const measurements = database.createObjectStore('bodyMeasurements', { keyPath: 'id' });
      measurements.createIndex('by_date', 'date');
      const activities = database.createObjectStore('activities', { keyPath: 'id' });
      activities.createIndex('by_date', 'date');
      activities.createIndex('by_externalSampleId', 'externalSampleId', { unique: true });
    },
  });

  const prescription = {
    sets: 3,
    repRange: { lowerBound: 6, upperBound: 10 },
    targetRIR: { lowerBound: 1, upperBound: 3 },
    restSeconds: 120,
  };

  await db.put('exercises', {
    id: 'legacy-exercise',
    name: 'Prensa',
    primaryMuscle: 'quadriceps',
    pattern: 'squat',
    equipment: 'machine',
    loadIncrementKg: 5,
    isCustom: false,
    isArchived: 0,
  });
  await db.put('sessions', {
    id: 'legacy-session',
    planDayId: 'legacy-plan-day',
    dayNameSnapshot: 'PIERNA',
    scheduledDate: T0,
    startedAt: T0,
    endedAt: T0 + 1000,
    phase: { kind: 'normal' },
    status: 'completed',
    deletionPending: false,
  });
  await db.put('exerciseSessions', {
    id: 'legacy-exercise-session',
    sessionId: 'legacy-session',
    sessionDate: T0,
    order: 1,
    exerciseId: 'legacy-exercise',
    exerciseNameSnapshot: 'Prensa',
    prescription,
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: 120,
    loadDeltaKg: null,
    status: 'done',
    completedAt: T0 + 1000,
  });
  await db.put('sets', {
    id: 'legacy-set',
    exerciseSessionId: 'legacy-exercise-session',
    sessionId: 'legacy-session',
    index: 1,
    weightKg: 120,
    targetReps: 8,
    actualReps: 8,
    effort: null,
    discomfort: null,
    confirmedAt: T0 + 500,
  });
  db.close();
}

describe('§5.1 the database, its stores and its indexes', () => {
  let storage: StoragePort;

  beforeEach(async () => {
    freshIndexedDb();
    storage = createStorage();
    await storage.open();
  });

  afterEach(() => {
    storage.close();
  });

  it('declares one database named rupfit at schema version 1', () => {
    expect(DB_NAME).toBe('rupfit');
    expect(DB_VERSION).toBe(1);
  });

  it('creates the nine stores of §5.1 with their key paths, and no tenth store', async () => {
    const raw = await openRaw(DB_NAME);
    try {
      expect([...raw.storeNames()].sort()).toEqual(EXPECTED_STORES.map((store) => store.name).sort());
      for (const expected of EXPECTED_STORES) {
        const keyPath = await keyPathOf(raw, expected.name);
        expect(keyPath).toBe(expected.keyPath);
      }
    } finally {
      raw.close();
    }
  });

  it('creates exactly the twelve indexes of §5.1, with the unique flag where the document puts it', async () => {
    const raw = await openRaw(DB_NAME);
    try {
      let total = 0;
      for (const expected of EXPECTED_STORES) {
        const actual = raw.indexMetadata(expected.name).map((index) => ({
          name: index.name,
          keyPath: index.keyPath,
          unique: index.unique,
        }));
        const wanted = expected.indexes.map((index) => ({
          name: index.name,
          keyPath: Array.isArray(index.keyPath) ? [...index.keyPath] : index.keyPath,
          unique: index.unique,
        }));
        expect(actual.sort(byName)).toEqual(wanted.sort(byName));
        total += actual.length;
      }
      expect(total).toBe(12);
    } finally {
      raw.close();
    }
  });

  it('exposes the same table as SCHEMA, so the upgrade step has one source', () => {
    expect(
      SCHEMA.map((store) => ({
        name: store.name,
        keyPath: store.keyPath,
        indexes: store.indexes.map((index) => ({
          name: index.name,
          keyPath: Array.isArray(index.keyPath) ? [...index.keyPath] : index.keyPath,
          unique: index.unique,
        })),
      })),
    ).toEqual(
      EXPECTED_STORES.map((store) => ({
        name: store.name,
        keyPath: store.keyPath,
        indexes: store.indexes.map((index) => ({
          name: index.name,
          keyPath: Array.isArray(index.keyPath) ? [...index.keyPath] : index.keyPath,
          unique: index.unique,
        })),
      })),
    );
  });

  it('I-6 keeps no aggregate store: volume, e1RM, PRs and weekly means are never stored', async () => {
    const raw = await openRaw(DB_NAME);
    try {
      for (const name of raw.storeNames()) {
        expect(name).not.toMatch(/volume|e1rm|stat|summary|aggregate|cache|weekly|pr\b/i);
      }
    } finally {
      raw.close();
    }
  });
});

describe('§5.3 opening and migration', () => {
  let storage: StoragePort | null = null;

  beforeEach(() => {
    freshIndexedDb();
  });

  afterEach(() => {
    storage?.close();
    storage = null;
  });

  it('opens a v1 database written by the previous build with its data intact', async () => {
    await createLegacyV1Database();

    storage = createStorage();
    const report = await storage.open();

    expect(report.state.status).toBe('open');
    expect(report.state.currentVersion).toBe(1);

    const session = await storage.sessions.byId('legacy-session');
    expect(session?.status).toBe('completed');
    expect(session?.exercises[0]?.usedWeightKg).toBe(120);
    expect(session?.exercises[0]?.sets[0]?.weightKg).toBe(120);

    const library = await storage.exercises.all();
    expect(library.map((entry) => entry.name)).toEqual(['Prensa']);
  });

  it('rejects a database written by a newer schema version, naming both versions', async () => {
    const future = await openDB(DB_NAME, DB_VERSION + 1, { upgrade() {} });
    future.close();

    storage = createStorage();
    await expect(storage.open()).rejects.toSatisfy(
      (error: unknown) =>
        isStorageError(error) &&
        error.code === 'schemaTooNew' &&
        error.message.includes(String(DB_VERSION)) &&
        error.message.includes(String(DB_VERSION + 1)),
    );
  });

  it('reports blocked instead of forcing an upgrade another context is holding', async () => {
    const handlers: DatabaseHandlers[] = [];
    const factory: DatabaseFactory = {
      open: (_name, _version, openHandlers) => {
        handlers.push(openHandlers);
        openHandlers.blocked?.(1, 2);
        // A real blocked open never resolves until the other context closes.
        return new Promise(() => undefined);
      },
      delete: () => Promise.resolve(),
    };

    storage = createStorage({ factory });
    await expect(storage.open()).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'blocked',
    );
    expect(storage.state().status).toBe('blocked');
    expect(storage.state().blockedVersion).toBe(2);
    expect(handlers).toHaveLength(1);
  });

  it('closes the connection when another context asks to upgrade (blocking)', async () => {
    const listeners: DatabaseHandlers[] = [];
    storage = createStorage({ factory: spyingFactory(listeners) });
    await storage.open();

    const handlers = listeners[0];
    expect(handlers).toBeDefined();
    handlers?.blocking?.(1, 2);

    expect(storage.state().status).toBe('closed');
    expect(storage.state().blockedVersion).toBe(2);
  });

  it('reopening after the browser terminated the connection works lazily', async () => {
    const listeners: DatabaseHandlers[] = [];
    storage = createStorage({ factory: spyingFactory(listeners) });
    await storage.open();

    listeners[0]?.terminated?.();
    expect(storage.state().status).toBe('terminated');

    const library = await storage.exercises.all();
    expect(library).toEqual([]);
    expect(storage.state().status).toBe('open');
  });
});

describe('§5.1/I-1 the orphan scan reports, never repairs', () => {
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

  it('counts sets and exercise sessions whose parent is gone and leaves them in place', async () => {
    const session = workoutSession({ exercises: [exerciseSession()] });
    await storage.sessions.create(session);
    await storage.sessions.confirmSet(session.id, session.exercises[0]!.id, setRecord());

    await raw.put('sets', orphanSetRow());
    await raw.put('exerciseSessions', orphanExerciseSessionRow());
    await raw.put('planItems', orphanPlanItemRow());

    const report = await storage.scanOrphans();

    expect(report.setsWithoutExerciseSession).toBe(1);
    expect(report.exerciseSessionsWithoutSession).toBe(1);
    expect(report.planItemsWithoutPlanDay).toBe(1);

    // Q-5: report only. Nothing is deleted by the scan.
    expect(await raw.count('sets')).toBe(2);
    expect(await raw.count('exerciseSessions')).toBe(2);
    expect(await raw.count('planItems')).toBe(1);

    // The open sequence performs the same scan (I-1: "an orphan scan in the open sequence").
    raw.close();
    storage.close();
    const reopened = await storage.open();
    expect(reopened.orphans.setsWithoutExerciseSession).toBe(1);
    expect(reopened.orphans.exerciseSessionsWithoutSession).toBe(1);
    raw = await openRaw(DB_NAME);
  });
});

describe('§10 deletion of every row', () => {
  let storage: StoragePort;

  beforeEach(async () => {
    freshIndexedDb();
    storage = createStorage();
    await storage.open();
  });

  afterEach(() => {
    storage.close();
  });

  it('requires the typed confirmation and changes nothing when it is wrong', async () => {
    const library = exercise();
    await storage.exercises.save(library);

    await expect(storage.deleteAll({ confirmation: 'borrar' })).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'confirmationRequired',
    );
    expect(await storage.exercises.all()).toHaveLength(1);
  });

  it('deletes the database, reopens empty and reseeds the library', async () => {
    await storage.exercises.save(exercise({ name: 'Prensa' }));
    const seed = [exercise({ name: 'Sentadilla', id: 'seed-sentadilla' })];

    await storage.deleteAll({ confirmation: DELETE_ALL_CONFIRMATION, seed });

    const library = await storage.exercises.all();
    expect(library.map((entry) => entry.id)).toEqual(['seed-sentadilla']);
    expect(storage.state().status).toBe('open');
  });

  it('reports blocked rather than forcing a delete another context is holding', async () => {
    const holder = await openRaw(DB_NAME);
    try {
      await expect(storage.deleteAll({ confirmation: DELETE_ALL_CONFIRMATION })).rejects.toSatisfy(
        (error: unknown) => isStorageError(error) && error.code === 'blocked',
      );
    } finally {
      holder.close();
    }
  });
});

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}

async function keyPathOf(raw: RawDatabase, store: string): Promise<unknown> {
  return raw.keyPath(store);
}

/** Wraps the real factory so a test can reach the callbacks the opener registered. */
function spyingFactory(listeners: DatabaseHandlers[]): DatabaseFactory {
  return {
    open: (name, version, handlers) => {
      listeners.push(handlers);
      return defaultDatabaseFactory.open(name, version, handlers);
    },
    delete: (name, handlers) => defaultDatabaseFactory.delete(name, handlers),
  };
}

function orphanSetRow(): unknown {
  return {
    id: 'orphan-set',
    exerciseSessionId: 'missing-exercise-session',
    sessionId: 'missing-session',
    index: 1,
    weightKg: 100,
    targetReps: 6,
    actualReps: 6,
    effort: null,
    discomfort: null,
    confirmedAt: T0,
  };
}

function orphanExerciseSessionRow(): unknown {
  return {
    id: 'orphan-exercise-session',
    sessionId: 'missing-session',
    sessionDate: T0,
    order: 1,
    exerciseId: null,
    exerciseNameSnapshot: 'Fantasma',
    prescription: { sets: 3, repRange: { lowerBound: 6, upperBound: 10 }, targetRIR: { lowerBound: 1, upperBound: 3 }, restSeconds: 120 },
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    status: 'pending',
    completedAt: null,
  };
}

function orphanPlanItemRow(): unknown {
  return {
    id: 'orphan-plan-item',
    planDayId: 'missing-plan-day',
    order: 1,
    exerciseId: null,
    exerciseNameSnapshot: 'Fantasma',
    prescription: { sets: 3, repRange: { lowerBound: 6, upperBound: 10 }, targetRIR: { lowerBound: 1, upperBound: 3 }, restSeconds: 120 },
  };
}
