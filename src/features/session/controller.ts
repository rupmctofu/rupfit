/**
 * The session controller — the reducer, the port, and the order between them.
 *
 * The reducer (`src/core/session/model.ts`) decides *what* happened and returns effect
 * descriptors. This file is the only place those descriptors meet `StoragePort`, and it
 * owns the three rules the screen depends on:
 *
 * 1. **No call for a rejected event.** The reducer's refusal is final: nothing is
 *    written, nothing is announced as written.
 * 2. **Write first, then show it.** The state is applied only after the writes it
 *    implies resolved, so a failed set is not displayed as confirmed. The render
 *    `sesion-error` is exactly this state: the failed set is still on screen, the
 *    banner says so, `Reintentar` re-runs the same event.
 * 3. **One write at a time.** `dispatch` is serialised: a double tap cannot produce two
 *    transactions over the same set index.
 *
 * Nothing here reads the clock on its own: `now` arrives with every event, and the
 * injected `Clock` is used only for the boot reads and the history window.
 */

import type { Equipment, Exercise, PhaseState } from '../../core/domain';
import {
  createSession,
  isSessionAnswered,
  reduce,
  type ConfirmedSet,
  type EpochMs,
  type PlainRecommendation,
  type SessionEffect,
  type SessionEvent,
  type SessionSeed,
  type SessionSource,
  type SessionState,
} from '../../core/session/model';
import type { SetRecord, StoragePort, SubstitutedFrom, WorkoutSession } from '../../storage';
import { canSubstitute, SUBSTITUTION_REFUSED } from './substitution';
// S4/T7: the block a closing session earns. `start.ts` narrows the history to the block
// each session was trained in; the two modules already reach into each other for
// `startOfDay`, and both only *call* across, never during module evaluation.
import { phaseAdvance } from './start';

/** The one clock the session screen is allowed to read. */
export interface Clock {
  now(): EpochMs;
}

/**
 * What survives an app kill that storage does not hold: the card on screen and the
 * skipped slots (§7 keeps none of them).
 */
export interface SessionJournal {
  read(): SessionState | null;
  write(state: SessionState): void;
  clear(): void;
}

/** A journal that remembers nothing: the page-discarded path, and the tests' default. */
export const NO_JOURNAL: SessionJournal = {
  read: () => null,
  write: () => undefined,
  clear: () => undefined,
};

export interface SessionDeps {
  readonly storage: StoragePort;
  readonly clock: Clock;
  readonly journal?: SessionJournal | undefined;
}

/** How many stored sessions the history read covers, and how many points it shows. */
export const HISTORY_SESSIONS = 12;
export const HISTORY_POINTS = 6;

export interface HistoryPoint {
  readonly at: EpochMs;
  readonly weightKg: number;
  readonly reps: number;
  readonly effort: ConfirmedSet['effort'];
  /** Confirmed sets of that session for this exercise. */
  readonly sets: number;
  /** Same calendar day as the boot instant: the `hoy` bar of the strip. */
  readonly today: boolean;
}

export type SessionHistory = Readonly<Record<string, readonly HistoryPoint[]>>;

export type SessionPhase = 'loading' | 'ready' | 'empty' | 'failed';
export type SessionRecovery = 'none' | 'resumed' | 'recovered';

export interface SessionRuntime {
  readonly phase: SessionPhase;
  readonly session: SessionState | null;
  /** `resumed` = the journal survived; `recovered` = only storage was left. */
  readonly recovery: SessionRecovery;
  readonly history: SessionHistory;
  /** The library entry of each exercise session, for the equipment and muscle chips. */
  readonly exercises: Readonly<Record<string, Exercise>>;
  /**
   * The swaps stored on this session's rows, keyed by exercise session id (S4, T5). Read
   * from the row, not from the library: the read-out says «sustituye a X» after a reload
   * exactly as it does the moment the owner picks, and never invents one.
   */
  readonly substitutions: Readonly<Record<string, SubstitutedFrom>>;
  /** `Perfil`'s declared equipment; empty means it does not narrow the alternatives. */
  readonly availableEquipment: readonly Equipment[];
  /** A write that failed, in Spanish, with `retry()` as the way out. */
  readonly error: string | null;
  /** The reducer's refusal for the last event, in Spanish. */
  readonly rejection: string | null;
}

