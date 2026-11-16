/**
 * Corregir una serie registrada (odd/tasks/edit-set.md, T1, T3).
 *
 * Every rule the feature states in prose is pinned here against the two surfaces that
 * exist without a DOM: the pure correction rule and the press state machine. Nothing is
 * drawn; what is checked is what the rule *does* — which field changes, which does not,
 * and what is refused with a sentence instead of an edit.
 *
 * The last test in the first block is the one that keeps this file honest: the rule and
 * `reduce(… 'set-corrected')` must produce the same session, because the screen validates
 * with the rule and writes through the reducer.
 */

import { describe, expect, it } from 'vitest';
import { DISCOMFORT, EFFORT, type Discomfort, type Effort } from '../../core/domain';
import {
  reduce,
  type ConfirmedSet,
  type ExerciseState,
  type SessionState,
  type SetEntry,
} from '../../core/session/model';
import type { ExercisePrescription } from '../../storage';
import {
  CORRECTION_HINT,
  CORRECTION_REFUSED,
  correctSet,
  isCorrectable,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  pressCancelled,
  pressHeld,
  pressMoved,
  pressStarted,
  showsCorrectionHint,
} from './editSet';

/** Wednesday 8 November 2023, 18:00 local. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();

const PRESCRIPTION: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 6, upperBound: 8 },
  targetRIR: { lowerBound: 2, upperBound: 3 },
  restSeconds: 180,
};

function storedSet(
  slot: number,
  weightKg: number,
  reps: number,
  effort: Effort | null = EFFORT.correct,
  discomfort: Discomfort | null = null,
): ConfirmedSet {
  return {
    id: `xs-1:${slot}`,
    index: slot,
    weightKg,
    targetReps: 6,
    actualReps: reps,
    effort,
    discomfort,
    // Spaced out, so "the instant is preserved" is a claim a test can catch.
    confirmedAt: NOW - (4 - slot) * 60_000,
  };
}

function confirmed(slot: number, weightKg: number, reps: number): SetEntry {
  return { status: 'confirmed', slot, set: storedSet(slot, weightKg, reps) };
}

function exerciseOf(sets: readonly SetEntry[], overrides: Partial<ExerciseState> = {}): ExerciseState {
  return {
    id: 'xs-1',
    exerciseId: 'ex-peso-muerto',
    exerciseNameSnapshot: 'Peso muerto',
    prescription: PRESCRIPTION,
    recommendation: null,
    decision: { kind: 'accepted' },
    recommendedWeightKg: 60,
    usedWeightKg: 60,
    loadDeltaKg: 0,
    sets,
    status: 'active',
    completedAt: null,
    ...overrides,
  };
}

const OTHER: ExerciseState = {
  id: 'xs-2',
  exerciseId: 'ex-sentadilla',
  exerciseNameSnapshot: 'Sentadilla',
  prescription: PRESCRIPTION,
  recommendation: null,
  decision: { kind: 'accepted' },
  recommendedWeightKg: 80,
  usedWeightKg: 80,
  loadDeltaKg: 0,
  sets: [{ status: 'confirmed', slot: 1, set: { ...storedSet(1, 80, 5), id: 'xs-2:1' } }],
  status: 'active',
  completedAt: null,
};

/** An open session with two of the three sets done: the state the gesture acts on. */
function openSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'session-1',
    dayNameSnapshot: 'MIÉRCOLES / CUERPO COMPLETO',
    scheduledDate: NOW - 30 * 60_000,
    startedAt: NOW - 25 * 60_000,
    endedAt: null,
    phase: { kind: 'readaptation', week: 2 },
    status: 'inProgress',
    autoStartRest: false,
    activeIndex: 0,
    rest: {
      exerciseSessionId: null,
      startedAt: null,
      durationSeconds: null,
      extensionSeconds: 0,
      dismissed: false,
    },
    exercises: [exerciseOf([confirmed(1, 60, 6), confirmed(2, 60, 5)]), OTHER],
    ...overrides,
  };
}

/** The answers the owner typed into the editor: heavier, one more rep, easier. */
const CORRECTION = {
  weightKg: 62.5,
  actualReps: 7,
  effort: EFFORT.easy,
  discomfort: DISCOMFORT.mild,
} as const;

