/**
 * §9 the backup document: its shape, its version, the export/import round trip, the
 * two import modes and the validation rules that must change nothing when they fail.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_DOCUMENT_TYPE,
  BACKUP_SCHEMA_VERSION,
  createStorage,
  DELETE_ALL_CONFIRMATION,
  isStorageError,
  RESTORE_CONFIRMATION,
  type StoragePort,
} from '../../src/storage';
import {
  activity,
  days,
  exercise,
  exerciseSession,
  freshIndexedDb,
  measurement,
  openRaw,
  phaseState,
  planDay,
  planItem,
  prescription,
  setRecord,
  T0,
  userProfile,
  workoutSession,
  type RawDatabase,
} from './harness';

const APP_VERSION = '0.1.0';
const OPTIONS = { appVersion: APP_VERSION, exportedAt: T0 };

let storage: StoragePort;
/**
 * A second connection, opened per test where a test has to look at what is on disk.
 * It is *not* open by default: an open context blocks `deleteDatabase` (§10), which is
 * exactly what the deletion-blocked test asserts.
 */
let raw: RawDatabase | null = null;

beforeEach(async () => {
  freshIndexedDb();
  storage = createStorage();
  await storage.open();
});

afterEach(() => {
  raw?.close();
  raw = null;
  storage.close();
});

async function openReader(): Promise<RawDatabase> {
  raw = await openRaw('rupfit');
  return raw;
}

/** Seeds one row in every collection the document carries. */
async function seedEverything(): Promise<void> {
  await storage.profile.save(userProfile());
  await storage.meta.savePhaseState(phaseState({ block: 2, passedBlocks: 1 }));

  const library = exercise({ name: 'Sentadilla trasera', loadIncrementKg: 2.5 });
  await storage.exercises.save(library);

  const day = planDay({ name: 'SENTADILLA / PIERNA', order: 1 });
  await storage.plan.save({
    ...day,
    items: [
      planItem({
        planDayId: day.id,
        order: 1,
        exerciseId: library.id,
        exerciseNameSnapshot: library.name,
        prescription: prescription(),
      }),
    ],
  });

  const session = workoutSession({
    dayNameSnapshot: day.name,
    exercises: [
      exerciseSession({
        exerciseId: library.id,
        exerciseNameSnapshot: library.name,
        recommendation: {
          suggestedWeightKg: 100,
          suggestedSets: 3,
          suggestedTargetReps: 6,
          action: 'hold',
          reason: 'addRepetition',
          confidence: { level: 'medium', sessionsConsidered: 3 },
          basedOnSessions: 3,
          computedAt: new Date(T0 - days(1)),
          reasonContext: { next: 102.5 },
        },
        recommendedWeightKg: 100,
      }),
    ],
  });
  await storage.sessions.create(session);
  const exerciseSessionId = session.exercises[0]!.id;
  await storage.sessions.recordDecision({
    exerciseSessionId,
    decision: { kind: 'manual', kg: 95 },
    recommendedWeightKg: 100,
    previousWeightKg: null,
  });
  await storage.sessions.confirmSet(
    session.id,
    exerciseSessionId,
    setRecord({ index: 1, weightKg: 95, effort: 1, discomfort: 0 }),
  );
  await storage.sessions.confirmSet(
    session.id,
    exerciseSessionId,
    setRecord({ index: 2, weightKg: 95, effort: null, discomfort: null }),
  );
  await storage.sessions.finish(session.id, 'completed', T0 + 3_600_000);

  await storage.measurements.save(measurement({ date: days(-1), weightKg: 82.4, waistCm: 84 }));
  await storage.activities.save(
    activity({
      date: days(-1),
      kind: 'cardio',
      durationSeconds: 1800,
      activeEnergyKcal: 220,
      provenance: 'imported',
      externalSampleId: 'health-sample-1',
    }),
  );
}

async function snapshot(): Promise<string> {
  const { json } = await storage.backup.export(OPTIONS);
  return json;
}

function mutate(json: string, mutateDocument: (document: Record<string, any>) => void): string {
  const document = JSON.parse(json) as Record<string, any>;
  mutateDocument(document);
  return JSON.stringify(document);
}

