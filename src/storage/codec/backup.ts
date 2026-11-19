/**
 * Backup export and import — docs/data-model.md §9.
 *
 * The two modes are the document's:
 *
 * | `restore` | clear and write every store in one transaction, after a typed confirmation |
 * | `merge`   | upsert measurements and activities only; never deletes, never touches training history |
 *
 * Validation happens *before* the transaction opens, so an invalid document changes
 * nothing. A crash mid-import leaves the previous store intact: the whole import is one
 * transaction and the promise resolves on `complete`.
 */

import { RESTORE_CONFIRMATION } from '../constants';
import { ALL_STORES } from '../records';
import type { Database } from '../db';
import { StorageError } from '../errors';
import { activityToRow, exerciseToRow, measurementToRow, phaseStateToMetaRow } from '../mappers';
import { readAllActivities, readAllExercises, readAllMeasurements, readAllPlanDays, readAllSessions, readPhaseState, readProfile } from '../readers';
import { writeActivities, writeMeasurements, writePlanDay, writeProfile, writeSessionAggregate } from '../writers';
import {
  BACKUP_COLLECTIONS,
  type BackupCollection,
  type BackupCounts,
  type BackupExport,
  type BackupPort,
  type BackupValidation,
  type ExportInput,
  type ImportInput,
  type ImportReport,
} from '../port';
import { buildBackupDocument, decodeSession, serializeDocument, type BackupDocument } from './document';
import { parseBackupDocument } from './schema';

export class BackupService implements BackupPort {
  constructor(private readonly database: Database) {}

  async export(input: ExportInput): Promise<BackupExport> {
    const data = await this.database.read(ALL_STORES, async (tx) => ({
      profile: await readProfile(tx),
      phaseState: await readPhaseState(tx),
      exercises: await readAllExercises(tx),
      planDays: await readAllPlanDays(tx),
      sessions: await readAllSessions(tx),
      bodyMeasurements: await readAllMeasurements(tx),
      activities: await readAllActivities(tx),
    }));

    const document = buildBackupDocument(data, {
      appVersion: input.appVersion,
      exportedAt: input.exportedAt,
    });
    return { document, json: serializeDocument(document) };
  }

  validate(json: string): BackupValidation {
    return parseBackupDocument(json);
  }

  async import(input: ImportInput): Promise<ImportReport> {
    const validation = parseBackupDocument(input.json);
    if (!validation.ok) {
      throw new StorageError('backupInvalid', validation.message, { path: validation.path });
    }
    const document = validation.document;

    return input.mode === 'restore'
      ? this.restore(document, input.confirmation)
      : this.merge(document);
  }

  private async restore(document: BackupDocument, confirmation: string): Promise<ImportReport> {
    if (confirmation !== RESTORE_CONFIRMATION) {
      throw new StorageError(
        'confirmationRequired',
        'Restoring replaces every stored row; type the confirmation word to continue.',
        { expected: RESTORE_CONFIRMATION },
      );
    }

    await this.database.write(ALL_STORES, async (tx) => {
      for (const store of ALL_STORES) {
        await tx.objectStore(store).clear();
      }
      if (document.profile !== null) await writeProfile(tx, document.profile);
      if (document.phaseState !== null) {
        await tx.objectStore('meta').put(phaseStateToMetaRow(document.phaseState));
      }
      for (const exercise of document.exercises) {
        await tx.objectStore('exercises').put(exerciseToRow(exercise));
      }
      for (const day of document.planDays) {
        await writePlanDay(tx, day);
      }
      for (const session of document.sessions) {
        await writeSessionAggregate(tx, decodeSession(session));
      }
      await writeMeasurements(tx, document.bodyMeasurements);
      await writeActivities(tx, document.activities);
    });

    return {
      mode: 'restore',
      written: counts({
        profile: document.profile === null ? 0 : 1,
        phaseState: document.phaseState === null ? 0 : 1,
        exercises: document.exercises.length,
        planDays: document.planDays.length,
        sessions: document.sessions.length,
        bodyMeasurements: document.bodyMeasurements.length,
        activities: document.activities.length,
      }),
      skipped: counts({}),
    };
  }

  private async merge(document: BackupDocument): Promise<ImportReport> {
    const written = await this.database.write(
      ['bodyMeasurements', 'activities'],
      async (tx) => {
        const measurements = tx.objectStore('bodyMeasurements');
        for (const measurement of document.bodyMeasurements) {
          await measurements.put(measurementToRow(measurement));
        }

        const activities = tx.objectStore('activities');
        const bySample = activities.index('by_externalSampleId');
        for (const activity of document.activities) {
          // Upsert by id, and by externalSampleId where present (I-11). The stored
          // identity wins: an incoming row with a new id but a known sample id updates
          // the row that already carries that sample instead of duplicating it.
          let target = activity.id;
          if (activity.externalSampleId !== null) {
            const clash = await bySample.get(activity.externalSampleId);
            if (clash !== undefined) target = clash.id;
          }
          await activities.put(activityToRow({ ...activity, id: target }));
        }

        return {
          bodyMeasurements: document.bodyMeasurements.length,
          activities: document.activities.length,
        };
      },
    );

    return {
      mode: 'merge',
      written: counts(written),
      skipped: counts({
        profile: document.profile === null ? 0 : 1,
        phaseState: document.phaseState === null ? 0 : 1,
        exercises: document.exercises.length,
        planDays: document.planDays.length,
        sessions: document.sessions.length,
      }),
    };
  }
}

function counts(partial: Partial<Record<BackupCollection, number>>): BackupCounts {
  const result = {} as Record<BackupCollection, number>;
  for (const collection of BACKUP_COLLECTIONS) {
    result[collection] = partial[collection] ?? 0;
  }
  return result;
}
