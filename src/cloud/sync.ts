/**
 * One sync pass: push, then pull — specs S4, S5, and `docs/cloud-sync.md` §2.
 *
 * The pass, in order, and why each step is ordered that way:
 *
 * 1. **Single flight.** A second pass returns `busy` instead of running (S4: «Evita
 *    ejecutar sincronizaciones simultáneas»). Never a second queue of passes: two
 *    overlapping pushes would send the same op twice and two pulls would race the same
 *    watermark.
 * 2. **Push in batches**, in dependency order. An op leaves the queue only when the
 *    remote acknowledged it; a rejected op stays and gets `attempts + 1` (S5). A batch
 *    with any rejection ends the push phase, so one outage cannot burn a whole retry
 *    budget in one pass.
 * 3. **Pull per table since a persisted watermark.** Only new or changed rows travel
 *    (S4). The watermark advances only after every row of that table was decided *and*
 *    applied: a failed write must not hide a row forever.
 * 4. **Merge by rule, never by "last one wins".** Append-only tables are merged by id
 *    and never overwritten once present; mutable rows compare `updatedAt` and the loser
 *    becomes a conflict record instead of disappearing (S4, S5).
 * 5. **Nothing throws.** Every entry point answers with a result object carrying what
 *    happened, so a caller completing a workout never sees a network error.
 *
 * The module knows no repository, no IndexedDB and no Supabase: the local store is one
 * `read` callback, the winner is written through `apply`, and the remote is `pushRows`
 * plus `pullSince`.
 */

import { Outbox } from './outbox';
import {
  DEFAULT_BATCH_SIZE,
  SYNC_TABLES,
  conflictKey,
  errorMessage,
  isAppendOnly,
  sameContent,
  type ApplyChange,
  type LocalStorePort,
  type OpResult,
  type OutboxOp,
  type PushOutcome,
  type PushRow,
  type RemoteRow,
  type SyncChange,
  type SyncConflict,
  type SyncFailure,
  type SyncRemote,
  type SyncRowVersion,
  type SyncStorePort,
  type SyncTable,
} from './types';

export interface SyncPassResult {
  /**
   * `completed` — the pass ran to the end (individual failures are listed, never
   * thrown). `busy` — another pass was in flight and this one did nothing. `failed` —
   * a store-level error stopped the pass; the queue is intact.
   */
  readonly status: 'completed' | 'busy' | 'failed';
  readonly pushed: number;
  readonly pulled: number;
  readonly conflicts: number;
  readonly failures: readonly SyncFailure[];
  readonly startedAt: number;
  readonly finishedAt: number;
}

export interface SyncServiceOptions {
  readonly remote: SyncRemote;
  readonly store: SyncStorePort;
  readonly local: LocalStorePort;
  readonly apply: ApplyChange;
  /** Injected clock: the pass never reads one of its own. */
  readonly now?: () => number;
  readonly batchSize?: number;
}

/** What a merge decided, before the caller's `apply` runs. */
type Decision =
  | { readonly kind: 'skip' }
  | {
      readonly kind: 'apply';
      readonly mode: 'insert' | 'update';
      readonly row: RemoteRow;
      readonly conflict: ConflictDraft | null;
    }
  | { readonly kind: 'hold'; readonly conflict: ConflictDraft };

type ConflictDraft = Pick<SyncConflict, 'table' | 'rowId' | 'keptVersion' | 'discardedVersion'>;

/**
 * The merge rule, pure and total — the one function that decides who wins.
 *
 * - absent locally → insert the remote row;
 * - same content → nothing to decide, and nothing to record: a differing `rev` over
 *   identical values is not a loss;
 * - append-only and present → hold the local row. History is never replaced by a
 *   remote copy, only reported (S4: «No sobrescribir automáticamente»);
 * - mutable → the newer `updatedAt` wins, `rev` breaks a tie, and an exact tie keeps
 *   the local row. The loser is a conflict, never a deletion.
 */
function decide(table: SyncTable, local: SyncRowVersion | null, remote: RemoteRow): Decision {
  if (local === null) return { kind: 'apply', mode: 'insert', row: remote, conflict: null };
  if (sameContent(local, remote)) return { kind: 'skip' };

  const draft: ConflictDraft = {
    table,
    rowId: remote.rowId,
    keptVersion: local,
    discardedVersion: remote,
  };
  if (isAppendOnly(table)) return { kind: 'hold', conflict: draft };

  const remoteWins =
    remote.updatedAt > local.updatedAt ||
    (remote.updatedAt === local.updatedAt && remote.rev > local.rev);
  if (!remoteWins) return { kind: 'hold', conflict: draft };

  return {
    kind: 'apply',
    mode: 'update',
    row: remote,
    conflict: { ...draft, keptVersion: remote, discardedVersion: local },
  };
}

