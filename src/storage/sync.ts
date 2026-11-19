/**
 * The storage half of the sync layer — odd/tasks/cloud-sync.md T3/T4/T6, specs S1, S4,
 * S5, S6, S7.
 *
 * Four rules live here:
 *
 * 1. **A local write is the whole story.** Every repository write stamps `rev` and
 *    `updatedAt` and appends its queue op **inside the same transaction** that writes
 *    the row, so a crash can leave both or neither. Nothing in the app awaits the network
 *    to decide that a set was confirmed (S1).
 * 2. **The queue is stored in `meta`, not in a store of its own.** The nine stores of
 *    `docs/data-model.md` §5.1 stay nine and `DB_VERSION` stays 1: `meta` is schemaless
 *    and already keyed by a string, so a pending op is `outbox:<table>:<rowId>:<rev>` and
 *    the push watermarks are one row under `syncWatermarks`. No upgrade step, no copied
 *    row, nothing to half-migrate.
 * 3. **The queue's vocabulary is not imported; only its shape is.** `PendingSyncOp` is
 *    field for field the queue's own op, so `src/cloud/outbox.ts` can be handed
 *    `storage.sync.queue()` as its store. `src/storage` keeps knowing nothing about the
 *    queue, the remote or Supabase.
 * 4. **Nothing here runs at import time.** Only types, constants and functions that take
 *    the transaction they must write in.
 */

import type { IDBPTransaction } from 'idb';
import type { SyncTable } from '../cloud/types';
import { META_KEYS, OUTBOX_OP_PREFIX } from './constants';
import type { EpochMs } from './entities';
import { nextSync, syncOf } from './mappers';
import type {
  MetaRow,
  PendingSyncOp,
  RupfitDb,
  StoreName,
  SyncMeta,
  SyncWatermarks,
} from './records';

/** The two transaction shapes a repository or the sync surface may be handed. */
export type WriteTx = IDBPTransaction<RupfitDb, StoreName[], 'readwrite'>;
export type ReadTx = IDBPTransaction<RupfitDb, StoreName[], 'readonly'>;

/**
 * The pieces of an `idb` object store this module uses, declared structurally.
 *
 * The point is not to avoid a type: a store name that arrives as a `SyncTable` cannot be
 * narrowed to one member of `StoreName`, and threading a generic through every helper
 * would document nothing. The three methods are exactly the ones the callers use.
 */
