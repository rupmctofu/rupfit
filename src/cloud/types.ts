/**
 * The shapes the local-first sync core exchanges — specs S1, S4, S5, S6.
 *
 * Three rules live in this file and nowhere else:
 *
 * 1. **Nothing here knows IndexedDB, Supabase or a repository.** The queue lives behind
 *    `OutboxStorePort`, the remote behind `SyncRemote`, and the local merge behind
 *    `LocalStorePort` + `apply`. A test supplies all four and runs in `node`, which is
 *    exactly what makes "a wrong sync is silent and expensive" testable at all.
 * 2. **Nothing runs at import time.** Only constants, types and pure helpers: importing
 *    this module must not open a connection, read an environment variable or touch a
 *    clock.
 * 3. **Every operation answers with a result object.** `OpResult` is the reason a
 *    failing network cannot throw into a caller that is completing a workout (S1:
 *    «Un fallo de sincronización nunca debe impedir guardar un entrenamiento»).
 */

/* --------------------------------------------------------------------- tables */

/**
 * The mirrored tables, in push order. Parent before child, because
 * `docs/cloud-sync.md` §1 makes the foreign keys satisfiable by a single ordered
 * push: a plan item cannot travel before its day, a set before its exercise session.
 */
export const SYNC_TABLES = [
  'profiles',
  'plan_days',
  'plan_items',
  'phase_state',
  'exercises',
  'sessions',
  'session_exercises',
  'sets',
  'body_measurements',
  'activities',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/**
 * Append-only tables: training history and body evidence. Merged by id and **never
 * overwritten once present** (S4: «No sobrescribir automáticamente datos existentes»).
 * A differing remote copy of a row that already exists locally is a conflict record,
 * not a write.
 */
export const APPEND_ONLY_TABLES = [
  'sessions',
  'session_exercises',
  'sets',
  'body_measurements',
  'activities',
] as const satisfies readonly SyncTable[];

/** Mutable rows: configuration, not evidence. The newer `updatedAt` wins. */
export const MUTABLE_TABLES = [
  'profiles',
  'plan_days',
  'plan_items',
  'phase_state',
  'exercises',
] as const satisfies readonly SyncTable[];

const APPEND_ONLY: ReadonlySet<SyncTable> = new Set<SyncTable>(APPEND_ONLY_TABLES);

export function isAppendOnly(table: SyncTable): boolean {
  return APPEND_ONLY.has(table);
}

export function isSyncTable(value: string): value is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(value);
}

/* ----------------------------------------------------------------------- rows */

/** Column values as the remote carries them. Opaque here: only the adapters map them. */
export type SyncRowValues = Readonly<Record<string, unknown>>;

/** One version of a row, whichever side it comes from. Compared, never interpreted. */
export interface SyncRowVersion {
  /** The client's conflict counter (`rev >= 1`, docs/cloud-sync.md §2). */
  readonly rev: number;
  /** Server clock on the remote side; the local `updatedAt` on this one. */
  readonly updatedAt: number;
  /** Soft delete: `null` means the row is live. Nothing is ever removed by sync. */
  readonly deletedAt: number | null;
  readonly values: SyncRowValues;
}

/** A row after a pull: a version plus the identity it belongs to. */
export interface RemoteRow extends SyncRowVersion {
  readonly table: SyncTable;
  readonly rowId: string;
}

/* ---------------------------------------------------------------------- outbox */

export type OutboxOpKind = 'upsert' | 'delete';

/**
 * One pending operation. `id` is derived from `(table, rowId, rev)`, so re-offering the
 * same intent replaces the record instead of appending a second one (S5: «Prevención de
 * operaciones duplicadas»).
 */
export interface OutboxOp {
  readonly id: string;
  readonly table: SyncTable;
  readonly rowId: string;
  readonly op: OutboxOpKind;
  readonly rev: number;
  readonly queuedAt: number;
  /** Bounded retry counter (S5 «reintentos»). Grows by one per failed push. */
  readonly attempts: number;
  readonly lastError: string | null;
}

/** Stable identity of an operation. The queue's own idempotency, in one function. */
export function outboxOpId(table: SyncTable, rowId: string, rev: number): string {
  return `${table}:${rowId}:${rev}`;
}

/** How many failed pushes an op survives before the queue stops offering it (S5). */
export const DEFAULT_MAX_ATTEMPTS = 5;

/** How many ops one push round sends. Bounded so a long queue cannot stall a pull. */
export const DEFAULT_BATCH_SIZE = 20;

/* ------------------------------------------------------- watermarks, conflicts */

/** How far each table has been pulled. Persisted, so a reload does not re-download. */
export interface TableWatermark {
  readonly table: SyncTable;
  readonly since: number;
}

