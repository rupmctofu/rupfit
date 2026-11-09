/**
 * One sync pass — specs S4, S5.
 *
 * Every test here is a branch of the pass that fails silently in production:
 *
 * - an op marked done before the remote acknowledged it (data loss, no error);
 * - two passes overlapping (the same op sent twice, two pulls racing one watermark);
 * - a watermark advanced past a row whose write failed (the row never arrives);
 * - an append-only row overwritten by a remote copy (history rewritten);
 * - a mutable conflict resolved by discarding the loser (the loss S5 forbids);
 * - a network error thrown into a caller completing a workout (S1).
 *
 * The remote is a fake with `pushRows`/`pullSince`; the local store is a Map behind one
 * `read` callback; nothing touches the network, IndexedDB or `src/storage`.
 */

import { describe, expect, it } from 'vitest';
import { memorySyncStore } from './outbox';
import { createSyncService } from './sync';
import type {
  LocalStorePort,
  PushOutcome,
  PushRow,
  RemoteRow,
  SyncChange,
  SyncRowValues,
  SyncRowVersion,
  SyncTable,
  SyncRemote,
} from './types';

const NOW = 1_760_000_000_000;
const LATER = NOW + 60_000;
const LATER_STILL = NOW + 120_000;

function version(
  rev: number,
  updatedAt: number,
  values: SyncRowValues,
  deletedAt: number | null = null,
): SyncRowVersion {
  return { rev, updatedAt, deletedAt, values };
}

function remoteRow(
  table: SyncTable,
  rowId: string,
  rev: number,
  updatedAt: number,
  values: SyncRowValues,
  deletedAt: number | null = null,
): RemoteRow {
  return { table, rowId, rev, updatedAt, deletedAt, values };
}

/* ------------------------------------------------------------------- fixtures */

class FakeRemote implements SyncRemote {
  readonly pushes: (readonly PushRow[])[] = [];
  readonly pulls: { readonly table: SyncTable; readonly since: number }[] = [];
  rows: RemoteRow[] = [];
  /** Default: everything is acknowledged, the way a healthy upsert behaves. */
  onPush: ((rows: readonly PushRow[]) => Promise<PushOutcome>) | null = null;
  pullError: string | null = null;
  cursor: number | undefined = undefined;

  pushRows(rows: readonly PushRow[]): Promise<PushOutcome> {
    this.pushes.push(rows);
    if (this.onPush !== null) return this.onPush(rows);
    return Promise.resolve({ acknowledged: rows.map((row) => row.id), error: null });
  }

  pullSince(table: SyncTable, since: number): Promise<{ rows: readonly RemoteRow[] }> {
    this.pulls.push({ table, since });
    if (this.pullError !== null) return Promise.reject(new Error(this.pullError));
    const rows = this.rows.filter((row) => row.table === table && row.updatedAt > since);
    return Promise.resolve(this.cursor === undefined ? { rows } : { rows, cursor: this.cursor });
  }
}

interface FakeLocal extends LocalStorePort {
  rows: Map<string, SyncRowVersion>;
  unreadable: Set<string>;
}

function fakeLocal(seed: readonly (readonly [SyncTable, string, SyncRowVersion])[] = []): FakeLocal {
  const rows = new Map<string, SyncRowVersion>();
  for (const [table, rowId, row] of seed) rows.set(`${table}:${rowId}`, row);
  const unreadable = new Set<string>();
  return {
    rows,
    unreadable,
    read: (table, rowId) => {
      const key = `${table}:${rowId}`;
      if (unreadable.has(key)) return Promise.reject(new Error(`unreadable ${key}`));
      return Promise.resolve(rows.get(key) ?? null);
    },
  };
}

interface Recorder {
  readonly changes: SyncChange[];
  failOn: string | null;
  apply(change: SyncChange): void;
}

function recorder(): Recorder {
  const changes: SyncChange[] = [];
  const target: Recorder = {
    changes,
    failOn: null,
    apply: (change) => {
      if (target.failOn === change.rowId) throw new Error(`write refused: ${change.rowId}`);
      changes.push(change);
    },
  };
  return target;
}

