/**
 * Read paths shared by the repositories and the backup export — docs/data-model.md
 * §5.1 (why each index exists) and §8 (nothing precomputed).
 *
 * Every read goes through an index the document names, and an aggregate is assembled
 * from those reads; no statistic and no summary is stored anywhere (I-6).
 */

import type { IDBPTransaction } from 'idb';
import { prefixKeyRange } from './db';
import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  ExerciseSession,
  PhaseState,
  PlanDay,
  UserProfile,
  WorkoutSession,
} from './entities';
import {
  activityFromRow,
  exerciseFromRow,
  exerciseSessionFromRow,
  isTombstone,
  measurementFromRow,
  phaseStateFromStored,
  planDayFromRow,
  sessionFromRow,
  setFromRow,
} from './mappers';
import { META_KEYS } from './constants';
import type { RupfitDb, StoreName } from './records';

export type Transaction<Mode extends 'readonly' | 'readwrite'> = IDBPTransaction<
  RupfitDb,
  StoreName[],
  Mode
>;

/** One session with its ordered exercise sessions and their sets (§5.1). */
export async function loadSession<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
  sessionId: string,
): Promise<WorkoutSession | null> {
  const sessionRow = await tx.objectStore('sessions').get(sessionId);
  // A tombstone is a row another device deleted: still on disk, never in an answer.
  if (sessionRow === undefined || isTombstone(sessionRow)) return null;

  const exerciseRows = await tx
    .objectStore('exerciseSessions')
    .index('by_session_order')
    .getAll(prefixKeyRange(sessionId));

  const setIndex = tx.objectStore('sets').index('by_exerciseSession_index');

  const exercises: ExerciseSession[] = [];
  for (const exerciseRow of exerciseRows) {
    if (isTombstone(exerciseRow)) continue;
    const setRows = await setIndex.getAll(prefixKeyRange(exerciseRow.id));
    exercises.push(
      exerciseSessionFromRow(
        exerciseRow,
        setRows.filter((row) => !isTombstone(row)).map(setFromRow),
      ),
    );
  }
  return sessionFromRow(sessionRow, exercises);
}

/** Every session, oldest scheduled first. Used by the export only. */
export async function readAllSessions<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
): Promise<WorkoutSession[]> {
  const rows = await tx.objectStore('sessions').index('by_scheduledDate').getAll();
  const sessions: WorkoutSession[] = [];
  for (const row of rows) {
    if (isTombstone(row)) continue;
    const session = await loadSession(tx, row.id);
    if (session !== null) sessions.push(session);
  }
  return sessions;
}

export async function readAllPlanDays<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
): Promise<PlanDay[]> {
  const rows = await tx.objectStore('planDays').index('by_order').getAll();
  const itemIndex = tx.objectStore('planItems').index('by_planDay_order');
  const days: PlanDay[] = [];
  for (const row of rows) {
    if (isTombstone(row)) continue;
    const items = await itemIndex.getAll(prefixKeyRange(row.id));
    days.push(planDayFromRow(row, items.filter((item) => !isTombstone(item))));
  }
  return days;
}

export async function readAllExercises<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
): Promise<Exercise[]> {
  const rows = await tx.objectStore('exercises').index('by_archived').getAll();
  return rows.filter((row) => !isTombstone(row)).map(exerciseFromRow);
}

export async function readAllMeasurements<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
): Promise<BodyMeasurement[]> {
  const rows = await tx.objectStore('bodyMeasurements').index('by_date').getAll();
  return rows.filter((row) => !isTombstone(row)).map(measurementFromRow);
}

export async function readAllActivities<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
): Promise<ActivityRecord[]> {
  const rows = await tx.objectStore('activities').index('by_date').getAll();
  return rows.filter((row) => !isTombstone(row)).map(activityFromRow);
}

export async function readProfile<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
): Promise<UserProfile | null> {
  const row = await tx.objectStore('meta').get(META_KEYS.profile);
  return row !== undefined && row.key === 'profile' && !isTombstone(row) ? row.value : null;
}

export async function readPhaseState<Mode extends 'readonly' | 'readwrite'>(
  tx: Transaction<Mode>,
): Promise<PhaseState | null> {
  const row = await tx.objectStore('meta').get(META_KEYS.phaseState);
  return row !== undefined && row.key === 'phaseState' && !isTombstone(row)
    ? phaseStateFromStored(row.value)
    : null;
}