/** The op as a remote row: the local values, plus the soft delete when it is one. */
function pushRowOf(
  op: OutboxOp,
  local: SyncRowVersion | null,
  isoNow: string,
): PushRow {
  const values: Record<string, unknown> = { ...(local?.values ?? {}), id: op.rowId, rev: op.rev };
  if (op.op === 'delete') {
    // A delete is an update that sets `deleted_at` (docs/cloud-sync.md §2). The row is
    // never removed, on either side: a device that was offline for a week has to learn
    // that a session was deleted instead of silently keeping it.
    values['deleted_at'] = local?.deletedAt != null ? new Date(local.deletedAt).toISOString() : isoNow;
  }
  return { id: op.id, table: op.table, rowId: op.rowId, op: op.op, rev: op.rev, values };
}

export class SyncService {
  readonly outbox: Outbox;
  private readonly remote: SyncRemote;
  private readonly store: SyncStorePort;
  private readonly local: LocalStorePort;
  private readonly apply: ApplyChange;
  private readonly now: () => number;
  private readonly batchSize: number;
  private running = false;

  constructor(options: SyncServiceOptions) {
    this.remote = options.remote;
    this.store = options.store;
    this.local = options.local;
    this.apply = options.apply;
    this.now = options.now ?? (() => Date.now());
    this.batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
    this.outbox = new Outbox({ store: options.store, now: this.now });
  }

  /** One pass. Callable from a timer, a button or a resume: it never throws. */
  async pass(): Promise<SyncPassResult> {
    const startedAt = this.now();
    if (this.running) {
      return {
        status: 'busy',
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        failures: [],
        startedAt,
        finishedAt: this.now(),
      };
    }

    this.running = true;
    const failures: SyncFailure[] = [];
    let pushed = 0;
    let pulled = 0;
    let conflicts = 0;
    let status: SyncPassResult['status'] = 'completed';

    try {
      const known = await this.knownConflicts(failures);
      pushed = await this.push(failures);
      const pulledResult = await this.pull(known, failures);
      pulled = pulledResult.pulled;
      conflicts = pulledResult.conflicts;
    } catch (error) {
      // Only a store-level failure reaches here; the queue is untouched either way.
      status = 'failed';
      failures.push({ stage: 'store', table: null, message: errorMessage(error) });
    } finally {
      this.running = false;
    }

    return {
      status,
      pushed,
      pulled,
      conflicts,
      failures,
      startedAt,
      finishedAt: this.now(),
    };
  }

