/**
 * The routine editor's decisions, without React (FR-3.2, FR-3.3, S4 S5 S6).
 *
 * `Entrenar` could read the plan and nothing could write one: the owner could not add,
 * remove, reorder or re-prescribe an exercise, and the template could only arrive by
 * import (`docs/roadmap.md` §"Open work recorded at this state", item 1). This module is
 * the whole of that edit, as data in and data out, so every branch is one fixture away
 * and the sheet holds no rule worth testing.
 *
 * ## What the editor is allowed to do, and what it is not
 *
 * 1. **It edits a template, never history.** The output is a `PlanDay` for
 *    `plan.save`; a stored `ExerciseSession` carries its own prescription snapshot and a
 *    frozen recommendation (I-2), so nothing here can reach a session that already
 *    started. The sheet says that sentence; this file is why it is true.
 * 2. **It never deletes an exercise.** Removing an item removes it from the day. The
 *    library row stays, because a session that references it keeps its id and its name
 *    snapshot (I-4); `exercises.remove` exists for custom exercises and is not this
 *    screen's operation.
 * 3. **A day with exercises cannot be emptied.** Removing the last item is refused with
 *    a sentence, not by silently producing a template that prescribes nothing.
 * 4. **The bounds are the training science's.** Sets, reps and target RIR come from
 *    `docs/training-science.md` §5 and §6: a prescription that leaves them is refused
 *    instead of written, and target RIR starts at 1 so the plan can never prescribe
 *    training to failure (FR-4.3).
 *
 * Nothing here reads a clock, a store or the DOM, and ids arrive as `newId`, so the
 * module is a pure function of its arguments.
 */

import type {
  Exercise,
  ExercisePrescription,
  PlanDay,
  PlanItem,
  RepRange,
  WorkoutSession,
} from '../../storage';

/** `crypto.randomUUID()` in the sheet, a counter in a test. */
export type IdFactory = () => string;

/**
 * The prescription limits of `docs/training-science.md` §5–§6.
 *
 * - **Sets 1–5.** The protocol never goes above 4 sets for a single exercise (W4
 *   primary: 4 × 8); 5 is the one step of headroom above it, and 0 would be a day that
 *   prescribes nothing.
 * - **Reps 1–20.** The ranges the document prescribes run from 6–10 (primary) to 10–20
 *   (isolation/core); the bounds are the extremes of that table plus the low end, so a
 *   heavy triple stays expressible.
 * - **Target RIR 1–5.** 0 RIR is a set to failure, which FR-4.3 forbids during the
 *   readaptation phase and the document discourages afterwards; above 5 RIR the set
 *   stops being a training set.
 */
export const SETS_BOUNDS = { min: 1, max: 5 } as const;
export const REPS_BOUNDS = { min: 1, max: 20 } as const;
export const RIR_BOUNDS = { min: 1, max: 5 } as const;

/** The rest defaults of `docs/training-science.md` §7, by kind of work. */
export const ACCESSORY_REST_SECONDS = 120;
export const ISOLATION_REST_SECONDS = 90;

/* ------------------------------------------------------------------ the draft */

/**
 * One editable item. The item's `id` is the stored `PlanItem` id and is kept, so
 * `plan.save` replaces the row it came from instead of deleting and re-inserting it;
 * the array position is the order, which is why no `order` field lives here to drift.
 */
export interface EditableItem {
  readonly id: string;
  readonly exerciseId: string | null;
  readonly exerciseName: string;
  readonly prescription: ExercisePrescription;
}

/** The day being edited: a copy, so a refused operation cannot touch the stored day. */
export interface EditableDay {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly items: readonly EditableItem[];
}

/** The stored day, as the sheet edits it. */
export function editableDayOf(day: PlanDay): EditableDay {
  return {
    id: day.id,
    name: day.name,
    order: day.order,
    items: [...day.items]
      .sort((left, right) => left.order - right.order)
      .map((stored) => ({
        id: stored.id,
        exerciseId: stored.exerciseId,
        exerciseName: stored.exerciseNameSnapshot,
        prescription: stored.prescription,
      })),
  };
}

