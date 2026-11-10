/**
 * The adapters that make a sync row and a stored row the same row — odd/tasks/cloud-sync.md
 * T5/T6, specs S4, S5.
 *
 * Every expectation here is a loss that would be silent in production:
 *
 * - a field that travels to the account but is not read back (a push that never equals the
 *   row it came from, so every pull is a conflict);
 * - a local-only field the account does not carry, dropped by a `put` (an exercise's
 *   illustration, an exercise session's substitution);
 * - a tombstone written as a removal (history gone, S5 and S7 both broken);
 * - a single-row table written flat into `meta`, where the app then cannot read it.
 *
 * The store is a Map behind the two calls the adapters use. `applySyncRow` is mimicked
 * with the rule `src/storage/repositories/sync.ts` implements — `id` for a flat table, the
 * fixed `key` for a single-row one — so the assertions are about the mapping, not about a
 * second copy of IndexedDB.
 */

import { describe, expect, it } from 'vitest';
import { tableTarget, type StoredSyncRow } from '../storage';
import { applyToStorage, localStoreOf, rowVersion, storedRecord, syncedValues } from './apply';
import { SYNC_TABLES, type SyncChange, type SyncRowValues, type SyncTable } from './types';

const NOW = 1_760_000_000_000;

/** The two calls the adapters use, over a Map. A read is counted, so `mode` is visible. */
class MemoryRows {
  readonly rows = new Map<string, StoredSyncRow>();
  reads = 0;

  keyOf(table: SyncTable, id: string): string {
    return `${table}:${tableTarget(table).metaKey ?? id}`;
  }

  seed(row: StoredSyncRow): void {
    this.rows.set(this.keyOf(row.table, row.id), row);
  }

  readSyncRow(table: SyncTable, id: string): Promise<StoredSyncRow | undefined> {
    this.reads += 1;
    return Promise.resolve(this.rows.get(this.keyOf(table, id)));
  }

  /** As `SyncRepository.applySyncRow`: a put, with the identity the storage layer owns. */
  applySyncRow(table: SyncTable, row: StoredSyncRow): Promise<void> {
    const metaKey = tableTarget(table).metaKey;
    const id = metaKey ?? row.id;
    const record = metaKey === null ? { ...row.record, id } : { ...row.record, key: metaKey };
    this.rows.set(this.keyOf(table, id), { table, id, sync: row.sync, record });
    return Promise.resolve();
  }
}

/** One value per synced field of every table: the contract this file has with `remote.ts`. */
const SAMPLE: Readonly<Record<SyncTable, SyncRowValues>> = {
  profiles: {
    displayName: 'Ana',
    massUnit: 'kg',
    weightGoal: 'maintain',
    weeklyTrainingDays: 4,
    availableEquipment: ['barbell', 'dumbbell'],
    autoStartRestTimer: false,
  },
  plan_days: { name: 'Día A', order: 1 },
  plan_items: {
    planDayId: 'day-1',
    order: 2,
    exerciseId: 'exercise-1',
    exerciseNameSnapshot: 'Sentadilla',
    prescription: { sets: 3, repsFrom: 6, repsTo: 8, restSeconds: 150 },
  },
  phase_state: { block: 2, passedBlocks: 1, role: 'accumulation', scheduledSessionsPerWeek: 4 },
  exercises: {
    name: 'Sentadilla',
    primaryMuscle: 'quadriceps',
    pattern: 'squat',
    equipment: 'barbell',
    loadIncrementKg: 2.5,
    isCustom: false,
    isArchived: 0,
    secondaryMuscles: ['glutes'],
    description: 'Barra alta.',
    variantOf: null,
    alternatives: ['exercise-2'],
  },
  sessions: {
    planDayId: 'day-1',
    dayNameSnapshot: 'Día A',
    scheduledDate: NOW,
    startedAt: NOW + 1,
    endedAt: NOW + 2,
    phase: 'accumulation',
    status: 'completed',
    deletionPending: false,
  },
  session_exercises: {
    sessionId: 'session-1',
    sessionDate: NOW,
    order: 1,
    exerciseId: 'exercise-1',
    exerciseNameSnapshot: 'Sentadilla',
    prescription: { sets: 3, repsFrom: 6, repsTo: 8, restSeconds: 150 },
    recommendation: { suggestedWeightKg: 80, basis: 'history', reasons: ['progressed'] },
    decision: 'repeated',
    recommendedWeightKg: 80,
    usedWeightKg: 80,
    loadDeltaKg: 0,
    status: 'completed',
    completedAt: NOW + 3,
  },
  sets: {
    exerciseSessionId: 'session-exercise-1',
    sessionId: 'session-1',
    index: 1,
    weightKg: 80,
    targetReps: 6,
    actualReps: 6,
    effort: 'moderate',
    discomfort: 'none',
    confirmedAt: NOW + 4,
  },
  body_measurements: {
    date: NOW,
    weightKg: 74.2,
    waistCm: 81,
    chestCm: 99,
    armCm: 34,
    thighCm: 56,
    hipCm: 95,
    bodyFatPercent: 18,
    provenance: 'manual',
  },
  activities: {
    date: NOW,
    kind: 'football',
    durationSeconds: 5400,
    activeEnergyKcal: 620,
    provenance: 'manual',
    externalSampleId: 'sample-1',
  },
};