function harness(options: { batchSize?: number; local?: FakeLocal } = {}) {
  const remote = new FakeRemote();
  const store = memorySyncStore();
  const local = options.local ?? fakeLocal();
  const applied = recorder();
  const sync = createSyncService({
    remote,
    store,
    local,
    apply: (change) => applied.apply(change),
    now: () => NOW,
    ...(options.batchSize === undefined ? {} : { batchSize: options.batchSize }),
  });
  return { remote, store, local, applied, sync };
}

/* ----------------------------------------------------------------------- tests */

describe('a sync pass with nothing to do', () => {
  it('sends no push and applies nothing, but still asks every table for changes', async () => {
    const { remote, applied, sync } = harness();

    const result = await sync.pass();

    expect(result.status).toBe('completed');
    expect(result).toMatchObject({ pushed: 0, pulled: 0, conflicts: 0, failures: [] });
    expect(remote.pushes).toEqual([]);
    expect(applied.changes).toEqual([]);
    expect(remote.pulls).toHaveLength(10);
    expect(remote.pulls.every((pull) => pull.since === 0)).toBe(true);
  });
});

describe('pushing', () => {
  it('drops an op only after the acknowledgement, in dependency order and in batches', async () => {
    const { remote, local, sync } = harness({ batchSize: 3 });
    local.rows.set('sets:set-1', version(1, NOW, { weight: 60 }));
    local.rows.set('sessions:session-1', version(1, NOW, { status: 'inProgress' }));
    local.rows.set('plan_items:item-1', version(1, NOW, { order: 1 }));

    await sync.outbox.enqueue({ table: 'sets', rowId: 'set-1', op: 'upsert', rev: 1 });
    await sync.outbox.enqueue({ table: 'sessions', rowId: 'session-1', op: 'upsert', rev: 1 });
    await sync.outbox.enqueue({ table: 'plan_items', rowId: 'item-1', op: 'upsert', rev: 1 });
    // An op whose row no longer exists locally: nothing honest to send, nothing lost.
    await sync.outbox.enqueue({ table: 'plan_days', rowId: 'day-gone', op: 'upsert', rev: 1 });

    const result = await sync.pass();

    expect(result).toMatchObject({ status: 'completed', pushed: 3 });
    expect(result.failures).toEqual([
      { stage: 'push', table: 'plan_days', message: 'row-missing' },
    ]);
    expect(remote.pushes).toHaveLength(2);
    expect(remote.pushes[0]?.map((row) => row.table)).toEqual(['plan_items', 'sessions']);
    expect(remote.pushes[1]?.map((row) => row.table)).toEqual(['sets']);
    expect(remote.pushes[1]?.[0]?.values).toMatchObject({ id: 'set-1', weight: 60, rev: 1 });
    expect(await sync.pendingCount()).toEqual({ ok: true, value: 1 });
  });

  it('keeps a rejected op with its attempt counted, while the acknowledged one leaves', async () => {
    const { remote, local, sync } = harness();
    local.rows.set('sets:set-1', version(1, NOW, { weight: 60 }));
    local.rows.set('sets:set-2', version(1, NOW, { weight: 62.5 }));
    await sync.outbox.enqueue({ table: 'sets', rowId: 'set-1', op: 'upsert', rev: 1 });
    await sync.outbox.enqueue({ table: 'sets', rowId: 'set-2', op: 'upsert', rev: 1 });

    remote.onPush = () =>
      Promise.resolve({ acknowledged: ['sets:set-1:1'], error: 'row level security' });
    const result = await sync.pass();

    expect(result.status).toBe('completed');
    expect(result.pushed).toBe(1);
    expect(result.failures).toEqual([
      { stage: 'push', table: 'sets', message: 'row level security' },
    ]);
    const listed = await sync.outbox.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([
      {
        id: 'sets:set-2:1',
        table: 'sets',
        rowId: 'set-2',
        op: 'upsert',
        rev: 1,
        queuedAt: NOW,
        attempts: 1,
        lastError: 'row level security',
      },
    ]);
  });

  it('keeps the whole queue when the push throws, and never throws out of the pass', async () => {
    const { remote, local, sync } = harness();
    local.rows.set('sets:set-1', version(1, NOW, { weight: 60 }));
    local.rows.set('sets:set-2', version(1, NOW, { weight: 62.5 }));
    await sync.outbox.enqueue({ table: 'sets', rowId: 'set-1', op: 'upsert', rev: 1 });
    await sync.outbox.enqueue({ table: 'sets', rowId: 'set-2', op: 'upsert', rev: 1 });

    remote.onPush = () => Promise.reject(new Error('network down'));
    const result = await sync.pass();

    expect(result.status).toBe('completed');
    expect(result.failures[0]?.message).toBe('network down');
    const listed = await sync.outbox.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(2);
    expect(listed.value.every((op) => op.attempts === 1)).toBe(true);
    // Nothing was acknowledged, so nothing was dropped: the queue survives the outage.
    await expect(sync.pass()).resolves.toMatchObject({ status: 'completed', pushed: 0 });
  });
});

