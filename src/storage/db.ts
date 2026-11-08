/**
 * The thin `idb` opener — docs/data-model.md §5.3.
 *
 * What this file is responsible for, and nothing else:
 *
 * - one schema table driving one upgrade function (§5.1, ADR-011 additive only);
 * - `blocked`: surface it, never force it, never delete the database;
 * - `blocking`: close this connection so the other context can upgrade;
 * - `terminated`: drop the connection and reopen lazily;
 * - the commit point: a write resolves on `IDBTransaction.complete`, never on
 *   `request.onsuccess` (§5.4, I-12).
 *
 * A connection is never handed to a repository: they run through `read`/`write`,
 * which own the transaction lifetime.
 */

import { deleteDB, openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { DB_NAME, DB_VERSION } from './constants';
import { StorageError, isStorageError, mapWriteFailure } from './errors';
import { SCHEMA, type RupfitDb, type StoreName } from './records';

export type { RupfitDb };

export type StorageStatus =
  /** No connection has been attempted yet. */
  | 'idle'
  | 'open'
  /** Another context holds an older version, so this one cannot open (§5.3). */
  | 'blocked'
  /** The connection was closed so another context can upgrade, or by `close()`. */
  | 'closed'
  /** The browser killed the connection; the next call reopens it lazily. */
  | 'terminated'
  | 'failed';

export interface StorageState {
  readonly status: StorageStatus;
  readonly currentVersion: number | null;
  readonly blockedVersion: number | null;
  readonly detail: string | null;
}

export interface DatabaseHandlers {
  upgrade?(
    database: IDBPDatabase<RupfitDb>,
    oldVersion: number,
    newVersion: number | null,
    transaction: IDBPTransaction<RupfitDb, StoreName[], 'versionchange'>,
  ): void;
  blocked?(currentVersion: number, blockedVersion: number | null): void;
  blocking?(currentVersion: number, blockedVersion: number | null): void;
  terminated?(): void;
}

export interface DeleteHandlers {
  /** A delete this context is holding: report it, never force it (§10). */
  blocked?(currentVersion: number): void;
}

/**
 * The seam over `idb`. The default implementation is the library; a test can supply
 * its own to reach the upgrade/blocked/blocking/terminated callbacks deterministically,
 * which is what makes §5.3 testable without a second browser context.
 */
export interface DatabaseFactory {
  open(
    name: string,
    version: number | undefined,
    handlers: DatabaseHandlers,
  ): Promise<IDBPDatabase<RupfitDb>>;
  delete(name: string, handlers: DeleteHandlers): Promise<void>;
}

export const defaultDatabaseFactory: DatabaseFactory = {
  open: (name, version, handlers) => openDB<RupfitDb>(name, version, { ...handlers }),
  delete: (name, handlers) => deleteDB(name, { ...handlers }),
};

/**
 * Only the pieces of the IndexedDB DOM surface that `idb` does not re-declare
 * (`close`, `version`, `abort`) and the key-range factory, which is a global.
 * They are reached through one narrow structural type so the storage module keeps
 * typechecking in a project without DOM lib (the core test project), instead of
 * sprinkling `any` over every call.
 */
interface RawConnection {
  close(): void;
  readonly version?: number;
}

interface RawTransaction {
  abort(): void;
}

interface KeyRangeFactory {
  bound(lower: unknown, upper: unknown): unknown;
}

function rawConnection(database: IDBPDatabase<RupfitDb>): RawConnection {
  return database as unknown as RawConnection;
}

function rawTransaction(transaction: IDBPTransaction<RupfitDb, StoreName[], 'readwrite'>): RawTransaction {
  return transaction as unknown as RawTransaction;
}

function keyRangeFactory(): KeyRangeFactory {
  const factory = (globalThis as unknown as { IDBKeyRange?: KeyRangeFactory }).IDBKeyRange;
  if (factory === undefined) {
    throw new StorageError('failed', 'IndexedDB is not available: IDBKeyRange is missing.');
  }
  return factory;
}

/**
 * A real `IDBKeyRange`; typed as `never` so it satisfies every idb query parameter
 * without the storage module naming a DOM type. The `[]` upper endpoint is the
 * standard prefix-range idiom: an empty array sorts after every number, string and
 * date, so `[[id]] .. [[id], []]` covers exactly the `[id, ...]` group.
 */
export function prefixKeyRange(...prefix: readonly (string | number)[]): never {
  return keyRangeFactory().bound([...prefix], [...prefix, []]) as never;
}

export function atLeastKeyRange(lower: string | number): never {
  const factory = (globalThis as unknown as {
    IDBKeyRange?: { lowerBound(lower: unknown): unknown };
  }).IDBKeyRange;
  if (factory === undefined) {
    throw new StorageError('failed', 'IndexedDB is not available: IDBKeyRange is missing.');
  }
  return factory.lowerBound(lower) as never;
}

export function windowKeyRange(lower: string | number, upper: string | number): never {
  return keyRangeFactory().bound(lower, upper) as never;
}

/**
 * §5.1 as an upgrade step. Additive only (ADR-011): while `DB_VERSION` stays 1 this
 * creates everything; a future version adds `if (oldVersion < 2)` with an explicit
 * copy inside this same transaction, so the cheapest failure is a rollback rather
 * than a half-migrated store. Nothing here ever deletes a store or a row.
 */
export function upgradeSchema(database: IDBPDatabase<RupfitDb>, oldVersion: number): void {
  if (oldVersion < 1) {
    const target = database as unknown as {
      createObjectStore(
        name: string,
        options: { keyPath: string },
      ): {
        createIndex(name: string, keyPath: string | string[], options: { unique: boolean }): unknown;
      };
    };

    for (const store of SCHEMA) {
      const objectStore = target.createObjectStore(store.name, { keyPath: store.keyPath });
      for (const index of store.indexes) {
        objectStore.createIndex(
          index.name,
          typeof index.keyPath === 'string' ? index.keyPath : [...index.keyPath],
          { unique: index.unique },
        );
      }
    }
  }
}

export interface DatabaseOptions {
  readonly factory?: DatabaseFactory;
  readonly name?: string;
}

export class Database {
  readonly name: string;
  private readonly factory: DatabaseFactory;
  private readonly listeners = new Set<(state: StorageState) => void>();
  private connection: Promise<IDBPDatabase<RupfitDb>> | null = null;
  private current: IDBPDatabase<RupfitDb> | null = null;
  private currentState: StorageState = {
    status: 'idle',
    currentVersion: null,
    blockedVersion: null,
    detail: null,
  };

  constructor(options: DatabaseOptions = {}) {
    this.factory = options.factory ?? defaultDatabaseFactory;
    this.name = options.name ?? DB_NAME;
  }

  state(): StorageState {
    return this.currentState;
  }

  subscribe(listener: (state: StorageState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Opens lazily and reuses one connection, as `idb` is designed to. */
  async open(): Promise<IDBPDatabase<RupfitDb>> {
    if (this.current !== null) return this.current;
    if (this.connection !== null) return this.connection;

    let rejectBlocked: ((error: StorageError) => void) | null = null;
    const blockedSignal = new Promise<never>((_resolve, reject) => {
      rejectBlocked = reject;
    });

    const opening = this.factory.open(this.name, DB_VERSION, {
      upgrade: (database, oldVersion) => {
        upgradeSchema(database, oldVersion);
      },
      blocked: (currentVersion, blockedVersion) => {
        this.publish({
          status: 'blocked',
          currentVersion,
          blockedVersion: blockedVersion ?? null,
          detail: 'Another context holds an older schema version; close it to continue.',
        });
        rejectBlocked?.(
          new StorageError(
            'blocked',
            `The database is blocked by another open context (schema version ${currentVersion}).`,
            { currentVersion, blockedVersion },
          ),
        );
      },
      blocking: (currentVersion, blockedVersion) => {
        this.dropConnection();
        this.publish({
          status: 'closed',
          currentVersion,
          blockedVersion: blockedVersion ?? null,
          detail: 'Another context requested an upgrade; this connection was closed so it can proceed.',
        });
      },
      terminated: () => {
        this.current = null;
        this.connection = null;
        this.publish({
          status: 'terminated',
          currentVersion: null,
          blockedVersion: null,
          detail: 'The browser terminated the connection; the next call reopens it.',
        });
      },
    });

    // Every caller of a blocked open shares the same rejection instead of hanging:
    // a real `blocked` open never settles until the other context closes.
    const guarded = Promise.race([opening, blockedSignal]);
    this.connection = guarded;

    try {
      const database = await guarded;
      this.current = database;
      this.publish({
        status: 'open',
        currentVersion: rawConnection(database).version ?? DB_VERSION,
        blockedVersion: null,
        detail: null,
      });
      return database;
    } catch (error) {
      this.connection = null;
      this.current = null;
      // A blocked open can still resolve later; do not leak that connection.
      opening.then(
        (late) => rawConnection(late).close(),
        () => undefined,
      );
      if (isStorageError(error)) throw error;
      throw await this.translateOpenFailure(error);
    }
  }

  /** Closes the connection. The next call to `open()` reconnects. */
  close(): void {
    this.dropConnection();
    this.publish({
      status: 'closed',
      currentVersion: null,
      blockedVersion: null,
      detail: null,
    });
  }

  /** §5.4 `read statistics`: no writes, ever. */
  async read<R>(
    stores: readonly StoreName[],
    run: (tx: IDBPTransaction<RupfitDb, StoreName[], 'readonly'>) => Promise<R>,
  ): Promise<R> {
    const database = await this.open();
    // The mode type argument is explicit: without DOM lib the `IDBTransactionMode`
    // union is not resolvable, and inference would widen it to `string`.
    const transaction = database.transaction<StoreName[], 'readonly'>([...stores], 'readonly');
    const result = await run(transaction);
    await transaction.done;
    return result;
  }

  /**
   * One transaction, and the promise resolves on `complete` (§5.4, I-12). If the
   * guard inside `run` throws — or anything else does — the transaction is aborted
   * explicitly, so a partially written operation leaves nothing behind.
   */
  async write<R>(
    stores: readonly StoreName[],
    run: (tx: IDBPTransaction<RupfitDb, StoreName[], 'readwrite'>) => Promise<R>,
  ): Promise<R> {
    const database = await this.open();
    const transaction = database.transaction<StoreName[], 'readwrite'>([...stores], 'readwrite');

    let result: R;
    try {
      result = await run(transaction);
    } catch (error) {
      try {
        rawTransaction(transaction).abort();
      } catch {
        // Already finished; the abort is best effort on a dead transaction.
      }
      await transaction.done.catch(() => undefined);
      throw mapWriteFailure(error);
    }

    try {
      await transaction.done;
    } catch (error) {
      throw mapWriteFailure(error);
    }
    return result;
  }

  /**
   * §10: close, delete, reopen empty. A delete another context is holding is
   * reported, never forced.
   */
  async removeDatabase(): Promise<void> {
    this.dropConnection();

    let rejectBlocked: ((error: StorageError) => void) | null = null;
    const blockedSignal = new Promise<never>((_resolve, reject) => {
      rejectBlocked = reject;
    });

    const deletion = this.factory.delete(this.name, {
      blocked: (currentVersion) => {
        this.publish({
          status: 'blocked',
          currentVersion,
          blockedVersion: null,
          detail: 'Another context is holding the database open; close it and delete again.',
        });
        rejectBlocked?.(
          new StorageError(
            'blocked',
            `Deleting the database is blocked by another open context (schema version ${currentVersion}).`,
            { currentVersion },
          ),
        );
      },
    });

    try {
      await Promise.race([deletion, blockedSignal]);
    } catch (error) {
      deletion.catch(() => undefined);
      throw isStorageError(error)
        ? error
        : new StorageError('failed', 'The database could not be deleted.', { cause: error });
    }
  }

  private dropConnection(): void {
    if (this.current !== null) {
      try {
        rawConnection(this.current).close();
      } catch {
        // Closing an already-closed connection is not an error worth reporting.
      }
    }
    this.current = null;
    this.connection = null;
  }

  private publish(state: StorageState): void {
    this.currentState = state;
    for (const listener of [...this.listeners]) listener(state);
  }

  /**
   * A newer build already wrote this database. §5.3's failure behaviour is a
   * read-only app that offers an export — never "delete and start over".
   */
  private async translateOpenFailure(error: unknown): Promise<StorageError> {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === 'VersionError') {
      const existing = await this.probeVersion();
      return new StorageError(
        'schemaTooNew',
        `The stored database is at schema version ${existing ?? 'unknown'}; this build supports version ${DB_VERSION}. Export your data and update the app instead of resetting the database.`,
        { existingVersion: existing, supportedVersion: DB_VERSION },
      );
    }
    return new StorageError('failed', 'The database could not be opened.', { cause: error });
  }

  private async probeVersion(): Promise<number | null> {
    try {
      const database = await this.factory.open(this.name, undefined, {});
      try {
        return rawConnection(database).version ?? null;
      } finally {
        rawConnection(database).close();
      }
    } catch {
      return null;
    }
  }
}
