/**
 * Storage constants — docs/data-model.md §5.1, §5.3, §9, §10.
 *
 * The schema version exists from the first release even while its only step is
 * "create everything" (ADR-011): that way a future additive step is a new branch in
 * the same upgrade function instead of a new mechanism.
 */

/** One database, one name. §5.1 */
export const DB_NAME = 'rupfit';

/** §5.3. Bumping this requires an explicit copy step inside the upgrade transaction. */
export const DB_VERSION = 1;

/** §9 the document's own identity, checked before anything is written. */
export const BACKUP_DOCUMENT_TYPE = 'rupfit.backup';
export const BACKUP_SCHEMA_VERSION = 1;

/** §10 deleting every row is the only destructive operation and needs this word. */
export const DELETE_ALL_CONFIRMATION = 'BORRAR TODO';

/** §9 restore replaces the whole store, so it is confirmed the same way. */
export const RESTORE_CONFIRMATION = 'REEMPLAZAR';

/**
 * I-5: a session is removed only after a typed confirmation. Typing the day name
 * makes it impossible to confirm the wrong row by holding down a key.
 */
export function deleteSessionConfirmation(dayNameSnapshot: string): string {
  return `BORRAR ${dayNameSnapshot}`;
}

/**
 * The fixed keys of the single-row records in `meta` (§5.1), plus the two the sync layer
 * keeps beside them. `meta` is schemaless and already keyed, so the push watermarks and
 * the pending queue ops need no object store of their own and no `DB_VERSION` bump.
 */
export const META_KEYS = {
  profile: 'profile',
  phaseState: 'phaseState',
  storage: 'storage',
  /** The per-table "last pushed" marks (odd/tasks/cloud-sync.md T3/T4). */
  syncWatermarks: 'syncWatermarks',
} as const;

/**
 * Prefix of a pending queue op inside `meta`. The rest of the key is the op's own id
 * (`table:rowId:rev`), so one row's op is addressable without a scan of its own.
 */
export const OUTBOX_OP_PREFIX = 'outbox:';

export type MetaKey = (typeof META_KEYS)[keyof typeof META_KEYS];

/** Set indexes are 1-based and match the card label "SERIE n" (§3). */
export const SET_INDEX_START = 1;
