/**
 * Session state machine — docs/data-model.md §6, §7, §8. Task T4, first half.
 *
 * A pure reducer over plain data: no React, no storage, no DOM, no clock of its own.
 * Time is injected (`now`) and copied into the state; the reducer writes nothing and
 * returns the next state plus an ordered list of effect *descriptors* that the store
 * performs. Same state, same event, same instant → same result, always.
 *
 * Three rules decide the shape of the state:
 *
 * 1. **Fully serialisable (§1 rule 6).** Every value survives `JSON.stringify` and a
 *    reload: no class instances, no functions, no `Date`, and `null` — never
 *    `undefined` — for absence, because `JSON.stringify` drops `undefined` keys and the
 *    backup document is JSON. The state *is* the persisted projection of §3: the field
 *    names follow `WorkoutSession`, `ExerciseSession` and `SetRecord` so that a record
 *    read back through the storage mappers is the same data with the same names.
 * 2. **Derived values are computed, never stored (I-6).** Progress, remaining sets,
 *    volume, the summary and the rest deadline are pure functions of the state and the
 *    injected instant. The rest timer in particular is derived from the confirmation
 *    instant of the last set and the prescribed rest, never from a running countdown
 *    (§7, FR-8.4): that is what makes it survive backgrounding, screen lock and a
 *    relaunch.
 * 3. **The reducer owns the transitions the document names, and only those.** Effects
 *    describe the writes; they never perform them, and a rejected event returns the
 *    state it was given, with no effect (§6 invariants).
 *
 * Two fields are session-local and not part of the stored aggregate: `activeIndex` (the
 * card on screen) and `rest` (the rest bar). §7 says the session row is the journal, so
 * the two are rebuilt on recovery from the record itself — see `snapshotFromSource`
 * and the notes on skipped sets below.
 */

import type {
  Discomfort,
  Effort,
  ExercisePrescription,
  ProgressionRecommendation,
  TrainingPhase,
} from '../domain';

/* --------------------------------------------------------------- value types */

/** Milliseconds since the epoch, orderable and JSON-safe (§2). */
export type EpochMs = number;

/** §7: `scheduled → inProgress → completed | partial | abandoned`. */
export type SessionStatus = 'scheduled' | 'inProgress' | 'completed' | 'partial' | 'abandoned';

/** The three terminal statuses of §7. */
export type SessionOutcome = 'completed' | 'partial' | 'abandoned';

/** §3 `ExerciseStatus`. */
export type ExerciseStatus = 'pending' | 'active' | 'done' | 'skipped';

/** §3 `LoadDecision`. Evidence of what the owner chose, written once (I-8). */
export type LoadDecision =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'repeated' }
  | { readonly kind: 'manual'; readonly kg: number };

/**
 * A `ProgressionRecommendation` with its instant as epoch milliseconds (§2): the engine
 * takes and returns a `Date`, the stored and exported value is a number. `src/storage`
 * has the same transformation at its own boundary; it lives here too because this
 * module must not import a storage adapter (architecture §4).
 */
export type PlainRecommendation = Omit<ProgressionRecommendation, 'computedAt'> & {
  readonly computedAt: EpochMs;
};

/** §3 `SetRecord`: a confirmed set, as stored. */
export interface ConfirmedSet {
  readonly id: string;
  /** 1-based position among the *confirmed* sets of its exercise session (§5.2, §5.4). */
  readonly index: number;
  readonly weightKg: number;
  readonly targetReps: number;
  readonly actualReps: number;
  /** `null` = unanswered (I-7). Never defaulted to "easy" or "no discomfort". */
  readonly effort: Effort | null;
  readonly discomfort: Discomfort | null;
  readonly confirmedAt: EpochMs;
}

/**
 * One entry of an exercise's set list.
 *
 * `slot` is the prescription slot, i.e. the card label `SERIE n`. A skipped set has no
 * stored row (§5.2 stores confirmed sets only) and therefore no persisted index; the
 * confirmed entry carries the `index` the storage write uses, which counts confirmed
 * sets because §5.4 requires the stored index list to extend from 1 without gaps.
 * Without a skip the two numbers are equal, which is the ordinary case.
 */
export type SetEntry =
  | { readonly status: 'confirmed'; readonly slot: number; readonly set: ConfirmedSet }
  | { readonly status: 'skipped'; readonly slot: number; readonly at: EpochMs };

/** §3 `ExerciseSession`: the stored aggregate plus its set list. */
export interface ExerciseState {
  readonly id: string;
  readonly exerciseId: string | null;
  readonly exerciseNameSnapshot: string;
  readonly prescription: ExercisePrescription;
  /** Frozen when the exercise session starts; never recomputed (I-2). */
  readonly recommendation: PlainRecommendation | null;
  readonly decision: LoadDecision | null;
  readonly recommendedWeightKg: number | null;
  readonly usedWeightKg: number | null;
  /** Stored evidence: `usedWeightKg − recommendedWeightKg` at decision time (I-8). */
  readonly loadDeltaKg: number | null;
  readonly sets: readonly SetEntry[];
  readonly status: ExerciseStatus;
  readonly completedAt: EpochMs | null;
}

/**
 * The rest bar. `startedAt` is the confirmation instant of the set that started it, so
 * the remaining time is derived, never accumulated (§7, FR-8.4).
 */
export interface RestState {
  readonly exerciseSessionId: string | null;
  readonly startedAt: EpochMs | null;
  readonly durationSeconds: number | null;
  /** `+15 s` / `+30 s` (FR-8.3). Session-local: §7 stores no countdown. */
  readonly extensionSeconds: number;
  /** Dismissed by the owner (`Saltar`); the rest is over and the bar is gone. */
  readonly dismissed: boolean;
}

