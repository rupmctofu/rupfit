/**
 * Browser-only helpers for `src/storage`. They are the only files here that name a DOM
 * type, and they are imported by the features (Perfil), never by the persistence layer
 * itself, so the rest of the storage module keeps typechecking in a project without
 * DOM lib.
 *
 * §9 export path on iOS: a `Blob` download first, the share sheet with the file second,
 * copy-to-clipboard last. Which one works in a standalone iOS web app is measured on
 * device (F5); at least one must.
 */

import { BACKUP_DOCUMENT_TYPE, BACKUP_SCHEMA_VERSION } from '../constants';

export const BACKUP_MIME_TYPE = 'application/json';

/** `rupfit-backup-2026-11-08T10-00-00Z.json` — sortable, no colons, no spaces. */
export function backupFileName(document: { exportedAt: string }): string {
  const stamp = document.exportedAt.replace(/[:.]/g, '-');
  return `rupfit-backup-${stamp}.json`;
}

/** The file the download, the share sheet or the clipboard hands over (§9). */
export function backupBlob(json: string): Blob {
  return new Blob([json], { type: BACKUP_MIME_TYPE });
}

/** True when the document is the one this build writes; useful before offering export. */
export function isOwnBackupDocument(document: unknown): boolean {
  if (typeof document !== 'object' || document === null) return false;
  const candidate = document as { documentType?: unknown; schemaVersion?: unknown };
  return (
    candidate.documentType === BACKUP_DOCUMENT_TYPE &&
    candidate.schemaVersion === BACKUP_SCHEMA_VERSION
  );
}
