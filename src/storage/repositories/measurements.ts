/**
 * Measurements repository — body weight and measurements, docs/data-model.md §5.1
 * (`by_date`) and I-10.
 *
 * Writes are stamped and queued in their own transaction (odd/tasks/cloud-sync.md T3);
 * reads hide a row another device deleted.
 */

import { windowKeyRange, type Database } from '../db';
import { StorageError } from '../errors';
import type { BodyMeasurement, EpochMs, Uuid } from '../entities';
import { isTombstone, measurementFromRow, measurementToRow } from '../mappers';
import type { MeasurementRepositoryPort } from '../port';
import { deleteStamped, writeStamped, type RowSyncDeps } from '../sync';

/** The measures a row may carry; at least one must be present (I-10). */
const MEASURES = [
  'weightKg',
  'waistCm',
  'chestCm',
  'armCm',
  'thighCm',
  'hipCm',
  'bodyFatPercent',
] as const;

export function hasAnyMeasure(measurement: BodyMeasurement): boolean {
  return MEASURES.some((measure) => measurement[measure] !== null);
}

export class MeasurementRepository implements MeasurementRepositoryPort {
  constructor(
    private readonly database: Database,
    private readonly sync: RowSyncDeps,
  ) {}

  async all(): Promise<readonly BodyMeasurement[]> {
    return this.database.read(['bodyMeasurements'], async (tx) => {
      const rows = await tx.objectStore('bodyMeasurements').index('by_date').getAll();
      return rows.filter((row) => !isTombstone(row)).map(measurementFromRow);
    });
  }

  async between(from: EpochMs, to: EpochMs): Promise<readonly BodyMeasurement[]> {
    return this.database.read(['bodyMeasurements'], async (tx) => {
      const rows = await tx
        .objectStore('bodyMeasurements')
        .index('by_date')
        .getAll(windowKeyRange(from, to));
      return rows.filter((row) => !isTombstone(row)).map(measurementFromRow);
    });
  }

  async save(measurement: BodyMeasurement): Promise<void> {
    // I-10 is a property of the row, so it is checked before the transaction opens and
    // nothing is written when it fails.
    if (!hasAnyMeasure(measurement)) {
      throw new StorageError(
        'invalid',
        'A body measurement must carry at least one measure.',
        { measureId: measurement.id },
      );
    }
    await this.database.write(['bodyMeasurements', 'meta'], async (tx) => {
      await writeStamped({
        ...this.sync,
        tx,
        table: 'body_measurements',
        key: measurement.id,
        row: measurementToRow(measurement),
      });
    });
  }

  async remove(id: Uuid): Promise<void> {
    await this.database.write(['bodyMeasurements', 'meta'], async (tx) => {
      await deleteStamped({ ...this.sync, tx, table: 'body_measurements', key: id });
    });
  }
}