/** §7/§3 `WorkoutSession`, with the two session-local fields the reducer needs. */
export interface SessionState {
  readonly id: string;
  readonly dayNameSnapshot: string;
  readonly scheduledDate: EpochMs;
  readonly startedAt: EpochMs | null;
  readonly endedAt: EpochMs | null;
  readonly phase: TrainingPhase;
  readonly status: SessionStatus;
  /** `Perfil → entrenamiento`: whether a confirmed set starts a rest (FR-8.1). */
  readonly autoStartRest: boolean;
  /** Zero-based index of the exercise card on screen. Session-local. */
  readonly activeIndex: number;
  readonly rest: RestState;
  readonly exercises: readonly ExerciseState[];
}

/** What the store hands the reducer to build a session before the first event. */
export interface SessionExerciseSeed {
  readonly id: string;
  readonly exerciseId: string | null;
  readonly exerciseNameSnapshot: string;
  readonly prescription: ExercisePrescription;
  readonly recommendation: PlainRecommendation | null;
}

export interface SessionSeed {
  readonly id: string;
  readonly dayNameSnapshot: string;
  readonly scheduledDate: EpochMs;
  readonly phase: TrainingPhase;
  readonly autoStartRest: boolean;
  readonly exercises: readonly SessionExerciseSeed[];
}

/**
 * What the storage layer returns for one session (§3, §5.1): the aggregate without the
 * session-local fields, and with confirmed sets only. This is the recovery input; the
 * store builds it from the domain values its repositories return.
 */
export interface SessionSourceExercise {
  readonly id: string;
  readonly exerciseId: string | null;
  readonly exerciseNameSnapshot: string;
  readonly prescription: ExercisePrescription;
  readonly recommendation: PlainRecommendation | null;
  readonly decision: LoadDecision | null;
  readonly recommendedWeightKg: number | null;
  readonly usedWeightKg: number | null;
  readonly loadDeltaKg: number | null;
  readonly status: ExerciseStatus;
  readonly completedAt: EpochMs | null;
  readonly sets: readonly ConfirmedSet[];
}

export interface SessionSource {
  readonly id: string;
  readonly dayNameSnapshot: string;
  readonly scheduledDate: EpochMs;
  readonly startedAt: EpochMs | null;
  readonly endedAt: EpochMs | null;
  readonly phase: TrainingPhase;
  readonly status: SessionStatus;
  readonly exercises: readonly SessionSourceExercise[];
}

/* -------------------------------------------------------------------- effects */

/**
 * §5.4 "Confirm a set", as a descriptor: the transaction over `sets`,
 * `exerciseSessions` and `sessions`. The load decision travels in the same descriptor
 * because §5.4 records it once (I-8) and there is no separate write path for it: the
 * store writes it with the first set, in the same transaction.
 */
export interface PersistSetEffect {
  readonly type: 'persist-set';
  readonly sessionId: string;
  readonly exerciseSessionId: string;
  readonly set: ConfirmedSet;
  readonly sessionStatus: SessionStatus;
  readonly startedAt: EpochMs | null;
  readonly exerciseStatus: ExerciseStatus;
  readonly decision: LoadDecision | null;
  readonly recommendedWeightKg: number | null;
  readonly usedWeightKg: number;
  readonly loadDeltaKg: number | null;
}

/** §5.4: the exercise session reached `done` or `skipped`. */
export interface AdvanceExerciseEffect {
  readonly type: 'advance-exercise';
  readonly sessionId: string;
  readonly exerciseSessionId: string;
  readonly status: 'done' | 'skipped';
  readonly completedAt: EpochMs;
}

/** The rest bar: a UI directive. Nothing about it is persisted (§7). */
export interface StartRestEffect {
  readonly type: 'start-rest';
  readonly exerciseSessionId: string;
  readonly startedAt: EpochMs;
  readonly durationSeconds: number;
  readonly deadlineAt: EpochMs;
}

/** §5.4 "Finish a session": a terminal status, only ever from `inProgress`. */
export interface FinishSessionEffect {
  readonly type: 'finish-session';
  readonly sessionId: string;
  readonly status: SessionOutcome;
  readonly endedAt: EpochMs;
}

export type SessionEffect =
  | PersistSetEffect
  | AdvanceExerciseEffect
  | StartRestEffect
  | FinishSessionEffect;

/* --------------------------------------------------------------------- events */

/** The payload of a confirmed or corrected set. */
export interface SetAnswers {
  readonly exerciseSessionId: string;
  readonly slot: number;
  readonly weightKg: number;
  readonly actualReps: number;
  readonly effort: Effort | null;
  readonly discomfort: Discomfort | null;
}

