/**
 * The open sequence's orphan scan — docs/data-model.md I-1 and §11.
 *
 * IndexedDB has no cascade and no referential integrity, so the delete routine is code
 * plus this scan. It counts and reports; it never repairs and never deletes (Q-5): a
 * row the owner did not create on purpose is still evidence, and a bug that this scan
 * hides is a bug that ships.
 */

import type { Database } from './db';
import type { OrphanReport } from './port';

const SCAN_STORES = ['sets', 'exerciseSessions', 'sessions', 'planItems', 'planDays'] as const;

export async function scanOrphans(database: Database): Promise<OrphanReport> {
  return database.read(SCAN_STORES, async (tx) => {
    const exerciseSessionIds = new Set<string>(
      await tx.objectStore('exerciseSessions').getAllKeys(),
    );
    const sessionIds = new Set<string>(await tx.objectStore('sessions').getAllKeys());
    const planDayIds = new Set<string>(await tx.objectStore('planDays').getAllKeys());

    const setRows = await tx.objectStore('sets').getAll();
    const exerciseRows = await tx.objectStore('exerciseSessions').getAll();
    const planItemRows = await tx.objectStore('planItems').getAll();

    return {
      setsWithoutExerciseSession: setRows.filter(
        (row) => !exerciseSessionIds.has(row.exerciseSessionId),
      ).length,
      exerciseSessionsWithoutSession: exerciseRows.filter((row) => !sessionIds.has(row.sessionId))
        .length,
      planItemsWithoutPlanDay: planItemRows.filter((row) => !planDayIds.has(row.planDayId)).length,
    };
  });
}
