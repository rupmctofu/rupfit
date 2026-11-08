/**
 * Validation turned into what the screen says, and the two import modes —
 * docs/data-model.md §9.
 *
 * The document itself is validated by `src/storage` before any transaction opens; this
 * module only decides how to say it. §9 sets the rule that matters: an invalid document
 * changes nothing and reports the *first failure with its path*
 * (`sessions[3].exercises[0].sets[1].effort`), never a generic "import failed".
 *
 * `merge` is offered only for the collections it accepts — measurements and activities.
 * A document that carries nothing else has nothing to merge, and a restore is the only
 * remaining mode, which is exactly why the merge affordance is not drawn for it.
 */

import {
  BACKUP_SCHEMA_VERSION,
  isStorageError,
  type BackupDocument,
  type BackupValidation,
} from '../../storage';

export type ImportProblemKind = 'not-json' | 'version' | 'shape';

export interface ImportProblem {
  readonly kind: ImportProblemKind;
  /** The exact path of the first failure; `null` when the whole file is the failure. */
  readonly path: string | null;
  /** One Spanish sentence naming what is wrong. */
  readonly title: string;
  /** The validation's own words, kept verbatim so nothing is lost in translation. */
  readonly detail: string;
}

/** `null` when the document validated and may be offered for import. */
export function importProblem(validation: BackupValidation): ImportProblem | null {
  if (validation.ok) return null;

  const path = validation.path === '' ? null : validation.path;
  const detail = validation.message;

  if (path === null && /not JSON/i.test(detail)) {
    return { kind: 'not-json', path: null, title: 'El archivo no es una copia de Rupfit.', detail };
  }

  if (path === 'schemaVersion') {
    return { kind: 'version', path, title: versionSentence(detail), detail };
  }

  return {
    kind: 'shape',
    path,
    title: path === null ? 'La copia no es válida.' : `La copia no es válida en ${path}.`,
    detail,
  };
}

/**
 * The storage layer names both versions in an English sentence
 * (`… declares schemaVersion 2; this build reads schemaVersion 1 …`). When both numbers
 * are there they are reused; when they are not, this build's own version is named.
 */
function versionSentence(detail: string): string {
  const found = [...detail.matchAll(/schemaVersion\s+(\d+)/g)].map((match) => match[1]);
  const declared = found[0];
  const readable = found[1];

  if (declared !== undefined && readable !== undefined) {
    return `La copia es de otra versión: el archivo declara la ${declared} y esta app lee la ${readable}. No se importa nada.`;
  }
  return `La copia es de otra versión. Esta app lee la ${BACKUP_SCHEMA_VERSION} del documento y no importa nada.`;
}

export interface MergeScope {
  readonly measurements: number;
  readonly activities: number;
  readonly total: number;
  /** Rows the document carries that merge leaves alone: the training history. */
  readonly skipped: number;
}

/** What `merge` would write, by collection (§9). */
export function mergeScope(document: BackupDocument): MergeScope {
  const measurements = document.bodyMeasurements.length;
  const activities = document.activities.length;
  const skipped =
    (document.profile === null ? 0 : 1) +
    (document.phaseState === null ? 0 : 1) +
    document.exercises.length +
    document.planDays.length +
    document.sessions.length;

  return { measurements, activities, total: measurements + activities, skipped };
}

/** `Añadir 2 pesos y 1 actividad. No toca el entrenamiento.` — `null` when it is not offered. */
export function mergeOffer(document: BackupDocument): string | null {
  const scope = mergeScope(document);
  if (scope.total === 0) return null;

  const weights = `${scope.measurements} ${scope.measurements === 1 ? 'peso' : 'pesos'}`;
  const activities = `${scope.activities} ${scope.activities === 1 ? 'actividad' : 'actividades'}`;
  return `Añadir ${weights} y ${activities}. No toca el entrenamiento.`;
}

export interface ImportFailure {
  readonly title: string;
  readonly detail: string | null;
}

/**
 * A failed import, in Spanish. The storage layer's codes say which sentence applies;
 * anything unclassified keeps its own message rather than disappearing.
 */
export function importFailureText(error: unknown): ImportFailure {
  if (isStorageError(error)) {
    switch (error.code) {
      case 'confirmationRequired':
        return {
          title: 'Falta la confirmación escrita.',
          detail: expectedWord(error.detail),
        };
      case 'backupInvalid':
        return {
          title: 'La copia no es válida.',
          detail: stringDetail(error.detail['path']) ?? error.message,
        };
      case 'blocked':
        return {
          title: 'Otra pestaña está usando los datos. Ciérrala e inténtalo otra vez.',
          detail: error.message,
        };
      case 'schemaTooNew':
        return {
          title: 'Los datos son de una versión más nueva de la app.',
          detail: error.message,
        };
      default:
        return { title: 'No se pudo importar la copia.', detail: error.message };
    }
  }

  if (error instanceof Error) {
    return { title: 'No se pudo importar la copia.', detail: error.message };
  }
  return { title: 'No se pudo importar la copia.', detail: null };
}

function stringDetail(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function expectedWord(detail: Record<string, unknown>): string | null {
  const expected = stringDetail(detail['expected']);
  return expected === null ? null : `La palabra es ${expected}.`;
}