export type SessionEvent =
  /** `Empezar entrenamiento` (§7: the row does not move until the first set). */
  | { readonly type: 'session-started' }
  | ({ readonly type: 'set-confirmed' } & SetAnswers)
  /** FR-7.4: correct a logged set after the fact, including from the summary. */
  | ({ readonly type: 'set-corrected' } & SetAnswers)
  | { readonly type: 'set-skipped'; readonly exerciseSessionId: string; readonly slot: number }
  | { readonly type: 'weight-accepted'; readonly exerciseSessionId: string }
  | { readonly type: 'weight-held'; readonly exerciseSessionId: string; readonly previousWeightKg: number }
  | { readonly type: 'weight-overridden'; readonly exerciseSessionId: string; readonly kg: number }
  | { readonly type: 'exercise-advanced' }
  | { readonly type: 'exercise-returned' }
  | { readonly type: 'rest-started'; readonly exerciseSessionId: string }
  | { readonly type: 'rest-extended'; readonly seconds: number }
  | { readonly type: 'rest-skipped' }
  /** §7 `finish(all done)`, `finish(partial)` and `discard` (abandoned). */
  | { readonly type: 'session-finished'; readonly outcome: SessionOutcome }
  /** Launch recovery: the serialised state, journal included (§7). */
  | { readonly type: 'session-resumed'; readonly record: SessionState }
  /** The page was discarded from memory: only what the store returns is left (§7). */
  | {
      readonly type: 'page-recovered';
      readonly source: SessionSource;
      readonly autoStartRest: boolean;
    };

/** Every rejection the reducer can produce. Codes are identifiers; copy is Spanish. */
export type RejectionCode =
  | 'sessionClosed'
  | 'notStarted'
  | 'pendingSets'
  | 'unknownExercise'
  | 'exerciseClosed'
  | 'alreadyConfirmed'
  | 'alreadySkipped'
  | 'notConfirmed'
  | 'invalidSlot'
  | 'outOfOrder'
  | 'invalidWeight'
  | 'invalidReps'
  | 'decisionRecorded'
  | 'noRecommendation'
  | 'noNextExercise'
  | 'noPreviousExercise'
  | 'noRest'
  | 'invalidExtension'
  | 'unknownEvent';

export interface SessionRejection {
  readonly code: RejectionCode;
  /** Spanish, as the domain's reason templates are (NFR-6). */
  readonly message: string;
}

export interface SessionTransition {
  readonly state: SessionState;
  /** In the order the store must perform them. Empty when the event was rejected. */
  readonly effects: readonly SessionEffect[];
  /** `null` when the event was applied. A rejection changes neither state nor effects. */
  readonly rejection: SessionRejection | null;
}

/* --------------------------------------------------------------------- values */

const NO_REST: RestState = {
  exerciseSessionId: null,
  startedAt: null,
  durationSeconds: null,
  extensionSeconds: 0,
  dismissed: false,
};

const NO_EFFECTS: readonly SessionEffect[] = [];

const TERMINAL: readonly SessionStatus[] = ['completed', 'partial', 'abandoned'];

/* ------------------------------------------------------------------- building */

/**
 * The state before the first event. `recommendedWeightKg` is seeded from the frozen
 * recommendation because that is the suggestion the session started with (I-2); the
 * `decision` stays `null` until the owner picks (I-7's spirit: unanswered is not a
 * value).
 */
export function createSession(seed: SessionSeed): SessionState {
  return {
    id: seed.id,
    dayNameSnapshot: seed.dayNameSnapshot,
    scheduledDate: seed.scheduledDate,
    startedAt: null,
    endedAt: null,
    phase: seed.phase,
    status: 'scheduled',
    autoStartRest: seed.autoStartRest,
    activeIndex: 0,
    rest: NO_REST,
    exercises: seed.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseNameSnapshot: exercise.exerciseNameSnapshot,
      prescription: exercise.prescription,
      recommendation: exercise.recommendation,
      decision: null,
      recommendedWeightKg: null,
      usedWeightKg: null,
      loadDeltaKg: null,
      sets: [],
      status: 'pending',
      completedAt: null,
    })),
  };
}

/**
 * Rebuilds the session-local fields from what the store returns.
 *
 * §7 keeps no journal beyond the session row, so:
 *
 * - the active card is the first exercise still open, else the last one;
 * - the rest is derived from the confirmation instant of the last confirmed set and the
 *   prescription it belongs to — the same rule that drives the timer everywhere else;
 * - a skipped set has no stored row, so it comes back as an unanswered slot. That is
 *   the documented cost of §5.2 storing confirmed sets only: a skip is a decision of the
 *   moment, not evidence.
 */
export function snapshotFromSource(source: SessionSource, autoStartRest: boolean): SessionState {
  const exercises: ExerciseState[] = source.exercises.map((exercise) => ({
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    exerciseNameSnapshot: exercise.exerciseNameSnapshot,
    prescription: exercise.prescription,
    recommendation: exercise.recommendation,
    decision: exercise.decision,
    recommendedWeightKg: exercise.recommendedWeightKg,
    usedWeightKg: exercise.usedWeightKg,
    loadDeltaKg: exercise.loadDeltaKg,
    sets: [...exercise.sets]
      .sort((left, right) => left.index - right.index)
      .map((set): SetEntry => ({ status: 'confirmed', slot: set.index, set })),
    status: exercise.status,
    completedAt: exercise.completedAt,
  }));

  const state: SessionState = {
    id: source.id,
    dayNameSnapshot: source.dayNameSnapshot,
    scheduledDate: source.scheduledDate,
    startedAt: source.startedAt,
    endedAt: source.endedAt,
    phase: source.phase,
    status: source.status,
    autoStartRest,
    activeIndex: firstOpenIndex(exercises),
    rest: NO_REST,
    exercises,
  };

  return { ...state, rest: restFromStoredSets(state) };
}

/** §5.1: "the last confirmed set drives the rest timer". */
function restFromStoredSets(state: SessionState): RestState {
  if (!state.autoStartRest || TERMINAL.includes(state.status)) return NO_REST;

  let latest: { readonly exercise: ExerciseState; readonly set: ConfirmedSet } | null = null;

  for (const exercise of state.exercises) {
    for (const entry of exercise.sets) {
      if (entry.status !== 'confirmed') continue;
      if (latest === null || entry.set.confirmedAt >= latest.set.confirmedAt) {
        latest = { exercise, set: entry.set };
      }
    }
  }

  if (latest === null) return NO_REST;
  return restFor(latest.exercise, latest.set.confirmedAt);
}