  /** The conflicts the UI shows later (S5). Never throws. */
  async listConflicts(): Promise<OpResult<readonly SyncConflict[]>> {
    try {
      return { ok: true, value: await this.store.conflicts() };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** S8 «Número de cambios pendientes», delegated to the queue it owns. */
  pendingCount(): Promise<OpResult<number>> {
    return this.outbox.pendingCount();
  }

  /* --------------------------------------------------------------------- push */

  private async push(failures: SyncFailure[]): Promise<number> {
    let pushed = 0;
    const handled = new Set<string>();

    for (;;) {
      const listed = await this.outbox.pushable();
      if (!listed.ok) {
        failures.push({ stage: 'queue', table: null, message: listed.error });
        return pushed;
      }
      const batch = listed.value.filter((op) => !handled.has(op.id)).slice(0, this.batchSize);
      if (batch.length === 0) return pushed;
      for (const op of batch) handled.add(op.id);

      const rows: PushRow[] = [];
      const broken: { readonly id: string; readonly op: OutboxOp; readonly reason: string }[] = [];
      const isoNow = new Date(this.now()).toISOString();

      for (const op of batch) {
        let local: SyncRowVersion | null;
        try {
          local = await this.local.read(op.table, op.rowId);
        } catch (error) {
          broken.push({ id: op.id, op, reason: `row-unreadable: ${errorMessage(error)}` });
          continue;
        }
        if (local === null && op.op === 'upsert') {
          // The row this op described is gone locally and was never a delete. Sending
          // nothing is honest; the op stays visible with an advanced counter.
          broken.push({ id: op.id, op, reason: 'row-missing' });
          continue;
        }
        rows.push(pushRowOf(op, local, isoNow));
      }

      if (broken.length > 0) {
        const failed = await this.outbox.fail(
          broken.map((entry) => entry.id),
          broken[0]?.reason ?? 'row-missing',
        );
        if (!failed.ok) failures.push({ stage: 'queue', table: null, message: failed.error });
        for (const entry of broken) {
          failures.push({ stage: 'push', table: entry.op.table, message: entry.reason });
        }
      }

      if (rows.length === 0) return pushed;

      let outcome: PushOutcome;
      try {
        outcome = await this.remote.pushRows(rows);
      } catch (error) {
        // The whole batch is unacknowledged. Nothing is removed, every op is retried.
        outcome = { acknowledged: [], error: errorMessage(error) };
      }

      const acknowledged = new Set(outcome.acknowledged);
      const done = rows.filter((row) => acknowledged.has(row.id)).map((row) => row.id);
      const kept = rows.filter((row) => !acknowledged.has(row.id));

      if (done.length > 0) {
        const completed = await this.outbox.complete(done);
        if (!completed.ok) failures.push({ stage: 'queue', table: null, message: completed.error });
        pushed += done.length;
      }

      if (kept.length > 0) {
        const reason = outcome.error ?? 'not acknowledged';
        const failed = await this.outbox.fail(
          kept.map((row) => row.id),
          reason,
        );
        if (!failed.ok) failures.push({ stage: 'queue', table: null, message: failed.error });
        failures.push({ stage: 'push', table: kept[0]?.table ?? null, message: reason });
        // No progress: stop pushing, so one outage costs one attempt, not the budget.
        return pushed;
      }
    }
  }

  /* --------------------------------------------------------------------- pull */

  private async pull(
    known: ReadonlySet<string>,
    failures: SyncFailure[],
  ): Promise<{ readonly pulled: number; readonly conflicts: number }> {
    const seen = new Set(known);
    const recorded: SyncConflict[] = [];
    let pulled = 0;

    const marks = await this.store.watermarks();
    const since = new Map<SyncTable, number>();
    for (const mark of marks) since.set(mark.table, mark.since);

    for (const table of SYNC_TABLES) {
      const from = since.get(table) ?? 0;
      let rows: readonly RemoteRow[];
      let cursor: number | undefined;
      try {
        const outcome = await this.remote.pullSince(table, from);
        rows = outcome.rows;
        cursor = outcome.cursor;
      } catch (error) {
        failures.push({ stage: 'pull', table, message: errorMessage(error) });
        continue;
      }

      let highest = from;
      let whole = true;

      for (const row of rows) {
        if (row.updatedAt > highest) highest = row.updatedAt;

        let local: SyncRowVersion | null;
        try {
          local = await this.local.read(table, row.rowId);
        } catch (error) {
          failures.push({ stage: 'read', table, message: errorMessage(error) });
          whole = false;
          break;
        }

        const decision = decide(table, local, row);
        if (decision.kind === 'skip') continue;

        if (decision.conflict !== null) {
          const key = conflictKey(decision.conflict);
          if (!seen.has(key)) {
            seen.add(key);
            recorded.push({ ...decision.conflict, at: this.now() });
          }
        }
        if (decision.kind !== 'apply') continue;

        const change: SyncChange = {
          table,
          rowId: row.rowId,
          mode: decision.mode,
          rev: row.rev,
          updatedAt: row.updatedAt,
          deletedAt: row.deletedAt,
          values: row.values,
        };
        try {
          await this.apply(change);
          pulled += 1;
        } catch (error) {
          failures.push({ stage: 'apply', table, message: errorMessage(error) });
          whole = false;
          break;
        }
      }

      // Advance only what was fully decided: a row that failed to apply must be offered
      // again next pass, which cannot happen behind a watermark that already passed it.
      if (!whole) continue;
      const next = cursor !== undefined && cursor > highest ? cursor : highest;
      if (next > from) {
        try {
          await this.store.putWatermark({ table, since: next });
        } catch (error) {
          failures.push({ stage: 'store', table, message: errorMessage(error) });
        }
      }
    }

    if (recorded.length > 0) {
      try {
        await this.store.addConflicts(recorded);
      } catch (error) {
        failures.push({ stage: 'store', table: null, message: errorMessage(error) });
      }
    }

    return { pulled, conflicts: recorded.length };
  }

  private async knownConflicts(failures: SyncFailure[]): Promise<ReadonlySet<string>> {
    try {
      const existing = await this.store.conflicts();
      return new Set(existing.map((conflict) => conflictKey(conflict)));
    } catch (error) {
      failures.push({ stage: 'store', table: null, message: errorMessage(error) });
      return new Set<string>();
    }
  }
}

export function createSyncService(options: SyncServiceOptions): SyncService {
  return new SyncService(options);
}
