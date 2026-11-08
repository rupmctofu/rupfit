/**
 * Exercises repository — the library of docs/data-model.md §5.1 plus I-4.
 *
 * Archiving is the normal path (the library row stays, history keeps its reference).
 * Removing a custom exercise clears the reference on the history rows in the same
 * transaction: identity goes, the name snapshot stays (§3, I-4).
 */

import { prefixKeyRange, type Database } from '../db';
import { StorageError } from '../errors';
import type { Exercise, Uuid } from '../entities';
import type { MovementPattern } from '../../core/domain';
import { exerciseFromRow, exerciseToRow } from '../mappers';
import type { ExerciseRepositoryPort } from '../port';

export class ExerciseRepository implements ExerciseRepositoryPort {
  constructor(private readonly database: Database) {}

  async all(): Promise<readonly Exercise[]> {
    return this.database.read(['exercises'], async (tx) => {
      // `by_archived` ascending: 0 (active) before 1 (archived).
      const rows = await tx.objectStore('exercises').index('by_archived').getAll();
      return rows.map(exerciseFromRow);
    });
  }

  async byId(id: Uuid): Promise<Exercise | undefined> {
    return this.database.read(['exercises'], async (tx) => {
      const row = await tx.objectStore('exercises').get(id);
      return row === undefined ? undefined : exerciseFromRow(row);
    });
  }

  async byPattern(pattern: MovementPattern): Promise<readonly Exercise[]> {
    return this.database.read(['exercises'], async (tx) => {
      const rows = await tx.objectStore('exercises').index('by_pattern').getAll(pattern);
      return rows.map(exerciseFromRow);
    });
  }

  async save(exercise: Exercise): Promise<void> {
    await this.database.write(['exercises'], async (tx) => {
      await tx.objectStore('exercises').put(exerciseToRow(exercise));
    });
  }

  async setArchived(id: Uuid, archived: boolean): Promise<void> {
    await this.database.write(['exercises'], async (tx) => {
      const store = tx.objectStore('exercises');
      const row = await store.get(id);
      if (row === undefined) {
        throw new StorageError('notFound', `Exercise ${id} is not stored.`, { exerciseId: id });
      }
      await store.put({ ...row, isArchived: archived ? 1 : 0 });
    });
  }

  async remove(id: Uuid): Promise<void> {
    await this.database.write(['exercises', 'exerciseSessions'], async (tx) => {
      const store = tx.objectStore('exercises');
      const row = await store.get(id);
      if (row === undefined) {
        throw new StorageError('notFound', `Exercise ${id} is not stored.`, { exerciseId: id });
      }
      await store.delete(id);

      // I-4: the id is nullable so history survives the deletion of its library row;
      // `by_exercise_date` gives exactly the rows that reference this exercise.
      const exerciseSessions = tx.objectStore('exerciseSessions');
      const referencing = await exerciseSessions.index('by_exercise_date').getAll(prefixKeyRange(id));
      for (const exerciseRow of referencing) {
        await exerciseSessions.put({ ...exerciseRow, exerciseId: null });
      }
    });
  }
}