/* -------------------------------------------------------------------- reducer */

export function reduce(state: SessionState, event: SessionEvent, now: EpochMs): SessionTransition {
  switch (event.type) {
    case 'session-started':
      return startSession(state);
    case 'set-confirmed':
      return confirmSet(state, event, now);
    case 'set-corrected':
      return correctSet(state, event);
    case 'set-skipped':
      return skipSet(state, event, now);
    case 'weight-accepted':
      return decideWeight(state, event, { kind: 'accepted' });
    case 'weight-held':
      return decideWeight(state, event, { kind: 'repeated' }, event.previousWeightKg);
    case 'weight-overridden':
      return decideWeight(state, event, { kind: 'manual', kg: event.kg }, event.kg);
    case 'exercise-advanced':
      return pageForward(state);
    case 'exercise-returned':
      return pageBack(state);
    case 'rest-started':
      return startRest(state, event, now);
    case 'rest-extended':
      return extendRest(state, event);
    case 'rest-skipped':
      return skipRest(state);
    case 'session-finished':
      return finishSession(state, event, now);
    case 'session-resumed':
      return applied(event.record);
    case 'page-recovered':
      return applied(snapshotFromSource(event.source, event.autoStartRest));
    default: {
      const exhaustive: never = event;
      return rejected(state, 'unknownEvent', `Evento de sesión desconocido: ${String(exhaustive)}`);
    }
  }
}

/* --------------------------------------------------------- reducer: the start */

/**
 * §7: "The transition to `inProgress` happens when the first set is confirmed, not when
 * the screen opens: opening the plan tomorrow must not create a session." The event is
 * therefore accepted and records nothing; the confirmation below performs the
 * transition and stamps `startedAt` with its own instant.
 */
function startSession(state: SessionState): SessionTransition {
  if (isTerminal(state.status)) return closed(state);
  return applied(state);
}

/* ---------------------------------------------------------- reducer: the sets */

function confirmSet(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'set-confirmed' }>,
  now: EpochMs,
): SessionTransition {
  const refusal = guard(state);
  if (refusal !== null) return refusal;

  const invalid = validateAnswers(event);
  if (invalid !== null) return rejected(state, invalid.code, invalid.message);

  const index = indexOfExercise(state, event.exerciseSessionId);
  const exercise = state.exercises[index] ?? null;
  if (exercise === null) return unknownExercise(state, event.exerciseSessionId);
  if (isClosed(exercise)) return exerciseClosed(state);

  const slotRefusal = checkSlot(exercise, event.slot, 'confirm');
  if (slotRefusal !== null) return rejected(state, slotRefusal.code, slotRefusal.message);

  const ordinal = confirmedOrdinal(exercise, event.slot);
  const set: ConfirmedSet = {
    id: `${exercise.id}:${ordinal}`,
    index: ordinal,
    weightKg: event.weightKg,
    targetReps: exercise.recommendation?.suggestedTargetReps ?? exercise.prescription.repRange.lowerBound,
    actualReps: event.actualReps,
    effort: event.effort,
    discomfort: event.discomfort,
    confirmedAt: now,
  };

  const session: SessionState = {
    ...state,
    status: state.status === 'scheduled' ? 'inProgress' : state.status,
    startedAt: state.startedAt ?? now,
  };

  const written = withEntry(exercise, { status: 'confirmed', slot: event.slot, set });
  const confirmed: ExerciseState = {
    ...written,
    status: 'active',
    usedWeightKg: event.weightKg,
  };

  let next = replaceExercise(session, index, confirmed);
  const effects: SessionEffect[] = [persistSetEffect(next, confirmed, set)];

  if (next.autoStartRest) {
    const rest = restFor(confirmed, now);
    if (rest.exerciseSessionId !== null && rest.startedAt !== null && rest.durationSeconds !== null) {
      next = { ...next, rest };
      effects.push(startRestEffect(rest));
    }
  }

  const settled = settleIfAnswered(next, index, now);
  if (settled.effect !== null) effects.push(settled.effect);

  return applied(settled.state, effects);
}

/**
 * FR-7.4. A correction rewrites the answers of a set that is already confirmed and
 * keeps its identity, its stored index and its confirmation instant: the set cannot be
 * moved into a different exercise, because the event targets the exercise that owns the
 * slot and an unconfirmed slot is not editable.
 */
function correctSet(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'set-corrected' }>,
): SessionTransition {
  const refusal = guard(state);
  if (refusal !== null) return refusal;

  const invalid = validateAnswers(event);
  if (invalid !== null) return rejected(state, invalid.code, invalid.message);

  const index = indexOfExercise(state, event.exerciseSessionId);
  const exercise = state.exercises[index] ?? null;
  if (exercise === null) return unknownExercise(state, event.exerciseSessionId);
  if (isClosed(exercise)) return exerciseClosed(state);

  const existing = exercise.sets.find((entry) => entry.slot === event.slot) ?? null;
  if (existing === null || existing.status !== 'confirmed') {
    return rejected(state, 'notConfirmed', 'Esa serie no está registrada en este ejercicio.');
  }

  const corrected: ConfirmedSet = {
    ...existing.set,
    weightKg: event.weightKg,
    actualReps: event.actualReps,
    effort: event.effort,
    discomfort: event.discomfort,
  };
  const correctedExercise = withEntry(exercise, {
    status: 'confirmed',
    slot: event.slot,
    set: corrected,
  });
  const next = replaceExercise(state, index, correctedExercise);

  return applied(next, [persistSetEffect(next, correctedExercise, corrected)]);
}

