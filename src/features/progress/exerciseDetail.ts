/**
 * One exercise, read from the sessions that already exist.
 *
 * `#/progreso/ejercicio/<key>` is a drill-down of the Progreso tab, and its whole
 * content is derived from the rows the tab already read: no new storage port, no new
 * entity, no stored field. The key is `exerciseKey()` — the id, or `name:<snapshot>`
 * when the library row was deleted (`exerciseId` is `null` then, I-4) — so the detail
 * and the aggregations of `aggregates.ts` group by the same identity.
 *
 * Two refusals, the same two the tab makes:
 *
 * - **A session without sets is not history.** A scheduled row is a plan and an
 *   `inProgress` row is the sheet that is still open; neither is a data point. The
 *   open session is read separately (`openSessionOf`) because its prescription and
 *   its decided weight are real, frozen values — just not history yet.
 * - **Nothing is interpolated.** One point is one recorded session. There is no
 *   weekly bucket here: the series is the sequence of sessions that happened, not a
 *   calendar window, so a week without training is not a hole to fill but a date the
 *   axis simply does not show.
 *
 * Pure: no clock, no I/O, no formatting.
 */

import type { Exercise, ExerciseSession, WorkoutSession } from '../../storage';
import { exerciseKey, isRecordedSession } from './aggregates';

/** One recorded session of one exercise, as the detail reads it. */
export interface ExerciseSessionPoint {
  readonly sessionId: string;
  /** The session's `scheduledDate`. */
  readonly at: number;
  /** Heaviest confirmed set of the session. `null` = no weighted set that day. */
  readonly topSetKg: number | null;
  /** Reps actually performed on that heaviest set. */
  readonly topSetReps: number | null;
  readonly setsConfirmed: number;
  readonly setsPrescribed: number;
}

/** A stored exercise session with the session it belongs to. */
export interface ExerciseSessionRef {
  readonly session: WorkoutSession;
  readonly exercise: ExerciseSession;
}

export interface ExerciseHistory {
  readonly key: string;
  /** The newest snapshot: a rename keeps the history and shows the current name. */
  readonly name: string;
  /** Ascending by `scheduledDate`: the order the line is drawn in. */
  readonly points: readonly ExerciseSessionPoint[];
  readonly lastPoint: ExerciseSessionPoint | null;
  /** The stored exercise session of `lastPoint`, for its frozen prescription. */
  readonly lastSession: ExerciseSessionRef | null;
  readonly sessionCount: number;
  readonly setCount: number;
}

/** The one-line form the Progreso and Historial lists need. */
export interface ExerciseUsage {
  readonly key: string;
  readonly name: string;
  readonly lastAt: number;
  readonly topSetKg: number | null;
  readonly topSetReps: number | null;
  readonly sessionCount: number;
  readonly setCount: number;
}

function topSetOf(exercise: ExerciseSession): Pick<ExerciseSessionPoint, 'topSetKg' | 'topSetReps'> {
  let weightKg: number | null = null;
  let reps: number | null = null;
  for (const entry of exercise.sets) {
    // A bodyweight set has no weight to plot: 0 kg would read as a load.
    if (entry.weightKg <= 0) continue;
    if (weightKg === null || entry.weightKg > weightKg) {
      weightKg = entry.weightKg;
      reps = entry.actualReps;
    }
  }
  return { topSetKg: weightKg, topSetReps: reps };
}

function ascending(refs: readonly ExerciseSessionRef[]): readonly ExerciseSessionRef[] {
  return refs
    .slice()
    .sort(
      (left, right) =>
        left.session.scheduledDate - right.session.scheduledDate ||
        left.session.id.localeCompare(right.session.id),
    );
}

/** Every recorded session, grouped by exercise key, in the order the sessions happened. */
function recordedByExercise(
  sessions: readonly WorkoutSession[],
): Map<string, readonly ExerciseSessionRef[]> {
  const found = new Map<string, ExerciseSessionRef[]>();

  for (const session of sessions) {
    // Only what happened: a plan is not history, and an open sheet is not either.
    if (!isRecordedSession(session)) continue;

    for (const exercise of session.exercises) {
      // The exercise of a recorded session that was skipped or never started has no
      // point: it is a prescription, not an observation.
      if (exercise.sets.length === 0) continue;
      const key = exerciseKey(exercise);
      const list = found.get(key) ?? [];
      list.push({ session, exercise });
      found.set(key, list);
    }
  }

  for (const [key, refs] of found) found.set(key, [...ascending(refs)]);
  return found;
}