describe('single flight', () => {
  it('answers busy and does no work while a pass is in flight', async () => {
    const { remote, local, sync } = harness();
    local.rows.set('sets:set-1', version(1, NOW, { weight: 60 }));
    await sync.outbox.enqueue({ table: 'sets', rowId: 'set-1', op: 'upsert', rev: 1 });

    let release: (() => void) | null = null;
    let notifyPush: () => void = () => undefined;
    const pushStarted = new Promise<void>((resolve) => {
      notifyPush = () => resolve();
    });
    remote.onPush = (rows) =>
      new Promise((resolve) => {
        release = () => resolve({ acknowledged: rows.map((row) => row.id), error: null });
        notifyPush();
      });

    const first = sync.pass();
    await pushStarted;
    const second = await sync.pass();

    expect(second.status).toBe('busy');
    expect(second).toMatchObject({ pushed: 0, pulled: 0, failures: [] });
    expect(remote.pushes).toHaveLength(1);
    expect(remote.pulls).toHaveLength(0);

    (release as unknown as () => void)();
    const finished = await first;
    expect(finished.status).toBe('completed');
    expect(finished.pushed).toBe(1);
  });
});

describe('pulling and the watermark', () => {
  it('applies rows once and then only asks for what changed', async () => {
    const { remote, sync, applied } = harness();
    remote.rows = [remoteRow('sessions', 'session-1', 1, NOW, { status: 'completed' })];

    const first = await sync.pass();
    expect(first).toMatchObject({ status: 'completed', pulled: 1 });
    expect(applied.changes[0]).toMatchObject({ table: 'sessions', mode: 'insert', rowId: 'session-1' });

    const second = await sync.pass();
    expect(second.pulled).toBe(0);
    expect(applied.changes).toHaveLength(1);
    expect(remote.pulls.filter((pull) => pull.table === 'sessions').map((pull) => pull.since)).toEqual([
      0, NOW,
    ]);
  });

  it('does not advance the watermark past a row whose write failed', async () => {
    const { remote, sync, applied } = harness();
    remote.rows = [remoteRow('sessions', 'session-1', 1, NOW, { status: 'completed' })];
    applied.failOn = 'session-1';

    const failed = await sync.pass();
    expect(failed.pulled).toBe(0);
    expect(failed.failures).toEqual([
      { stage: 'apply', table: 'sessions', message: 'write refused: session-1' },
    ]);

    applied.failOn = null;
    const retried = await sync.pass();
    expect(retried.pulled).toBe(1);
    expect(remote.pulls.filter((pull) => pull.table === 'sessions').map((pull) => pull.since)).toEqual([
      0, 0,
    ]);
  });

  it('turns a pull error into a failure and keeps the watermark where it was', async () => {
    const { remote, sync } = harness();
    remote.pullError = 'offline';

    const result = await sync.pass();

    expect(result.status).toBe('completed');
    expect(result.pulled).toBe(0);
    expect(result.failures).toHaveLength(10);
    expect(result.failures[0]).toEqual({ stage: 'pull', table: 'profiles', message: 'offline' });
  });
});

