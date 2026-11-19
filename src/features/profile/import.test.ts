/**
 * Validation to Spanish, and the two import modes — docs/data-model.md §9.
 *
 * The document's own validation is `src/storage`; this module only decides what the
 * screen says about it. Two rules from §9 decide the shape: an invalid document
 * changes nothing and names its first failure *with its path*, and `merge` is only
 * offered for the collections it accepts (measurements and activities).
 */

import { describe, expect, it } from 'vitest';
import {
  BACKUP_FIRST_SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  StorageError,
  type BackupDocument,
  type BackupValidation,
} from '../../storage';
import { importFailureText, importProblem, mergeOffer, mergeScope } from './import';

const INVALID = (path: string, message: string): BackupValidation => ({ ok: false, path, message });

/** Only the collections `merge` reads; the rest of the document is irrelevant here. */
function documentWith(parts: Partial<BackupDocument>): BackupDocument {
  return {
    documentType: 'rupfit.backup',
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: '2026-11-08T10:00:00.000Z',
    profile: null,
    phaseState: null,
    exercises: [],
    planDays: [],
    sessions: [],
    bodyMeasurements: [],
    activities: [],
    ...parts,
  } as BackupDocument;
}

describe('importProblem', () => {
  it('says nothing about a document that validated', () => {
    expect(importProblem({ ok: true, document: documentWith({}) })).toBeNull();
  });

  it('separates "not JSON" from "wrong shape": the fix is different', () => {
    const problem = importProblem(INVALID('', 'The document is not JSON: Unexpected token <'));

    expect(problem?.kind).toBe('not-json');
    expect(problem?.path).toBeNull();
    expect(problem?.title).toBe('El archivo no es una copia de Rupfit.');
    expect(problem?.detail).toContain('Unexpected token <');
  });

  it('names the version the file declares and the range this build reads', () => {
    const problem = importProblem(
      INVALID(
        'schemaVersion',
        'The document declares schemaVersion 3; this build reads schemaVersion 1 to 2. No partial import is attempted.',
      ),
    );

    expect(problem?.kind).toBe('version');
    expect(problem?.path).toBe('schemaVersion');
    // The declared number comes from the message; the range comes from the constants. Reading
    // it out of the sentence quoted the bottom of the range as if it were the only version
    // (T4 raised the ceiling to 2), so the screen said the app reads 1 while it reads 1 to 2.
    expect(problem?.title).toContain('3');
    expect(problem?.title).toContain(String(BACKUP_FIRST_SCHEMA_VERSION));
    expect(problem?.title).toContain(String(BACKUP_SCHEMA_VERSION));
    expect(problem?.title).toContain('versión');
  });

  it('still names this build when the message does not carry the versions', () => {
    const problem = importProblem(INVALID('schemaVersion', 'Unsupported document version.'));

    expect(problem?.kind).toBe('version');
    // The subject is "this build's version is named", not the number it happens to be: the
    // version moves when a field is retired (T4 raised it to 2, spec S5).
    expect(problem?.title).toContain(String(BACKUP_SCHEMA_VERSION));
  });

  it('reports the exact failure path, not a generic "import failed"', () => {
    const path = 'sessions[3].exercises[0].sets[1].effort';
    const problem = importProblem(INVALID(path, 'Invalid input'));

    expect(problem?.kind).toBe('shape');
    expect(problem?.path).toBe(path);
    expect(problem?.title).toContain(path);
    expect(problem?.detail).toContain('Invalid input');
  });

  it('has a sentence for a document that fails at its root', () => {
    const problem = importProblem(INVALID('', 'Expected object, received array'));

    expect(problem?.kind).toBe('shape');
    expect(problem?.path).toBeNull();
    expect(problem?.title).toBe('La copia no es válida.');
    expect(problem?.detail).toContain('Expected object, received array');
  });
});

describe('mergeScope', () => {
  it('counts what merge accepts and what it leaves untouched', () => {
    const scope = mergeScope(
      documentWith({
        bodyMeasurements: [{}, {}] as unknown as BackupDocument['bodyMeasurements'],
        activities: [{}] as unknown as BackupDocument['activities'],
        sessions: [{}, {}, {}] as unknown as BackupDocument['sessions'],
      }),
    );

    expect(scope).toEqual({ measurements: 2, activities: 1, total: 3, skipped: 3 });
  });
});

describe('mergeOffer', () => {
  it('names the two collections it adds and the one it does not touch', () => {
    const offer = mergeOffer(
      documentWith({
        bodyMeasurements: [{}, {}] as unknown as BackupDocument['bodyMeasurements'],
        activities: [{}] as unknown as BackupDocument['activities'],
        sessions: [{}] as unknown as BackupDocument['sessions'],
      }),
    );

    expect(offer).toBe('Añadir 2 pesos y 1 actividad. No toca el entrenamiento.');
  });

  it('is not offered when the document carries nothing merge accepts', () => {
    const offer = mergeOffer(
      documentWith({ sessions: [{}] as unknown as BackupDocument['sessions'] }),
    );

    expect(offer).toBeNull();
  });

  it('counts one item in the singular', () => {
    const offer = mergeOffer(
      documentWith({
        bodyMeasurements: [{}] as unknown as BackupDocument['bodyMeasurements'],
        activities: [{}] as unknown as BackupDocument['activities'],
      }),
    );

    expect(offer).toBe('Añadir 1 peso y 1 actividad. No toca el entrenamiento.');
  });
});

describe('importFailureText', () => {
  it('maps a missing typed confirmation to the word that is missing', () => {
    const failure = importFailureText(
      new StorageError('confirmationRequired', 'A confirmation is required.', {
        expected: 'REEMPLAZAR',
      }),
    );

    expect(failure.title).toBe('Falta la confirmación escrita.');
    expect(failure.detail).toContain('REEMPLAZAR');
  });

  it('maps a validation failure raised by the storage layer to its path', () => {
    const failure = importFailureText(
      new StorageError('backupInvalid', 'The document is not valid.', {
        path: 'activities[2].durationSeconds',
      }),
    );

    expect(failure.detail).toContain('activities[2].durationSeconds');
  });

  it('asks for the other context to be closed when the database is blocked', () => {
    const failure = importFailureText(
      new StorageError('blocked', 'Another context holds the database open.'),
    );

    expect(failure.title).toContain('Otra pestaña');
  });

  it('never swallows an unknown failure, and never shows a stack trace', () => {
    const failure = importFailureText(new Error('QuotaExceededError'));

    expect(failure.title).toBe('No se pudo importar la copia.');
    expect(failure.detail).toBe('QuotaExceededError');
    expect(importFailureText('not an error').detail).toBeNull();
  });
});
