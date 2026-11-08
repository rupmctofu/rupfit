/**
 * The routine editor's rules, pinned (FR-3.2/FR-3.3, training-science §5–§6, I-2).
 *
 * Everything here is a pure decision: no store, no clock, no React. The three things a
 * wrong editor could break are the reason the file exists — a day left with no
 * exercises, a prescription outside what the training science allows, and history that
 * a plan edit is not allowed to touch.
 */

import { describe, expect, it } from 'vitest';
import type { Exercise, PlanDay, WorkoutSession } from '../../storage';
import {
  addExercise,
  addableExercises,
  canMoveItemDown,
  canMoveItemUp,
  defaultPrescription,
  editableDayOf,
  isDirty,
  moveItemDown,
  moveItemUp,
  planDayOf,
  removeItem,
  RIR_BOUNDS,
  REPS_BOUNDS,
  SETS_BOUNDS,
  setRepRange,
  setSets,
  setTargetRIR,
  trainedBefore,
  validateDraft,
  type EditableDay,
  type EditableItem,
} from './editor';

/* ------------------------------------------------------------------ fixtures */

function exercise(id: string, name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name,
    primaryMuscle: 'quadriceps',
    pattern: 'squat',
    equipment: 'barbell',
    loadIncrementKg: 2.5,
    isCustom: false,
    isArchived: false,
    ...overrides,
  };
}

const SQUAT = exercise('lib-sentadilla', 'Sentadilla trasera');
const CURL = exercise('lib-curl', 'Curl de bíceps', {
  primaryMuscle: 'biceps',
  pattern: 'isolation',
  equipment: 'dumbbell',
  loadIncrementKg: 1,
});
const PLANCHA = exercise('lib-plancha', 'Plancha', {
  primaryMuscle: 'core',
  pattern: 'core',
  equipment: 'bodyweight',
  loadIncrementKg: 0,
});

function item(
  id: string,
  order: number,
  name: string,
  exerciseId: string | null,
  sets = 3,
): PlanDay['items'][number] {
  return {
    id,
    planDayId: 'day-pierna',
    order,
    exerciseId,
    exerciseNameSnapshot: name,
    prescription: {
      sets,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
      restSeconds: 180,
    },
  };
}

const DAY: PlanDay = {
  id: 'day-pierna',
  name: 'SENTADILLA / PIERNA',
  order: 0,
  items: [
    item('item-1', 0, 'Sentadilla trasera', SQUAT.id),
    item('item-2', 1, 'Curl de bíceps', CURL.id, 2),
    item('item-3', 2, 'Plancha', PLANCHA.id, 2),
  ],
};

function draftOf(day: PlanDay = DAY): EditableDay {
  return editableDayOf(day);
}

/** The item at a position of the draft, so a test never indexes an optional away. */
function itemAt(index: number, day: PlanDay = DAY): EditableItem {
  const found = editableDayOf(day).items[index];
  if (found === undefined) throw new Error(`no item at ${String(index)}`);
  return found;
}

let ids = 0;
function newId(): string {
  ids += 1;
  return `new-item-${String(ids)}`;
}

function sessionWith(exercises: WorkoutSession['exercises']): WorkoutSession {
  return {
    id: 'session-1',
    planDayId: DAY.id,
    dayNameSnapshot: DAY.name,
    scheduledDate: new Date(2024, 10, 4, 18).getTime(),
    startedAt: new Date(2024, 10, 4, 18).getTime(),
    endedAt: new Date(2024, 10, 4, 19).getTime(),
    phase: { kind: 'readaptation', week: 2 },
    status: 'completed',
    exercises,
  };
}

function exerciseSessionOf(exerciseId: string | null, name: string): WorkoutSession['exercises'][number] {
  return {
    id: `es-${name}`,
    order: 0,
    exerciseId,
    exerciseNameSnapshot: name,
    prescription: {
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
      restSeconds: 180,
    },
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    sets: [],
    status: 'done',
    completedAt: new Date(2024, 10, 4, 18, 40).getTime(),
  };
}

/* -------------------------------------------------------------------- bounds */

