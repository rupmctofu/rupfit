/**
 * The outbox queue — specs S1, S5.
 *
 * What is pinned here, and why each one is silent when it breaks:
 *
 * - **idempotency**: a re-offered operation must replace, not append, or a retried push
 *   sends the same intent twice and the remote sees two rows for one edit;
 * - **reload survival**: the queue is the only record of an unsent change. If it lives in
 *   memory, closing the tab loses the workout;
 * - **retry counting**: a bounded counter is what stops an unreachable server from
 *   spinning forever, and what tells the account screen an error is real;
 * - **explicit failure**: every method answers with a result object, because the caller
 *   may be in the middle of `confirmSet` and must never be thrown into.
 *
 * The last test uses `fake-indexeddb`, so the IndexedDB store is proven against a real
 * implementation instead of a mock of one.
 */

import { describe, expect, it } from 'vitest';
import * as fakeIndexedDb from 'fake-indexeddb';
import {
  Outbox,
  SYNC_STORE_NAMES,
  indexedDbSyncStore,
  memorySyncStore,
  type IdbDatabase,
} from './outbox';
import type { OutboxOp, OutboxStorePort } from './types';

const NOW = 1_760_000_000_000;

function queue(store: OutboxStorePort = memorySyncStore(), maxAttempts = 5): Outbox {
  return new Outbox({ store, now: () => NOW, maxAttempts });
}

const SQUAT_SET = {
  table: 'sets',
  rowId: 'set-1',
  op: 'upsert',
  rev: 1,
  queuedAt: NOW,
} as const;

describe('the outbox queue', () => {
  it('replaces an identical operation instead of appending a second one', async () => {
    const outbox = queue();
    await outbox.enqueue(SQUAT_SET);
    await outbox.enqueue(SQUAT_SET);

    const listed = await outbox.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(await outbox.pendingCount()).toEqual({ ok: true, value: 1 });
  });

  it('keeps only the newest intent for a row when a higher revision arrives', async () => {
    const outbox = queue();
    await outbox.enqueue(SQUAT_SET);
    await outbox.enqueue({ ...SQUAT_SET, rev: 2 });

    const listed = await outbox.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((op) => op.rev)).toEqual([2]);
  });

  it('survives a reload: a new queue over the same store still sees the operation', async () => {
    const store = memorySyncStore();
    await queue(store).enqueue(SQUAT_SET);

    const reloaded = queue(store);
    const listed = await reloaded.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.id).toBe('sets:set-1:1');
  });

  it('counts failed attempts, keeps the counter across a re-offer, and stops sending at the budget', async () => {
    const outbox = queue(memorySyncStore(), 2);
    await outbox.enqueue(SQUAT_SET);

    await outbox.fail(['sets:set-1:1'], 'offline');
    const afterOne = await outbox.list();
    expect(afterOne.ok).toBe(true);
    if (!afterOne.ok) return;
    expect(afterOne.value[0]?.attempts).toBe(1);
    expect(afterOne.value[0]?.lastError).toBe('offline');

    const stillSendable = await outbox.pushable();
    expect(stillSendable.ok).toBe(true);
    if (!stillSendable.ok) return;
    expect(stillSendable.value).toHaveLength(1);

    // Re-offering the same intent must not reset the budget it has already spent.
    await outbox.enqueue(SQUAT_SET);
    await outbox.fail(['sets:set-1:1'], 'offline');
    const exhausted = await outbox.pushable();
    expect(exhausted.ok).toBe(true);
    if (!exhausted.ok) return;
    expect(exhausted.value).toEqual([]);
    // Exhausted, not deleted: it is still a change this device has not delivered.
    expect(await outbox.pendingCount()).toEqual({ ok: true, value: 1 });
  });

  it('keeps the queue intact when the store fails, answering with an error result', async () => {
    const broken: OutboxStorePort = {
      allOps: () => Promise.reject(new Error('quota exceeded')),
      putOps: () => Promise.reject(new Error('quota exceeded')),
      removeOps: () => Promise.reject(new Error('quota exceeded')),
    };
    const outbox = queue(broken);

    expect(await outbox.enqueue(SQUAT_SET)).toEqual({ ok: false, error: 'quota exceeded' });
    expect(await outbox.pendingCount()).toEqual({ ok: false, error: 'quota exceeded' });
    expect(await outbox.complete(['sets:set-1:1'])).toEqual({
      ok: false,
      error: 'quota exceeded',
    });
  });
});

/* --------------------------------------------------------- the IndexedDB store */

function freshIndexedDb(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(fakeIndexedDb)) globals[name] = value;
  const factory = new (fakeIndexedDb as unknown as { IDBFactory: new () => unknown }).IDBFactory();
  globals['indexedDB'] = factory;
}

interface RawOpenRequest {
  onupgradeneeded: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  result: {
    createObjectStore(name: string, options: { keyPath: string }): unknown;
    close(): void;
  };
  error: unknown;
}

/** The two stores a real upgrade creates, in a throwaway database per test run. */
function openSyncDatabase(name: string): Promise<IdbDatabase & { close(): void }> {
  const factory = (globalThis as unknown as { indexedDB: { open(name: string, version: number): RawOpenRequest } })
    .indexedDB;
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SYNC_STORE_NAMES.outbox, { keyPath: 'id' });
      request.result.createObjectStore(SYNC_STORE_NAMES.state, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result as unknown as IdbDatabase & { close(): void });
    request.onerror = () => reject(request.error);
  });
}

describe('the outbox on IndexedDB', () => {
  it('persists the queue and the watermark across a reopened connection', async () => {
    freshIndexedDb();
    const name = `rupfit-outbox-test-${Math.random().toString(36).slice(2)}`;

    const first = await openSyncDatabase(name);
    const firstQueue = new Outbox({ store: indexedDbSyncStore({ database: first }), now: () => NOW });
    await firstQueue.enqueue({ ...SQUAT_SET, op: 'delete' });
    const store = indexedDbSyncStore({ database: first });
    await store.putWatermark({ table: 'sets', since: 42 });
    first.close();

    // A reload: new connection, new store, new queue — the bytes are the only memory.
    const second = await openSyncDatabase(name);
    const reopened = indexedDbSyncStore({ database: second });
    const reloaded = new Outbox({ store: reopened, now: () => NOW });

    const listed = await reloaded.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]).toEqual<OutboxOp>({
      id: 'sets:set-1:1',
      table: 'sets',
      rowId: 'set-1',
      op: 'delete',
      rev: 1,
      queuedAt: NOW,
      attempts: 0,
      lastError: null,
    });
    expect(await reopened.watermarks()).toEqual([{ table: 'sets', since: 42 }]);

    await reloaded.complete(['sets:set-1:1']);
    expect(await reloaded.pendingCount()).toEqual({ ok: true, value: 0 });
    second.close();
  });
});
