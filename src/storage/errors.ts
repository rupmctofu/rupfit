/**
 * Typed storage failures. A repository reports *why* a write was refused; the UI
 * decides what to say (data-model §5.4, §7; architecture §7).
 */

export type StorageErrorCode =
  /** A guard refused the write because the store is already in that state (I-9, I-2, I-5). */
  | 'conflict'
  /** The session or exercise session is not in a state the transition allows (§7). */
  | 'invalidTransition'
  /** A set must extend the existing list by exactly one (§5.4). */
  | 'invalidIndex'
  | 'notFound'
  /** The value itself is not storable (I-10). */
  | 'invalid'
  /** A unique index rejected the row (I-11). */
  | 'duplicate'
  /** The destructive operation was not confirmed with the typed word (§9, §10). */
  | 'confirmationRequired'
  /** The database was written by a newer build; opens read-only instead of resetting. */
  | 'schemaTooNew'
  /** Another context holds the database open (§5.3, §10). */
  | 'blocked'
  /** The transaction aborted before `complete`; nothing was committed (I-12). */
  | 'aborted'
  /** The backup document failed validation; `detail.path` names the first failure (§9). */
  | 'backupInvalid'
  /** Anything the store could not classify. Never swallowed, never retried silently. */
  | 'failed';

export interface StorageErrorDetail {
  readonly [key: string]: unknown;
}

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly detail: StorageErrorDetail;

  constructor(code: StorageErrorCode, message: string, detail: StorageErrorDetail = {}) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.detail = detail;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/** IndexedDB reports a failed unique index as a `ConstraintError`; that is I-11's shape. */
export function mapWriteFailure(error: unknown): StorageError {
  if (isStorageError(error)) return error;
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'ConstraintError') {
    return new StorageError('duplicate', 'A unique index rejected this row.', { cause: error });
  }
  return new StorageError('aborted', 'The transaction did not commit; nothing was written.', {
    cause: error,
  });
}
