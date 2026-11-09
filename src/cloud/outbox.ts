/**
 * The outbox: a persistent queue of pending operations — specs S1, S5, and
 * `docs/cloud-sync.md` §2.
 *
 * What this file owns:
 *
 * - the queue's identity rule: an op is `(table, rowId, rev)`, so re-offering the same
 *   intent replaces the record and never appends a second one;
 * - the ordering a push needs: dependency order first, then age;
 * - the retry counter, bounded, that only a failed push advances;
 * - the store seam, with two implementations: an in-memory one for tests and one over
 *   IndexedDB.
 *
 * What it deliberately does **not** own: the remote, the merge, and the local rows.
 * Nothing here imports `src/storage`: the queue receives a store. A repository that
 * enqueues inside its own write passes the transaction's store, which is how the op and
 * the row land in one commit (S1: «Rupfit guarda inmediatamente cada cambio en
 * IndexedDB. Los cambios se incorporan a una cola de sincronización»).
 *
 * A deletion is an `op: 'delete'`, never a row removal: the row is written with
 * `deleted_at` and kept, so history cannot be lost (S4, S5).
 */

import {
  DEFAULT_MAX_ATTEMPTS,
  SYNC_TABLES,
  errorMessage,
  outboxOpId,
  type OpResult,
  type OutboxOp,
  type OutboxOpKind,
  type OutboxStorePort,
  type SyncConflict,
  type SyncStorePort,
  type SyncTable,
  type TableWatermark,
} from './types';

/* ------------------------------------------------------------------ the queue */

export interface OutboxInput {
  readonly table: SyncTable;
  readonly rowId: string;
  readonly op: OutboxOpKind;
  /**
   * Monotonic per row. A higher `rev` supersedes a lower pending one: the queue keeps
   * the newest intent for a row instead of replaying a stale value onto the remote.
   */
  readonly rev: number;
  /** Injected, never read from a clock of the queue's own (tests stay deterministic). */
  readonly queuedAt?: number;
}

export interface OutboxOptions {
  readonly store: OutboxStorePort;
  readonly now?: () => number;
  readonly maxAttempts?: number;
}