function setAt(session: SessionState, slot: number): ConfirmedSet | null {
  const entry = session.exercises[0]?.sets.find((candidate) => candidate.slot === slot);
  return entry !== undefined && entry.status === 'confirmed' ? entry.set : null;
}

describe('the correction rule (T1)', () => {
  it('S3 rewrites the kilos, the reps, how it was and the discomfort of that set', () => {
    // RED 1: an unimplemented rule cannot correct anything.
    const outcome = correctSet(openSession(), 'xs-1', 2, CORRECTION);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(setAt(outcome.session, 2)).toMatchObject({
      weightKg: 62.5,
      actualReps: 7,
      effort: EFFORT.easy,
      discomfort: DISCOMFORT.mild,
    });
  });

  it('S6 keeps the identity of the set: its id, its stored index, its target and its instant', () => {
    // RED 2: the fields the correction must not touch.
    const before = openSession();
    const original = setAt(before, 2);
    if (original === null) throw new Error('the fixture lost its set');

    const outcome = correctSet(before, 'xs-1', 2, CORRECTION);
    if (!outcome.ok) throw new Error(outcome.message);

    expect(outcome.set.id).toBe(original.id);
    expect(outcome.set.index).toBe(original.index);
    expect(outcome.set.targetReps).toBe(original.targetReps);
    expect(outcome.set.confirmedAt).toBe(original.confirmedAt);
  });

  it('S6 does not renumber, reorder or touch the neighbour sets or the other exercise', () => {
    // RED 3: "corregir no reordena ni renumera".
    const before = openSession();
    const outcome = correctSet(before, 'xs-1', 1, CORRECTION);
    if (!outcome.ok) throw new Error(outcome.message);

    const slots = outcome.session.exercises[0]?.sets.map((entry) => entry.slot);
    expect(slots).toEqual([1, 2]);
    // Set 2 is the very same entry, not a copy with a rewritten index.
    expect(outcome.session.exercises[0]?.sets[1]).toBe(before.exercises[0]?.sets[1]);
    // The second exercise is untouched, entry and all.
    expect(outcome.session.exercises[1]).toBe(before.exercises[1]);
    // Nothing outside the set list moves either: the decision, the load, the card.
    expect(outcome.session.activeIndex).toBe(before.activeIndex);
    expect(outcome.session.status).toBe(before.status);
    expect(outcome.session.exercises[0]?.decision).toEqual(before.exercises[0]?.decision);
    expect(outcome.session.exercises[0]?.usedWeightKg).toBe(before.exercises[0]?.usedWeightKg);
  });

  it('S5 refuses a session that is not open, and changes nothing', () => {
    // RED 4: S5 — only `inProgress` is correctable.
    const closed = [
      'scheduled',
      'completed',
      'partial',
      'abandoned',
    ] as const;

    for (const status of closed) {
      const outcome = correctSet(openSession({ status }), 'xs-1', 1, CORRECTION);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error(`${status} was corrected`);
      expect(outcome.code).toBe('sessionClosed');
      expect(outcome.message).toBe(CORRECTION_REFUSED.sessionClosed);
    }
  });

  it('S6 refuses a slot that is out of range or not registered yet', () => {
    // RED 5: "rechaza índices fuera de rango".
    const before = openSession();

    for (const slot of [0, -1, 4, 99, 1.5]) {
      const outcome = correctSet(before, 'xs-1', slot, CORRECTION);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error(`slot ${slot} was corrected`);
      expect(outcome.code).toBe('invalidSlot');
    }

    // Slot 3 is prescribed but unanswered: an editor, not a correction.
    const pending = correctSet(before, 'xs-1', 3, CORRECTION);
    expect(pending.ok).toBe(false);
    if (pending.ok) throw new Error('a pending slot was corrected');
    expect(pending.code).toBe('notConfirmed');
  });

  it('refuses an exercise that is not in the session', () => {
    const outcome = correctSet(openSession(), 'xs-missing', 1, CORRECTION);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('an unknown exercise was corrected');
    expect(outcome.code).toBe('unknownExercise');
  });

  it('refuses answers that are not a weight and a rep count', () => {
    for (const correction of [
      { ...CORRECTION, weightKg: Number.NaN },
      { ...CORRECTION, weightKg: -2 },
      { ...CORRECTION, actualReps: 6.5 },
      { ...CORRECTION, actualReps: -1 },
    ]) {
      const outcome = correctSet(openSession(), 'xs-1', 1, correction);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('invalid answers were written');
      expect(outcome.code).toBe('invalidAnswers');
    }
  });

  it('produces exactly the session the reducer produces for the same correction', () => {
    // The screen validates with this rule and writes through the machine: if the two ever
    // disagree, the row shows one thing and the store holds another.
    const before = openSession();
    const outcome = correctSet(before, 'xs-1', 2, CORRECTION);
    if (!outcome.ok) throw new Error(outcome.message);

    const reduced = reduce(
      before,
      { type: 'set-corrected', exerciseSessionId: 'xs-1', slot: 2, ...CORRECTION },
      NOW,
    );

    expect(reduced.rejection).toBe(null);
    expect(reduced.state).toEqual(outcome.session);
    expect(reduced.effects).toEqual([
      expect.objectContaining({ type: 'persist-set', exerciseSessionId: 'xs-1' }),
    ]);
  });

  it('tells the gesture which rows it may open', () => {
    expect(isCorrectable(openSession(), 'xs-1', 1)).toBe(true);
    // Unanswered slot, unknown exercise, no session, closed session: never.
    expect(isCorrectable(openSession(), 'xs-1', 3)).toBe(false);
    expect(isCorrectable(openSession(), 'xs-missing', 1)).toBe(false);
    expect(isCorrectable(null, 'xs-1', 1)).toBe(false);
    expect(isCorrectable(openSession({ status: 'completed' }), 'xs-1', 1)).toBe(false);
  });
});