describe('the bounds a prescription may not leave', () => {
  it('publishes the limits the training science sets', () => {
    expect(SETS_BOUNDS).toEqual({ min: 1, max: 5 });
    expect(REPS_BOUNDS).toEqual({ min: 1, max: 20 });
    // RIR 0 is failure, which FR-4.3 forbids the plan to prescribe.
    expect(RIR_BOUNDS).toEqual({ min: 1, max: 5 });
  });

  it('changes sets inside the bounds and refuses the edges by name', () => {
    const raised = setSets(draftOf(), 'item-1', 4);
    expect(raised.ok).toBe(true);
    if (raised.ok) expect(raised.day.items[0]?.prescription.sets).toBe(4);

    for (const refused of [0, 6, 2.5]) {
      const outcome = setSets(draftOf(), 'item-1', refused);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.refusal).toBe('setsOutOfBounds');
    }
  });

  it('refuses a rep range outside 1–20 and a range whose ends cross', () => {
    const wider = setRepRange(draftOf(), 'item-1', { lowerBound: 6, upperBound: 12 });
    expect(wider.ok).toBe(true);
    if (wider.ok) expect(wider.day.items[0]?.prescription.repRange).toEqual({ lowerBound: 6, upperBound: 12 });

    const above = setRepRange(draftOf(), 'item-1', { lowerBound: 6, upperBound: 21 });
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.refusal).toBe('repsOutOfBounds');

    const inverted = setRepRange(draftOf(), 'item-1', { lowerBound: 12, upperBound: 6 });
    expect(inverted.ok).toBe(false);
    if (!inverted.ok) expect(inverted.refusal).toBe('repsInverted');

    const zero = setRepRange(draftOf(), 'item-1', { lowerBound: 0, upperBound: 6 });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.refusal).toBe('repsOutOfBounds');
  });

  it('never lets the plan prescribe failure: target RIR starts at 1', () => {
    const harder = setTargetRIR(draftOf(), 'item-1', { lowerBound: 1, upperBound: 2 });
    expect(harder.ok).toBe(true);
    if (harder.ok) expect(harder.day.items[0]?.prescription.targetRIR).toEqual({ lowerBound: 1, upperBound: 2 });

    const failure = setTargetRIR(draftOf(), 'item-1', { lowerBound: 0, upperBound: 1 });
    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(failure.refusal).toBe('rirOutOfBounds');

    const above = setTargetRIR(draftOf(), 'item-1', { lowerBound: 1, upperBound: 6 });
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.refusal).toBe('rirOutOfBounds');

    const inverted = setTargetRIR(draftOf(), 'item-1', { lowerBound: 4, upperBound: 2 });
    expect(inverted.ok).toBe(false);
    if (!inverted.ok) expect(inverted.refusal).toBe('rirInverted');
  });

  it('leaves the day untouched when an operation is refused', () => {
    const draft = draftOf();
    setSets(draft, 'item-1', 9);
    expect(draft).toEqual(draftOf());
  });
});

/* ------------------------------------------------------------------ reordering */

describe('reordering within a day', () => {
  it('moves an item down and up, and the stored order is the new position', () => {
    const down = moveItemDown(draftOf(), 'item-1');
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    expect(down.day.items.map((entry) => entry.id)).toEqual(['item-2', 'item-1', 'item-3']);
    expect(planDayOf(down.day).items.map((entry) => entry.order)).toEqual([0, 1, 2]);

    const back = moveItemUp(down.day, 'item-1');
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.day.items.map((entry) => entry.id)).toEqual(['item-1', 'item-2', 'item-3']);
  });

  it('names why the first and the last item cannot move further', () => {
    const up = moveItemUp(draftOf(), 'item-1');
    expect(up.ok).toBe(false);
    if (!up.ok) expect(up.refusal).toBe('firstItem');

    const down = moveItemDown(draftOf(), 'item-3');
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.refusal).toBe('lastItem');
  });

  it('disables the controls it would refuse', () => {
    const draft = draftOf();
    expect(canMoveItemUp(draft, 'item-1')).toBe(false);
    expect(canMoveItemDown(draft, 'item-1')).toBe(true);
    expect(canMoveItemUp(draft, 'item-2')).toBe(true);
    expect(canMoveItemDown(draft, 'item-3')).toBe(false);
  });
});

/* ---------------------------------------------------------------- adding items */

describe('adding an exercise from the library', () => {
  it('appends it with the accessory default of training-science §5', () => {
    const added = addExercise(draftOf(), CURL, newId);
    // `CURL` is already in the day, so the refusal is the duplicate.
    expect(added.ok).toBe(false);
    if (!added.ok) expect(added.refusal).toBe('duplicateExercise');

    const fresh = addExercise(draftOf(), exercise('lib-remo', 'Remo con barra'), newId);
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    const appended = fresh.day.items[fresh.day.items.length - 1];
    expect(appended?.exerciseName).toBe('Remo con barra');
    expect(appended?.prescription).toEqual(defaultPrescription(exercise('lib-remo', 'Remo con barra')));
    expect(planDayOf(fresh.day).items[3]?.order).toBe(3);
  });

  it('gives isolation and core work their own, lighter prescription', () => {
    const compound = defaultPrescription(SQUAT);
    const isolation = defaultPrescription(CURL);
    const core = defaultPrescription(PLANCHA);

    expect(compound).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 15 },
      targetRIR: { lowerBound: 1, upperBound: 3 },
      restSeconds: 120,
    });
    expect(isolation).toEqual({
      sets: 2,
      repRange: { lowerBound: 10, upperBound: 20 },
      targetRIR: { lowerBound: 1, upperBound: 2 },
      restSeconds: 90,
    });
    expect(core.sets).toBe(2);
    expect(core.restSeconds).toBe(90);
  });

  it('refuses an archived exercise and offers only what the day does not have', () => {
    const archived = exercise('lib-archivado', 'Sentadilla frontal', { isArchived: true });
    const refused = addExercise(draftOf(), archived, newId);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.refusal).toBe('archivedExercise');

    const available = addableExercises(draftOf(), [SQUAT, CURL, PLANCHA, archived]);
    expect(available).toEqual([]);

    const remo = exercise('lib-remo', 'Remo con barra');
    expect(addableExercises(draftOf(), [SQUAT, CURL, PLANCHA, archived, remo])).toEqual([remo]);
  });
});

