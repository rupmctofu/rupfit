/**
 * `createStorage()` — the adapter the app composes once and hands to the features as
 * `StoragePort` (architecture §6, §7).
 *
 * Everything the rest of the app may know is in `port.ts`. This class exists to wire
 * the pieces together, to own the connection, and to be the single place where the
 * destructive `deleteAll` of §10 lives.
 */

import { DELETE_ALL_CONFIRMATION } from './constants';
import { Database, type DatabaseFactory, type StorageState } from './db';
import { StorageError } from './errors';
import { exerciseToRow } from './mappers';
import { scanOrphans } from './maintenance';
import type {
  DeleteAllInput,
  OpenReport,
  OrphanReport,
  StoragePort,
} from './port';
import { ActivityRepository } from './repositories/activities';
import { ExerciseRepository } from './repositories/exercises';
import { MeasurementRepository } from './repositories/measurements';
import { PlanRepository } from './repositories/plan';
import { MetaRepository, ProfileRepository } from './repositories/profile';
import { SessionRepository } from './repositories/sessions';
import { BackupService } from './codec/backup';

export interface StorageOptions {
  /** The `idb` seam. A test supplies its own; the app uses the default. */
  readonly factory?: DatabaseFactory;
  readonly dbName?: string;
}

export class IndexedDbStorage implements StoragePort {
  private readonly database: Database;

  readonly sessions: SessionRepository;
  readonly exercises: ExerciseRepository;
  readonly plan: PlanRepository;
  readonly measurements: MeasurementRepository;
  readonly activities: ActivityRepository;
  readonly profile: ProfileRepository;
  readonly meta: MetaRepository;
  readonly backup: BackupService;

  constructor(options: StorageOptions = {}) {
    this.database = new Database(
      options.factory === undefined && options.dbName === undefined
        ? {}
        : {
            ...(options.factory === undefined ? {} : { factory: options.factory }),
            ...(options.dbName === undefined ? {} : { name: options.dbName }),
          },
    );
    this.sessions = new SessionRepository(this.database);
    this.exercises = new ExerciseRepository(this.database);
    this.plan = new PlanRepository(this.database);
    this.measurements = new MeasurementRepository(this.database);
    this.activities = new ActivityRepository(this.database);
    this.profile = new ProfileRepository(this.database);
    this.meta = new MetaRepository(this.database);
    this.backup = new BackupService(this.database);
  }

  async open(): Promise<OpenReport> {
    await this.database.open();
    // I-1: the open sequence reports orphans. Reporting only (Q-5).
    const orphans = await scanOrphans(this.database);
    return { state: this.database.state(), orphans };
  }

  state(): StorageState {
    return this.database.state();
  }

  subscribe(listener: (state: StorageState) => void): () => void {
    return this.database.subscribe(listener);
  }

  async scanOrphans(): Promise<OrphanReport> {
    return scanOrphans(this.database);
  }

  close(): void {
    this.database.close();
  }

  /**
   * §10 `Borrar todos los datos`: mark it, close, `deleteDatabase`, reopen empty and
   * reseed the exercise library. The only destructive operation in the app, and it
   * requires the typed confirmation.
   */
  async deleteAll(input: DeleteAllInput): Promise<void> {
    if (input.confirmation !== DELETE_ALL_CONFIRMATION) {
      throw new StorageError(
        'confirmationRequired',
        'Deleting every row requires the typed confirmation.',
        { expected: DELETE_ALL_CONFIRMATION },
      );
    }

    await this.database.removeDatabase();

    const seed = input.seed ?? [];
    if (seed.length > 0) {
      await this.database.write(['exercises'], async (tx) => {
        const store = tx.objectStore('exercises');
        for (const exercise of seed) {
          await store.put(exerciseToRow(exercise));
        }
      });
    }

    await this.database.open();
  }
}

export function createStorage(options: StorageOptions = {}): StoragePort {
  return new IndexedDbStorage(options);
}
