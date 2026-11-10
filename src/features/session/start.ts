/**
 * Starting today's session — the link the app tier was missing (S3 S4 S5 S6).
 *
 * The sheet (`#/sesion`) could display and drive a session, but nothing ever created
 * one: Inicio showed a day only when a session row already existed, and no screen wrote
 * the row. This module is the whole decision, pure and React-free, so every branch the
 * design lists is one fixture away and the screens hold no logic worth testing:
 *
 * 1. **Which plan day is next** (`nextPlanDay`). `PlanDay` stores `order` and a name, no
 *    weekday, and there is no calendar in the app (data-model §3, architecture §1.2).
 *    The rotation is therefore read from history: the sessions that were actually
 *    trained say where in the plan the owner is.
 * 2. **What gets written** (`buildSession`). One `WorkoutSession` with the day name and
 *    the prescriptions snapshotted, the engine's recommendation **frozen** per exercise
 *    (I-2, data-model §4), nothing pre-confirmed, and today's date.
 * 3. **Whether it may be written at all** (`planStart`). I-9 comes first — a session in
 *    progress is resumed, never duplicated — then each honest reason the app cannot
 *    start anything, each with its own sentence.
 *
 * Rules this file keeps: no `Date.now()` (the instant arrives as `now`), no port, no
 * DOM, no randomness (ids arrive as `newId`), and no Spanish identifier.
 */

import type {
  ExerciseOutcome,
  PhaseState,
  ProgressionRecommendation,
  SetOutcome,
  TrainingPhase,
} from '../../core/domain';
import { recommend } from '../../core/engine/progression-engine';
import { MAX_READAPTATION_WEEK } from '../../core/engine/readaptation';
import type {
  Exercise,
  ExercisePrescription,
  ExerciseSession,
  EpochMs,
  PlanDay,
  UserProfile,
  WorkoutSession,
} from '../../storage';
import { startOfDay } from './controller';

/** The id seam: `crypto.randomUUID()` in the browser (startSession.ts), a counter in a test. */
export type IdFactory = () => string;

/* ------------------------------------------------------------------- rotation */

function isClosed(status: WorkoutSession['status']): boolean {
  return status === 'completed' || status === 'partial';
}

/**
 * The instant a session is placed at, the same order Inicio's `lastSessionOf` uses:
 * the end when it was written, the start when it was not, the scheduled day otherwise.
 */
function instantOf(session: WorkoutSession): EpochMs {
  return session.endedAt ?? session.startedAt ?? session.scheduledDate;
}

/**
 * The next day of the rotation, or `null` when there is no plan to rotate through.
 *
 * The reasoning, in order:
 *
 * - **The plan is a rotation, not a calendar.** `PlanDay` carries `order` and a name;
 *   no field says "Monday". Inventing a weekday would be a fact the store cannot
 *   prove, so the position in the rotation comes from the sessions that happened.
 * - **The day after the last closed session's day.** Closed means `completed` or
 *   `partial`: a partial session trained most of the day and a `completed` one trained
 *   all of it, so both advance the rotation. An `abandoned` session is not evidence
 *   (progression-engine §2 excludes zero-set sessions) and a `scheduled` or
 *   `inProgress` row has not been trained at all, so neither moves the cursor.
 * - **Wrap at the end.** The plan is a cycle: after the last day comes the first.
 * - **With no history, the first day by `order`.** A fresh install starts the plan at
 *   its beginning.
 * - **A history entry that names a day the plan no longer has is skipped, backwards.**
 *   A deleted `PlanDay` cannot say what came after it — its neighbours in the old
 *   rotation are gone with it — so the rule keeps walking back until it finds a day the
 *   current plan still contains, and starts at the beginning only when none does.
 */
export function nextPlanDay(
  plan: readonly PlanDay[],
  sessions: readonly WorkoutSession[],
): PlanDay | null {
  const ordered = [...plan].sort((left, right) => left.order - right.order);
  const first = ordered[0];
  if (first === undefined) return null;

  const newestFirst = sessions
    .filter((session) => isClosed(session.status))
    .sort((left, right) => instantOf(right) - instantOf(left));

  for (const session of newestFirst) {
    const index = ordered.findIndex((day) => day.id === session.planDayId);
    if (index === -1) continue;
    return ordered[(index + 1) % ordered.length] ?? first;
  }

  return first;
}

/* -------------------------------------------------------------------- history */

/** One exercise's outcomes, newest first, as `ProgressionInput.history` requires. */
export type ProgressionHistory = Readonly<Record<string, readonly ExerciseOutcome[]>>;

