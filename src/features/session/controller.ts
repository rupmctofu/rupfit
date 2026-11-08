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

import type { Exercise } from '../../core/domain';
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
import type { SetRecord, StoragePort, WorkoutSession } from '../../storage';

/** The one clock the session screen is allowed to read. */
export interface Clock {
  now(): EpochMs;
}

/**
 * What survives an app kill that storage does not hold: the card on screen, the rest
 * bar and the skipped slots (§7 keeps none of them).
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
  /** Re-runs the event whose write failed, or the boot that failed. */
  retry(now: EpochMs): Promise<SessionRuntime>;
  /** `Seguir`: the resume banner goes away and the session stays as it is. */
  dismissRecovery(): SessionRuntime;
}

const EMPTY_RUNTIME: SessionRuntime = {
  phase: 'loading',
  session: null,
  recovery: 'none',
  history: {},
  exercises: {},
  error: null,
  rejection: null,
};

/* ------------------------------------------------------- storage → reducer input */

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

/** The state the reducer starts from before a recovery event replaces it. */
function sessionSeedFrom(session: WorkoutSession, autoStartRest: boolean): SessionSeed {
  return {
    id: session.id,
    dayNameSnapshot: session.dayNameSnapshot,
    scheduledDate: session.scheduledDate,
    phase: session.phase,
    autoStartRest,
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

      const profile = await storage.profile.read();
      const autoStartRest = profile?.autoStartRestTimer ?? true;
      const recent = await storage.sessions.recent(HISTORY_SESSIONS);
      const exercises = await loadLibrary(stored);
      const source = sessionSourceFrom(stored);
      const journaled = journal.read();

      const base = createSession(sessionSeedFrom(stored, autoStartRest));
      const recovered = reduce(base, { type: 'page-recovered', source, autoStartRest }, deps.clock.now()).state;
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
        error: null,
        rejection: null,
      });
    } catch {
      return publish({ phase: 'failed', error: 'No se pudo abrir la sesión. Inténtalo otra vez.' });
    }
  }

  /** Runs the effect descriptors in the order the reducer produced them. */
  async function runEffects(transition: { readonly effects: readonly SessionEffect[] }): Promise<string | null> {
    for (const effect of transition.effects) {
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
        const failure = await runEffects(transition);
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
  | 'rest'
  | 'rest-finished'
  | 'first-time'
  | 'decision'
  | 'active';

/**
 * The state the screen is in, in the order the design's Sesión row lists them. One
 * function so the screen and the demo fixture test agree on what "the error state"
 * means instead of each keeping its own idea of it.
 */
export function screenStateOf(runtime: SessionRuntime, now: EpochMs): ScreenState {
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

  const rest = session.rest;
  if (rest.exerciseSessionId !== null && rest.startedAt !== null && rest.durationSeconds !== null && !rest.dismissed) {
    const deadline = rest.startedAt + (rest.durationSeconds + rest.extensionSeconds) * 1000;
    return now >= deadline ? 'rest-finished' : 'rest';
  }

  const exercise = session.exercises[session.activeIndex];
  if (exercise === undefined) return 'empty';
  if (exercise.decision !== null) return 'active';

  const points = historyFor(runtime, exercise.exerciseId, exercise.exerciseNameSnapshot);
  const known = exercise.recommendation?.suggestedWeightKg ?? null;
  return points.length === 0 || known === null ? 'first-time' : 'decision';
}

export { isSessionAnswered };