/* --------------------------------------------------------------- removing items */

describe('removing an exercise from the day', () => {
  it('removes it and closes the gap in the order', () => {
    const removed = removeItem(draftOf(), 'item-2');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.day.items.map((entry) => entry.id)).toEqual(['item-1', 'item-3']);
    expect(planDayOf(removed.day).items.map((entry) => entry.order)).toEqual([0, 1]);
  });

  it('refuses to leave a day that had exercises with none, and says so', () => {
    const oneItem: PlanDay = { ...DAY, items: [item('item-1', 0, 'Sentadilla trasera', SQUAT.id)] };
    const outcome = removeItem(draftOf(oneItem), 'item-1');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal).toBe('lastExercise');
    expect(outcome.message).toContain('Sentadilla trasera');
    expect(outcome.message).toContain('último ejercicio');
  });

  it('keeps the library and the history: nothing here deletes an exercise', () => {
    // The editor's returned day is a template; the library rows and the sessions are
    // not part of its output, which is what makes a removal non-destructive.
    const removed = removeItem(draftOf(), 'item-1');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(planDayOf(removed.day).items.some((entry) => entry.exerciseId === SQUAT.id)).toBe(false);
    expect(removed.day.name).toBe(DAY.name);
  });

  it('knows which exercises a stored session already trained', () => {
    const sessions = [
      sessionWith([exerciseSessionOf(SQUAT.id, 'Sentadilla trasera')]),
      sessionWith([exerciseSessionOf(null, 'Plancha')]),
    ];
    expect(trainedBefore(sessions, itemAt(0))).toBe(true);
    expect(trainedBefore(sessions, itemAt(2))).toBe(true);
    expect(trainedBefore(sessions, itemAt(1))).toBe(false);
    expect(trainedBefore([], itemAt(0))).toBe(false);
  });
});

/* ----------------------------------------------------------- the day it saves */

describe('what the editor hands to plan.save', () => {
  it('writes the day with its items numbered from zero', () => {
    const moved = moveItemDown(draftOf(), 'item-1');
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const stored = planDayOf(moved.day);
    expect(stored.id).toBe(DAY.id);
    expect(stored.name).toBe(DAY.name);
    expect(stored.items.map((entry) => [entry.planDayId, entry.order])).toEqual([
      [DAY.id, 0],
      [DAY.id, 1],
      [DAY.id, 2],
    ]);
    // Item ids survive the edit, so `plan.save` replaces instead of delete-and-insert.
    expect(stored.items.map((entry) => entry.id)).toEqual(['item-2', 'item-1', 'item-3']);
  });

  it('keeps the prescription it was not asked to change', () => {
    const changed = setSets(draftOf(), 'item-1', 5);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const stored = planDayOf(changed.day);
    expect(stored.items[0]?.prescription).toEqual({
      sets: 5,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
      restSeconds: 180,
    });
  });

  it('refuses to save a day with no exercises, and names the exercises that are out of bounds', () => {
    const empty = validateDraft({ ...draftOf(), items: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.refusal).toBe('emptyDay');

    // An imported plan can carry a prescription no stepper could produce.
    const imported: PlanDay = { ...DAY, items: [item('item-1', 0, 'Sentadilla trasera', SQUAT.id, 8)] };
    const refused = validateDraft(draftOf(imported));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal).toBe('setsOutOfBounds');
    expect(refused.message).toContain('Sentadilla trasera');

    expect(validateDraft(draftOf()).ok).toBe(true);
  });

  it('tells an unchanged draft from an edited one', () => {
    const draft = draftOf();
    expect(isDirty(DAY, draft)).toBe(false);

    const moved = moveItemDown(draft, 'item-1');
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(isDirty(DAY, moved.day)).toBe(true);

    const relabelled = setTargetRIR(draft, 'item-2', { lowerBound: 1, upperBound: 1 });
    expect(relabelled.ok).toBe(true);
    if (relabelled.ok) expect(isDirty(DAY, relabelled.day)).toBe(true);
  });
});