/**
 * The loser of a merge, kept instead of deleted (S5: «conserva la información y aplica
 * una estrategia explícita para evitar pérdidas»). The UI shows these much later; the
 * sync core never destroys either version.
 */
export interface SyncConflict {
  readonly table: SyncTable;
  readonly rowId: string;
  readonly keptVersion: SyncRowVersion;
  readonly discardedVersion: SyncRowVersion;
  readonly at: number;
}

/** What the caller's `apply` callback receives: one winning row, insert or update. */
export interface SyncChange {
  readonly table: SyncTable;
  readonly rowId: string;
  readonly mode: 'insert' | 'update';
  readonly rev: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
  readonly values: SyncRowValues;
}

/** Everything that went wrong in one pass, as a value instead of an exception. */
export interface SyncFailure {
  readonly stage: 'push' | 'pull' | 'apply' | 'read' | 'queue' | 'store';
  /** `null` when the failure is not about one table (the queue or the store itself). */
  readonly table: SyncTable | null;
  readonly message: string;
}

/* ---------------------------------------------------------------------- remote */

/** One outbox op on the wire, with the values it should carry. */
export interface PushRow {
  /** The outbox op id, echoed back in `acknowledged` so an ack cannot be misread. */
  readonly id: string;
  readonly table: SyncTable;
  readonly rowId: string;
  readonly op: OutboxOpKind;
  readonly rev: number;
  readonly values: SyncRowValues;
}

export interface PushOutcome {
  /** Op ids the remote committed. An op is only dropped from the queue once listed. */
  readonly acknowledged: readonly string[];
  /** `null` on success; the message kept as `lastError` otherwise. */
  readonly error: string | null;
}

export interface PullOutcome {
  readonly rows: readonly RemoteRow[];
  /** The remote's own change clock, when it reports one. Never trusted to go back. */
  readonly cursor?: number;
}

/**
 * The whole remote surface. Supabase satisfies it with an upsert on the app id and a
 * `updated_at > since` select; a test satisfies it with an array.
 */
export interface SyncRemote {
  pushRows(rows: readonly PushRow[]): Promise<PushOutcome>;
  pullSince(table: SyncTable, since: number): Promise<PullOutcome>;
}

/**
 * What sync needs to know about the local store: one row at a time, by id.
 *
 * Deliberately one method. Existence, the push payload and the merge comparison are all
 * the same read, and a repository-shaped port here would drag storage internals into a
 * module that has to stay testable without them.
 */
export interface LocalStorePort {
  read(table: SyncTable, rowId: string): Promise<SyncRowVersion | null>;
}

/** Writes the winner. `mode` says insert or update, so the caller needs no own lookup. */
export type ApplyChange = (change: SyncChange) => Promise<void> | void;

/* ----------------------------------------------------------------------- store */

/** The queue's persistence. One object store in IndexedDB in production, a Map in a test. */
export interface OutboxStorePort {
  allOps(): Promise<readonly OutboxOp[]>;
  putOps(ops: readonly OutboxOp[]): Promise<void>;
  removeOps(ids: readonly string[]): Promise<void>;
}

/** Watermarks and conflict records, kept beside the queue so both survive a reload. */
export interface SyncStateStorePort {
  watermarks(): Promise<readonly TableWatermark[]>;
  putWatermark(watermark: TableWatermark): Promise<void>;
  conflicts(): Promise<readonly SyncConflict[]>;
  addConflicts(conflicts: readonly SyncConflict[]): Promise<void>;
}

export interface SyncStorePort extends OutboxStorePort, SyncStateStorePort {}

/* ---------------------------------------------------------------------- result */

export type OpResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** One sentence from anything thrown, without ever throwing on the way out. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const text = typeof error === 'string' ? error : String(error);
  return text === '' ? 'unknown error' : text;
}

/* --------------------------------------------------------------------- compare */

/** Deterministic JSON: keys sorted, so two rows with the same content compare equal. */
export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

/** Same content, ignoring `rev` and `updatedAt`: nothing to lose, so nothing to record. */
export function sameContent(left: SyncRowVersion, right: SyncRowVersion): boolean {
  return left.deletedAt === right.deletedAt && canonical(left.values) === canonical(right.values);
}

/** Conflict identity, so the same loser is never recorded twice by a repeated pull. */
export function conflictKey(conflict: {
  readonly table: SyncTable;
  readonly rowId: string;
  readonly keptVersion: SyncRowVersion;
  readonly discardedVersion: SyncRowVersion;
}): string {
  return [
    conflict.table,
    conflict.rowId,
    conflict.keptVersion.rev,
    conflict.discardedVersion.rev,
    conflict.discardedVersion.updatedAt,
  ].join(':');
}