/** The draft, as `plan.save` takes it: items numbered from zero, in array order. */
export function planDayOf(draft: EditableDay): PlanDay {
  return {
    id: draft.id,
    name: draft.name,
    order: draft.order,
    items: draft.items.map(
      (item, index): PlanItem => ({
        id: item.id,
        planDayId: draft.id,
        order: index,
        exerciseId: item.exerciseId,
        exerciseNameSnapshot: item.exerciseName,
        prescription: item.prescription,
      }),
    ),
  };
}

/* ------------------------------------------------------------------ refusals */

export type EditorRefusal =
  | 'firstItem'
  | 'lastItem'
  | 'itemNotFound'
  | 'lastExercise'
  | 'duplicateExercise'
  | 'archivedExercise'
  | 'setsOutOfBounds'
  | 'repsOutOfBounds'
  | 'repsInverted'
  | 'rirOutOfBounds'
  | 'rirInverted'
  | 'emptyDay';

export type EditorOutcome =
  | { readonly ok: true; readonly day: EditableDay }
  /** The day is unchanged and the sentence says why. */
  | { readonly ok: false; readonly refusal: EditorRefusal; readonly message: string };

function refuse(refusal: EditorRefusal, message: string): EditorOutcome {
  return { ok: false, refusal, message };
}

function accept(day: EditableDay): EditorOutcome {
  return { ok: true, day };
}

function indexOfItem(day: EditableDay, itemId: string): number {
  return day.items.findIndex((item) => item.id === itemId);
}

function withItem(day: EditableDay, index: number, item: EditableItem): EditableDay {
  return { ...day, items: day.items.map((current, at) => (at === index ? item : current)) };
}

/* -------------------------------------------------------------------- bounds */

function setsMessage(name: string, sets: number): string {
  return `«${name}» pide ${String(sets)} series y el plan permite de ${String(SETS_BOUNDS.min)} a ${String(
    SETS_BOUNDS.max,
  )}: ajusta las series antes de guardar.`;
}

function repsMessage(name: string, range: RepRange): string {
  return `«${name}» pide de ${String(range.lowerBound)} a ${String(range.upperBound)} repeticiones y el plan permite de ${String(
    REPS_BOUNDS.min,
  )} a ${String(REPS_BOUNDS.max)}.`;
}

function rirMessage(name: string, range: RepRange): string {
  return `«${name}» pide de ${String(range.lowerBound)} a ${String(range.upperBound)} RIR y el plan permite de ${String(
    RIR_BOUNDS.min,
  )} a ${String(RIR_BOUNDS.max)}: ni al fallo ni tan lejos.`;
}

function withinBounds(value: number, bounds: { readonly min: number; readonly max: number }): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

/* ---------------------------------------------------------------- operations */

function missing(): EditorOutcome {
  return refuse('itemNotFound', 'Ese ejercicio ya no está en el día. Vuelve a abrirlo desde la rutina.');
}

export function canMoveItemUp(day: EditableDay, itemId: string): boolean {
  const index = indexOfItem(day, itemId);
  return index > 0;
}

export function canMoveItemDown(day: EditableDay, itemId: string): boolean {
  const index = indexOfItem(day, itemId);
  return index !== -1 && index < day.items.length - 1;
}

function swap(day: EditableDay, from: number, to: number): EditableDay {
  const items = [...day.items];
  const moving = items[from];
  const other = items[to];
  if (moving === undefined || other === undefined) return day;
  items[from] = other;
  items[to] = moving;
  return { ...day, items };
}

export function moveItemUp(day: EditableDay, itemId: string): EditorOutcome {
  const index = indexOfItem(day, itemId);
  if (index === -1) return missing();
  if (index === 0) return refuse('firstItem', 'Este ejercicio ya es el primero del día.');
  return accept(swap(day, index, index - 1));
}

export function moveItemDown(day: EditableDay, itemId: string): EditorOutcome {
  const index = indexOfItem(day, itemId);
  if (index === -1) return missing();
  if (index === day.items.length - 1) {
    return refuse('lastItem', 'Este ejercicio ya es el último del día.');
  }
  return accept(swap(day, index, index + 1));
}

/**
 * Removes the item from the day — never from the library and never from a session.
 * The last item is refused: a day that had exercises cannot become a template that
 * prescribes nothing without the owner hearing about it.
 */