function changeOf(
  table: SyncTable,
  rowId: string,
  values: SyncRowValues,
  patch: Partial<SyncChange> = {},
): SyncChange {
  return {
    table,
    rowId,
    mode: 'insert',
    rev: 1,
    updatedAt: NOW,
    deletedAt: null,
    values,
    ...patch,
  };
}

/** One stored row as the push side builds it, for the reverse-adapter tests. */
function storedRow(
  table: SyncTable,
  id: string,
  record: SyncRowValues,
  sync: { readonly rev: number; readonly updatedAt: number; readonly deletedAt: number | null } = {
    rev: 3,
    updatedAt: NOW,
    deletedAt: null,
  },
): StoredSyncRow {
  return { table, id, sync, record };
}

describe('applyToStorage', () => {
  it('reads back exactly the values it wrote, for every table', async () => {
    for (const table of SYNC_TABLES) {
      const rows = new MemoryRows();
      const values = SAMPLE[table];
      await applyToStorage(rows)(changeOf(table, 'row-1', values));

      const stored = await rows.readSyncRow(table, 'row-1');
      expect(stored, table).toBeDefined();
      if (stored === undefined) continue;

      // The round trip is the contract: what the account carries is what this device
      // sends again, so a pull of the row we just pushed is not a conflict.
      expect(rowVersion(table, stored).values, table).toEqual(values);
      expect(Object.keys(rowVersion(table, stored).values).sort(), table).toEqual(
        Object.keys(values).sort(),
      );
    }
  });

  it('lands a tombstone as a soft delete through the same path', async () => {
    const rows = new MemoryRows();
    const values = SAMPLE.sets;
    await applyToStorage(rows)(changeOf('sets', 'set-1', values, { deletedAt: NOW + 5 }));

    const stored = await rows.readSyncRow('sets', 'set-1');
    expect(stored?.sync.deletedAt).toBe(NOW + 5);
    // Nothing is removed and nothing is blanked: a device that was offline learns that a
    // set was deleted instead of losing the fact that it existed (S5, S7).
    expect(stored?.record['weightKg']).toBe(80);
    expect(rowVersion('sets', stored as StoredSyncRow).deletedAt).toBe(NOW + 5);
    expect(rows.rows.size).toBe(1);
  });

  it('keeps the fields the account does not carry when an update wins', async () => {
    const rows = new MemoryRows();
    rows.seed(
      storedRow('exercises', 'exercise-1', {
        id: 'exercise-1',
        ...SAMPLE.exercises,
        illustration: 'sentadilla.svg',
        sync: { rev: 1, updatedAt: NOW - 1, deletedAt: null },
      }),
    );

    const values = { ...SAMPLE.exercises, name: 'Sentadilla frontal' };
    await applyToStorage(rows)(changeOf('exercises', 'exercise-1', values, { mode: 'update' }));

    const stored = await rows.readSyncRow('exercises', 'exercise-1');
    expect(stored?.record['name']).toBe('Sentadilla frontal');
    expect(stored?.record['illustration']).toBe('sentadilla.svg');
  });

  it('does not read a row it is inserting, and does read one it is updating', async () => {
    const rows = new MemoryRows();
    const apply = applyToStorage(rows);

    await apply(changeOf('sessions', 'session-1', SAMPLE.sessions));
    expect(rows.reads).toBe(0);

    await apply(changeOf('sessions', 'session-1', SAMPLE.sessions, { mode: 'update' }));
    expect(rows.reads).toBe(1);
  });

  it('stores the two single-row tables under their meta key, wrapped in `value`', async () => {
    const rows = new MemoryRows();
    const apply = applyToStorage(rows);

    await apply(changeOf('profiles', 'profile-uuid', SAMPLE.profiles));
    await apply(changeOf('phase_state', 'phase-uuid', SAMPLE.phase_state));

    const profile = await rows.readSyncRow('profiles', 'profile-uuid');
    expect(profile?.id).toBe('profile');
    expect(profile?.record['displayName']).toBeUndefined();
    expect(profile?.record['value']).toEqual(SAMPLE.profiles);

    const phase = await rows.readSyncRow('phase_state', 'phase-uuid');
    expect(phase?.id).toBe('phaseState');
    expect(phase?.record['value']).toEqual(SAMPLE.phase_state);
  });

  it('merges a single-row update field by field, keeping the rest of the record', async () => {
    const rows = new MemoryRows();
    const apply = applyToStorage(rows);

    await apply(changeOf('profiles', 'profile-uuid', SAMPLE.profiles));
    await apply(
      changeOf('profiles', 'profile-uuid', { displayName: 'Bea' }, { mode: 'update', rev: 2 }),
    );

    const profile = await rows.readSyncRow('profiles', 'profile-uuid');
    expect(profile?.record['value']).toEqual({ ...SAMPLE.profiles, displayName: 'Bea' });
    expect(profile?.sync.rev).toBe(2);
  });
});