describe('§9 the backup document shape', () => {
  it('declares its document type and schema version', async () => {
    const { document } = await storage.backup.export(OPTIONS);
    expect(BACKUP_DOCUMENT_TYPE).toBe('rupfit.backup');
    expect(BACKUP_SCHEMA_VERSION).toBe(1);
    expect(document.documentType).toBe('rupfit.backup');
    expect(document.schemaVersion).toBe(1);
  });

  it('carries the version, the injected instant and exactly the documented collections', async () => {
    await seedEverything();
    const { document } = await storage.backup.export(OPTIONS);

    expect(Object.keys(document).sort()).toEqual([
      'activities',
      'appVersion',
      'bodyMeasurements',
      'documentType',
      'exercises',
      'exportedAt',
      'phaseState',
      'planDays',
      'profile',
      'schemaVersion',
      'sessions',
    ]);
    expect(document.appVersion).toBe(APP_VERSION);
    expect(document.exportedAt).toBe('2026-11-08T10:00:00.000Z');
  });

  it('encodes the domain objects as-is: nested exercises and sets, no flat record fields', async () => {
    await seedEverything();
    const parsed = JSON.parse(await snapshot()) as Record<string, any>;

    const set = parsed.sessions[0].exercises[0].sets[0];
    expect(Object.keys(set).sort()).toEqual([
      'actualReps',
      'confirmedAt',
      'discomfort',
      'effort',
      'id',
      'index',
      'targetReps',
      'weightKg',
    ]);
    expect(set.effort).toBe(1);
    expect(parsed.sessions[0].exercises[0].sets[1].effort).toBeNull();
    // Absence is null in the document, never an omitted key (§1).
    expect('effort' in parsed.sessions[0].exercises[0].sets[1]).toBe(true);
    // Instants are epoch milliseconds, so a JSON diff stays orderable.
    expect(typeof set.confirmedAt).toBe('number');
  });

  it('never includes storage internals: no meta key, no deletion flag, no row denormalisation', async () => {
    await seedEverything();
    const json = await snapshot();

    expect(json).not.toContain('deletionPending');
    expect(json).not.toContain('"key"');
    expect(json).not.toContain('exerciseSessionId');
    expect(json).not.toContain('sessionDate');
    expect(json).not.toContain('planItems"');
  });

  it('validates its own document', async () => {
    await seedEverything();
    const json = await snapshot();

    const validation = storage.backup.validate(json);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.documentType).toBe('rupfit.backup');
      expect(validation.document.sessions).toHaveLength(1);
    }
  });

  it('writes null for a missing profile and a missing phase state', async () => {
    const parsed = JSON.parse(await snapshot()) as Record<string, unknown>;
    expect(parsed['profile']).toBeNull();
    expect(parsed['phaseState']).toBeNull();
    expect(parsed['sessions']).toEqual([]);
  });
});

describe('§9 the export/import round trip', () => {
  it('returns byte-identical domain data after a wipe and a restore', async () => {
    await seedEverything();
    const before = await snapshot();

    await storage.deleteAll({ confirmation: DELETE_ALL_CONFIRMATION });
    expect(await snapshot()).not.toBe(before);

    const report = await storage.backup.import({
      json: before,
      mode: 'restore',
      confirmation: RESTORE_CONFIRMATION,
    });

    expect(report.mode).toBe('restore');
    expect(report.written.sessions).toBe(1);
    expect(report.written.bodyMeasurements).toBe(1);
    expect(report.written.activities).toBe(1);

    expect(await snapshot()).toBe(before);
  });

  it('restores the domain values the store reads back, not just the document strings', async () => {
    await seedEverything();
    const before = await snapshot();
    const restoredSessionId = (JSON.parse(before) as { sessions: { id: string }[] }).sessions[0]!
      .id;

    await storage.deleteAll({ confirmation: DELETE_ALL_CONFIRMATION });
    await storage.backup.import({ json: before, mode: 'restore', confirmation: RESTORE_CONFIRMATION });

    const session = await storage.sessions.byId(restoredSessionId);
    expect(session?.status).toBe('completed');
    expect(session?.exercises[0]?.decision).toEqual({ kind: 'manual', kg: 95 });
    expect(session?.exercises[0]?.loadDeltaKg).toBe(-5);
    expect(session?.exercises[0]?.recommendation?.computedAt).toEqual(new Date(T0 - days(1)));
    expect(session?.exercises[0]?.sets.map((set) => set.index)).toEqual([1, 2]);

    expect((await storage.profile.read())?.displayName).toBe('Robert');
    expect(await storage.meta.readPhaseState()).toEqual(phaseState({ block: 2, passedBlocks: 1 }));
    expect((await storage.plan.all())[0]?.items).toHaveLength(1);
  });

  it('leaves the previous store intact when the import transaction aborts', async () => {
    await seedEverything();
    const before = await snapshot();

    // A valid document that the store itself refuses: the same bridge sample twice. The
    // unique index rejects the second row, so the whole single transaction rolls back
    // instead of leaving a half-replaced database (§9).
    const clashing = mutate(before, (document) => {
      document['activities'].push({
        ...document['activities'][0],
        id: 'activity-clashing',
        date: days(-3),
      });
    });
    expect(storage.backup.validate(clashing).ok).toBe(true);

    await expect(
      storage.backup.import({ json: clashing, mode: 'restore', confirmation: RESTORE_CONFIRMATION }),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'duplicate');

    expect(await snapshot()).toBe(before);
  });

  it('requires the typed confirmation for restore and changes nothing without it', async () => {
    await seedEverything();
    const before = await snapshot();

    await expect(
      storage.backup.import({ json: before, mode: 'restore', confirmation: 'vale' }),
    ).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'confirmationRequired',
    );

    expect(await snapshot()).toBe(before);
  });
});