function skipSet(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'set-skipped' }>,
  now: EpochMs,
): SessionTransition {
  const refusal = guard(state);
  if (refusal !== null) return refusal;

  const index = indexOfExercise(state, event.exerciseSessionId);
  const exercise = state.exercises[index] ?? null;
  if (exercise === null) return unknownExercise(state, event.exerciseSessionId);
  if (isClosed(exercise)) return exerciseClosed(state);

  const slotRefusal = checkSlot(exercise, event.slot, 'skip');
  if (slotRefusal !== null) return rejected(state, slotRefusal.code, slotRefusal.message);

  const skipped = withEntry(exercise, { status: 'skipped', slot: event.slot, at: now });
  const next = replaceExercise(state, index, skipped);
  const settled = settleIfAnswered(next, index, now);

  return applied(settled.state, settled.effect === null ? NO_EFFECTS : [settled.effect]);
}

/**
 * §7 sets `usedWeightKg` from the confirmed set and computes `loadDeltaKg` once, at
 * decision time (I-8). The decision itself is written once: a second weight choice for
 * the same exercise session is refused, which is the same guard the storage transaction
 * applies.
 */
function decideWeight(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'weight-accepted' | 'weight-held' | 'weight-overridden' }>,
  decision: LoadDecision,
  explicitKg?: number,
): SessionTransition {
  const refusal = guard(state);
  if (refusal !== null) return refusal;

  const index = indexOfExercise(state, event.exerciseSessionId);
  const exercise = state.exercises[index] ?? null;
  if (exercise === null) return unknownExercise(state, event.exerciseSessionId);
  if (isClosed(exercise)) return exerciseClosed(state);
  if (exercise.decision !== null) {
    return rejected(state, 'decisionRecorded', 'Ya has elegido el peso de este ejercicio.');
  }

  const recommendedWeightKg = exercise.recommendation?.suggestedWeightKg ?? null;
  const usedWeightKg = decision.kind === 'accepted' ? recommendedWeightKg : (explicitKg ?? null);

  if (usedWeightKg === null) {
    return rejected(
      state,
      'noRecommendation',
      'No hay peso sugerido para este ejercicio. Elige un peso antes de empezar.',
    );
  }
  if (!isValidWeight(usedWeightKg)) {
    return rejected(state, 'invalidWeight', 'El peso debe ser un número mayor o igual que cero.');
  }

  const decided: ExerciseState = {
    ...exercise,
    decision,
    recommendedWeightKg,
    usedWeightKg,
    loadDeltaKg: recommendedWeightKg === null ? null : usedWeightKg - recommendedWeightKg,
  };

  return applied(replaceExercise(state, index, decided));
}

/* ------------------------------------------------------- reducer: navigation */

function pageForward(state: SessionState): SessionTransition {
  if (isTerminal(state.status)) return closed(state);
  if (state.activeIndex + 1 >= state.exercises.length) {
    return rejected(state, 'noNextExercise', 'No hay más ejercicios en la sesión.');
  }
  return applied({ ...state, activeIndex: state.activeIndex + 1 });
}

function pageBack(state: SessionState): SessionTransition {
  if (isTerminal(state.status)) return closed(state);
  if (state.activeIndex <= 0) return rejected(state, 'noPreviousExercise', 'Este es el primer ejercicio.');
  return applied({ ...state, activeIndex: state.activeIndex - 1 });
}

/* ------------------------------------------------------------- reducer: rest */

function startRest(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'rest-started' }>,
  now: EpochMs,
): SessionTransition {
  const refusal = guard(state);
  if (refusal !== null) return refusal;

  const exercise = state.exercises.find((candidate) => candidate.id === event.exerciseSessionId) ?? null;
  if (exercise === null) return unknownExercise(state, event.exerciseSessionId);

  const rest = restFor(exercise, now);
  if (rest.durationSeconds === null) {
    return rejected(state, 'noRest', 'Este ejercicio no tiene descanso configurado.');
  }

  return applied({ ...state, rest }, [startRestEffect(rest)]);
}

function extendRest(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'rest-extended' }>,
): SessionTransition {
  const refusal = guard(state);
  if (refusal !== null) return refusal;
  if (!isRestRunning(state.rest)) {
    return rejected(state, 'noRest', 'No hay ningún descanso en marcha.');
  }
  if (!Number.isFinite(event.seconds) || event.seconds <= 0) {
    return rejected(state, 'invalidExtension', 'La prórroga debe ser un número de segundos mayor que cero.');
  }

  return applied({
    ...state,
    rest: { ...state.rest, extensionSeconds: state.rest.extensionSeconds + event.seconds },
  });
}

function skipRest(state: SessionState): SessionTransition {
  const refusal = guard(state);
  if (refusal !== null) return refusal;
  if (!isRestRunning(state.rest)) {
    return rejected(state, 'noRest', 'No hay ningún descanso en marcha.');
  }
  return applied({ ...state, rest: { ...state.rest, dismissed: true } });
}

/* ---------------------------------------------------------- reducer: finishing */

/**
 * §7: `inProgress → completed` needs every set answered; `→ partial` and `→ abandoned`
 * are the owner explicitly stopping, and they settle the exercises that were `active`
 * the way §5.4's finish transaction does — no invented rows, no auto-completion.
 */
