/**
 * The two adapters between a sync row and a stored row — odd/tasks/cloud-sync.md T5/T6,
 * specs S4, S5, S6.
 *
 * `SyncService` (src/cloud/sync.ts) refuses to know what a row *is*: it reads a
 * `SyncRowVersion`, compares it, and hands the winner to an `apply` callback. This file
 * is that callback and its inverse, and it is the only place where a sync row and a
 * stored record are the same thing:
 *
 * - **down** (`applyToStorage`): a pulled `SyncChange` becomes a `StoredSyncRow` for
 *   `storage.sync.applySyncRow`, which writes it exactly as received — no guard, no
 *   queue — because the row was decided by the merge and refusing it would leave the
 *   watermark behind it forever.
 * - **up** (`rowVersion`): a stored row's `sync` field plus the values it carries, for
 *   the merge to compare and for the push to send.
 *
 * Three rules shape the mapping, and each one exists because its absence is a silent
 * loss:
 *
 * 1. **The values are the synced fields only.** A local record carries more than the
 *    account holds — an exercise's `illustration`, an exercise session's
 *    `substitutedFrom`, the row's own `id` and its `sync` stamp. Sending them would make
 *    `sameContent` compare two different bags on every round trip, which turns each pull
 *    into a spurious conflict, and would let a remote update overwrite a field the
 *    remote never carried.
 * 2. **An applied update merges, it does not replace.** The remote's values win on the
 *    fields it owns; the local-only fields stay. `applySyncRow` is a `put`, so the merge
 *    has to happen here, before the write (S4: «No sobrescribir automáticamente datos
 *    existentes», S5: «conserva la información»).
 * 3. **A tombstone is a write, not a removal.** A row with `deletedAt` set lands through
 *    the same path with its `sync.deletedAt` stamped; nothing is ever deleted by sync, on
 *    either side (S5, S7). The app-facing reads hide it (`isTombstone`), and the bytes
 *    are still there.
 *
 * The two single-row tables (`profiles`, `phase_state`) are stored in `meta` as
 * `{ key, value }`, not as a flat record, so they are unwrapped on the way up and
 * re-wrapped on the way down. `tableTarget()` is the storage layer's own answer to
 * "where does this table live", so that knowledge is not repeated here.
 */

import { tableTarget, type StoredSyncRow, type SyncMeta, type SyncStoragePort } from '../storage';
import {
  SYNC_TABLES,
  type ApplyChange,
  type LocalStorePort,
  type SyncChange,
  type SyncRowValues,
  type SyncRowVersion,
  type SyncTable,
} from './types';

/**
 * The fields each table carries to the account, in the remote's own field names.
 *
 * This is the local half of the contract `src/cloud/remote.ts` encodes as SQL columns:
 * the same names, the same set, one field per column the migration has. A field that is
 * not listed here stays on this device — `docs/cloud-sync.md` §1 has no column for it,
 * so pushing it would be rejected or lost.
 */
const SYNCED_FIELDS: Readonly<Record<SyncTable, readonly string[]>> = {
  profiles: [
    'displayName',
    'massUnit',
    'weightGoal',
    'weeklyTrainingDays',
    'availableEquipment',
    'autoStartRestTimer',
  ],
  plan_days: ['name', 'order'],
  plan_items: ['planDayId', 'order', 'exerciseId', 'exerciseNameSnapshot', 'prescription'],
  phase_state: ['block', 'passedBlocks', 'role', 'scheduledSessionsPerWeek'],
  exercises: [
    'name',
    'primaryMuscle',
    'pattern',
    'equipment',
    'loadIncrementKg',
    'isCustom',
    'isArchived',
    'secondaryMuscles',
    'description',
    'variantOf',
    'alternatives',
  ],
  sessions: [
    'planDayId',
    'dayNameSnapshot',
    'scheduledDate',
    'startedAt',
    'endedAt',
    'phase',
    'status',
    'deletionPending',
  ],
  session_exercises: [
    'sessionId',
    'sessionDate',
    'order',
    'exerciseId',
    'exerciseNameSnapshot',
    'prescription',
    'recommendation',
    'decision',
    'recommendedWeightKg',
    'usedWeightKg',
    'loadDeltaKg',
    'status',
    'completedAt',
  ],
  sets: [
    'exerciseSessionId',
    'sessionId',
    'index',
    'weightKg',
    'targetReps',
    'actualReps',
    'effort',
    'discomfort',
    'confirmedAt',
  ],
  body_measurements: [
    'date',
    'weightKg',
    'waistCm',
    'chestCm',
    'armCm',
    'thighCm',
    'hipCm',
    'bodyFatPercent',
    'provenance',
  ],
  activities: [
    'date',
    'kind',
    'durationSeconds',
    'activeEnergyKcal',
    'provenance',
    'externalSampleId',
  ],
};