describe('syncedValues', () => {
  it('drops the identity and the stamp: they are not row values', () => {
    expect(
      syncedValues('plan_days', {
        id: 'day-1',
        name: 'Día A',
        order: 1,
        sync: { rev: 4, updatedAt: NOW, deletedAt: null },
      }),
    ).toEqual({ name: 'Día A', order: 1 });
  });

  it('drops a field the account has no column for', () => {
    expect(
      syncedValues('exercises', { name: 'Press', illustration: 'press.svg', isArchived: 1 }),
    ).toEqual({ name: 'Press', isArchived: 1 });
  });

  it('treats an undefined field as absent, so it never reads back as null', () => {
    const values = syncedValues('sessions', { status: 'completed', endedAt: undefined });
    expect(values).toEqual({ status: 'completed' });
    expect('endedAt' in values).toBe(false);
  });

  it('unwraps a single-row record before picking fields', () => {
    expect(syncedValues('profiles', { key: 'profile', value: { massUnit: 'kg' } })).toEqual({
      massUnit: 'kg',
    });
    expect(syncedValues('profiles', { key: 'profile' })).toEqual({});
  });
});

describe('rowVersion and localStoreOf', () => {
  it('reads the stamp from `sync`, not from the record', () => {
    const version = rowVersion(
      'sets',
      storedRow('sets', 'set-1', SAMPLE.sets, { rev: 7, updatedAt: NOW - 5, deletedAt: NOW }),
    );

    expect(version.rev).toBe(7);
    expect(version.updatedAt).toBe(NOW - 5);
    expect(version.deletedAt).toBe(NOW);
    expect(version.values).toEqual(SAMPLE.sets);
  });

  it('answers null for a row this device does not hold', async () => {
    const rows = new MemoryRows();
    expect(await localStoreOf(rows).read('sets', 'missing')).toBeNull();

    rows.seed(storedRow('sets', 'set-1', SAMPLE.sets));
    expect(await localStoreOf(rows).read('sets', 'set-1')).toEqual(rowVersion('sets', storedRow('sets', 'set-1', SAMPLE.sets)));
  });
});

describe('storedRecord', () => {
  it('spreads a flat table over what was there and wraps a single-row one', () => {
    expect(storedRecord('plan_days', { name: 'Día B' }, { id: 'day-1', name: 'Día A', extra: 1 })).toEqual({
      id: 'day-1',
      name: 'Día B',
      extra: 1,
    });
    expect(storedRecord('phase_state', { block: 3 }, { key: 'phaseState', value: { block: 2, role: 'x' } })).toEqual({
      value: { block: 3, role: 'x' },
    });
  });
});