function setOutcomeOf(set: ExerciseSession['sets'][number]): SetOutcome {
  return {
    targetReps: set.targetReps,
    actualReps: set.actualReps,
    effort: set.effort,
    discomfort: set.discomfort,
  };
}

/**
 * The engine's history, built from the stored sessions (progression-engine §2).
 *
 * Four decisions, each one an invariant rather than a preference:
 *
 * - **Closed sessions only.** An abandoned session is not evidence and a session in
 *   progress is today's work, not a past result (§2).
 * - **The heaviest confirmed set is the weight of the outcome.** `ExerciseOutcome`
 *   carries one `weightKg` for a set list, and a back-off set would otherwise drag the
 *   number down; the heaviest set is the load the session was trained at, and it is the
 *   same choice Inicio's strip already makes.
 * - **`recommendedWeightKg` is what the app showed**, stored at decision time (I-8),
 *   falling back to the frozen recommendation's suggestion. The engine compares the two
 *   in rule 7 and must not be fed a recomputed number (I-2).
 * - **Newest first**, which is the order the engine reads.
 */
export function progressionHistoryOf(sessions: readonly WorkoutSession[]): ProgressionHistory {
  const oldestFirst = sessions
    .filter((session) => isClosed(session.status))
    .sort((left, right) => left.scheduledDate - right.scheduledDate);

  const collected: Record<string, ExerciseOutcome[]> = {};

  for (const session of oldestFirst) {
    for (const exercise of session.exercises) {
      const exerciseId = exercise.exerciseId;
      // A deleted library row leaves its snapshot but no id: there is nothing to key
      // the engine's history by, and `buildSession` writes a null recommendation for it.
      if (exerciseId === null) continue;
      const confirmed = exercise.sets.filter((set) => Number.isFinite(set.weightKg));
      if (confirmed.length === 0) continue;

      const heaviest = confirmed.reduce((best, set) => (set.weightKg >= best.weightKg ? set : best));
      const outcome: ExerciseOutcome = {
        date: new Date(session.scheduledDate),
        weightKg: heaviest.weightKg,
        recommendedWeightKg:
          exercise.recommendedWeightKg ?? exercise.recommendation?.suggestedWeightKg ?? null,
        sets: confirmed.map(setOutcomeOf),
      };

      collected[exerciseId] = [...(collected[exerciseId] ?? []), outcome];
    }
  }

  const newestFirst: Record<string, readonly ExerciseOutcome[]> = {};
  for (const [exerciseId, outcomes] of Object.entries(collected)) {
    newestFirst[exerciseId] = [...outcomes].reverse();
  }
  return newestFirst;
}

/* --------------------------------------------------------------- the aggregate */

/**
 * The phase a new session is trained in. `PhaseState.block` is the block being trained
 * (1..4) and `TrainingPhase.week` is the week inside readaptation (1..8); the app tier
 * keeps no separate week counter, so the block travels as the week — the number the
 * readaptation table compares, and the one Inicio already labels `semana N de 4`.
 * No stored phase state means the programme has not started: normal rules apply.
 */
export function phaseOf(phaseState: PhaseState | undefined): TrainingPhase {
  if (phaseState === undefined) return { kind: 'normal' };
  return {
    kind: 'readaptation',
    week: Math.min(Math.max(Math.trunc(phaseState.block), 1), MAX_READAPTATION_WEEK),
  };
}

/** Rule 6 is the only reader of `phaseState`, and `{ block: 1, passedBlocks: 0 }` is neutral. */
const NEUTRAL_PHASE_STATE: PhaseState = { block: 1, passedBlocks: 0 };

function copyPrescription(prescription: ExercisePrescription): ExercisePrescription {
  return {
    sets: prescription.sets,
    repRange: { lowerBound: prescription.repRange.lowerBound, upperBound: prescription.repRange.upperBound },
    targetRIR: {
      lowerBound: prescription.targetRIR.lowerBound,
      upperBound: prescription.targetRIR.upperBound,
    },
    restSeconds: prescription.restSeconds,
    // The profile is part of the prescription: without it the session would ask the
    // engine for hypertrophy numbers for a strength lift the plan declared differently.
    ...(prescription.role === undefined ? {} : { role: prescription.role }),
    // And so is the timed work of a conditioning set. This copy is the one the session and
    // the engine both read, so dropping it here would turn a 3-minute interval back into a
    // line of repetitions on the only screen that shows it.
    ...(prescription.durationSeconds === undefined
      ? {}
      : { durationSeconds: prescription.durationSeconds }),
  };
}