/** The tables whose row is a single `meta` record (`{ key, value }`), not a flat row. */
const META_TABLES: ReadonlySet<SyncTable> = new Set<SyncTable>(
  SYNC_TABLES.filter((table) => tableTarget(table).metaKey !== null),
);

function isValues(value: unknown): value is SyncRowValues {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The inner domain record of a single-row table, or `{}` when the row is not there yet. */
function innerRecord(record: SyncRowValues | undefined): SyncRowValues {
  const inner = record?.['value'];
  return isValues(inner) ? inner : {};
}

/** One field set, `undefined` dropped: an absent field is not the same as `null`. */
function pick(fields: readonly string[], source: SyncRowValues): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    const value = source[field];
    if (value === undefined) continue;
    picked[field] = value;
  }
  return picked;
}

/**
 * The values a stored record sends to the account: the synced fields, nothing else.
 *
 * `id`, `sync` and — for the single-row tables — the `key`/`value` wrapper are not
 * values; the identity travels beside them (`SyncRowVersion` and `SyncChange` both carry
 * the row id) and the stamp is what the comparison reads.
 */
export function syncedValues(table: SyncTable, record: SyncRowValues): SyncRowValues {
  const source = META_TABLES.has(table) ? innerRecord(record) : record;
  return pick(SYNCED_FIELDS[table], source);
}

/**
 * A pulled change as the record to store: the remote's values over the local ones, so a
 * field the account does not carry survives an update (§2 above).
 *
 * `mode` is not a hint: `insert` means the merge compared against nothing, so there is
 * nothing to read and nothing to merge; `update` replaces a row that exists here.
 */
export function storedRecord(
  table: SyncTable,
  values: SyncRowValues,
  previous: SyncRowValues | undefined,
): Record<string, unknown> {
  if (META_TABLES.has(table)) {
    return { value: { ...innerRecord(previous), ...values } };
  }
  return { ...previous, ...values };
}

/** A stored row as the merge sees it: its `sync` stamp plus the values it carries. */
export function rowVersion(table: SyncTable, stored: StoredSyncRow): SyncRowVersion {
  return {
    rev: stored.sync.rev,
    updatedAt: stored.sync.updatedAt,
    deletedAt: stored.sync.deletedAt,
    values: syncedValues(table, stored.record),
  };
}

/**
 * The two calls `applyToStorage` and `localStoreOf` need from the storage layer.
 *
 * Narrower than `SyncStoragePort` on purpose: these adapters neither queue nor watermark,
 * so a test can hand them a Map and the app hands them `AppServices.cloud.storage`.
 */
export type SyncRowStore = Pick<SyncStoragePort, 'readSyncRow' | 'applySyncRow'>;

/** The pull side of `SyncService`: one stored row by id, stamped, or `null`. */
export function localStoreOf(sync: SyncRowStore): LocalStorePort {
  return {
    async read(table, rowId) {
      const stored = await sync.readSyncRow(table, rowId);
      return stored === undefined ? null : rowVersion(table, stored);
    },
  };
}

/** The stored key a synced table is written under: its own id, or the fixed meta key. */
function storedId(table: SyncTable, rowId: string): string {
  return tableTarget(table).metaKey ?? rowId;
}

/**
 * The push side of `SyncService`: one pulled change, written as received.
 *
 * Every failure is left to throw: the service records it as an `apply` failure and keeps
 * the watermark behind the row, so the next pass offers it again instead of losing it.
 */
export function applyToStorage(sync: SyncRowStore): ApplyChange {
  return async (change: SyncChange): Promise<void> => {
    const previous =
      change.mode === 'update'
        ? (await sync.readSyncRow(change.table, change.rowId))?.record
        : undefined;

    const meta: SyncMeta = {
      rev: change.rev,
      updatedAt: change.updatedAt,
      deletedAt: change.deletedAt,
    };

    await sync.applySyncRow(change.table, {
      table: change.table,
      id: storedId(change.table, change.rowId),
      sync: meta,
      record: storedRecord(change.table, change.values, previous),
    });
  };
}