describe('§9 validation before writing: one invalid document per rule', () => {
  interface Case {
    readonly rule: string;
    readonly breakDocument: (document: Record<string, any>) => void;
    readonly path: string;
  }

  const cases: readonly Case[] = [
    {
      rule: 'R1 documentType must be rupfit.backup',
      breakDocument: (document) => {
        document['documentType'] = 'rupfit.somethingelse';
      },
      path: 'documentType',
    },
    {
      rule: 'R2 schemaVersion must be a known version',
      breakDocument: (document) => {
        document['schemaVersion'] = 99;
      },
      path: 'schemaVersion',
    },
    {
      rule: 'R3 every collection key must be present',
      breakDocument: (document) => {
        delete document['activities'];
      },
      path: 'activities',
    },
    {
      rule: 'R4 absence is null, never an omitted key',
      breakDocument: (document) => {
        delete document['sessions'][0].exercises[0].sets[1].effort;
      },
      path: 'sessions[0].exercises[0].sets[1].effort',
    },
    {
      rule: 'R5 a required number cannot be null',
      breakDocument: (document) => {
        document['sessions'][0].exercises[0].sets[0].weightKg = null;
      },
      path: 'sessions[0].exercises[0].sets[0].weightKg',
    },
    {
      rule: 'R6 effort must be one of the four answered values',
      breakDocument: (document) => {
        document['sessions'][0].exercises[0].sets[0].effort = 7;
      },
      path: 'sessions[0].exercises[0].sets[0].effort',
    },
    {
      rule: 'R7 a set index is 1-based',
      breakDocument: (document) => {
        document['sessions'][0].exercises[0].sets[0].index = 0;
      },
      path: 'sessions[0].exercises[0].sets[0].index',
    },
    {
      rule: 'R8 a body measurement carries at least one measure',
      breakDocument: (document) => {
        const row = document['bodyMeasurements'][0];
        for (const key of ['weightKg', 'waistCm', 'chestCm', 'armCm', 'thighCm', 'hipCm', 'bodyFatPercent']) {
          row[key] = null;
        }
      },
      path: 'bodyMeasurements[0]',
    },
    {
      rule: 'R9 a session status is one of the five',
      breakDocument: (document) => {
        document['sessions'][0].status = 'finished';
      },
      path: 'sessions[0].status',
    },
    {
      rule: 'R10 a phase block is 1..4',
      breakDocument: (document) => {
        document['phaseState']['block'] = 5;
      },
      path: 'phaseState.block',
    },
    {
      rule: 'R11 an id is a non-empty string',
      breakDocument: (document) => {
        document['exercises'][0].id = '';
      },
      path: 'exercises[0].id',
    },
    {
      rule: 'R12 a collection must be an array',
      breakDocument: (document) => {
        document['sessions'] = {};
      },
      path: 'sessions',
    },
  ];

  it('rejects a document that is not JSON at all', async () => {
    const before = await snapshot();
    await expect(
      storage.backup.import({ json: 'not json', mode: 'restore', confirmation: RESTORE_CONFIRMATION }),
    ).rejects.toSatisfy((error: unknown) => isStorageError(error) && error.code === 'backupInvalid');
    expect(await snapshot()).toBe(before);
  });

  for (const testCase of cases) {
    it(`${testCase.rule}, and leaves storage unchanged`, async () => {
      await seedEverything();
      const before = await snapshot();
      const invalid = mutate(before, testCase.breakDocument);

      const validation = storage.backup.validate(invalid);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.path).toBe(testCase.path);
      }

      await expect(
        storage.backup.import({ json: invalid, mode: 'restore', confirmation: RESTORE_CONFIRMATION }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          isStorageError(error) && error.code === 'backupInvalid' && error.detail['path'] === testCase.path,
      );

      expect(await snapshot()).toBe(before);
    });
  }

  it('reports the first failure with its path, not a generic import failure', async () => {
    await seedEverything();
    const valid = await snapshot();
    // Four sessions with two sets each, then break the second set of the fourth.
    const seeded = JSON.parse(valid) as Record<string, any>;
    const template = seeded['sessions'][0];
    for (let position = 1; position < 4; position += 1) {
      const clone = JSON.parse(JSON.stringify(template)) as Record<string, any>;
      clone['id'] = `session-clone-${position}`;
      clone['exercises'][0].id = `exercise-session-clone-${position}`;
      seeded['sessions'].push(clone);
    }
    seeded['sessions'][3].exercises[0].sets[1].effort = 9;

    const validation = storage.backup.validate(JSON.stringify(seeded));
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.path).toBe('sessions[3].exercises[0].sets[1].effort');
    }
  });

  it('rejects two rows with the same id instead of silently overwriting one', async () => {
    await seedEverything();
    const invalid = mutate(await snapshot(), (document) => {
      document['bodyMeasurements'].push({ ...document['bodyMeasurements'][0] });
    });

    const validation = storage.backup.validate(invalid);
    expect(validation.ok).toBe(false);
  });
});