export function removeItem(day: EditableDay, itemId: string): EditorOutcome {
  const index = indexOfItem(day, itemId);
  if (index === -1) return missing();

  const item = day.items[index];
  if (item === undefined) return missing();

  if (day.items.length === 1) {
    return refuse(
      'lastExercise',
      `«${item.exerciseName}» es el último ejercicio del día. Un día con ejercicios no puede quedarse sin ninguno: añade otro antes de quitarlo.`,
    );
  }

  return accept({ ...day, items: day.items.filter((_, at) => at !== index) });
}

/**
 * The prescription a newly added exercise starts with, from the table of
 * `docs/training-science.md` §5: isolation and core work gets the lighter row of the
 * table, everything else the accessory row. The primary-lift row is narrower, and the
 * library does not say which exercise is a primary lift, so it is not guessed.
 */
export function defaultPrescription(exercise: Exercise): ExercisePrescription {
  const isolation = exercise.pattern === 'isolation' || exercise.pattern === 'core';
  if (isolation) {
    return {
      sets: 2,
      repRange: { lowerBound: 10, upperBound: 20 },
      targetRIR: { lowerBound: 1, upperBound: 2 },
      restSeconds: ISOLATION_REST_SECONDS,
    };
  }
  return {
    sets: 3,
    repRange: { lowerBound: 8, upperBound: 15 },
    targetRIR: { lowerBound: 1, upperBound: 3 },
    restSeconds: ACCESSORY_REST_SECONDS,
  };
}

/** Appends an exercise to the end of the day, with a fresh item id. */
export function addExercise(day: EditableDay, exercise: Exercise, newId: IdFactory): EditorOutcome {
  if (exercise.isArchived) {
    return refuse(
      'archivedExercise',
      `«${exercise.name}» está archivado. Restáuralo en la biblioteca antes de añadirlo a un día.`,
    );
  }
  if (day.items.some((item) => item.exerciseId === exercise.id)) {
    return refuse('duplicateExercise', `«${exercise.name}» ya está en este día.`);
  }

  return accept({
    ...day,
    items: [
      ...day.items,
      {
        id: newId(),
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        prescription: defaultPrescription(exercise),
      },
    ],
  });
}