/** Dependency order, then age, then revision, then id: a stable, explainable order. */
export function compareOps(left: OutboxOp, right: OutboxOp): number {
  const tableDelta = SYNC_TABLES.indexOf(left.table) - SYNC_TABLES.indexOf(right.table);
  if (tableDelta !== 0) return tableDelta;
  if (left.queuedAt !== right.queuedAt) return left.queuedAt - right.queuedAt;
  if (left.rev !== right.rev) return left.rev - right.rev;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export class Outbox {
  private readonly store: OutboxStorePort;
  private readonly now: () => number;
  readonly maxAttempts: number;

  constructor(options: OutboxOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => Date.now());
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  /**
   * Appends one operation. Idempotent: the same `(table, rowId, rev)` replaces the
   * record it already is, keeping its attempt counter so a poison op cannot reset its
   * own retry budget by being re-offered.
   */
  async enqueue(input: OutboxInput): Promise<OpResult<OutboxOp>> {
    const written = await this.enqueueMany([input]);
    if (!written.ok) return written;
    const [first] = written.value;
    if (first === undefined) return { ok: false, error: 'the operation was not queued' };
    return { ok: true, value: first };
  }

  /** The same rule for a batch, in one store write (a repository commit). */
  async enqueueMany(inputs: readonly OutboxInput[]): Promise<OpResult<readonly OutboxOp[]>> {
    try {
      const existing = await this.store.allOps();
      const working = new Map<string, OutboxOp>(existing.map((op) => [op.id, op]));
      const written: OutboxOp[] = [];
      const superseded = new Set<string>();

      for (const input of inputs) {
        const id = outboxOpId(input.table, input.rowId, input.rev);
        const previous = working.get(id);
        // A newer intent for the same row makes every older pending one pointless: the
        // upsert would be overwritten immediately, and a stale `delete` must not erase
        // the row the newer `upsert` describes.
        for (const other of working.values()) {
          if (
            other.table === input.table &&
            other.rowId === input.rowId &&
            other.rev < input.rev
          ) {
            working.delete(other.id);
            superseded.add(other.id);
          }
        }
        const op: OutboxOp = {
          id,
          table: input.table,
          rowId: input.rowId,
          op: input.op,
          rev: input.rev,
          queuedAt: input.queuedAt ?? this.now(),
          attempts: previous?.attempts ?? 0,
          lastError: previous?.lastError ?? null,
        };
        working.set(id, op);
        written.push(op);
      }

      if (superseded.size > 0) await this.store.removeOps([...superseded]);
      if (written.length > 0) await this.store.putOps(written);
      return { ok: true, value: written.filter((op) => working.has(op.id)) };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** Every pending op, in push order. Includes exhausted ones: they are still pending. */
  async list(): Promise<OpResult<readonly OutboxOp[]>> {
    try {
      const ops = await this.store.allOps();
      return { ok: true, value: [...ops].sort(compareOps) };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** The ops a pass may send: ordered, and within their retry budget. */
  async pushable(): Promise<OpResult<readonly OutboxOp[]>> {
    const listed = await this.list();
    if (!listed.ok) return listed;
    return { ok: true, value: listed.value.filter((op) => op.attempts < this.maxAttempts) };
  }

  /**
   * The number the account screen shows (S8 «Número de cambios pendientes»). Counts
   * exhausted ops too: they are changes this device still has not delivered.
   */
  async pendingCount(): Promise<OpResult<number>> {
    try {
      const ops = await this.store.allOps();
      return { ok: true, value: ops.length };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** Drops ops the remote acknowledged. Called only after the acknowledgement. */
  async complete(ids: readonly string[]): Promise<OpResult<number>> {
    if (ids.length === 0) return { ok: true, value: 0 };
    try {
      await this.store.removeOps(ids);
      return { ok: true, value: ids.length };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** Keeps a rejected op and advances its counter. The queue is never dropped on error. */
  async fail(ids: readonly string[], reason: string): Promise<OpResult<number>> {
    if (ids.length === 0) return { ok: true, value: 0 };
    try {
      const wanted = new Set(ids);
      const ops = await this.store.allOps();
      const updated = ops
        .filter((op) => wanted.has(op.id))
        .map((op) => ({ ...op, attempts: op.attempts + 1, lastError: reason }));
      if (updated.length > 0) await this.store.putOps(updated);
      return { ok: true, value: updated.length };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** True when every attempt is spent: the op stays visible but stops being sent (S5). */
  exhausted(op: OutboxOp): boolean {
    return op.attempts >= this.maxAttempts;
  }
}

/* -------------------------------------------------------------- in-memory store */

/**
 * A whole `SyncStorePort` in a Map. Used by every test in this folder, and by nothing in
 * the app: production persists through `indexedDbSyncStore`.
 */
export function memorySyncStore(): SyncStorePort {
  const ops = new Map<string, OutboxOp>();
  const marks = new Map<SyncTable, number>();
  const conflicts: SyncConflict[] = [];

  return {
    allOps: () => Promise.resolve([...ops.values()]),
    putOps: (written) => {
      for (const op of written) ops.set(op.id, { ...op });
      return Promise.resolve();
    },
    removeOps: (ids) => {
      for (const id of ids) ops.delete(id);
      return Promise.resolve();
    },
    watermarks: () => Promise.resolve([...marks].map(([table, since]) => ({ table, since }))),
    putWatermark: (watermark) => {
      const previous = marks.get(watermark.table) ?? 0;
      // A watermark never moves backwards: a re-pull must not rewind a table.
      if (watermark.since > previous) marks.set(watermark.table, watermark.since);
      return Promise.resolve();
    },
    conflicts: () => Promise.resolve(conflicts.map((conflict) => ({ ...conflict }))),
    addConflicts: (added) => {
      const seen = new Set(
        conflicts.map(
          (conflict) =>
            `${conflict.table}:${conflict.rowId}:${conflict.keptVersion.rev}:${conflict.discardedVersion.rev}:${conflict.discardedVersion.updatedAt}`,
        ),
      );
      for (const conflict of added) {
        const key = `${conflict.table}:${conflict.rowId}:${conflict.keptVersion.rev}:${conflict.discardedVersion.rev}:${conflict.discardedVersion.updatedAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push({ ...conflict });
      }
      return Promise.resolve();
    },
  };
}

/* ------------------------------------------------------------- IndexedDB store */

/** The two object stores a storage upgrade has to create, beside the nine mirrored ones. */
export const SYNC_STORE_NAMES = {
  outbox: 'outbox',
  state: 'syncState',
} as const;

/**
 * The pieces of the IndexedDB DOM surface this file needs, declared structurally.
 *
 * The point is not to avoid a type: it is to keep this module from importing the
 * storage adapter, so the queue can be handed *any* connection — the app's, or a test's
 * — and the same-transaction requirement stays the caller's to satisfy.
 */
interface RawRequest<T> {
  onsuccess: ((this: unknown) => void) | null;
  onerror: ((this: unknown) => void) | null;
  result: T;
  error: unknown;
}

interface RawObjectStore {
  getAll(): RawRequest<unknown[]>;
  put(value: unknown): RawRequest<unknown>;
  delete(key: string): RawRequest<undefined>;
}

interface RawTransaction {
  objectStore(name: string): RawObjectStore;
  oncomplete: ((this: unknown) => void) | null;
  onerror: ((this: unknown) => void) | null;
  onabort: ((this: unknown) => void) | null;
  error: unknown;
}

export interface IdbDatabase {
  transaction(names: readonly string[], mode: 'readonly' | 'readwrite'): RawTransaction;
}

function settle<T>(request: RawRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(asError(request.error));
  });
}

function commit(transaction: RawTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(asError(transaction.error));
  });
}

function asError(detail: unknown): Error {
  return detail instanceof Error ? detail : new Error(errorMessage(detail));
}

/** `syncState` rows: one document per key, so a small map needs no index. */
interface StateRecord {
  readonly key: 'watermarks' | 'conflicts';
  readonly rows: readonly unknown[];
}

export interface IndexedDbStoreOptions {
  readonly database: IdbDatabase;
  readonly outboxStore?: string;
  readonly stateStore?: string;
}

/**
 * The production store. Everything it writes is committed on `oncomplete`, so a reload
 * after a crash finds either the whole operation or none of it.
 */
export function indexedDbSyncStore(options: IndexedDbStoreOptions): SyncStorePort {
  const database = options.database;
  const outboxName = options.outboxStore ?? SYNC_STORE_NAMES.outbox;
  const stateName = options.stateStore ?? SYNC_STORE_NAMES.state;

  async function readState(key: StateRecord['key']): Promise<readonly unknown[]> {
    const transaction = database.transaction([stateName], 'readonly');
    const done = commit(transaction);
    const all = await settle(transaction.objectStore(stateName).getAll());
    await done;
    const record = all.find(
      (candidate): candidate is StateRecord =>
        typeof candidate === 'object' &&
        candidate !== null &&
        (candidate as { key?: unknown }).key === key,
    );
    return record?.rows ?? [];
  }

  async function writeState(key: StateRecord['key'], rows: readonly unknown[]): Promise<void> {
    const transaction = database.transaction([stateName], 'readwrite');
    const done = commit(transaction);
    transaction.objectStore(stateName).put({ key, rows } satisfies StateRecord);
    await done;
  }

  return {
    async allOps() {
      const transaction = database.transaction([outboxName], 'readonly');
      const done = commit(transaction);
      const all = await settle(transaction.objectStore(outboxName).getAll());
      await done;
      return all as readonly OutboxOp[];
    },

    async putOps(ops) {
      if (ops.length === 0) return;
      const transaction = database.transaction([outboxName], 'readwrite');
      const done = commit(transaction);
      const store = transaction.objectStore(outboxName);
      for (const op of ops) store.put(op);
      await done;
    },

    async removeOps(ids) {
      if (ids.length === 0) return;
      const transaction = database.transaction([outboxName], 'readwrite');
      const done = commit(transaction);
      const store = transaction.objectStore(outboxName);
      for (const id of ids) store.delete(id);
      await done;
    },

    async watermarks() {
      return (await readState('watermarks')) as readonly TableWatermark[];
    },

    async putWatermark(watermark) {
      const current = (await readState('watermarks')) as readonly TableWatermark[];
      const previous = current.find((entry) => entry.table === watermark.table)?.since ?? 0;
      if (watermark.since <= previous) return;
      const next = current.filter((entry) => entry.table !== watermark.table);
      await writeState('watermarks', [...next, watermark]);
    },

    async conflicts() {
      return (await readState('conflicts')) as readonly SyncConflict[];
    },

    async addConflicts(added) {
      if (added.length === 0) return;
      const current = (await readState('conflicts')) as readonly SyncConflict[];
      const keyOf = (conflict: SyncConflict): string =>
        `${conflict.table}:${conflict.rowId}:${conflict.keptVersion.rev}:${conflict.discardedVersion.rev}:${conflict.discardedVersion.updatedAt}`;
      const seen = new Set(current.map(keyOf));
      const fresh = added.filter((conflict) => {
        const key = keyOf(conflict);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (fresh.length === 0) return;
      await writeState('conflicts', [...current, ...fresh]);
    },
  };
}