describe('§9 merge brings in measurements and activities only', () => {
  it('adds measurements and activities and never touches training history', async () => {
    await seedEverything();
    const before = JSON.parse(await snapshot()) as Record<string, any>;

    const extraMeasurement = {
      ...before['bodyMeasurements'][0],
      id: 'measurement-extra',
      date: days(-2),
      weightKg: 82.9,
    };
    const extraActivity = {
      ...before['activities'][0],
      id: 'activity-extra',
      externalSampleId: 'health-sample-2',
      date: days(-2),
    };
    const extraSession = {
      ...before['sessions'][0],
      id: 'session-extra',
    };
    const incoming = mutate(await snapshot(), (document) => {
      document['bodyMeasurements'].push(extraMeasurement);
      document['activities'].push(extraActivity);
      document['sessions'].push(extraSession);
      document['exercises'].push({ ...document['exercises'][0], id: 'exercise-incoming' });
    });

    const report = await storage.backup.import({ json: incoming, mode: 'merge' });
    const reader = await openReader();

    expect(report.mode).toBe('merge');
    // `written` counts the rows the document carries for a collection the mode touches.
    expect(report.written.bodyMeasurements).toBe(2);
    expect(report.written.activities).toBe(2);
    expect(report.written.sessions).toBe(0);
    // `skipped` counts the rows the mode refuses to touch, so written + skipped is the document.
    expect(report.skipped.sessions).toBe(2);
    expect(report.skipped.exercises).toBe(2);

    expect(await reader.count('sessions')).toBe(1);
    expect(await storage.sessions.byId('session-extra')).toBeUndefined();
    expect(await storage.exercises.byId('exercise-incoming')).toBeUndefined();
    expect(await reader.count('bodyMeasurements')).toBe(2);
    expect(await reader.count('activities')).toBe(2);
  });

  it('deduplicates by externalSampleId even when the incoming id differs', async () => {
    await storage.activities.save(
      activity({ externalSampleId: 'health-sample-1', activeEnergyKcal: 200 }),
    );
    const stored = await storage.activities.all();
    const storedId = stored[0]!.id;

    await storage.activities.save(
      activity({ id: storedId, externalSampleId: 'health-sample-1', activeEnergyKcal: 200 }),
    );

    const incoming = mutate(await snapshot(), (document) => {
      document['activities'][0].id = 'a-different-id';
      document['activities'][0].activeEnergyKcal = 310;
    });

    await storage.backup.import({ json: incoming, mode: 'merge' });

    const merged = await storage.activities.all();
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe(storedId);
    expect(merged[0]?.activeEnergyKcal).toBe(310);
  });

  it('never deletes a row that the incoming document does not carry', async () => {
    await seedEverything();
    const reader = await openReader();
    const before = await reader.count('bodyMeasurements');

    const emptier = mutate(await snapshot(), (document) => {
      document['bodyMeasurements'] = [];
      document['activities'] = [];
    });
    await storage.backup.import({ json: emptier, mode: 'merge' });

    expect(await reader.count('bodyMeasurements')).toBe(before);
    expect(await reader.count('activities')).toBe(1);
  });

  it('applies the same validation before merging anything', async () => {
    await seedEverything();
    const before = await snapshot();
    const invalid = mutate(before, (document) => {
      document['bodyMeasurements'][0].weightKg = null;
      for (const key of ['waistCm', 'chestCm', 'armCm', 'thighCm', 'hipCm', 'bodyFatPercent']) {
        document['bodyMeasurements'][0][key] = null;
      }
    });

    await expect(storage.backup.import({ json: invalid, mode: 'merge' })).rejects.toSatisfy(
      (error: unknown) => isStorageError(error) && error.code === 'backupInvalid',
    );
    expect(await snapshot()).toBe(before);
  });
});