function finishSession(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'session-finished' }>,
  now: EpochMs,
): SessionTransition {
  if (isTerminal(state.status)) return closed(state);
  if (state.status !== 'inProgress') {
    return rejected(state, 'notStarted', 'La sesión no se ha empezado: no hay ninguna serie confirmada.');
  }
  if (event.outcome === 'completed' && !isSessionAnswered(state)) {
    return rejected(
      state,
      'pendingSets',
      'Quedan series sin registrar. Regístralas o saltarlas antes de terminar.',
    );
  }

  const settledStatus: ExerciseStatus = event.outcome === 'completed' ? 'done' : 'skipped';
  const exercises = state.exercises.map((exercise) =>
    exercise.status === 'active'
      ? { ...exercise, status: settledStatus, completedAt: now }
      : exercise,
  );

  return applied({ ...state, exercises, status: event.outcome, endedAt: now, rest: NO_REST }, [
    { type: 'finish-session', sessionId: state.id, status: event.outcome, endedAt: now },
  ]);
}

/* ---------------------------------------------------------------- transitions */

function applied(state: SessionState, effects: readonly SessionEffect[] = NO_EFFECTS): SessionTransition {
  return { state, effects, rejection: null };
}

/** A rejected event changes nothing: the state it was given, and no effect. */
function rejected(state: SessionState, code: RejectionCode, message: string): SessionTransition {
  return { state, effects: NO_EFFECTS, rejection: { code, message } };
}

function closed(state: SessionState): SessionTransition {
  return rejected(state, 'sessionClosed', 'La sesión ya está cerrada.');
}

function unknownExercise(state: SessionState, exerciseSessionId: string): SessionTransition {
  return rejected(state, 'unknownExercise', `Ese ejercicio no está en la sesión: ${exerciseSessionId}.`);
}

function exerciseClosed(state: SessionState): SessionTransition {
  return rejected(state, 'exerciseClosed', 'Ese ejercicio ya está cerrado.');
}

/** A terminal session refuses every interaction; only the two recovery events pass. */
function guard(state: SessionState): SessionTransition | null {
  return isTerminal(state.status) ? closed(state) : null;
}

/* -------------------------------------------------------------------- helpers */

function isTerminal(status: SessionStatus): boolean {
  return TERMINAL.includes(status);
}

function isOpen(exercise: ExerciseState): boolean {
  return exercise.status === 'pending' || exercise.status === 'active';
}

function isClosed(exercise: ExerciseState): boolean {
  return exercise.status === 'done' || exercise.status === 'skipped';
}

function isValidWeight(weightKg: number): boolean {
  return Number.isFinite(weightKg) && weightKg >= 0;
}

function validateAnswers(event: SetAnswers): SessionRejection | null {
  if (!isValidWeight(event.weightKg)) {
    return { code: 'invalidWeight', message: 'El peso debe ser un número mayor o igual que cero.' };
  }
  if (!Number.isInteger(event.actualReps) || event.actualReps < 0) {
    return {
      code: 'invalidReps',
      message: 'Las repeticiones deben ser un número entero mayor o igual que cero.',
    };
  }
  return null;
}

/**
 * The set list is answered in order and, once confirmed, a set is never rewritten into a
 * different position. Two consequences, both enforced here:
 *
 * - a slot is either the next unanswered one, or a trailing skipped slot the owner
 *   changes their mind about;
 * - a confirmation cannot be inserted before a slot that is already answered, because
 *   §5.4 requires the stored index list to extend from 1 and there is no renumbering
 *   path for a set that is already committed.
 */
function checkSlot(
  exercise: ExerciseState,
  slot: number,
  mode: 'confirm' | 'skip',
): SessionRejection | null {
  const plan = exercise.prescription.sets;
  if (!Number.isInteger(slot) || slot < 1 || slot > plan) {
    return { code: 'invalidSlot', message: `La serie debe estar entre 1 y ${plan}.` };
  }

  const existing = exercise.sets.find((entry) => entry.slot === slot) ?? null;

  if (existing !== null && existing.status === 'confirmed') {
    return { code: 'alreadyConfirmed', message: 'Esa serie ya está registrada.' };
  }
  if (existing !== null && existing.status === 'skipped') {
    if (mode === 'skip') return { code: 'alreadySkipped', message: 'Esa serie ya está saltada.' };
    if (hasLaterEntry(exercise, slot)) {
      return {
        code: 'outOfOrder',
        message: 'No puedes registrar una serie anterior a otra que ya está registrada.',
      };
    }
    return null;
  }

  const next = nextSlot(exercise);
  if (next !== null && slot === next) return null;
  return { code: 'outOfOrder', message: 'Las series se registran en orden.' };
}

function hasLaterEntry(exercise: ExerciseState, slot: number): boolean {
  return exercise.sets.some((entry) => entry.slot > slot);
}

/** The 1-based prescription slot still unanswered, or `null` when all are answered. */
function nextSlot(exercise: ExerciseState): number | null {
  for (let slot = 1; slot <= exercise.prescription.sets; slot += 1) {
    if (!exercise.sets.some((entry) => entry.slot === slot)) return slot;
  }
  return null;
}

/** The stored index of a set: it counts confirmed sets, so a skip leaves no gap (§5.4). */
function confirmedOrdinal(exercise: ExerciseState, slot: number): number {
  return exercise.sets.filter((entry) => entry.status === 'confirmed' && entry.slot < slot).length + 1;
}

