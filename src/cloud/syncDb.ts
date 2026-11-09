/**
 * The sync queue's own IndexedDB database (ADR-0002).
 *
 * The queue lives in `rupfit-cloud`, not in the app's database, on purpose:
 *
 * - The app's store holds the training history, and its schema is versioned and guarded
 *   (`src/storage/db.ts`). A queue that only exists while an account is configured has no
 *   business bumping that version or riding along in its upgrade path.
 * - A corrupt or half-written queue must never be able to block opening the store that
 *   the workout needs. Separate databases means separate failure domains.
 * - Signing out can clear the queue without touching a single session.
 *
 * Nothing here runs at import time: the database is opened on first use, and a browser
 * without IndexedDB simply gets a failing result instead of an exception during boot.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { indexedDbSyncStore, SYNC_STORE_NAMES } from './outbox';
import type { SyncStorePort } from './types';

export const SYNC_DB_NAME = 'rupfit-cloud';
export const SYNC_DB_VERSION = 1;

interface StateRow {
  readonly key: string;
  readonly rows: readonly unknown[];
}

interface SyncDb {
  readonly outbox: unknown;
  readonly syncState: StateRow;
}

let cached: Promise<IDBPDatabase<SyncDb>> | null = null;

function open(): Promise<IDBPDatabase<SyncDb>> {
  if (cached !== null) return cached;

  cached = openDB<SyncDb>(SYNC_DB_NAME, SYNC_DB_VERSION, {
    upgrade(database) {
      // Keyed by the operation's own id (`table:rowId:rev`), which is what makes an
      // enqueue idempotent: the same write twice replaces, never duplicates.
      if (!database.objectStoreNames.contains(SYNC_STORE_NAMES.outbox)) {
        database.createObjectStore(SYNC_STORE_NAMES.outbox, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(SYNC_STORE_NAMES.state)) {
        database.createObjectStore(SYNC_STORE_NAMES.state, { keyPath: 'key' });
      }
    },
  });

  return cached;
}

/** The production queue, or `null` when this browser cannot open IndexedDB. */
export async function syncStore(): Promise<SyncStorePort | null> {
  try {
    const database = await open();
    return indexedDbSyncStore({ database: database as never });
  } catch {
    // No store, no queue: the app keeps training locally and the account screen says the
    // sync is not available. It never becomes a blocking error.
    return null;
  }
}

/** Signing out of an account that has nothing pending clears the queue's marks. */
export async function clearSyncDatabase(): Promise<void> {
  cached = null;
  try {
    const { deleteDB } = await import('idb');
    await deleteDB(SYNC_DB_NAME);
  } catch {
    // Nothing to clear, or the browser refused: the queue is empty anyway.
  }
}