describe('the long press (S2)', () => {
  const ORIGIN = { x: 100, y: 400 };

  it('fires at 500 ms and not one millisecond before', () => {
    // RED 6: the threshold is the owner's, not the platform's.
    const gesture = pressStarted(ORIGIN, 1_000);

    expect(LONG_PRESS_MS).toBe(500);
    expect(pressHeld(gesture, 1_000 + 499)).toBe(false);
    expect(pressHeld(gesture, 1_000 + 500)).toBe(true);
  });

  it('survives a tremor of up to 10 px and dies beyond it', () => {
    // RED 7: a finger moves; a press that cancelled on 1 px would never open.
    const gesture = pressStarted(ORIGIN, 1_000);

    const tremor = pressMoved(gesture, { x: ORIGIN.x + 6, y: ORIGIN.y + 8 });
    expect(pressHeld(tremor, 1_500)).toBe(true);

    const drag = pressMoved(gesture, { x: ORIGIN.x + LONG_PRESS_SLOP_PX + 1, y: ORIGIN.y });
    expect(pressHeld(drag, 1_500)).toBe(false);
  });

  it('writes nothing when the finger is lifted or the browser takes the pointer away', () => {
    // RED 8: a tap is a tap; a cancel is a cancel.
    const gesture = pressStarted(ORIGIN, 1_000);

    expect(pressHeld(null, 9_999)).toBe(false);
    expect(pressHeld(pressCancelled(gesture), 9_999)).toBe(false);
    // And a cancelled press stays cancelled, whatever the clock says later.
    expect(pressHeld(pressCancelled(gesture), 1_500)).toBe(false);
  });
});

describe('the one line (S4)', () => {
  it('is shown with a set done and nothing being edited', () => {
    // RED 9: discovery, and its disappearing act.
    expect(CORRECTION_HINT).toBe('Mantén una serie para corregirla');
    expect(showsCorrectionHint(openSession(), false)).toBe(true);
  });

  it('is hidden while an editor is open, with nothing done, and on a closed session', () => {
    expect(showsCorrectionHint(openSession(), true)).toBe(false);

    const nothingDone = openSession({
      // No set confirmed anywhere in the session: the line has nothing to teach yet.
      exercises: [exerciseOf([]), { ...OTHER, sets: [] }],
    });
    expect(showsCorrectionHint(nothingDone, false)).toBe(false);

    expect(showsCorrectionHint(openSession({ status: 'completed' }), false)).toBe(false);
    expect(showsCorrectionHint(null, false)).toBe(false);
  });
});