function withEntry(exercise: ExerciseState, entry: SetEntry): ExerciseState {
  const without = exercise.sets.filter((candidate) => candidate.slot !== entry.slot);
  return { ...exercise, sets: [...without, entry].sort((left, right) => left.slot - right.slot) };
}

function replaceExercise(state: SessionState, index: number, exercise: ExerciseState): SessionState {
  return {
    ...state,
    exercises: state.exercises.map((candidate, position) => (position === index ? exercise : candidate)),
  };
}

function indexOfExercise(state: SessionState, exerciseSessionId: string): number {
  return state.exercises.findIndex((exercise) => exercise.id === exerciseSessionId);
}

/**
 * An exercise whose every prescribed slot is answered is closed: `done` when at least
 * one set was confirmed, `skipped` when the owner skipped them all. The effect tells the
 * store to write that status (§5.4), and it is emitted after the set so a confirmed set
 * is written before anything claims it exists (I-12).
 */
function settleIfAnswered(
  state: SessionState,
  index: number,
  now: EpochMs,
): { readonly state: SessionState; readonly effect: AdvanceExerciseEffect | null } {
  const exercise = state.exercises[index] ?? null;
  if (exercise === null || nextSlot(exercise) !== null) return { state, effect: null };

  const confirmed = exercise.sets.some((entry) => entry.status === 'confirmed');
  const status: 'done' | 'skipped' = confirmed ? 'done' : 'skipped';
  const settled: ExerciseState = { ...exercise, status, completedAt: now };
  const exercises = state.exercises.map((candidate, position) =>
    position === index ? settled : candidate,
  );

  return {
    state: { ...state, exercises, activeIndex: focusAfter(exercises, state.activeIndex, index) },
    effect: {
      type: 'advance-exercise',
      sessionId: state.id,
      exerciseSessionId: settled.id,
      status,
      completedAt: now,
    },
  };
}

/** The open card keeps the screen; otherwise focus walks forward (§7 has no wrap-around). */
function focusAfter(
  exercises: readonly ExerciseState[],
  currentActive: number,
  settledIndex: number,
): number {
  const current = exercises[currentActive];
  if (current !== undefined && isOpen(current)) return currentActive;

  for (let position = settledIndex + 1; position < exercises.length; position += 1) {
    const candidate = exercises[position];
    if (candidate !== undefined && isOpen(candidate)) return position;
  }
  return currentActive;
}

function firstOpenIndex(exercises: readonly ExerciseState[]): number {
  for (let position = 0; position < exercises.length; position += 1) {
    const candidate = exercises[position];
    if (candidate !== undefined && isOpen(candidate)) return position;
  }
  return Math.max(0, exercises.length - 1);
}

function isRestRunning(rest: RestState): boolean {
  return (
    rest.exerciseSessionId !== null &&
    rest.startedAt !== null &&
    rest.durationSeconds !== null &&
    !rest.dismissed
  );
}

/** The rest a confirmed set starts: the prescription's duration from the set's instant. */
function restFor(exercise: ExerciseState, startedAt: EpochMs): RestState {
  const durationSeconds = exercise.prescription.restSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ...NO_REST, exerciseSessionId: exercise.id, startedAt };
  }
  return {
    exerciseSessionId: exercise.id,
    startedAt,
    durationSeconds,
    extensionSeconds: 0,
    dismissed: false,
  };
}

function startRestEffect(rest: RestState): StartRestEffect {
  const startedAt = rest.startedAt ?? 0;
  const durationSeconds = rest.durationSeconds ?? 0;
  return {
    type: 'start-rest',
    exerciseSessionId: rest.exerciseSessionId ?? '',
    startedAt,
    durationSeconds,
    deadlineAt: startedAt + (durationSeconds + rest.extensionSeconds) * 1000,
  };
}

function persistSetEffect(
  state: SessionState,
  exercise: ExerciseState,
  set: ConfirmedSet,
): PersistSetEffect {
  return {
    type: 'persist-set',
    sessionId: state.id,
    exerciseSessionId: exercise.id,
    set,
    sessionStatus: state.status,
    startedAt: state.startedAt,
    exerciseStatus: exercise.status,
    decision: exercise.decision,
    recommendedWeightKg: exercise.recommendedWeightKg,
    usedWeightKg: exercise.usedWeightKg ?? set.weightKg,
    loadDeltaKg: exercise.loadDeltaKg,
  };
}

/* ------------------------------------------------------------------ selectors */

export interface ActiveSet {
  readonly exerciseSessionId: string;
  readonly slot: number;
}

/** The card on screen, or `null` for a session with no exercises. */
export function activeExercise(state: SessionState): ExerciseState | null {
  return state.exercises[state.activeIndex] ?? null;
}

/** The set the owner is about to log: the first unanswered slot of the active card. */
export function activeSet(state: SessionState): ActiveSet | null {
  const exercise = activeExercise(state);
  if (exercise === null) return null;
  const slot = nextSlot(exercise);
  return slot === null ? null : { exerciseSessionId: exercise.id, slot };
}

/** Slots of one exercise with no answer yet (neither confirmed nor skipped). */
export function remainingSets(state: SessionState, exerciseSessionId: string): number {
  const exercise = state.exercises.find((candidate) => candidate.id === exerciseSessionId);
  if (exercise === undefined) return 0;
  return Math.max(0, exercise.prescription.sets - exercise.sets.length);
}

/** Slots with no answer across the whole session. */
export function sessionRemainingSets(state: SessionState): number {
  return state.exercises.reduce(
    (total, exercise) => total + Math.max(0, exercise.prescription.sets - exercise.sets.length),
    0,
  );
}