function pointOf(ref: ExerciseSessionRef): ExerciseSessionPoint {
  const { topSetKg, topSetReps } = topSetOf(ref.exercise);
  return {
    sessionId: ref.session.id,
    at: ref.session.scheduledDate,
    topSetKg,
    topSetReps,
    setsConfirmed: ref.exercise.sets.length,
    setsPrescribed: ref.exercise.prescription.sets,
  };
}

/** The history of one exercise, or `null` when no recorded session contains it. */
export function exerciseHistory(
  sessions: readonly WorkoutSession[],
  key: string,
): ExerciseHistory | null {
  const refs = recordedByExercise(sessions).get(key);
  if (refs === undefined || refs.length === 0) return null;

  const points = refs.map(pointOf);
  const lastRef = refs[refs.length - 1];

  return {
    key,
    name: lastRef?.exercise.exerciseNameSnapshot ?? '',
    points,
    lastPoint: points[points.length - 1] ?? null,
    lastSession: lastRef ?? null,
    sessionCount: points.length,
    setCount: points.reduce((total, point) => total + point.setsConfirmed, 0),
  };
}

/** Every exercise with recorded sets, most recently trained first. */
export function exerciseUsages(sessions: readonly WorkoutSession[]): readonly ExerciseUsage[] {
  const usages: ExerciseUsage[] = [];

  for (const [key, refs] of recordedByExercise(sessions)) {
    const lastRef = refs[refs.length - 1];
    if (lastRef === undefined) continue;
    const last = pointOf(lastRef);
    usages.push({
      key,
      name: lastRef.exercise.exerciseNameSnapshot,
      lastAt: last.at,
      topSetKg: last.topSetKg,
      topSetReps: last.topSetReps,
      sessionCount: refs.length,
      setCount: refs.reduce((total, ref) => total + ref.exercise.sets.length, 0),
    });
  }

  return usages.sort(
    (left, right) =>
      right.lastAt - left.lastAt || left.name.localeCompare(right.name, 'es'),
  );
}

/**
 * The open session's exercise, when the sheet is running and contains this exercise.
 * Its `prescription` and `recommendedWeightKg` are frozen stored values, so the detail
 * may show them — labelled as the session's, never as history.
 */
export function openSessionOf(
  sessions: readonly WorkoutSession[],
  key: string,
): ExerciseSessionRef | null {
  let newest: ExerciseSessionRef | null = null;

  for (const session of sessions) {
    if (session.status !== 'inProgress') continue;
    for (const exercise of session.exercises) {
      if (exerciseKey(exercise) !== key) continue;
      if (newest === null || session.scheduledDate > newest.session.scheduledDate) {
        newest = { session, exercise };
      }
    }
  }

  return newest;
}

/**
 * The library row behind the key, when it still exists. `exerciseId` is `null` for a
 * deleted exercise, so a name key is matched against the library by name; a row that
 * is not found stays unfound and the detail shows no muscle group and no equipment
 * rather than guessing them.
 */
export function exerciseFor(
  exercises: readonly Exercise[],
  key: string,
  name: string,
): Exercise | undefined {
  const byId = exercises.find((exercise) => exercise.id === key);
  if (byId !== undefined) return byId;
  return exercises.find(
    (exercise) => exercise.name.localeCompare(name, 'es', { sensitivity: 'base' }) === 0,
  );
}

/**
 * The one illustration this feature owns is a back squat with a bar. It is attached
 * only to content that *is* a squat: the library row's movement pattern, or a name
 * that says so. Any other exercise gets no picture instead of a wrong one.
 */
export function isSquatExercise(name: string, detail: Exercise | undefined): boolean {
  if (detail !== undefined && detail.pattern === 'squat') return true;
  return /sentadilla|squat/i.test(name);
}