describe('conflicts', () => {
  it('never overwrites an append-only row that already exists, and keeps the remote copy', async () => {
    const local = fakeLocal([['sessions', 'session-1', version(1, NOW, { status: 'completed' })]]);
    const { remote, sync, applied } = harness({ local });
    remote.rows = [remoteRow('sessions', 'session-1', 2, LATER, { status: 'abandoned' })];

    const result = await sync.pass();

    expect(result).toMatchObject({ status: 'completed', pulled: 0, conflicts: 1 });
    expect(applied.changes).toEqual([]);
    const conflicts = await sync.listConflicts();
    expect(conflicts.ok).toBe(true);
    if (!conflicts.ok) return;
    expect(conflicts.value).toHaveLength(1);
    expect(conflicts.value[0]).toMatchObject({
      table: 'sessions',
      rowId: 'session-1',
      keptVersion: { rev: 1, values: { status: 'completed' } },
      discardedVersion: { rev: 2, values: { status: 'abandoned' } },
      at: NOW,
    });
  });

  it('lets the newer mutable row win and keeps the local loser as a conflict', async () => {
    const local = fakeLocal([['profiles', 'profile-1', version(1, NOW, { displayName: 'Ana' })]]);
    const { remote, sync, applied } = harness({ local });
    remote.rows = [remoteRow('profiles', 'profile-1', 2, LATER, { displayName: 'Ana Ruiz' })];

    const result = await sync.pass();

    expect(result).toMatchObject({ pulled: 1, conflicts: 1 });
    expect(applied.changes[0]).toMatchObject({
      table: 'profiles',
      mode: 'update',
      values: { displayName: 'Ana Ruiz' },
    });
    const conflicts = await sync.listConflicts();
    expect(conflicts.ok).toBe(true);
    if (!conflicts.ok) return;
    expect(conflicts.value[0]?.keptVersion.values).toEqual({ displayName: 'Ana Ruiz' });
    expect(conflicts.value[0]?.discardedVersion.values).toEqual({ displayName: 'Ana' });
  });

  it('keeps the newer local row, writes nothing, and records only the rows that differ', async () => {
    const local = fakeLocal([
      ['exercises', 'ex-1', version(2, LATER_STILL, { name: 'Sentadilla' })],
      // Same content on both sides with a different rev: a difference in bookkeeping,
      // not a loss, so it must not become a conflict record.
      ['plan_days', 'day-1', version(1, NOW, { name: 'Pierna' })],
    ]);
    const { remote, sync, applied } = harness({ local });
    remote.rows = [
      remoteRow('exercises', 'ex-1', 1, NOW, { name: 'Squat' }),
      remoteRow('plan_days', 'day-1', 7, LATER, { name: 'Pierna' }),
    ];

    const result = await sync.pass();

    expect(result).toMatchObject({ pulled: 0, conflicts: 1 });
    expect(applied.changes).toEqual([]);
    const conflicts = await sync.listConflicts();
    expect(conflicts.ok).toBe(true);
    if (!conflicts.ok) return;
    expect(conflicts.value[0]?.keptVersion.values).toEqual({ name: 'Sentadilla' });
    expect(conflicts.value[0]?.discardedVersion.values).toEqual({ name: 'Squat' });
  });
});

describe('deleting', () => {
  it('travels as a soft delete and never removes the row', async () => {
    const { remote, local, sync } = harness();
    const row = version(2, LATER, { status: 'completed', deletedAt: 0 }, LATER);
    local.rows.set('sessions:session-1', row);
    await sync.outbox.enqueue({ table: 'sessions', rowId: 'session-1', op: 'delete', rev: 2 });

    const result = await sync.pass();

    expect(result.pushed).toBe(1);
    const pushed = remote.pushes[0]?.[0];
    expect(pushed?.op).toBe('delete');
    expect(pushed?.values).toMatchObject({ id: 'session-1', rev: 2, status: 'completed' });
    expect(typeof pushed?.values['deleted_at']).toBe('string');
    // Nothing was removed from the local rows: the queue does not delete history.
    expect(local.rows.size).toBe(1);
  });

  it('applies a remote tombstone to a mutable row as an update, not a removal', async () => {
    const local = fakeLocal([['plan_items', 'item-1', version(1, NOW, { order: 1 })]]);
    const { remote, sync, applied } = harness({ local });
    remote.rows = [remoteRow('plan_items', 'item-1', 2, LATER, { order: 1 }, LATER)];

    await sync.pass();

    expect(applied.changes[0]).toMatchObject({
      table: 'plan_items',
      mode: 'update',
      deletedAt: LATER,
    });
  });
});
