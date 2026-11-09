/**
 * The sync-facing storage adapter — odd/tasks/cloud-sync.md T3/T4/T6.
 *
 * Two objects, both here because they are the same concern from two sides:
 *
 * - `MetaSyncQueue` is the pending queue and the push watermarks, stored as rows of the
 *   existing `meta` store. It writes an op **into a caller's transaction** so the row and
 *   its op share one commit, and it also presents the queue in the shape
 *   `src/cloud/outbox.ts` consumes (`allOps`/`putOps`/`removeOps`), so the sync service
 *   can be constructed over it without this module importing the queue.
 * - `SyncRepository` is the sync read/write surface: one row by id, rows since an
 *   instant, and a pulled row applied as received.
 *
 * Neither is on `StoragePort`. A screen holds a `StoragePort` and therefore cannot reach
 * a method that writes history behind a guard's back.
 */

import { META_KEYS } from '../constants';
import type { Database } from '../db';
import type { EpochMs, Uuid } from '../entities';
import { isTombstone, stripSync, syncOf } from '../mappers';
import type { MetaRow, PendingSyncOp, SyncMeta, SyncWatermarks } from '../records';
import type { StoredSyncRow, SyncStoragePort } from '../port';
import type { SyncTable } from '../../cloud/types';
import {
  keyedStore,
  outboxOpKey,
  storedKey,
  tableTarget,
  watermarksRow,
  type KeyedStore,
  type SyncOutboxStorePort,
  type SyncQueueSink,
  type WriteTx,
} from '../sync';

/** `outbox:<table>:<rowId>:<rev>` → the op it holds, or `null` for another `meta` row. */
function asPendingOp(row: unknown): PendingSyncOp | null {
  if (typeof row !== 'object' || row === null) return null;
  const candidate = row as { key?: unknown; value?: unknown };
  if (typeof candidate.key !== 'string' || !candidate.key.startsWith('outbox:')) return null;
  const value = candidate.value;
  if (typeof value !== 'object' || value === null) return null;
  return value as PendingSyncOp;
}

function sortByQueuedAt(ops: readonly PendingSyncOp[]): PendingSyncOp[] {
  return [...ops].sort(
    (left, right) =>
      left.queuedAt - right.queuedAt ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
}

/**
 * The pending queue, persisted in `meta`.
 *
 * The one rule that matters: `enqueue` never opens a transaction. It is handed the
 * transaction that writes the row, so a crash between the two writes is impossible —
 * IndexedDB commits both or neither.
 */
export class MetaSyncQueue implements SyncQueueSink, SyncOutboxStorePort {
  constructor(private readonly database: Database) {}

  /**
   * Appends one op inside `tx`.
   *
   * A newer intent for the same row supersedes every older pending one: replaying an
   * older value after a newer one would publish the past. An op re-offered with the same
   * `rev` keeps its retry counter, so a poison op cannot reset its own budget.
   */
  async enqueue(tx: WriteTx, op: PendingSyncOp): Promise<void> {
    const meta = keyedStore(tx.objectStore('meta'));
    const key = outboxOpKey(op);
    const pending = (await meta.getAll()).map(asPendingOp).filter((row) => row !== null);

    for (const other of pending) {
      if (
        other.table === op.table &&
        other.rowId === op.rowId &&
        other.rev < op.rev
      ) {
        await meta.delete(outboxOpKey(other));
      }
    }

    const same = pending.find((other) => other.id === op.id);
    const stored: PendingSyncOp =
      same === undefined
        ? op
        : { ...op, attempts: same.attempts, lastError: same.lastError };
    // The cast states the invariant: `outboxOpKey` always starts with the prefix.
    await meta.put({ key: key as `outbox:${string}`, value: stored } satisfies MetaRow);
  }

  /* ------------------------------------------------- the queue as a store port */

  async allOps(): Promise<readonly PendingSyncOp[]> {
    const rows = await this.database.read(['meta'], async (tx) =>
      keyedStore(tx.objectStore('meta')).getAll(),
    );
    return sortByQueuedAt(rows.map(asPendingOp).filter((row) => row !== null));
  }

  async putOps(ops: readonly PendingSyncOp[]): Promise<void> {
    if (ops.length === 0) return;
    await this.database.write(['meta'], async (tx) => {
      const meta = keyedStore(tx.objectStore('meta'));
      for (const op of ops) {
        await meta.put({
          key: outboxOpKey(op) as `outbox:${string}`,
          value: op,
        } satisfies MetaRow);
      }
    });
  }

  async removeOps(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.database.write(['meta'], async (tx) => {
      const meta = keyedStore(tx.objectStore('meta'));
      const pending = (await meta.getAll()).map(asPendingOp).filter((row) => row !== null);
      const wanted = new Set(ids);
      for (const op of pending) {
        if (wanted.has(op.id)) await meta.delete(outboxOpKey(op));
      }
    });
  }

  /* ------------------------------------------------------------- watermarks */

  async watermarks(): Promise<SyncWatermarks> {
    const rows = await this.database.read(['meta'], async (tx) =>
      keyedStore(tx.objectStore('meta')).getAll(),
    );
    return readWatermarks(rows);
  }

  /** Only ever forward: a pull that restarts must not rewind a table (§4 of the T4 notes). */
  async putWatermark(table: SyncTable, at: EpochMs): Promise<void> {
    await this.database.write(['meta'], async (tx) => {
      const meta = keyedStore(tx.objectStore('meta'));
      const current = readWatermarks(await meta.getAll());
      const previous = current[table];
      if (previous !== undefined && at <= previous) return;
      await meta.put(watermarksRow({ ...current, [table]: at }));
    });
  }
}

function readWatermarks(rows: readonly unknown[]): SyncWatermarks {
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const candidate = row as { key?: unknown; value?: unknown };
    if (candidate.key !== META_KEYS.syncWatermarks) continue;
    if (typeof candidate.value !== 'object' || candidate.value === null) return {};
    return { ...(candidate.value as SyncWatermarks) };
  }
  return {};
}