export interface BuildSessionInput {
  /** The plan day being started, with its ordered items. */
  readonly day: PlanDay;
  /** The exercise library, archived rows included: a plan item may name one. */
  readonly library: readonly Exercise[];
  readonly history: ProgressionHistory;
  readonly profile: UserProfile;
  readonly phaseState: PhaseState | undefined;
  /** The injected instant: the session's date and the recommendation's `computedAt`. */
  readonly now: EpochMs;
  readonly newId: IdFactory;
}

export interface BuiltSession {
  /** Exactly what `sessions.create` receives: no sets, no decision, nothing confirmed. */
  readonly session: WorkoutSession;
  /**
   * FR-8.1 as the profile states it when the session is built.
   *
   * It is deliberately **not** written into the aggregate: `WorkoutSession` has no such
   * field (data-model §3). The session screen no longer reads it either — the rest timer
   * is gone (S5), so `controller.boot` seeds every session with `autoStartRest: false`
   * and the switch left Perfil. Returning it keeps the creation-time read explicit and
   * testable instead of letting a caller invent a default; a per-session snapshot would
   * be a storage column and a data-model change, not a UI decision.
   */
  readonly autoStartRest: boolean;
}

/**
 * The `WorkoutSession` to create for one plan day.
 *
 * What is snapshotted and why (I-2, I-4, data-model §1.3): the day name, every
 * prescription and every recommendation are copied in, so editing the plan, renaming an
 * exercise or archiving it later cannot rewrite what this session prescribed. What is
 * *not* written: no set, no `startedAt`, no load decision — the sheet earns those, one
 * confirmed set at a time (§5.4, §7).
 *
 * Two degradations, both stated rather than hidden:
 *
 * - A plan item whose library row is **archived** is still built. Archiving removes an
 *   exercise from the picker, not from a plan that already names it, and dropping it
 *   would silently shorten the day.
 * - A plan item whose library row is **missing or null** (a deleted custom exercise,
 *   I-4) keeps its name snapshot and gets `exerciseId: null` with a `null`
 *   recommendation: the engine needs an `Exercise`, and no number is better than an
 *   invented one.
 */
export function buildSession(input: BuildSessionInput): BuiltSession {
  const phase = phaseOf(input.phaseState);
  const phaseState = input.phaseState ?? NEUTRAL_PHASE_STATE;
  const computedAt = new Date(input.now);

  const exercises: ExerciseSession[] = [...input.day.items]
    .sort((left, right) => left.order - right.order)
    .map((item, index) => {
      const row =
        item.exerciseId === null
          ? undefined
          : input.library.find((candidate) => candidate.id === item.exerciseId);

      let recommendation: ProgressionRecommendation | null = null;
      if (row !== undefined) {
        recommendation = recommend(
          {
            exercise: row,
            prescription: copyPrescription(item.prescription),
            phase,
            phaseState,
            history: input.history[row.id] ?? [],
            // `UserProfile` carries no calibration weight, so a first-time exercise gets
            // the engine's §5 case 2: "elige un peso", never a confident guess (FR-5.5).
            coldStart: null,
          },
          computedAt,
        );
      }

      return {
        id: input.newId(),
        // Contiguous 1-based order: the position in the session, not the plan item's own
        // number, so a plan with gaps or duplicates still sorts and reads correctly.
        order: index + 1,
        exerciseId: row === undefined ? null : row.id,
        exerciseNameSnapshot: item.exerciseNameSnapshot,
        prescription: copyPrescription(item.prescription),
        recommendation,
        decision: null,
        recommendedWeightKg: null,
        usedWeightKg: null,
        loadDeltaKg: null,
        sets: [],
        status: 'pending',
        completedAt: null,
      };
    });

  return {
    session: {
      id: input.newId(),
      planDayId: input.day.id,
      dayNameSnapshot: input.day.name,
      // A session is scheduled for a day, not for an instant; the instant of the first
      // confirmed set is what becomes `startedAt` (§5.4).
      scheduledDate: startOfDay(input.now),
      startedAt: null,
      endedAt: null,
      phase,
      status: 'scheduled',
      exercises,
    },
    autoStartRest: input.profile.autoStartRestTimer,
  };
}

/* -------------------------------------------------------------------- the gate */

/** Why nothing can be started. Every one of them has a sentence in `START_COPY`. */
export type StartRefusal = 'noPlan' | 'noProfile' | 'emptyDay' | 'unknownDay';

