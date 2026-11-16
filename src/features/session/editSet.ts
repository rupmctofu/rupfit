/**
 * Corregir una serie ya registrada (odd/tasks/edit-set.md, S1–S6).
 *
 * Three decisions live here, and none of them needs React:
 *
 * 1. **The correction rule** (T1): a session, the exercise session, the slot and the four
 *    answers in, the corrected session out — same slot, same stored index, untouched
 *    neighbours, and a refusal instead of a guess. The screen applies it before it writes
 *    anything, so a row that cannot be corrected never opens an editor.
 * 2. **The gesture** (S2): a 500 ms press that survives a small tremor and dies the moment
 *    the finger travels or leaves. It is a state machine here rather than a timer inside a
 *    component, because "500 ms and not 10 px" is the rule the owner asked for and it has
 *    to be readable in a test.
 * 3. **The one line** (S4): when the sheet deserves «Mantén una serie para corregirla».
 *
 * The rule mirrors `reduce(… { type: 'set-corrected' })` on purpose and a test pins that
 * the two agree: the screen validates with this module and writes through the machine, and
 * two versions of the same rule would be the way the row and the store drift apart.
 */

import type { Discomfort, Effort } from '../../core/domain';
import type { ConfirmedSet, ExerciseState, SessionState, SetEntry } from '../../core/session/model';

/* ------------------------------------------------------------------ the rule */

/** The four answers of a set (S3): the kilos, the reps, how it was and the discomfort. */
export interface SetCorrection {
  readonly weightKg: number;
  readonly actualReps: number;
  readonly effort: Effort | null;
  readonly discomfort: Discomfort | null;
}

export type CorrectionRefusalCode =
  | 'sessionClosed'
  | 'unknownExercise'
  | 'invalidSlot'
  | 'notConfirmed'
  | 'invalidAnswers';

export interface CorrectionApplied {
  readonly ok: true;
  readonly session: SessionState;
  /** The set as it will be written: its own id, index, target and instant, corrected. */
  readonly set: ConfirmedSet;
}

export interface CorrectionRefused {
  readonly ok: false;
  readonly code: CorrectionRefusalCode;
  /** Spanish, ready to be shown next to the editor. */
  readonly message: string;
}

export type CorrectionOutcome = CorrectionApplied | CorrectionRefused;

export const CORRECTION_REFUSED: Record<CorrectionRefusalCode, string> = {
  sessionClosed: 'Solo se corrige en la sesión abierta.',
  unknownExercise: 'Ese ejercicio no está en la sesión.',
  invalidSlot: 'Esa serie no existe en este ejercicio.',
  notConfirmed: 'Esa serie todavía no está registrada.',
  invalidAnswers: 'Los kilos y las repeticiones no son válidos.',
};

/**
 * The correction, applied. `status !== 'inProgress'` is refused before anything else (S5):
 * a closed session is corrected from its summary, so this screen keeps one truth.
 */