export interface SessionMachine {
  runtime(): SessionRuntime;
  subscribe(listener: () => void): () => void;
  /** Reads the session, its history and the library. `session-resumed` or `page-recovered`. */
  boot(): Promise<SessionRuntime>;
  dispatch(event: SessionEvent, now: EpochMs): Promise<SessionRuntime>;
  /**
   * `Sugerir otro ejercicio` (S4, T5): swaps the exercise of one row for this session only.
   * Refused, without touching storage, once that exercise has an answered set (S6).
   */
  substitute(input: SubstituteExerciseRequest): Promise<SessionRuntime>;
  /** Re-runs the event whose write failed, or the boot that failed. */
  retry(now: EpochMs): Promise<SessionRuntime>;
  /** `Seguir`: the resume banner goes away and the session stays as it is. */
  dismissRecovery(): SessionRuntime;
}

/** What the screen asks for: this row, that library exercise, at that instant. */
export interface SubstituteExerciseRequest {
  readonly exerciseSessionId: string;
  readonly candidate: Exercise;
  readonly now: EpochMs;
}

const EMPTY_RUNTIME: SessionRuntime = {
  phase: 'loading',
  session: null,
  recovery: 'none',
  history: {},
  exercises: {},
  substitutions: {},
  availableEquipment: [],
  error: null,
  rejection: null,
};

/* ------------------------------------------------------- storage → reducer input */

/** T7: the readaptation write failed; the session close is retried as a whole. */
const PHASE_FAILURE = 'No se pudo actualizar el bloque de entrenamiento. Inténtalo otra vez.';

function plainRecommendation(
  recommendation: WorkoutSession['exercises'][number]['recommendation'],
): PlainRecommendation | null {
  if (recommendation === null) return null;
  return { ...recommendation, computedAt: recommendation.computedAt.getTime() };
}

/** §3/§5.1 aggregate → the recovery input the reducer names (`SessionSource`). */
export function sessionSourceFrom(session: WorkoutSession): SessionSource {
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
      recommendation: plainRecommendation(exercise.recommendation),
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

/**
 * The reducer seed. `autoStartRest` is always `false`: the session has no rest timer
 * (S5), so a confirmed set never opens a countdown or blocks the next one. The stored
 * `UserProfile.autoStartRestTimer` field stays in the data model — removing it needs a
 * migration and §3's model is not changed without one — but nothing in the session
 * reads it any more, and Perfil no longer offers the switch.
 */
function sessionSeedFrom(session: WorkoutSession): SessionSeed {
  return {
    id: session.id,
    dayNameSnapshot: session.dayNameSnapshot,
    scheduledDate: session.scheduledDate,
    phase: session.phase,
    autoStartRest: false,
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseNameSnapshot: exercise.exerciseNameSnapshot,
      prescription: exercise.prescription,
      recommendation: plainRecommendation(exercise.recommendation),
    })),
  };
}

/** The key the strip and «última vez» are grouped by: the library id, else the name. */
export function historyKey(exerciseId: string | null, name: string): string {
  return exerciseId ?? `name:${name}`;
}

function sameDay(left: EpochMs, right: EpochMs): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Midnight of the injected instant: "the session scheduled for today", not "the next one". */
export function startOfDay(now: EpochMs): EpochMs {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * The last six points per exercise, oldest first. One read (`sessions.recent`) feeds
 * both the strip and the «última vez» tile, and today's own session is the `hoy` bar.
 */
export function historyFrom(sessions: readonly WorkoutSession[], now: EpochMs): SessionHistory {
  const ordered = [...sessions].sort((left, right) => left.scheduledDate - right.scheduledDate);
  const collected: Record<string, HistoryPoint[]> = {};

  for (const session of ordered) {
    for (const exercise of session.exercises) {
      const confirmed = exercise.sets.filter((set) => Number.isFinite(set.weightKg));
      if (confirmed.length === 0) continue;
      const top = confirmed.reduce((best, set) => (set.weightKg >= best.weightKg ? set : best));
      const key = historyKey(exercise.exerciseId, exercise.exerciseNameSnapshot);
      const point: HistoryPoint = {
        at: top.confirmedAt,
        weightKg: top.weightKg,
        reps: top.actualReps,
        effort: top.effort,
        sets: confirmed.length,
        today: sameDay(top.confirmedAt, now),
      };
      collected[key] = [...(collected[key] ?? []), point];
    }
  }

  const trimmed: Record<string, readonly HistoryPoint[]> = {};
  for (const [key, points] of Object.entries(collected)) {
    trimmed[key] = points.slice(-HISTORY_POINTS);
  }
  return trimmed;
}

/** The points of the card on screen. */
export function historyFor(runtime: SessionRuntime, exerciseId: string | null, name: string): readonly HistoryPoint[] {
  return runtime.history[historyKey(exerciseId, name)] ?? [];
}

/** The most recent point that is not today: the `Última vez` tile (FR-5.1). */
export function previousPoint(points: readonly HistoryPoint[]): HistoryPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point !== undefined && !point.today) return point;
  }
  return null;
}

