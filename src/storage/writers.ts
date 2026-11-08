/**
 * Write paths shared by the import transaction — docs/data-model.md §9.
 *
 * The repositories guard; these functions only write, and they are used inside a
 * transaction that is already `restore`-ing a validated document. Keeping them apart
 * means the import cannot reach a guard that would reject a legitimate restore (a
 * finished session, a set index starting at 2) while the repository paths cannot
 * bypass one.
 */

import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  PlanDay,
  UserProfile,
  WorkoutSession,
} from './entities';
import {
  activityToRow,
  exerciseSessionToRow,
  exerciseToRow,
  measurementToRow,
  planDayToRow,
  planItemToRow,
  profileToMetaRow,
  sessionToRow,
  setToRow,
} from './mappers';
import type { Transaction } from './readers';

export async function writeSessionAggregate(
  tx: Transaction<'readwrite'>,
  session: WorkoutSession,
): Promise<void> {
  await tx.objectStore('sessions').put(sessionToRow(session, false));
  const exerciseSessions = tx.objectStore('exerciseSessions');
  const sets = tx.objectStore('sets');
  for (const exerciseSession of session.exercises) {
    await exerciseSessions.put(
      exerciseSessionToRow(exerciseSession, session.id, session.scheduledDate),
    );
    for (const set of exerciseSession.sets) {
      await sets.put(setToRow(set, exerciseSession.id, session.id));
    }
  }
}

export async function writePlanDay(
  tx: Transaction<'readwrite'>,
  day: PlanDay,
): Promise<void> {
  await tx.objectStore('planDays').put(planDayToRow(day));
  const items = tx.objectStore('planItems');
  for (const item of day.items) {
    await items.put(planItemToRow(item));
  }
}

export async function writeExercises(
  tx: Transaction<'readwrite'>,
  exercises: readonly Exercise[],
): Promise<void> {
  const store = tx.objectStore('exercises');
  for (const exercise of exercises) {
    await store.put(exerciseToRow(exercise));
  }
}

export async function writeProfile(
  tx: Transaction<'readwrite'>,
  profile: UserProfile,
): Promise<void> {
  await tx.objectStore('meta').put(profileToMetaRow(profile));
}

export async function writeMeasurements(
  tx: Transaction<'readwrite'>,
  measurements: readonly BodyMeasurement[],
): Promise<void> {
  const store = tx.objectStore('bodyMeasurements');
  for (const measurement of measurements) {
    await store.put(measurementToRow(measurement));
  }
}

export async function writeActivities(
  tx: Transaction<'readwrite'>,
  activities: readonly ActivityRecord[],
): Promise<void> {
  const store = tx.objectStore('activities');
  for (const activity of activities) {
    await store.put(activityToRow(activity));
  }
}
