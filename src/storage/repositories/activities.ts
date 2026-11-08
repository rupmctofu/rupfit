/**
 * Activities repository — cardio and other activity rows, docs/data-model.md §5.1 and
 * I-11.
 *
 * The dedupe rule is the document's: a unique index on `externalSampleId`, plus an
 * upsert-by-index inside the transaction. Manual rows omit the key entirely, so they
 * are not in the index and can never collide with an imported sample.
 */

import { windowKeyRange, type Database } from '../db';
import { StorageError } from '../errors';
import type { ActivityRecord, EpochMs, Uuid } from '../entities';
import { activityFromRow, activityToRow } from '../mappers';
import type { ActivityRepositoryPort } from '../port';

export class ActivityRepository implements ActivityRepositoryPort {
  constructor(private readonly database: Database) {}

  async all(): Promise<readonly ActivityRecord[]> {
    return this.database.read(['activities'], async (tx) => {
      const rows = await tx.objectStore('activities').index('by_date').getAll();
      return rows.map(activityFromRow);
    });
  }

  async between(from: EpochMs, to: EpochMs): Promise<readonly ActivityRecord[]> {
    return this.database.read(['activities'], async (tx) => {
      const rows = await tx
        .objectStore('activities')
        .index('by_date')
        .getAll(windowKeyRange(from, to));
      return rows.map(activityFromRow);
    });
  }

  async save(activity: ActivityRecord): Promise<void> {
    await this.database.write(['activities'], async (tx) => {
      const store = tx.objectStore('activities');

      if (activity.externalSampleId !== null) {
        const clash = await store.index('by_externalSampleId').get(activity.externalSampleId);
        if (clash !== undefined && clash.id !== activity.id) {
          throw new StorageError(
            'duplicate',
            `Activity ${clash.id} already carries externalSampleId ${activity.externalSampleId}.`,
            { externalSampleId: activity.externalSampleId, existingId: clash.id },
          );
        }
      }

      await store.put(activityToRow(activity));
    });
  }

  async remove(id: Uuid): Promise<void> {
    await this.database.write(['activities'], async (tx) => {
      await tx.objectStore('activities').delete(id);
    });
  }
}