export const START_COPY = {
  noPlan: 'Todavía no hay ninguna rutina guardada. Prepara los días de la semana en Ejercicios.',
  noProfile:
    'Antes de empezar necesitamos tu perfil: sin él la app no sabe cuántos días entrenas. Se completa en Perfil.',
  emptyDay: 'Ese día todavía no tiene ejercicios. Añade alguno en Ejercicios antes de empezar.',
  unknownDay: 'Ese día ya no está en tu rutina. Vuelve a la rutina de Ejercicios.',
  resume: 'Tienes un entrenamiento abierto. Se abre donde lo dejaste; no se ha creado otro.',
  readFailed: 'No se pudieron abrir tus datos. No se ha creado nada; inténtalo otra vez.',
  createFailed: 'No se pudo guardar la sesión. No se ha abierto nada; inténtalo otra vez.',
} as const;

/** What the sheet's boot will find, and what the caller may write. */
export type StartPlan =
  | { readonly kind: 'blocked'; readonly refusal: StartRefusal; readonly message: string }
  /** I-9: the only session that may be open is the one already open. */
  | { readonly kind: 'resume'; readonly sessionId: string; readonly dayName: string; readonly message: string }
  /** Today's scheduled session for this day already exists: open it, write nothing. */
  | { readonly kind: 'open'; readonly sessionId: string; readonly dayName: string }
  | { readonly kind: 'create'; readonly built: BuiltSession };

export interface StartInput {
  readonly now: EpochMs;
  readonly plan: readonly PlanDay[];
  /** The stored sessions, most recent first or not: this module sorts what it needs. */
  readonly sessions: readonly WorkoutSession[];
  readonly inProgress: WorkoutSession | undefined;
  readonly library: readonly Exercise[];
  readonly profile: UserProfile | undefined;
  readonly phaseState: PhaseState | undefined;
  readonly newId: IdFactory;
  /** Ejercicios names a day; Inicio leaves it out and lets the rotation decide. */
  readonly planDayId?: string | null;
}

function sameDayOf(left: EpochMs, right: EpochMs): boolean {
  return startOfDay(left) === startOfDay(right);
}

/**
 * The one door a start goes through.
 *
 * Order matters and is the message:
 *
 * 1. **A session in progress wins over everything** (I-9). Two open sessions are a
 *    corruption of the journal the owner relies on, so nothing else is even considered.
 * 2. **No plan, no start**: there is no day to build.
 * 3. **The day must exist and have exercises.** Ejercicios can name a day that was
 *    deleted while the list was on screen, so an unknown id is refused, not ignored.
 * 4. **Today's session for that day, if it already exists, is opened.** Tapping Inicio
 *    twice, or reopening Inicio after the sheet was closed, must never write a second
 *    session for the same day.
 * 5. **No profile, no write.** `autoStartRestTimer`, the training days and the weight
 *    goal live there; FR-8.1's setting has no honest default to guess.
 * 6. Only then is a session built.
 */
export function planStart(input: StartInput): StartPlan {
  if (input.inProgress !== undefined) {
    return {
      kind: 'resume',
      sessionId: input.inProgress.id,
      dayName: input.inProgress.dayNameSnapshot,
      message: START_COPY.resume,
    };
  }

  if (input.plan.length === 0) {
    return { kind: 'blocked', refusal: 'noPlan', message: START_COPY.noPlan };
  }

  const requested = input.planDayId ?? null;
  const day =
    requested === null
      ? nextPlanDay(input.plan, input.sessions)
      : (input.plan.find((candidate) => candidate.id === requested) ?? null);

  if (day === null) {
    return { kind: 'blocked', refusal: 'unknownDay', message: START_COPY.unknownDay };
  }

  if (day.items.length === 0) {
    return { kind: 'blocked', refusal: 'emptyDay', message: START_COPY.emptyDay };
  }

  const alreadyScheduled = input.sessions.find(
    (session) =>
      session.planDayId === day.id &&
      session.status === 'scheduled' &&
      sameDayOf(session.scheduledDate, input.now),
  );
  if (alreadyScheduled !== undefined) {
    return { kind: 'open', sessionId: alreadyScheduled.id, dayName: alreadyScheduled.dayNameSnapshot };
  }

  if (input.profile === undefined) {
    return { kind: 'blocked', refusal: 'noProfile', message: START_COPY.noProfile };
  }

  return {
    kind: 'create',
    built: buildSession({
      day,
      library: input.library,
      history: progressionHistoryOf(input.sessions),
      profile: input.profile,
      phaseState: input.phaseState,
      now: input.now,
      newId: input.newId,
    }),
  };
}