/** The active library rows the day does not already have, by name. */
export function addableExercises(day: EditableDay, library: readonly Exercise[]): readonly Exercise[] {
  const used = new Set(day.items.flatMap((item) => (item.exerciseId === null ? [] : [item.exerciseId])));
  return library
    .filter((exercise) => !exercise.isArchived && !used.has(exercise.id))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

export function setSets(day: EditableDay, itemId: string, sets: number): EditorOutcome {
  const index = indexOfItem(day, itemId);
  if (index === -1) return missing();
  const item = day.items[index];
  if (item === undefined) return missing();

  if (!withinBounds(sets, SETS_BOUNDS)) {
    return refuse('setsOutOfBounds', setsMessage(item.exerciseName, sets));
  }
  return accept(withItem(day, index, { ...item, prescription: { ...item.prescription, sets } }));
}

export function setRepRange(day: EditableDay, itemId: string, range: RepRange): EditorOutcome {
  const index = indexOfItem(day, itemId);
  if (index === -1) return missing();
  const item = day.items[index];
  if (item === undefined) return missing();

  if (!withinBounds(range.lowerBound, REPS_BOUNDS) || !withinBounds(range.upperBound, REPS_BOUNDS)) {
    return refuse('repsOutOfBounds', repsMessage(item.exerciseName, range));
  }
  if (range.lowerBound > range.upperBound) {
    return refuse(
      'repsInverted',
      `«${item.exerciseName}» no puede pedir un mínimo de repeticiones mayor que el máximo.`,
    );
  }
  return accept(withItem(day, index, { ...item, prescription: { ...item.prescription, repRange: range } }));
}

export function setTargetRIR(day: EditableDay, itemId: string, range: RepRange): EditorOutcome {
  const index = indexOfItem(day, itemId);
  if (index === -1) return missing();
  const item = day.items[index];
  if (item === undefined) return missing();

  if (!withinBounds(range.lowerBound, RIR_BOUNDS) || !withinBounds(range.upperBound, RIR_BOUNDS)) {
    return refuse('rirOutOfBounds', rirMessage(item.exerciseName, range));
  }
  if (range.lowerBound > range.upperBound) {
    return refuse(
      'rirInverted',
      `«${item.exerciseName}» no puede pedir un RIR mínimo mayor que el máximo.`,
    );
  }
  return accept(withItem(day, index, { ...item, prescription: { ...item.prescription, targetRIR: range } }));
}

/* ------------------------------------------------------------------ the save */

/**
 * Whether the draft may be written at all.
 *
 * The empty day is refused here and not only in `removeItem`, because a draft can also
 * arrive empty from an imported plan. A prescription out of bounds is refused with the
 * exercise that carries it: the editor is the place where a bad import gets fixed, and
 * a save that silently clamped it would hide the correction.
 */
export function validateDraft(day: EditableDay): EditorOutcome {
  if (day.items.length === 0) {
    return refuse(
      'emptyDay',
      'Este día no tiene ningún ejercicio. Añade uno antes de guardar: un día vacío no prescribe nada.',
    );
  }

  for (const item of day.items) {
    if (!withinBounds(item.prescription.sets, SETS_BOUNDS)) {
      return refuse('setsOutOfBounds', setsMessage(item.exerciseName, item.prescription.sets));
    }
    const reps = item.prescription.repRange;
    if (!withinBounds(reps.lowerBound, REPS_BOUNDS) || !withinBounds(reps.upperBound, REPS_BOUNDS)) {
      return refuse('repsOutOfBounds', repsMessage(item.exerciseName, reps));
    }
    if (reps.lowerBound > reps.upperBound) {
      return refuse(
        'repsInverted',
        `«${item.exerciseName}» no puede pedir un mínimo de repeticiones mayor que el máximo.`,
      );
    }
    const rir = item.prescription.targetRIR;
    if (!withinBounds(rir.lowerBound, RIR_BOUNDS) || !withinBounds(rir.upperBound, RIR_BOUNDS)) {
      return refuse('rirOutOfBounds', rirMessage(item.exerciseName, rir));
    }
    if (rir.lowerBound > rir.upperBound) {
      return refuse(
        'rirInverted',
        `«${item.exerciseName}» no puede pedir un RIR mínimo mayor que el máximo.`,
      );
    }
  }

  return accept(day);
}

function sameRange(left: RepRange, right: RepRange): boolean {
  return left.lowerBound === right.lowerBound && left.upperBound === right.upperBound;
}

function samePrescription(left: ExercisePrescription, right: ExercisePrescription): boolean {
  return (
    left.sets === right.sets &&
    left.restSeconds === right.restSeconds &&
    sameRange(left.repRange, right.repRange) &&
    sameRange(left.targetRIR, right.targetRIR)
  );
}

/** `true` when the draft would write something other than what is stored. */
export function isDirty(stored: PlanDay, draft: EditableDay): boolean {
  const current = editableDayOf(stored);
  if (current.name !== draft.name || current.order !== draft.order) return true;
  if (current.items.length !== draft.items.length) return true;

  return draft.items.some((item, index) => {
    const before = current.items[index];
    if (before === undefined) return true;
    return (
      before.id !== item.id ||
      before.exerciseId !== item.exerciseId ||
      before.exerciseName !== item.exerciseName ||
      !samePrescription(before.prescription, item.prescription)
    );
  });
}

/* ------------------------------------------------------------------ history */

/**
 * `true` when one of the given sessions already trained this exercise.
 *
 * The match is the library id **or** the name snapshot: a deleted custom exercise
 * leaves both sides with a null id and only the snapshot to go on (I-4), and a rename
 * keeps the old snapshot in history.
 *
 * The answer is evidence from the sessions the screen read, not a claim of absence:
 * `Entrenar` reads a twelve-session window, so an exercise trained in spring may show no
 * badge — which is why the badge is a hint and the sentence about history is
 * unconditional.
 */
export function trainedBefore(
  sessions: readonly WorkoutSession[],
  item: { readonly exerciseId: string | null; readonly exerciseName: string },
): boolean {
  return sessions.some((session) =>
    session.exercises.some(
      (exercise) =>
        (item.exerciseId !== null && exercise.exerciseId === item.exerciseId) ||
        exercise.exerciseNameSnapshot === item.exerciseName,
    ),
  );
}