export function correctSet(
  session: SessionState,
  exerciseSessionId: string,
  slot: number,
  correction: SetCorrection,
): CorrectionOutcome {
  // S5 first: on a closed session nothing below is even looked at.
  if (session.status !== 'inProgress') return refused('sessionClosed');

  const index = session.exercises.findIndex((candidate) => candidate.id === exerciseSessionId);
  const exercise = session.exercises[index];
  if (exercise === undefined) return refused('unknownExercise');

  // S6: the slot is the card's `Serie n`, and it is never renumbered or moved.
  if (!Number.isInteger(slot) || slot < 1 || slot > exercise.prescription.sets) {
    return refused('invalidSlot');
  }

  const existing = exercise.sets.find((entry) => entry.slot === slot);
  if (existing === undefined || existing.status !== 'confirmed') return refused('notConfirmed');

  if (!Number.isFinite(correction.weightKg) || correction.weightKg < 0) {
    return refused('invalidAnswers');
  }
  if (!Number.isInteger(correction.actualReps) || correction.actualReps < 0) {
    return refused('invalidAnswers');
  }

  // The four answers change; everything else of the set is carried over untouched — its
  // id, its stored index, its target and the instant it was confirmed.
  const set: ConfirmedSet = {
    ...existing.set,
    weightKg: correction.weightKg,
    actualReps: correction.actualReps,
    effort: correction.effort,
    discomfort: correction.discomfort,
  };

  const entry: SetEntry = { status: 'confirmed', slot, set };
  const sets = [...exercise.sets.filter((candidate) => candidate.slot !== slot), entry].sort(
    (left, right) => left.slot - right.slot,
  );

  // Only this exercise and only its set list: the decision, the load it was decided at
  // (I-8), the card on screen and every other exercise are the same objects they were.
  const corrected: ExerciseState = { ...exercise, sets };
  const next: SessionState = {
    ...session,
    exercises: session.exercises.map((candidate, position) =>
      position === index ? corrected : candidate,
    ),
  };

  return { ok: true, session: next, set };
}

function refused(code: CorrectionRefusalCode): CorrectionRefused {
  return { ok: false, code, message: CORRECTION_REFUSED[code] };
}

/** The gate the long press asks before it opens an editor. */
export function isCorrectable(
  session: SessionState | null,
  exerciseSessionId: string,
  slot: number,
): boolean {
  if (session === null || session.status !== 'inProgress') return false;
  const exercise = session.exercises.find((candidate) => candidate.id === exerciseSessionId);
  if (exercise === undefined) return false;
  if (!Number.isInteger(slot) || slot < 1 || slot > exercise.prescription.sets) return false;
  const entry = exercise.sets.find((candidate) => candidate.slot === slot);
  return entry !== undefined && entry.status === 'confirmed';
}

/* --------------------------------------------------------------- the gesture */

/** S2: the press the owner asked for, and the tremor it forgives. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 10;

export interface PressPoint {
  readonly x: number;
  readonly y: number;
}

export interface PressGesture {
  readonly origin: PressPoint;
  readonly startedAt: number;
  readonly cancelled: boolean;
}

export function pressStarted(point: PressPoint, at: number): PressGesture {
  return { origin: { x: point.x, y: point.y }, startedAt: at, cancelled: false };
}

/**
 * The finger moved. Past the slop the press is over — the sheet is scrolling or the track
 * is swiping, and both of those are gestures the row must not steal (S2).
 */
export function pressMoved(gesture: PressGesture, point: PressPoint): PressGesture {
  if (gesture.cancelled) return gesture;
  const dx = point.x - gesture.origin.x;
  const dy = point.y - gesture.origin.y;
  if (Math.hypot(dx, dy) <= LONG_PRESS_SLOP_PX) return gesture;
  return { ...gesture, cancelled: true };
}

/** The finger lifted before the threshold, or the browser took the pointer away. */
export function pressCancelled(gesture: PressGesture): PressGesture {
  return gesture.cancelled ? gesture : { ...gesture, cancelled: true };
}

/** True only for a press that is still held, still, at or past the threshold. */
export function pressHeld(gesture: PressGesture | null, at: number): boolean {
  if (gesture === null || gesture.cancelled) return false;
  return at - gesture.startedAt >= LONG_PRESS_MS;
}

/* -------------------------------------------------------------- the one line */

/** S4, in the owner's words: it is taught once, and it is not a control. */
export const CORRECTION_HINT = 'Mantén una serie para corregirla';

/** With a set done and nothing being edited, and never otherwise. */
export function showsCorrectionHint(
  session: SessionState | null,
  editing: boolean,
): boolean {
  if (session === null || editing) return false;
  if (session.status !== 'inProgress') return false;
  return session.exercises.some((exercise) =>
    exercise.sets.some((entry) => entry.status === 'confirmed'),
  );
}