/** A stored `meta` row is a sync row whose `record` is `{ key, value }`. */
function storedSyncRow(table: SyncTable, id: string, raw: unknown): StoredSyncRow {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    table,
    id,
    sync: syncOf(record as { sync?: SyncMeta }),
    record: stripSync(record),
  };
}

export class SyncRepository implements SyncStoragePort {
  constructor(
    private readonly database: Database,
    private readonly pending: MetaSyncQueue,
  ) {}

  async readSyncRow(table: SyncTable, id: Uuid): Promise<StoredSyncRow | undefined> {
    const target = tableTarget(table);
    const key = storedKey(table, id);
    const raw = await this.database.read([target.store], async (tx) =>
      keyedStore(tx.objectStore(target.store)).get(key),
    );
    return raw === undefined || raw === null ? undefined : storedSyncRow(table, key, raw);
  }

  /**
   * Rows with `updatedAt > since`, oldest first.
   *
   * A store scan rather than an index, on purpose: an index over `sync.updatedAt` would be
   * the tenth index of a schema whose table is fixed by `docs/data-model.md` §5.1, and the
   * scan is over the rows a device holds, not over the history of the account.
   */
  async listSyncRows(table: SyncTable, since: EpochMs): Promise<readonly StoredSyncRow[]> {
    const target = tableTarget(table);
    const rows = await this.database.read([target.store], async (tx) =>
      keyedStore(tx.objectStore(target.store)).getAll(),
    );
    return rows
      .map((raw) => {
        const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        const key = target.metaKey ?? String(record['id']);
        return storedSyncRow(table, key, record);
      })
      // `meta` also holds the queue ops and the watermarks; a single-row table is only its
      // own key, never everything that shares the store with it.
      .filter((row) => target.metaKey === null || row.id === target.metaKey)
      .filter((row) => row.sync.updatedAt > since)
      .sort((left, right) => left.sync.updatedAt - right.sync.updatedAt || left.id.localeCompare(right.id));
  }

  /**
   * Writes a pulled row exactly as received.
   *
   * No guard runs here and none may: the row was decided by the merge, and refusing it
   * would leave the watermark behind it forever. A `deletedAt` row is written, not
   * removed — a tombstone is how a device that was offline learns that a session was
   * deleted instead of silently keeping it.
   *
   * Nothing is queued: the row came *from* the remote, and pushing it back would echo.
   */
  async applySyncRow(table: SyncTable, row: StoredSyncRow): Promise<void> {
    const target = tableTarget(table);
    const value =
      target.metaKey === null
        ? { ...row.record, id: row.id, sync: row.sync }
        : { ...row.record, key: target.metaKey, sync: row.sync };
    await this.database.write([target.store], async (tx) => {
      const store: KeyedStore = keyedStore(tx.objectStore(target.store));
      await store.put(value);
    });
  }

  async readPushWatermark(table: SyncTable): Promise<EpochMs | null> {
    const marks = await this.pending.watermarks();
    return marks[table] ?? null;
  }

  writePushWatermark(table: SyncTable, at: EpochMs): Promise<void> {
    return this.pending.putWatermark(table, at);
  }

  queue(): SyncOutboxStorePort {
    return this.pending;
  }
}

/** Whether a stored row is a tombstone. Re-exported so callers need one import. */
export { isTombstone };