/** The swaps the stored rows carry, keyed by exercise session id (T5). */
export function substitutionsOf(session: WorkoutSession): Readonly<Record<string, SubstitutedFrom>> {
  const found: Record<string, SubstitutedFrom> = {};
  for (const exercise of session.exercises) {
    if (exercise.substitutedFrom !== undefined) {
      found[exercise.id] = { ...exercise.substitutedFrom };
    }
  }
  return found;
}

function countConfirmed(state: SessionState): number {
  return state.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((entry) => entry.status === 'confirmed').length,
    0,
  );
}

function isTerminal(state: SessionState): boolean {
  return state.status === 'completed' || state.status === 'partial' || state.status === 'abandoned';
}

/* ------------------------------------------------------------------ the machine */

export function createSessionMachine(deps: SessionDeps): SessionMachine {
  const { storage } = deps;
  const journal = deps.journal ?? NO_JOURNAL;
  const listeners = new Set<() => void>();

  let runtime: SessionRuntime = EMPTY_RUNTIME;
  /** The event whose write failed, so `Reintentar` repeats exactly that one. */
  let pending: SessionEvent | null = null;
  /** One write at a time: a double tap cannot open two transactions on one set. */
  let busy = false;
  /** Exercise sessions whose load decision is already on disk (I-8: written once). */
  let decided = new Set<string>();
  /** Sessions whose phase advance is already on disk: closing one twice cannot move it. */
  let advanced = new Set<string>();

  const publish = (next: Partial<SessionRuntime>): SessionRuntime => {
    runtime = { ...runtime, ...next };
    for (const listener of listeners) listener();
    return runtime;
  };

  async function loadLibrary(session: WorkoutSession): Promise<Record<string, Exercise>> {
    const details: Record<string, Exercise> = {};
    const seen = new Set<string>();
    for (const exercise of session.exercises) {
      const exerciseId = exercise.exerciseId;
      if (exerciseId === null || seen.has(exerciseId)) {
        if (exerciseId !== null) {
          const known = details[exerciseId];
          if (known !== undefined) details[exercise.id] = known;
        }
        continue;
      }
      seen.add(exerciseId);
      const found = await storage.exercises.byId(exerciseId);
      if (found === undefined) continue;
      details[exercise.id] = found;
      details[exerciseId] = found;
    }
    return details;
  }

  async function boot(): Promise<SessionRuntime> {
    publish({ phase: 'loading', error: null, rejection: null });
    try {
      const inProgress = await storage.sessions.inProgress();
      const stored = inProgress ?? (await storage.sessions.nextScheduledOnOrAfter(startOfDay(deps.clock.now())));
      if (stored === undefined) {
        decided = new Set();
        return publish({
          phase: 'empty',
          session: null,
          recovery: 'none',
          history: {},
          exercises: {},
          error: null,
          rejection: null,
        });
      }

      const recent = await storage.sessions.recent(HISTORY_SESSIONS);
      const exercises = await loadLibrary(stored);
      // Only to read the declared equipment: an empty list is "not narrowed", which is
      // what a profile the owner has not filled in honestly means (S4).
      const profile = await storage.profile.read();
      const source = sessionSourceFrom(stored);
      const journaled = journal.read();

      // No profile read here: the rest switch of Perfil is gone (S5) and the session
      // ignores `autoStartRestTimer`, so there is no setting this boot depends on.
      const base = createSession(sessionSeedFrom(stored));
      const recovered = reduce(base, { type: 'page-recovered', source, autoStartRest: false }, deps.clock.now()).state;
      // The journal is the fresher view only when it is not behind storage: a kill
      // between the set write and the journal write leaves storage ahead by one set,
      // and losing a confirmed set is the one thing §7 forbids.
      const journalFresher =
        journaled !== null &&
        journaled.id === stored.id &&
        countConfirmed(journaled) >= countConfirmed(recovered);
      const session = journalFresher
        ? reduce(base, { type: 'session-resumed', record: journaled }, deps.clock.now()).state
        : recovered;

      decided = new Set(
        session.exercises.filter((exercise) => exercise.decision !== null).map((exercise) => exercise.id),
      );

      const recovery: SessionRecovery = journalFresher
        ? 'resumed'
        : inProgress === undefined
          ? 'none'
          : 'recovered';

      pending = null;
      return publish({
        phase: 'ready',
        session,
        recovery,
        history: historyFrom(recent, deps.clock.now()),
        exercises,
        substitutions: substitutionsOf(stored),
        availableEquipment: profile?.availableEquipment ?? [],
        error: null,
        rejection: null,
      });
    } catch {
      return publish({ phase: 'failed', error: 'No se pudo abrir la sesión. Inténtalo otra vez.' });
    }
  }

  /** Runs the effect descriptors in the order the reducer produced them. */
  async function runEffects(
    state: SessionState,
    effects: readonly SessionEffect[],
  ): Promise<string | null> {
    for (const effect of effects) {
      switch (effect.type) {
        case 'persist-set': {
          const needsDecision = effect.decision !== null && !decided.has(effect.exerciseSessionId);
          if (needsDecision && effect.decision !== null) {
            try {
              await storage.sessions.recordDecision({
                exerciseSessionId: effect.exerciseSessionId,
                decision: effect.decision,
                recommendedWeightKg: effect.recommendedWeightKg,
                previousWeightKg:
                  effect.decision.kind === 'repeated' ? effect.usedWeightKg : null,
              });
              decided = new Set([...decided, effect.exerciseSessionId]);
            } catch {
              return `No se pudo guardar el peso de la serie ${effect.set.index}. Sigue en la pantalla.`;
            }
          }
          try {
            await storage.sessions.confirmSet(
              effect.sessionId,
              effect.exerciseSessionId,
              effect.set as SetRecord,
            );
          } catch {
            return `No se pudo guardar la serie ${effect.set.index}. Sigue en la pantalla.`;
          }
          break;
        }
        case 'finish-session': {
          try {
            await storage.sessions.finish(effect.sessionId, effect.status, effect.endedAt);
          } catch {
            return 'No se pudo cerrar la sesión. Inténtalo otra vez.';
          }
          // S4/T7: the verdict of the session is what moves the block, and the block is
          // what the *next* session is prescribed from. Abandoning is not evidence (§2),
          // so only a completed or partial session is evaluated.
          if (effect.status === 'abandoned') break;
          const phaseFailure = await advancePhaseAfter(state, effect.endedAt);
          if (phaseFailure !== null) return phaseFailure;
          break;
        }
        case 'advance-exercise':
        case 'start-rest':
          /*
           * Neither has a port method, and inventing one here would put a write path
           * outside `src/storage`. §5.4's set transaction is the only writer of a set
           * and §7 stores no countdown, so the rest is a UI directive; the exercise
           * status is settled by `sessions.finish` when the session ends. The gap is
           * reported rather than papered over.
           */
          break;
      }
    }
    return null;
  }

  /**
   * S4/T7: writes the next readaptation block once, after the session is closed.
   *
   * The session is already stored when this runs, so the history the gate reads includes
   * the sets the owner just confirmed: the verdict of *this* session is what moves the
   * block. `advanced` is the I-8 guard of this write — one `PhaseState` per closed session,
   * so re-closing one cannot advance twice — and it is only set after the write resolved,
   * which leaves `Reintentar` able to try again.
   */
  async function advancePhaseAfter(state: SessionState, at: EpochMs): Promise<string | null> {
    if (advanced.has(state.id)) return null;

    let next: PhaseState | null;
    try {
      const [phaseState, recent] = await Promise.all([
        storage.meta.readPhaseState(),
        storage.sessions.recent(HISTORY_SESSIONS),
      ]);
      next = phaseAdvance({
        phaseState,
        candidates: state.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          ...(exercise.prescription.role === undefined ? {} : { role: exercise.prescription.role }),
        })),
        sessions: recent,
        now: at,
      });
    } catch {
      return PHASE_FAILURE;
    }

    // No pass, no programme, or already done: nothing is written at all.
    if (next === null) return null;

    try {
      await storage.meta.savePhaseState(next);
    } catch {
      return PHASE_FAILURE;
    }

    advanced = new Set([...advanced, state.id]);
    return null;
  }

  async function dispatch(event: SessionEvent, now: EpochMs): Promise<SessionRuntime> {
    const current = runtime;
    if (current.session === null || busy) return current;

    busy = true;
    try {
      const transition = reduce(current.session, event, now);
      if (transition.rejection !== null) {
        return publish({ rejection: transition.rejection.message, error: null });
      }

      if (transition.effects.length > 0) {
        const failure = await runEffects(transition.state, transition.effects);
        if (failure !== null) {
          pending = event;
          return publish({ error: failure, rejection: null });
        }
      }

      pending = null;
      if (isTerminal(transition.state)) journal.clear();
      else journal.write(transition.state);

      return publish({
        phase: 'ready',
        session: transition.state,
        error: null,
        rejection: null,
      });
    } finally {
      busy = false;
    }
  }

  /**
   * S4/T5, in three steps and in this order: validate the swap against the state that is
   * on screen, write it to the row, then publish it. A refused swap writes nothing; a
   * failed write leaves the exercise as it was and says so, like a failed set does.
   *
   * The state is patched here instead of in the reducer because the swap is not a session
   * event: the reducer owns what happens *during* a session (sets, decisions, the card on
   * screen), while a substitution is a property of the stored row (S6) that the reducer
   * does not model. Nothing the reducer computes — the prescription, the answered sets,
   * the active card — is touched.
   */
  async function substitute(request: SubstituteExerciseRequest): Promise<SessionRuntime> {
    const current = runtime;
    if (current.session === null || busy) return current;
    const exercise = current.session.exercises.find(
      (candidate) => candidate.id === request.exerciseSessionId,
    );
    if (exercise === undefined) return current;
    if (!canSubstitute(exercise, !isTerminal(current.session))) {
      return publish({ rejection: SUBSTITUTION_REFUSED, error: null });
    }

    const substitutedFrom: SubstitutedFrom = {
      exerciseId: exercise.exerciseId,
      exerciseNameSnapshot: exercise.exerciseNameSnapshot,
      at: request.now,
    };

    busy = true;
    try {
      await storage.sessions.substitute({
        exerciseSessionId: exercise.id,
        exerciseId: request.candidate.id,
        exerciseNameSnapshot: request.candidate.name,
        substitutedFrom,
      });
      // The decision belonged to the exercise that left: a new one is written for the
      // substitute, so the storage guard of I-8 does not refuse its first set.
      decided.delete(exercise.id);

      const next: SessionState = {
        ...current.session,
        exercises: current.session.exercises.map((candidate) =>
          candidate.id === exercise.id
            ? {
                ...candidate,
                exerciseId: request.candidate.id,
                exerciseNameSnapshot: request.candidate.name,
                recommendation: null,
                decision: null,
                recommendedWeightKg: null,
                usedWeightKg: null,
                loadDeltaKg: null,
              }
            : candidate,
        ),
      };
      journal.write(next);

      return publish({
        session: next,
        exercises: {
          ...current.exercises,
          [exercise.id]: request.candidate,
          [request.candidate.id]: request.candidate,
        },
        substitutions: { ...current.substitutions, [exercise.id]: substitutedFrom },
        error: null,
        rejection: null,
      });
    } catch {
      return publish({
        error: 'No se pudo cambiar el ejercicio. Sigue el que tenías.',
        rejection: null,
      });
    } finally {
      busy = false;
    }
  }

  async function retry(now: EpochMs): Promise<SessionRuntime> {
    if (runtime.phase === 'failed') return boot();
    const event = pending;
    if (event === null) return runtime;
    pending = null;
    return dispatch(event, now);
  }

  return {
    runtime: () => runtime,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    boot,
    dispatch,
    substitute,
    retry,
    dismissRecovery: () => publish({ recovery: 'none' }),
  };
}

