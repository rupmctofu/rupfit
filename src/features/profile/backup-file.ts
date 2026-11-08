/**
 * The exported file's identity — docs/data-model.md §9, design-system §2.5.
 *
 * The export is the only durable copy of the owner's history (§11), so the artifact is
 * described as a thing that leaves the phone: a name, a type, the bytes, and nothing
 * that depends on how it is delivered. The name comes from
 * `src/storage/browser/blob.ts`, which owns the one naming rule (sortable, no colons,
 * no spaces); this module adds the size the screen states on returning.
 */

import { BACKUP_MIME_TYPE, backupFileName } from '../../storage/browser/blob';
import { formatBytes } from './storage-inventory';

export interface ExportArtifact {
  /** `rupfit-backup-2026-11-08T10-00-00-000Z.json` */
  readonly fileName: string;
  readonly mimeType: string;
  /** The document itself, byte for byte: the file is not a rendering of it. */
  readonly json: string;
  /** UTF-8 bytes. `String.length` would undercount every accent in the owner's data. */
  readonly bytes: number;
}

/** Builds the artifact from the serialised document of `BackupExport`. */
export function exportArtifact(
  json: string,
  document: { readonly exportedAt: string },
): ExportArtifact {
  return {
    fileName: backupFileName(document),
    mimeType: BACKUP_MIME_TYPE,
    json,
    bytes: new TextEncoder().encode(json).length,
  };
}

/** `rupfit-backup-….json · 1,4 MB` — what was produced, before wherever it went. */
export function artifactLine(artifact: ExportArtifact): string {
  return `${artifact.fileName} · ${formatBytes(artifact.bytes)}`;
}