export interface KeyedStore {
  get(key: string): Promise<unknown>;
  put(value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  getAllKeys(): Promise<string[]>;
}

export function keyedStore(store: unknown): KeyedStore {
  return store as KeyedStore;
}

/* ------------------------------------------------------------------- tables */

/**
 * Where one mirrored table lives locally.
 *
 * Eight tables are one store each, keyed by the row's own id. The two remaining ones —
 * `profiles` and `phase_state` — are single-row records in `meta`, keyed by a fixed
 * string, because that is how `docs/data-model.md` §5.1 stores them: a second copy of
 * the profile under a uuid key would be a second truth.
 */
export interface TableTarget {
  readonly store: StoreName;
  /** `null` for the eight id-keyed stores; the fixed key for a single-row `meta` table. */
  readonly metaKey: string | null;
}

const TABLE_TARGETS: Record<SyncTable, TableTarget> = {
  profiles: { store: 'meta', metaKey: META_KEYS.profile },
  plan_days: { store: 'planDays', metaKey: null },
  plan_items: { store: 'planItems', metaKey: null },
  phase_state: { store: 'meta', metaKey: META_KEYS.phaseState },
  exercises: { store: 'exercises', metaKey: null },
  sessions: { store: 'sessions', metaKey: null },
  session_exercises: { store: 'exerciseSessions', metaKey: null },
  sets: { store: 'sets', metaKey: null },
  body_measurements: { store: 'bodyMeasurements', metaKey: null },
  activities: { store: 'activities', metaKey: null },
};

export function tableTarget(table: SyncTable): TableTarget {
  return TABLE_TARGETS[table];
}

/** The key a row is stored under: its own id, or the fixed key of a single-row table. */
export function storedKey(table: SyncTable, id: string): string {
  return TABLE_TARGETS[table].metaKey ?? id;
}

/* -------------------------------------------------------------------- queue */

/**
 * The seam a repository needs from the queue: one call per written row, made with the
 * transaction the row is written in.
 *
 * This is deliberately not a promise-taking interface. An implementation that opened its
 * own transaction would break the rule it exists to serve — a crash between the row and
 * the op would lose the op — so the transaction is a parameter, not something the sink
 * may find for itself.
 */
export interface SyncQueueSink {
  enqueue(tx: WriteTx, op: PendingSyncOp): Promise<void>;
}

/**
 * The queue's persistence, shaped exactly like `OutboxStorePort` in
 * `src/cloud/types.ts` so the sync service's `Outbox` can be constructed over it without
 * a translation layer and without `src/storage` importing anything from the queue.
 */
export interface SyncOutboxStorePort {
  allOps(): Promise<readonly PendingSyncOp[]>;
  putOps(ops: readonly PendingSyncOp[]): Promise<void>;
  removeOps(ids: readonly string[]): Promise<void>;
}

/** The `meta` key of one op. Prefix + the op's own id, so it stays addressable. */
export function outboxOpKey(op: { readonly table: SyncTable; readonly rowId: string; readonly rev: number }): string {
  return `${OUTBOX_OP_PREFIX}${op.table}:${op.rowId}:${op.rev}`;
}

/** The identity rule of the queue, in one function (`table:rowId:rev`). */
export function pendingOpId(table: SyncTable, rowId: string, rev: number): string {
  return `${table}:${rowId}:${rev}`;
}

export interface PendingOpInput {
  readonly table: SyncTable;
  readonly rowId: string;
  readonly op: 'upsert' | 'delete';
  readonly rev: number;
  readonly at: EpochMs;
}

export function pendingOp(input: PendingOpInput): PendingSyncOp {
  return {
    id: pendingOpId(input.table, input.rowId, input.rev),
    table: input.table,
    rowId: input.rowId,
    op: input.op,
    rev: input.rev,
    queuedAt: input.at,
    attempts: 0,
    lastError: null,
  };
}

/* ------------------------------------------------------------ stamped writes */

/** What every repository needs from the sync layer: a clock and the queue. */
export interface RowSyncDeps {
  readonly queue: SyncQueueSink;
  readonly now: () => number;
}

export interface StampedWriteInput<Row> extends RowSyncDeps {
  readonly tx: WriteTx;
  readonly table: SyncTable;
  /** The stored key — the row's id, or the fixed `meta` key. */
  readonly key: string;
  /** The whole stored value, sync metadata excluded: it is computed here, not trusted. */
  readonly row: Row;
}

/**
 * Writes the row with `rev + 1` and a fresh `updatedAt`, and queues it in the same
 * transaction.
 *
 * The previous row is read inside the transaction — not from a cache — because `rev` is
 * only monotonic if it is read from the row it is about to replace. A deleted or
 * tombstoned row is still a row: its `rev` keeps counting.
 */
export async function writeStamped<Row extends object>(
  input: StampedWriteInput<Row>,
): Promise<SyncMeta> {
  const target = tableTarget(input.table);
  const store = keyedStore(input.tx.objectStore(target.store));
  const previous = await store.get(input.key);
  const sync = nextSync(syncOf(previous as { sync?: SyncMeta } | undefined), input.now());
  await store.put({ ...input.row, sync });
  await input.queue.enqueue(
    input.tx,
    pendingOp({
      table: input.table,
      rowId: input.key,
      op: 'upsert',
      rev: sync.rev,
      at: sync.updatedAt,
    }),
  );
  return sync;
}

export interface StampedDeleteInput extends RowSyncDeps {
  readonly tx: WriteTx;
  readonly table: SyncTable;
  readonly key: string;
}

/**
 * Removes the row and queues the deletion in the same transaction.
 *
 * The op carries the last `rev` plus one, so the remote can order the deletion against
 * the updates it already has. The row itself is gone locally — a user deleting a session
 * expects it to disappear — and the *remote* keeps it as a soft delete
 * (`docs/cloud-sync.md` §2); the sync path is what never removes bytes.
 */
export async function deleteStamped(input: StampedDeleteInput): Promise<void> {
  const target = tableTarget(input.table);
  const store = keyedStore(input.tx.objectStore(target.store));
  const previous = await store.get(input.key);
  const sync = nextSync(syncOf(previous as { sync?: SyncMeta } | undefined), input.now());
  await store.delete(input.key);
  await input.queue.enqueue(
    input.tx,
    pendingOp({
      table: input.table,
      rowId: input.key,
      op: 'delete',
      rev: sync.rev,
      at: sync.updatedAt,
    }),
  );
}

/* --------------------------------------------------------------- watermark */

/** The `meta` row the per-table push marks live in. */
export function watermarksRow(value: SyncWatermarks): MetaRow {
  return { key: META_KEYS.syncWatermarks, value };
}