/**
 * T3 (odd/tasks/training-program.md S4–S5): `secondaryMuscles`, `description`,
 * `variantOf` and `alternatives` are optional, additive members of `Exercise`. Two
 * behaviours decide whether they really are additive, and both are asserted here because
 * this is the file that covers the record ⇄ domain ⇄ document path.
 */
describe('§9 the additive library detail of T3', () => {
  /** A row as an older build wrote it: flat, no detail columns, nothing to migrate. */
  const legacyRow = {
    id: 'exercise-legacy',
    name: 'Curl femoral tumbado en máquina',
    primaryMuscle: 'hamstrings',
    pattern: 'isolation',
    equipment: 'machine',
    loadIncrementKg: 2.5,
    isCustom: false,
    isArchived: 0,
  } as const;

  it('reads an old row without the fields and round-trips a row that has them', async () => {
    const reader = await openReader();
    await reader.put('exercises', legacyRow);

    // 1. An old row loads. The four keys are absent, not `undefined` values: nothing had
    // to be written back for this row to keep working.
    const legacy = await storage.exercises.byId(legacyRow.id);
    expect(legacy?.name).toBe('Curl femoral tumbado en máquina');
    expect(legacy === undefined ? true : 'description' in legacy).toBe(false);
    expect(legacy === undefined ? true : 'secondaryMuscles' in legacy).toBe(false);
    expect(legacy === undefined ? true : 'variantOf' in legacy).toBe(false);
    expect(legacy === undefined ? true : 'alternatives' in legacy).toBe(false);

    const detailed = exercise({
      id: 'exercise-detailed',
      name: 'Curl femoral sentado en máquina',
      primaryMuscle: 'hamstrings',
      pattern: 'isolation',
      equipment: 'machine',
      secondaryMuscles: ['calves'],
      description:
        'Sentado en la máquina de curl femoral con el rodillo sobre el empeine, flexiona las rodillas y sube el peso sin despegar la espalda del respaldo.',
      variantOf: legacyRow.id,
      alternatives: [legacyRow.id],
    });
    await storage.exercises.save(detailed);

    const stored = await storage.exercises.byId(detailed.id);
    expect(stored?.secondaryMuscles).toEqual(['calves']);
    expect(stored?.variantOf).toBe(legacyRow.id);
    expect(stored?.alternatives).toEqual([legacyRow.id]);

    // 2. The document carries them, validates them, and gives them back after a wipe.
    reader.close();
    raw = null;
    const before = await snapshot();
    const document = JSON.parse(before) as { exercises: Record<string, unknown>[] };
    const exported = document.exercises.find((row) => row['id'] === detailed.id);
    expect(exported?.['secondaryMuscles']).toEqual(['calves']);
    expect(exported?.['description']).toBe(detailed.description);
    expect(exported?.['variantOf']).toBe(legacyRow.id);
    expect(exported?.['alternatives']).toEqual([legacyRow.id]);
    // The old row exports exactly as it was stored: no invented detail on the way out.
    const exportedLegacy = document.exercises.find((row) => row['id'] === legacyRow.id);
    expect(Object.keys(exportedLegacy ?? {}).sort()).toEqual([
      'equipment',
      'id',
      'isArchived',
      'isCustom',
      'loadIncrementKg',
      'name',
      'pattern',
      'primaryMuscle',
    ]);
    expect(storage.backup.validate(before).ok).toBe(true);

    await storage.deleteAll({ confirmation: DELETE_ALL_CONFIRMATION });
    const report = await storage.backup.import({
      json: before,
      mode: 'restore',
      confirmation: RESTORE_CONFIRMATION,
    });
    expect(report.written.exercises).toBe(2);

    const restored = await storage.exercises.byId(detailed.id);
    expect(restored).toEqual(detailed);
    expect(await storage.exercises.byId(legacyRow.id)).toEqual(legacy);
    expect(await snapshot()).toBe(before);
  });
});
