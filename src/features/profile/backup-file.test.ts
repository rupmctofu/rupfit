/**
 * The exported file's identity — docs/data-model.md §9, design-system §2.5.
 *
 * The name is the only thing the owner sees after an export, so it has to be
 * sortable, free of colons and spaces (iOS file names and the share sheet both
 * mangle them), and it has to carry the moment the copy was taken.
 */

import { describe, expect, it } from 'vitest';
import { artifactLine, exportArtifact } from './backup-file';

const DOCUMENT = { exportedAt: '2026-11-08T10:00:00.000Z' };

describe('exportArtifact', () => {
  it('names the file after the export instant, with no colons and no spaces', () => {
    const artifact = exportArtifact('{"a":1}', DOCUMENT);

    expect(artifact.fileName).toBe('rupfit-backup-2026-11-08T10-00-00-000Z.json');
    expect(artifact.fileName).not.toMatch(/[: ]/);
  });

  it('declares the one interchange type of §9', () => {
    expect(exportArtifact('{}', DOCUMENT).mimeType).toBe('application/json');
  });

  it('counts UTF-8 bytes, not JavaScript characters: the size is what leaves the phone', () => {
    // 9 characters, 10 bytes: `é` is two bytes in UTF-8.
    expect(exportArtifact('{"a":"é"}', DOCUMENT).bytes).toBe(10);
    expect(exportArtifact('{}', DOCUMENT).bytes).toBe(2);
  });

  it('keeps the JSON byte for byte: the file is the document, not a rendering of it', () => {
    const json = '{"documentType":"rupfit.backup","schemaVersion":1}';
    expect(exportArtifact(json, DOCUMENT).json).toBe(json);
  });

  it('states the file name and its size in one line', () => {
    const line = artifactLine(exportArtifact('{}', DOCUMENT));

    expect(line).toContain('rupfit-backup-2026-11-08T10-00-00-000Z.json');
    expect(line).toContain('2 B');
  });
});
