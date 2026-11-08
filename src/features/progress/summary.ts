/**
 * A stored session as the read-out of the Resumen screen — imported, not re-written.
 *
 * `src/core/session/model.ts` already owns `summarise`: volume, sets confirmed against
 * prescribed, duration and the per-exercise lines, all traced to stored sets (§8,
 * FR-9.1). This module only does the two things that folder cannot do for us:
 *
 * 1. **Adapt.** `summarise` takes a `SessionState`, because the session screen builds
 *    it from the reducer. A stored `WorkoutSession` becomes the same shape through
 *    `snapshotFromSource` — the documented recovery path (§7) — with one conversion:
 *    the frozen recommendation stores its instant as a `Date` and the core model keeps
 *    epoch milliseconds.
 * 2. **Decide what history is.** A finished session with evidence. A scheduled row is
 *    a plan, an `inProgress` row is the sheet that is still open, and a row without a
 *    single confirmed set has nothing to read out.
 *
 * There is deliberately no second formatting or arithmetic here: the numbers of the
 * read-out are the numbers of the Resumen screen.
 */

import {
  snapshotFromSource,
  summarise,
  type PlainRecommendation,
  type SessionSource,
  type SessionSummary,
} from '../../core/session/model';
import type { ExerciseSession, SessionStatus, WorkoutSession } from '../../storage';

const HISTORY_STATUSES: readonly SessionStatus[] = ['completed', 'partial', 'abandoned'];

function plainRecommendation(exercise: ExerciseSession): PlainRecommendation | null {
  if (exercise.recommendation === null) return null;
  return { ...exercise.recommendation, computedAt: exercise.recommendation.computedAt.getTime() };
}

/** §3/§5.1 aggregate → the recovery input the core state machine names. */
export function sessionSource(session: WorkoutSession): SessionSource {
  return {
    id: session.id,
    dayNameSnapshot: session.dayNameSnapshot,
    scheduledDate: session.scheduledDate,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    phase: session.phase,
    status: session.status,
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseNameSnapshot: exercise.exerciseNameSnapshot,
      prescription: exercise.prescription,
      recommendation: plainRecommendation(exercise),
      decision: exercise.decision,
      recommendedWeightKg: exercise.recommendedWeightKg,
      usedWeightKg: exercise.usedWeightKg,
      loadDeltaKg: exercise.loadDeltaKg,
      status: exercise.status,
      completedAt: exercise.completedAt,
      sets: [...exercise.sets].sort((left, right) => left.index - right.index),
    })),
  };
}

/** Every Resumen number of one stored session, computed from its stored sets. */
export function sessionSummary(session: WorkoutSession): SessionSummary {
  // `autoStartRest` is false: the read-out is history, and the rest bar is not part
  // of what it shows.
  return summarise(snapshotFromSource(sessionSource(session), false));
}

/** A finished session with at least one confirmed set. */
export function isHistorySession(session: WorkoutSession): boolean {
  if (!HISTORY_STATUSES.includes(session.status)) return false;
  return session.exercises.some((exercise) => exercise.sets.length > 0);
}

/** Historial's list: the sessions that happened, newest first. */
export function historySessions(sessions: readonly WorkoutSession[]): readonly WorkoutSession[] {
  return sessions
    .filter(isHistorySession)
    .slice()
    .sort((left, right) => right.scheduledDate - left.scheduledDate);
}