export function isExerciseAnswered(state: SessionState, exerciseSessionId: string): boolean {
  const exercise = state.exercises.find((candidate) => candidate.id === exerciseSessionId);
  return exercise !== undefined && nextSlot(exercise) === null;
}

/** §7 `finish(all done)`: every prescribed slot of every exercise is answered. */
export function isSessionAnswered(state: SessionState): boolean {
  return state.exercises.every((exercise) => nextSlot(exercise) === null);
}

export interface ExerciseProgress {
  readonly position: number;
  readonly total: number;
  /** The design's `Ejercicio 2 de 6`. */
  readonly label: string;
}

/** Session position of the card on screen (`Ejercicio 2 de 6`, docs/design-system §7.2). */
export function exerciseProgress(state: SessionState): ExerciseProgress {
  const total = state.exercises.length;
  const position = total === 0 ? 0 : Math.min(state.activeIndex + 1, total);
  return { position, total, label: `${position} de ${total}` };
}

export interface SetProgress {
  readonly answered: number;
  readonly prescribed: number;
  /** `2 de 4`. */
  readonly label: string;
}

export function setProgress(state: SessionState, exerciseSessionId: string): SetProgress {
  const exercise = state.exercises.find((candidate) => candidate.id === exerciseSessionId);
  const prescribed = exercise?.prescription.sets ?? 0;
  const answered = exercise?.sets.length ?? 0;
  return { answered, prescribed, label: `${answered} de ${prescribed}` };
}

/* --------------------------------------------------------- §8 derived: rest */

/**
 * The instant the rest ends, derived from the stored confirmation instant and the
 * prescribed duration. `null` when there is no rest. Nothing counts down anywhere: a
 * clock that jumps, a locked screen and a relaunch all read the same deadline (§7).
 */
export function restDeadline(state: SessionState): EpochMs | null {
  const { exerciseSessionId, startedAt, durationSeconds, extensionSeconds, dismissed } = state.rest;
  if (exerciseSessionId === null || startedAt === null || durationSeconds === null || dismissed) {
    return null;
  }
  return startedAt + (durationSeconds + extensionSeconds) * 1000;
}

export function restRemainingMs(state: SessionState, now: EpochMs): number {
  const deadline = restDeadline(state);
  if (deadline === null) return 0;
  return Math.max(0, deadline - now);
}

/** How long the rest has been running: `now − startedAt`, never an accumulated counter. */
export function restElapsedMs(state: SessionState, now: EpochMs): number {
  const startedAt = state.rest.startedAt;
  if (startedAt === null || state.rest.dismissed) return 0;
  return Math.max(0, now - startedAt);
}

export function isRestFinished(state: SessionState, now: EpochMs): boolean {
  const deadline = restDeadline(state);
  return deadline !== null && now >= deadline;
}

/* ------------------------------------------------------ §8 derived: summary */

export interface ExerciseSummary {
  readonly exerciseSessionId: string;
  readonly name: string;
  readonly status: ExerciseStatus;
  readonly setsConfirmed: number;
  readonly setsSkipped: number;
  readonly setsPrescribed: number;
  /** `Σ weightKg × actualReps` over this exercise's confirmed sets (§8). */
  readonly volumeKg: number;
  readonly totalReps: number;
  readonly bestWeightKg: number | null;
}

/** What the Resumen screen shows (§8, FR-9.1): every number traced to stored sets. */
export interface SessionSummary {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly dayNameSnapshot: string;
  readonly startedAt: EpochMs | null;
  readonly endedAt: EpochMs | null;
  /** `endedAt − startedAt`; `null` while the session is open. */
  readonly durationMs: number | null;
  readonly setsConfirmed: number;
  readonly setsSkipped: number;
  readonly setsPrescribed: number;
  readonly volumeKg: number;
  readonly exercises: readonly ExerciseSummary[];
}

export function summarise(state: SessionState): SessionSummary {
  const exercises = state.exercises.map((exercise): ExerciseSummary => {
    let volumeKg = 0;
    let totalReps = 0;
    let bestWeightKg: number | null = null;
    let setsConfirmed = 0;

    for (const entry of exercise.sets) {
      if (entry.status !== 'confirmed') continue;
      setsConfirmed += 1;
      volumeKg += entry.set.weightKg * entry.set.actualReps;
      totalReps += entry.set.actualReps;
      bestWeightKg = bestWeightKg === null ? entry.set.weightKg : Math.max(bestWeightKg, entry.set.weightKg);
    }

    return {
      exerciseSessionId: exercise.id,
      name: exercise.exerciseNameSnapshot,
      status: exercise.status,
      setsConfirmed,
      setsSkipped: exercise.sets.length - setsConfirmed,
      setsPrescribed: exercise.prescription.sets,
      volumeKg,
      totalReps,
      bestWeightKg,
    };
  });

  const durationMs =
    state.startedAt !== null && state.endedAt !== null ? state.endedAt - state.startedAt : null;

  return {
    sessionId: state.id,
    status: state.status,
    dayNameSnapshot: state.dayNameSnapshot,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    durationMs,
    setsConfirmed: exercises.reduce((total, exercise) => total + exercise.setsConfirmed, 0),
    setsSkipped: exercises.reduce((total, exercise) => total + exercise.setsSkipped, 0),
    setsPrescribed: exercises.reduce((total, exercise) => total + exercise.setsPrescribed, 0),
    volumeKg: exercises.reduce((total, exercise) => total + exercise.volumeKg, 0),
    exercises,
  };
}
