/**
 * The first-run write — the one place an empty store becomes a usable one.
 *
 * It is deliberately boring: read what the store holds, ask the seed what is missing
 * (`startingPointRows`), write it in a fixed order through the storage port, and report
 * the step that failed. No transaction, no clock, no id factory — the ids come from the
 * seed (`seed-ex-…`, `seed-day-…`, `seed-item-…`), which is what makes a second run an
 * upsert instead of a duplicate.
 *
 * ## The order, and what it is worth
 *
 * | step | after it | if it fails |
 * | --- | --- | --- |
 * | library | the exercises exist and `Entrenar`/`Perfil` can count them; the plan's ids have a target | nothing was written |
 * | plan | three days with items that resolve to real exercises; `planStart` can build a session | the library is complete, and the next run writes the plan |
 * | phase | the session is built in readaptation block 1 (FR-4.1); without it `planStart` reads a missing state as the normal phase | the plan exists, and the next run writes the phase |
 * | profile | the shell stops offering the setup and the store can train | the library, the plan and the phase exist; the setup is offered again, because a store with no profile is exactly what the gate looks for |
 *
 * That last row is the reason the profile is written **last**. Writing it first would make
 * the setup disappear the moment it succeeded, so a failure in the library or the plan
 * would leave a store the owner cannot train in *and* cannot repair from the UI. Written
 * last, the profile is both the flag that the start is complete and the guarantee that
 * everything it promises is already there.
 *
 * ## What it does not touch
 *
 * Any row that already exists is left alone: the sequence is additive, so the same call is
 * also the escape hatch for a store that already has a routine (`#/empezar`). Rewriting a
 * day would replace the owner's items (`plan.save` replaces a day's list, `data-model` §5.1),
 * and there is no version of this feature that is worth destroying an edited routine for.
 */

import type {
  Exercise,
  PhaseState,
  PlanDay,
  StoragePort,
  UserProfile,
} from '../../storage';
import { START_PHASE_STATE, seedRows, type SeedPlanDay } from '../../core/seed';

/**
 * The port narrowed to what the sequence uses. `StoragePort` satisfies it structurally, and
 * a test can satisfy it with eight methods and a map — the same reason the repositories are
 * ports in the first place (`data-model` §5.4).
 */
export interface StartingPointStore {
  readonly profile: Pick<StoragePort['profile'], 'save'>;
  readonly exercises: Pick<StoragePort['exercises'], 'all' | 'save'>;
  readonly plan: Pick<StoragePort['plan'], 'all' | 'save'>;
  readonly meta: Pick<StoragePort['meta'], 'readPhaseState' | 'savePhaseState'>;
}

/** What the store already holds. */
export interface StartingPointState {
  readonly exercises: readonly Exercise[];
  readonly planDays: readonly PlanDay[];
  readonly phaseState: PhaseState | undefined;
}

/** What is still missing, in the order it must be written. */
export interface StartingPointRows {
  readonly exercises: readonly Exercise[];
  readonly planDays: readonly SeedPlanDay[];
  /** `null` when a phase state already exists: real progress is never reset. */
  readonly phaseState: PhaseState | null;
}

/**
 * Omit a row that is already stored: a second run must not duplicate, and must not undo an
 * edit. A day the owner renamed or emptied stays theirs.
 */
export function startingPointRows(state: StartingPointState): StartingPointRows {
  const seed = seedRows();
  const library = new Set(state.exercises.map((exercise) => exercise.id));
  const days = new Set(state.planDays.map((day) => day.id));

  return {
    exercises: seed.exercises.filter((exercise) => !library.has(exercise.id)),
    planDays: seed.planDays.filter((day) => !days.has(day.id)),
    phaseState: state.phaseState === undefined ? START_PHASE_STATE : null,
  };
}

/** Every step of the sequence, in order. `read` is the read that happens first. */
export type StartingPointStep = 'read' | 'exercises' | 'planDays' | 'phaseState' | 'profile';

export interface StartingPointReport {
  readonly exercises: number;
  readonly planDays: number;
  readonly phaseState: number;
  readonly profile: number;
}

export type StartingPointOutcome =
  | { readonly kind: 'done'; readonly written: StartingPointReport }
  /** The owner stays on the setup and can retry; nothing navigates (S3). */
  | { readonly kind: 'failed'; readonly step: StartingPointStep; readonly message: string };

export const STARTING_POINT_COPY = {
  readFailed: 'No se pudieron leer tus datos. No se ha cambiado nada; inténtalo otra vez.',
  exercisesFailed:
    'No se pudo guardar la biblioteca de ejercicios. Nada se ha escrito todavía; inténtalo otra vez.',
  planFailed:
    'No se pudo guardar la rutina. Los ejercicios sí se han guardado; inténtalo otra vez y se completará.',
  phaseFailed:
    'No se pudo guardar el bloque de entrenamiento. La rutina sí se ha guardado; inténtalo otra vez.',
  profileFailed:
    'No se pudo guardar tu perfil. Los ejercicios y la rutina sí se han guardado; inténtalo otra vez.',
} as const;

function failed(step: StartingPointStep, message: string): StartingPointOutcome {
  return { kind: 'failed', step, message };
}

/**
 * Read, decide, write. Sequential on purpose: the order *is* the feature, and eight or
 * fifty small writes are slower in one transaction only in theory — every one of them is
 * an `await` on the same IndexedDB connection.
 */
export async function writeStartingPoint(
  store: StartingPointStore,
  profile: UserProfile,
): Promise<StartingPointOutcome> {
  let state: StartingPointState;
  try {
    state = {
      exercises: await store.exercises.all(),
      planDays: await store.plan.all(),
      phaseState: await store.meta.readPhaseState(),
    };
  } catch {
    return failed('read', STARTING_POINT_COPY.readFailed);
  }

  const rows = startingPointRows(state);

  try {
    for (const exercise of rows.exercises) await store.exercises.save(exercise);
  } catch {
    return failed('exercises', STARTING_POINT_COPY.exercisesFailed);
  }

  try {
    // `SeedPlanDay` declares the same fields as `PlanDay` (core may not import storage).
    for (const day of rows.planDays) await store.plan.save(day);
  } catch {
    return failed('planDays', STARTING_POINT_COPY.planFailed);
  }

  try {
    if (rows.phaseState !== null) await store.meta.savePhaseState(rows.phaseState);
  } catch {
    return failed('phaseState', STARTING_POINT_COPY.phaseFailed);
  }

  try {
    await store.profile.save(profile);
  } catch {
    return failed('profile', STARTING_POINT_COPY.profileFailed);
  }

  return {
    kind: 'done',
    written: {
      exercises: rows.exercises.length,
      planDays: rows.planDays.length,
      phaseState: rows.phaseState === null ? 0 : 1,
      profile: 1,
    },
  };
}