/* ------------------------------------------------------------------- selectors */

export type ScreenState =
  | 'loading'
  | 'empty'
  | 'failed'
  | 'error'
  | 'finished'
  | 'partial'
  | 'resumed'
  | 'recovered'
  | 'first-time'
  | 'decision'
  | 'active';

/**
 * The state the screen is in, in the order the design's Sesión row lists them. One
 * function so the screen and the demo fixture test agree on what "the error state"
 * means instead of each keeping its own idea of it.
 *
 * There is no rest state: nothing on the screen waits for a countdown (S5).
 */
export function screenStateOf(runtime: SessionRuntime): ScreenState {
  if (runtime.phase === 'loading') return 'loading';
  if (runtime.phase === 'empty') return 'empty';
  if (runtime.phase === 'failed') return 'failed';
  if (runtime.error !== null) return 'error';

  const session = runtime.session;
  if (session === null) return 'loading';
  // A closed session is over: its banner is the outcome, not a resume notice.
  if (session.status === 'completed') return 'finished';
  if (session.status === 'partial' || session.status === 'abandoned') return 'partial';

  if (runtime.recovery === 'resumed') return 'resumed';
  if (runtime.recovery === 'recovered') return 'recovered';

  const exercise = session.exercises[session.activeIndex];
  if (exercise === undefined) return 'empty';
  if (exercise.decision !== null) return 'active';

  const points = historyFor(runtime, exercise.exerciseId, exercise.exerciseNameSnapshot);
  const known = exercise.recommendation?.suggestedWeightKg ?? null;
  return points.length === 0 || known === null ? 'first-time' : 'decision';
}

export { isSessionAnswered };
