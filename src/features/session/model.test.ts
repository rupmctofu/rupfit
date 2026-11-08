/**
 * Session state machine — docs/data-model.md §6 (invariants), §7 (transitions and
 * crash recovery), §8 (derived values). Task T4, first half.
 *
 * Written from the document before the model existed. Every assertion is on the
 * observable outcome — the next state or the ordered effect descriptors — never on the
 * internal shape of the reducer.
 */

import { describe, expect, it } from 'vitest';
import {
  DISCOMFORT,
  EFFORT,
  NORMAL_PHASE,
  repRange,
  type Discomfort,
  type Effort,
  type ExercisePrescription,
} from '../../core/domain';
import {
  activeExercise,
  activeSet,
  createSession,
  exerciseProgress,
  isExerciseAnswered,
  isRestFinished,
  isSessionAnswered,
  reduce,
  remainingSets,
  restDeadline,
  restElapsedMs,
  restRemainingMs,
  sessionRemainingSets,
  setProgress,
  snapshotFromSource,
  summarise,
  type ConfirmedSet,
  type ExerciseState,
  type PersistSetEffect,
  type PlainRecommendation,
  type SessionEffect,
  type SessionEvent,
  type SessionSeed,
  type SessionSource,
  type SessionState,
  type SessionTransition,
  type SetEntry,
} from './model';

/* ------------------------------------------------------------------ fixtures */

/** A fixed calendar instant; every test derives its clock from it. */
const T0 = 1_760_000_000_000;
const MINUTE = 60_000;

const EXERCISE_1 = 'es-1';
const EXERCISE_2 = 'es-2';

function prescription(sets: number, restSeconds = 90): ExercisePrescription {
  return { sets, repRange: repRange(8, 10), targetRIR: repRange(1, 2), restSeconds };
}

function recommendation(weightKg: number | null, targetReps = 8): PlainRecommendation {
  return {
    suggestedWeightKg: weightKg,
    suggestedSets: 3,
    suggestedTargetReps: targetReps,
    action: 'hold',
    reason: 'addRepetition',
    confidence: { level: 'medium', sessionsConsidered: 3 },
    basedOnSessions: 3,
    computedAt: T0 - 2 * 86_400_000,
    reasonContext: {},
  };
}

/** Two exercises: three sets and two sets, ninety seconds of rest each. */
function seed(overrides: Partial<SessionSeed> = {}): SessionSeed {
  return {
    id: 'session-1',
    dayNameSnapshot: 'SENTADILLA / PIERNA',
    scheduledDate: T0,
    phase: NORMAL_PHASE,
    autoStartRest: true,
    exercises: [
      {
        id: EXERCISE_1,
        exerciseId: 'ex-1',
        exerciseNameSnapshot: 'Sentadilla',
        prescription: prescription(3),
        recommendation: recommendation(100),
      },
      {
        id: EXERCISE_2,
        exerciseId: 'ex-2',
        exerciseNameSnapshot: 'Press banca',
        prescription: prescription(2),
        recommendation: recommendation(60),
      },
    ],
    ...overrides,
  };
}

function start(): SessionState {
  return createSession(seed());
}

type ConfirmEvent = Extract<SessionEvent, { type: 'set-confirmed' }>;

function confirm(
  exerciseSessionId: string,
  slot: number,
  weightKg: number,
  actualReps = 8,
  effort: Effort | null = EFFORT.correct,
  discomfort: Discomfort | null = DISCOMFORT.none,
): ConfirmEvent {
  return { type: 'set-confirmed', exerciseSessionId, slot, weightKg, actualReps, effort, discomfort };
}

function correction(
  exerciseSessionId: string,
  slot: number,
  weightKg: number,
  actualReps = 9,
  effort: Effort | null = EFFORT.hard,
  discomfort: Discomfort | null = DISCOMFORT.mild,
): Extract<SessionEvent, { type: 'set-corrected' }> {
  return { type: 'set-corrected', exerciseSessionId, slot, weightKg, actualReps, effort, discomfort };
}

function skip(exerciseSessionId: string, slot: number): Extract<SessionEvent, { type: 'set-skipped' }> {
  return { type: 'set-skipped', exerciseSessionId, slot };
}

function apply(state: SessionState, event: SessionEvent, now: number): SessionTransition {
  return reduce(state, event, now);
}

/** Applies events in order, each one minute later than the previous confirmation. */
function applyAll(state: SessionState, events: readonly SessionEvent[], from = T0): SessionState {
  let current = state;
  let clock = from;
  for (const event of events) {
    current = reduce(current, event, clock).state;
    clock += MINUTE;
  }
  return current;
}

function findExercise(state: SessionState, exerciseSessionId: string): ExerciseState {
  const found = state.exercises.find((exercise) => exercise.id === exerciseSessionId);
  if (found === undefined) throw new Error(`no exercise session ${exerciseSessionId}`);
  return found;
}

function findEntry(state: SessionState, exerciseSessionId: string, slot: number): SetEntry {
  const exercise = findExercise(state, exerciseSessionId);
  const found = exercise.sets.find((entry) => entry.slot === slot);
  if (found === undefined) throw new Error(`no set entry at slot ${slot} of ${exerciseSessionId}`);
  return found;
}

function findConfirmed(state: SessionState, exerciseSessionId: string, slot: number): ConfirmedSet {
  const entry = findEntry(state, exerciseSessionId, slot);
  if (entry.status !== 'confirmed') throw new Error(`slot ${slot} of ${exerciseSessionId} is not confirmed`);
  return entry.set;
}

function effectOf<T extends SessionEffect['type']>(
  effects: readonly SessionEffect[],
  type: T,
): Extract<SessionEffect, { type: T }> {
  const found = effects.find((effect): effect is Extract<SessionEffect, { type: T }> => effect.type === type);
  if (found === undefined) {
    throw new Error(`no ${type} effect; emitted: ${effects.map((effect) => effect.type).join(', ') || '(none)'}`);
  }
  return found;
}

function effectTypes(effects: readonly SessionEffect[]): string[] {
  return effects.map((effect) => effect.type);
}

/** The whole session answered: three sets on the first exercise, then finish it. */
function answeredSession(): SessionState {
  const state = start();
  let clock = T0;
  let current = state;
  for (const slot of [1, 2, 3]) {
    current = reduce(current, confirm(EXERCISE_1, slot, 100), clock).state;
    clock += MINUTE;
  }
  return current;
}

/* --------------------------------------------------- §7 transitions: starting */

describe('§7 the session row and its start', () => {
  it('stays scheduled when the session is merely started: the first set is the transition', () => {
    const state = start();
    const transition = apply(state, { type: 'session-started' }, T0 + 1000);

    expect(transition.rejection).toBeNull();
    expect(transition.state.status).toBe('scheduled');
    expect(transition.state.startedAt).toBeNull();
    expect(transition.effects).toEqual([]);
  });

  it('moves to inProgress and stamps startedAt with the confirmation instant on the first set', () => {
    const instant = T0 + 3000;
    const transition = apply(start(), confirm(EXERCISE_1, 1, 100), instant);

    expect(transition.state.status).toBe('inProgress');
    expect(transition.state.startedAt).toBe(instant);
    expect(transition.state.endedAt).toBeNull();
    expect(effectTypes(transition.effects)).toEqual(['persist-set', 'start-rest']);
  });

  it('keeps startedAt at the first confirmation, not at later ones', () => {
    const state = applyAll(start(), [confirm(EXERCISE_1, 1, 100), confirm(EXERCISE_1, 2, 100)], T0);

    expect(state.startedAt).toBe(T0);
    expect(state.status).toBe('inProgress');
  });
});

/* --------------------------------------------------- §7 transitions: the sets */

describe('§7 the set list', () => {
  it('records a confirmed set with its confirmation instant and the ordinal stored index', () => {
    const instant = T0 + 5000;
    const transition = apply(start(), confirm(EXERCISE_1, 1, 102.5, 9, EFFORT.hard, DISCOMFORT.mild), instant);

    const set = findConfirmed(transition.state, EXERCISE_1, 1);
    expect(set.index).toBe(1);
    expect(set.weightKg).toBe(102.5);
    expect(set.actualReps).toBe(9);
    expect(set.effort).toBe(EFFORT.hard);
    expect(set.discomfort).toBe(DISCOMFORT.mild);
    expect(set.confirmedAt).toBe(instant);

    const effect = effectOf(transition.effects, 'persist-set');
    expect(effect.sessionId).toBe('session-1');
    expect(effect.exerciseSessionId).toBe(EXERCISE_1);
    expect(effect.set).toEqual(set);
    expect(effect.sessionStatus).toBe('inProgress');
    expect(effect.startedAt).toBe(instant);
    expect(effect.exerciseStatus).toBe('active');
    expect(effect.usedWeightKg).toBe(102.5);
  });

  it('keeps an unanswered effort and discomfort null, never defaulted (I-7)', () => {
    const transition = apply(start(), confirm(EXERCISE_1, 1, 100, 8, null, null), T0);

    const set = findConfirmed(transition.state, EXERCISE_1, 1);
    expect(set.effort).toBeNull();
    expect(set.discomfort).toBeNull();
    expect(effectOf(transition.effects, 'persist-set').set.effort).toBeNull();
    expect(effectOf(transition.effects, 'persist-set').set.discomfort).toBeNull();
  });

  it('takes the target reps from the frozen recommendation', () => {
    const transition = apply(start(), confirm(EXERCISE_1, 1, 100), T0);

    expect(findConfirmed(transition.state, EXERCISE_1, 1).targetReps).toBe(8);
  });

  it('counts the stored index over confirmed sets, so a skipped slot leaves no gap (§5.2, §5.4)', () => {
    const state = applyAll(start(), [skip(EXERCISE_1, 1), confirm(EXERCISE_1, 2, 100)], T0);

    const entry = findEntry(state, EXERCISE_1, 2);
    expect(entry.status).toBe('confirmed');
    if (entry.status === 'confirmed') expect(entry.set.index).toBe(1);
  });

  it('rewrites the answers of a confirmed set and keeps its identity and instant (FR-7.4)', () => {
    const confirmedAt = T0 + 1000;
    const afterConfirm = apply(start(), confirm(EXERCISE_1, 1, 100, 8, EFFORT.correct, DISCOMFORT.none), confirmedAt).state;
    const before = findConfirmed(afterConfirm, EXERCISE_1, 1);

    const transition = apply(afterConfirm, correction(EXERCISE_1, 1, 105, 6, EFFORT.failure, DISCOMFORT.pain), confirmedAt + MINUTE);
    const after = findConfirmed(transition.state, EXERCISE_1, 1);

    expect(transition.rejection).toBeNull();
    expect(after.id).toBe(before.id);
    expect(after.index).toBe(before.index);
    expect(after.confirmedAt).toBe(confirmedAt);
    expect(after.weightKg).toBe(105);
    expect(after.actualReps).toBe(6);
    expect(after.effort).toBe(EFFORT.failure);
    expect(after.discomfort).toBe(DISCOMFORT.pain);
    expect(effectTypes(transition.effects)).toEqual(['persist-set']);
    expect(effectOf(transition.effects, 'persist-set').set).toEqual(after);
  });

  it('lets the owner change their mind about the last skipped set', () => {
    const skipped = apply(start(), skip(EXERCISE_1, 1), T0).state;
    const transition = apply(skipped, confirm(EXERCISE_1, 1, 100), T0 + MINUTE);

    expect(transition.rejection).toBeNull();
    expect(findConfirmed(transition.state, EXERCISE_1, 1).index).toBe(1);
    expect(findExercise(transition.state, EXERCISE_1).sets).toHaveLength(1);
  });

  it('refuses to register a set before a slot that is already answered (§5.4 contiguity)', () => {
    const state = applyAll(start(), [skip(EXERCISE_1, 1), confirm(EXERCISE_1, 2, 100)], T0);
    const transition = apply(state, confirm(EXERCISE_1, 1, 100), T0 + 2 * MINUTE);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('outOfOrder');
  });

  it('refuses to skip a set that is already confirmed', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const transition = apply(state, skip(EXERCISE_1, 1), T0 + MINUTE);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('alreadyConfirmed');
  });

  it('records a skipped set as a slot without a stored row and emits nothing', () => {
    const transition = apply(start(), skip(EXERCISE_1, 1), T0 + 1000);

    expect(transition.rejection).toBeNull();
    expect(transition.effects).toEqual([]);
    expect(findEntry(transition.state, EXERCISE_1, 1).status).toBe('skipped');
    expect(findExercise(transition.state, EXERCISE_1).sets).toHaveLength(1);
  });

  it('completes the exercise when its last prescribed set is answered and hands focus on', () => {
    const state = applyAll(start(), [confirm(EXERCISE_1, 1, 100), confirm(EXERCISE_1, 2, 100)], T0);
    expect(findExercise(state, EXERCISE_1).status).toBe('active');

    const transition = apply(state, confirm(EXERCISE_1, 3, 100), T0 + 5 * MINUTE);

    expect(findExercise(transition.state, EXERCISE_1).status).toBe('done');
    expect(findExercise(transition.state, EXERCISE_1).completedAt).toBe(T0 + 5 * MINUTE);
    expect(transition.state.activeIndex).toBe(1);
    expect(activeExercise(transition.state)?.id).toBe(EXERCISE_2);
    expect(effectTypes(transition.effects)).toEqual(['persist-set', 'start-rest', 'advance-exercise']);
    expect(effectOf(transition.effects, 'advance-exercise')).toMatchObject({
      exerciseSessionId: EXERCISE_1,
      status: 'done',
      completedAt: T0 + 5 * MINUTE,
    });
  });

  it('marks an exercise whose every set was skipped as skipped, not done', () => {
    const state = applyAll(answeredSession(), [skip(EXERCISE_2, 1)], T0);
    const transition = apply(state, skip(EXERCISE_2, 2), T0 + MINUTE);

    expect(findExercise(transition.state, EXERCISE_2).status).toBe('skipped');
    expect(effectOf(transition.effects, 'advance-exercise').status).toBe('skipped');
  });

  it('leaves the active card in place when no other exercise is open (§7 has no wrap-around)', () => {
    const state = applyAll(answeredSession(), [skip(EXERCISE_2, 1), skip(EXERCISE_2, 2)], T0);

    expect(state.activeIndex).toBe(1);
    expect(isSessionAnswered(state)).toBe(true);
  });
});

/* ------------------------------------------------------------ §7: the weight */

describe('§7 the load decision', () => {
  it('records an accepted decision at the recommended weight with a zero delta (I-8)', () => {
    const transition = apply(start(), { type: 'weight-accepted', exerciseSessionId: EXERCISE_1 }, T0);

    const exercise = findExercise(transition.state, EXERCISE_1);
    expect(exercise.decision).toEqual({ kind: 'accepted' });
    expect(exercise.recommendedWeightKg).toBe(100);
    expect(exercise.usedWeightKg).toBe(100);
    expect(exercise.loadDeltaKg).toBe(0);
    expect(transition.effects).toEqual([]);
  });

  it('records a held decision at the previous weight with its delta against the recommendation (I-8)', () => {
    const transition = apply(
      start(),
      { type: 'weight-held', exerciseSessionId: EXERCISE_1, previousWeightKg: 95 },
      T0,
    );

    const exercise = findExercise(transition.state, EXERCISE_1);
    expect(exercise.decision).toEqual({ kind: 'repeated' });
    expect(exercise.usedWeightKg).toBe(95);
    expect(exercise.loadDeltaKg).toBe(-5);
    expect(transition.effects).toEqual([]);
  });

  it('records an overridden decision as manual with its delta (I-8)', () => {
    const transition = apply(start(), { type: 'weight-overridden', exerciseSessionId: EXERCISE_1, kg: 105 }, T0);

    const exercise = findExercise(transition.state, EXERCISE_1);
    expect(exercise.decision).toEqual({ kind: 'manual', kg: 105 });
    expect(exercise.usedWeightKg).toBe(105);
    expect(exercise.loadDeltaKg).toBe(5);
  });

  it('leaves the delta null when the engine suggested no weight at all', () => {
    const state = createSession(
      seed({
        exercises: [
          {
            id: EXERCISE_1,
            exerciseId: 'ex-1',
            exerciseNameSnapshot: 'Sentadilla',
            prescription: prescription(3),
            recommendation: recommendation(null),
          },
        ],
      }),
    );

    const transition = apply(state, { type: 'weight-overridden', exerciseSessionId: EXERCISE_1, kg: 80 }, T0);

    const exercise = findExercise(transition.state, EXERCISE_1);
    expect(exercise.decision).toEqual({ kind: 'manual', kg: 80 });
    expect(exercise.recommendedWeightKg).toBeNull();
    expect(exercise.usedWeightKg).toBe(80);
    expect(exercise.loadDeltaKg).toBeNull();
  });
});

/* ------------------------------------------------------- §7: paging exercises */

describe('§7 exercise navigation', () => {
  it('moves the active card forwards and backwards without emitting an effect', () => {
    const forward = apply(start(), { type: 'exercise-advanced' }, T0);
    expect(forward.state.activeIndex).toBe(1);
    expect(forward.effects).toEqual([]);

    const back = apply(forward.state, { type: 'exercise-returned' }, T0);
    expect(back.state.activeIndex).toBe(0);
    expect(back.effects).toEqual([]);
  });

  it('refuses to page before the first card', () => {
    const state = start();
    const transition = apply(state, { type: 'exercise-returned' }, T0);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('noPreviousExercise');
  });

  it('refuses to page past the last card', () => {
    const state = apply(start(), { type: 'exercise-advanced' }, T0).state;
    const transition = apply(state, { type: 'exercise-advanced' }, T0);

    expect(transition.state).toBe(state);
    expect(transition.rejection?.code).toBe('noNextExercise');
  });
});

/* ------------------------------------------------------------- §7: the rest */

describe('§7 the rest timer', () => {
  it('starts a rest for the confirmed exercise from the injected instant', () => {
    const instant = T0 + 2000;
    const transition = apply(start(), confirm(EXERCISE_1, 1, 100), instant);

    const effect = effectOf(transition.effects, 'start-rest');
    expect(effect.exerciseSessionId).toBe(EXERCISE_1);
    expect(effect.startedAt).toBe(instant);
    expect(effect.durationSeconds).toBe(90);
    expect(effect.deadlineAt).toBe(instant + 90_000);
    expect(restDeadline(transition.state)).toBe(instant + 90_000);
  });

  it('adds fifteen seconds to the deadline when the rest is extended (FR-8.3)', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const transition = apply(state, { type: 'rest-extended', seconds: 15 }, T0 + 1000);

    expect(restDeadline(transition.state)).toBe(T0 + 90_000 + 15_000);
    expect(transition.effects).toEqual([]);
  });

  it('dismisses the rest bar when the rest is skipped (FR-8.3)', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const transition = apply(state, { type: 'rest-skipped' }, T0 + 1000);

    expect(restDeadline(transition.state)).toBeNull();
    expect(isRestFinished(transition.state, T0 + 1000)).toBe(false);
    expect(transition.effects).toEqual([]);
  });

  it('starts a rest again from the injected instant on rest-started', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const instant = T0 + 10 * MINUTE;
    const transition = apply(state, { type: 'rest-started', exerciseSessionId: EXERCISE_1 }, instant);

    expect(effectTypes(transition.effects)).toEqual(['start-rest']);
    expect(restDeadline(transition.state)).toBe(instant + 90_000);
    expect(effectOf(transition.effects, 'start-rest').startedAt).toBe(instant);
  });

  it('starts a rest on demand even when auto-start is disabled (FR-8.1 is about the automatic case)', () => {
    const state = createSession(seed({ autoStartRest: false }));
    const transition = apply(state, { type: 'rest-started', exerciseSessionId: EXERCISE_1 }, T0);

    expect(transition.rejection).toBeNull();
    expect(restDeadline(transition.state)).toBe(T0 + 90_000);
  });

  it('does not start a rest when the profile disables auto-start (FR-8.1)', () => {
    const state = createSession(seed({ autoStartRest: false }));
    const transition = apply(state, confirm(EXERCISE_1, 1, 100), T0);

    expect(effectTypes(transition.effects)).toEqual(['persist-set']);
    expect(restDeadline(transition.state)).toBeNull();
  });
});

/* ------------------------------------------------------------ §7: finishing */

describe('§7 finishing the session', () => {
  it('completes the session when every set is answered, stamping endedAt with the injected instant', () => {
    const state = applyAll(answeredSession(), [skip(EXERCISE_2, 1), skip(EXERCISE_2, 2)], T0);
    const instant = T0 + 40 * MINUTE;
    const transition = apply(state, { type: 'session-finished', outcome: 'completed' }, instant);

    expect(transition.state.status).toBe('completed');
    expect(transition.state.endedAt).toBe(instant);
    expect(effectTypes(transition.effects)).toEqual(['finish-session']);
    expect(effectOf(transition.effects, 'finish-session')).toMatchObject({
      sessionId: 'session-1',
      status: 'completed',
      endedAt: instant,
    });
    expect(restDeadline(transition.state)).toBeNull();
  });

  it('closes the session as partial and settles the active exercise as skipped (§7 finish(partial))', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const instant = T0 + 12 * MINUTE;
    const transition = apply(state, { type: 'session-finished', outcome: 'partial' }, instant);

    expect(transition.state.status).toBe('partial');
    expect(transition.state.endedAt).toBe(instant);
    expect(findExercise(transition.state, EXERCISE_1).status).toBe('skipped');
    expect(findExercise(transition.state, EXERCISE_1).completedAt).toBe(instant);
    expect(findExercise(transition.state, EXERCISE_2).status).toBe('pending');
    expect(effectOf(transition.effects, 'finish-session').status).toBe('partial');
  });

  it('closes the session as abandoned on discard (§7 inProgress -> abandoned)', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const transition = apply(state, { type: 'session-finished', outcome: 'abandoned' }, T0 + MINUTE);

    expect(transition.state.status).toBe('abandoned');
    expect(effectOf(transition.effects, 'finish-session').status).toBe('abandoned');
    expect(findExercise(transition.state, EXERCISE_1).status).toBe('skipped');
  });

  it('refuses to finish a session that never started (§7 has no scheduled -> completed)', () => {
    const state = start();
    const transition = apply(state, { type: 'session-finished', outcome: 'completed' }, T0 + MINUTE);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('notStarted');
  });

  it('refuses every interaction once the session is terminal', () => {
    const finished = apply(
      apply(start(), confirm(EXERCISE_1, 1, 100), T0).state,
      { type: 'session-finished', outcome: 'partial' },
      T0 + MINUTE,
    ).state;

    for (const event of [
      confirm(EXERCISE_1, 2, 100),
      skip(EXERCISE_1, 2),
      { type: 'weight-accepted', exerciseSessionId: EXERCISE_2 } as SessionEvent,
      { type: 'exercise-advanced' } as SessionEvent,
      { type: 'rest-skipped' } as SessionEvent,
      { type: 'session-finished', outcome: 'completed' } as SessionEvent,
    ] satisfies SessionEvent[]) {
      const transition = apply(finished, event, T0 + 2 * MINUTE);
      expect(transition.state).toBe(finished);
      expect(transition.effects).toEqual([]);
      expect(transition.rejection?.code).toBe('sessionClosed');
    }
  });
});

/* -------------------------------------------------------------- §6 invariants */

describe('§6 invariants the reducer is the only place to enforce', () => {
  it('I-set: a set cannot be confirmed twice', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const transition = apply(state, confirm(EXERCISE_1, 1, 90, 5), T0 + MINUTE);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('alreadyConfirmed');
    expect(findConfirmed(transition.state, EXERCISE_1, 1).weightKg).toBe(100);
  });

  it('I-exercise: a confirmed set cannot be edited into a different exercise', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;

    // Slot 1 belongs to the second exercise, where nothing has been confirmed.
    const transition = apply(state, correction(EXERCISE_2, 1, 60), T0 + MINUTE);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('notConfirmed');
    expect(findExercise(transition.state, EXERCISE_1).sets).toHaveLength(1);
  });

  it('I-finish: the session cannot finish with a pending set the owner has not skipped', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;
    const transition = apply(state, { type: 'session-finished', outcome: 'completed' }, T0 + MINUTE);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('pendingSets');
    expect(transition.state.status).toBe('inProgress');
  });

  it('I-finish: skipping the pending sets is what unblocks a completed finish', () => {
    const skipped = applyAll(
      apply(start(), confirm(EXERCISE_1, 1, 100), T0).state,
      [skip(EXERCISE_1, 2), skip(EXERCISE_1, 3), skip(EXERCISE_2, 1), skip(EXERCISE_2, 2)],
      T0,
    );

    const transition = apply(skipped, { type: 'session-finished', outcome: 'completed' }, T0 + MINUTE);

    expect(transition.rejection).toBeNull();
    expect(transition.state.status).toBe('completed');
  });

  it('I-decision: the load decision is written once (I-2, I-8)', () => {
    const state = apply(start(), { type: 'weight-accepted', exerciseSessionId: EXERCISE_1 }, T0).state;
    const transition = apply(state, { type: 'weight-overridden', exerciseSessionId: EXERCISE_1, kg: 90 }, T0 + MINUTE);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('decisionRecorded');
  });

  it('I-accept: a recommendation with no weight cannot be accepted', () => {
    const state = createSession(
      seed({
        exercises: [
          {
            id: EXERCISE_1,
            exerciseId: 'ex-1',
            exerciseNameSnapshot: 'Sentadilla',
            prescription: prescription(3),
            recommendation: recommendation(null),
          },
        ],
      }),
    );
    const transition = apply(state, { type: 'weight-accepted', exerciseSessionId: EXERCISE_1 }, T0);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
    expect(transition.rejection?.code).toBe('noRecommendation');
  });

  it('rejects a set beyond the prescription and a set answered out of order', () => {
    const initial = start();
    const tooFar = apply(initial, confirm(EXERCISE_1, 4, 100), T0);
    expect(tooFar.state).toBe(initial);
    expect(tooFar.rejection?.code).toBe('invalidSlot');
    expect(tooFar.effects).toEqual([]);

    const outOfOrder = apply(initial, confirm(EXERCISE_1, 2, 100), T0);
    expect(outOfOrder.state).toBe(initial);
    expect(outOfOrder.rejection?.code).toBe('outOfOrder');
    expect(outOfOrder.effects).toEqual([]);
  });

  it('rejects a negative weight and a negative rep count', () => {
    const weight = apply(start(), confirm(EXERCISE_1, 1, -5), T0);
    expect(weight.rejection?.code).toBe('invalidWeight');

    const reps = apply(start(), confirm(EXERCISE_1, 1, 100, -1), T0);
    expect(reps.rejection?.code).toBe('invalidReps');
  });

  it('never mutates the state it is given', () => {
    const state = start();
    const snapshot = JSON.parse(JSON.stringify(state)) as unknown;

    apply(state, confirm(EXERCISE_1, 1, 100), T0);
    apply(state, { type: 'weight-accepted', exerciseSessionId: EXERCISE_1 }, T0);
    apply(state, { type: 'exercise-advanced' }, T0);

    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(snapshot);
  });
});

/* --------------------------------------------------- §7 crash recovery: resume */

describe('§7 crash recovery', () => {
  function busyState(): SessionState {
    let state = start();
    let clock = T0;
    state = reduce(state, { type: 'weight-accepted', exerciseSessionId: EXERCISE_1 }, clock).state;
    for (const slot of [1, 2]) {
      clock += MINUTE;
      state = reduce(state, confirm(EXERCISE_1, slot, 100, slot === 1 ? 8 : 9), clock).state;
    }
    clock += MINUTE;
    state = reduce(state, { type: 'rest-extended', seconds: 15 }, clock).state;
    clock += MINUTE;
    state = reduce(state, skip(EXERCISE_1, 3), clock).state;
    clock += MINUTE;
    return state;
  }

  it('resumes a serialised state to exactly the state that produced it', () => {
    const state = busyState();
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json) as SessionState;

    expect(parsed).toStrictEqual(state);

    const resumed = reduce(state, { type: 'session-resumed', record: parsed }, T0 + 20 * MINUTE);

    expect(resumed.rejection).toBeNull();
    expect(resumed.effects).toEqual([]);
    expect(resumed.state).toStrictEqual(state);
    expect(restDeadline(resumed.state)).toBe(restDeadline(state));
  });

  it('resumes without reading the clock: two injected instants give the same state', () => {
    const state = busyState();
    const parsed = JSON.parse(JSON.stringify(state)) as SessionState;

    const early = reduce(state, { type: 'session-resumed', record: parsed }, T0);
    const late = reduce(state, { type: 'session-resumed', record: parsed }, T0 + 365 * 86_400_000);

    expect(early.state).toStrictEqual(late.state);
  });

  it('resumes into a state that then behaves exactly as the replay would', () => {
    const state = busyState();
    const parsed = JSON.parse(JSON.stringify(state)) as SessionState;

    const resumed = reduce(reduce(state, { type: 'session-resumed', record: parsed }, T0 + MINUTE).state, confirm(EXERCISE_2, 1, 60), T0 + 30 * MINUTE);
    const replayed = reduce(state, confirm(EXERCISE_2, 1, 60), T0 + 30 * MINUTE);

    expect(resumed.state).toStrictEqual(replayed.state);
    expect(resumed.effects).toStrictEqual(replayed.effects);
  });

  it('recovers a page discarded from memory from what the store returns, to the replayed position', () => {
    const source: SessionSource = {
      id: 'session-1',
      dayNameSnapshot: 'SENTADILLA / PIERNA',
      scheduledDate: T0,
      startedAt: T0 + MINUTE,
      endedAt: null,
      phase: NORMAL_PHASE,
      status: 'inProgress',
      exercises: [
        {
          id: EXERCISE_1,
          exerciseId: 'ex-1',
          exerciseNameSnapshot: 'Sentadilla',
          prescription: prescription(3),
          recommendation: recommendation(100),
          decision: { kind: 'accepted' },
          recommendedWeightKg: 100,
          usedWeightKg: 100,
          loadDeltaKg: 0,
          status: 'done',
          completedAt: T0 + 3 * MINUTE,
          sets: [
            {
              id: 'es-1:1',
              index: 1,
              weightKg: 100,
              targetReps: 8,
              actualReps: 8,
              effort: EFFORT.correct,
              discomfort: DISCOMFORT.none,
              confirmedAt: T0 + MINUTE,
            },
            {
              id: 'es-1:2',
              index: 2,
              weightKg: 100,
              targetReps: 8,
              actualReps: 9,
              effort: EFFORT.correct,
              discomfort: DISCOMFORT.none,
              confirmedAt: T0 + 2 * MINUTE,
            },
            {
              id: 'es-1:3',
              index: 3,
              weightKg: 100,
              targetReps: 8,
              actualReps: 8,
              effort: EFFORT.correct,
              discomfort: DISCOMFORT.none,
              confirmedAt: T0 + 3 * MINUTE,
            },
          ],
        },
        {
          id: EXERCISE_2,
          exerciseId: 'ex-2',
          exerciseNameSnapshot: 'Press banca',
          prescription: prescription(2),
          recommendation: recommendation(60),
          decision: null,
          recommendedWeightKg: null,
          usedWeightKg: null,
          loadDeltaKg: null,
          status: 'pending',
          completedAt: null,
          sets: [],
        },
      ],
    };

    // The state the same session reaches by replaying its confirmations.
    const replayed = (() => {
      let state = start();
      state = reduce(state, { type: 'weight-accepted', exerciseSessionId: EXERCISE_1 }, T0 + MINUTE).state;
      state = reduce(state, confirm(EXERCISE_1, 1, 100, 8), T0 + MINUTE).state;
      state = reduce(state, confirm(EXERCISE_1, 2, 100, 9), T0 + 2 * MINUTE).state;
      state = reduce(state, confirm(EXERCISE_1, 3, 100, 8), T0 + 3 * MINUTE).state;
      return state;
    })();

    const recovered = reduce(replayed, { type: 'page-recovered', source, autoStartRest: true }, T0 + 30 * MINUTE);

    expect(recovered.rejection).toBeNull();
    expect(recovered.effects).toEqual([]);
    expect(recovered.state).toStrictEqual(replayed);
    expect(restDeadline(recovered.state)).toBe(T0 + 3 * MINUTE + 90_000);
  });

  it('derives the same state from the source that snapshotFromSource derives', () => {
    const state = start();
    const source: SessionSource = {
      id: state.id,
      dayNameSnapshot: state.dayNameSnapshot,
      scheduledDate: state.scheduledDate,
      startedAt: null,
      endedAt: null,
      phase: state.phase,
      status: 'scheduled',
      exercises: state.exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        exerciseNameSnapshot: exercise.exerciseNameSnapshot,
        prescription: exercise.prescription,
        recommendation: exercise.recommendation,
        decision: exercise.decision,
        recommendedWeightKg: exercise.recommendedWeightKg,
        usedWeightKg: exercise.usedWeightKg,
        loadDeltaKg: exercise.loadDeltaKg,
        status: 'pending',
        completedAt: null,
        sets: [],
      })),
    };

    expect(snapshotFromSource(source, true)).toStrictEqual(state);
  });
});

/* ----------------------------------------------------- §8 derived values */

describe('§8 derived values are computed, never stored', () => {
  it('reports which set is active: the first unanswered slot of the active exercise', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;

    expect(activeSet(state)).toEqual({ exerciseSessionId: EXERCISE_1, slot: 2 });

    const answered = applyAll(start(), [confirm(EXERCISE_1, 1, 100), confirm(EXERCISE_1, 2, 100), confirm(EXERCISE_1, 3, 100)], T0);
    expect(activeSet(answered)).toEqual({ exerciseSessionId: EXERCISE_2, slot: 1 });
  });

  it('reports no active exercise and no active set for a session with no exercises', () => {
    const state = createSession(seed({ exercises: [] }));

    expect(activeExercise(state)).toBeNull();
    expect(activeSet(state)).toBeNull();
  });

  it('counts the remaining sets of an exercise and of the whole session', () => {
    const state = applyAll(start(), [confirm(EXERCISE_1, 1, 100), skip(EXERCISE_1, 2)], T0);

    expect(remainingSets(state, EXERCISE_1)).toBe(1);
    expect(remainingSets(state, EXERCISE_2)).toBe(2);
    expect(sessionRemainingSets(state)).toBe(3);
  });

  it('reads every set of an exercise as answered only when all prescribed slots are', () => {
    const partial = applyAll(start(), [confirm(EXERCISE_1, 1, 100), confirm(EXERCISE_1, 2, 100)], T0);
    expect(isExerciseAnswered(partial, EXERCISE_1)).toBe(false);

    const complete = applyAll(partial, [skip(EXERCISE_1, 3)], T0);
    expect(isExerciseAnswered(complete, EXERCISE_1)).toBe(true);
    expect(isSessionAnswered(complete)).toBe(false);
  });

  it('shows the session position in the design\'s "Ejercicio 2 de 6" form', () => {
    const initial = start();
    expect(exerciseProgress(initial)).toEqual({ position: 1, total: 2, label: '1 de 2' });

    const state = apply(initial, { type: 'exercise-advanced' }, T0).state;
    expect(exerciseProgress(state)).toEqual({ position: 2, total: 2, label: '2 de 2' });

    const empty = createSession(seed({ exercises: [] }));
    expect(exerciseProgress(empty).label).toBe('0 de 0');
  });

  it('shows the set progress as "2 de 4"', () => {
    const state = applyAll(start(), [confirm(EXERCISE_1, 1, 100), confirm(EXERCISE_1, 2, 100)], T0);

    expect(setProgress(state, EXERCISE_1)).toEqual({ answered: 2, prescribed: 3, label: '2 de 3' });
  });

  it('derives the rest deadline from the stored instant, so a clock jump past it finishes the rest', () => {
    const confirmedAt = T0 + 1000;
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), confirmedAt).state;

    expect(restDeadline(state)).toBe(confirmedAt + 90_000);
    expect(restRemainingMs(state, confirmedAt)).toBe(90_000);
    expect(restRemainingMs(state, confirmedAt + 45_000)).toBe(45_000);
    expect(isRestFinished(state, confirmedAt + 45_000)).toBe(false);

    // The screen was locked for an hour: nothing ran, nothing accumulated.
    const afterLock = confirmedAt + 60 * MINUTE;
    expect(restRemainingMs(state, afterLock)).toBe(0);
    expect(restElapsedMs(state, afterLock)).toBe(60 * MINUTE);
    expect(isRestFinished(state, afterLock)).toBe(true);
  });

  it('keeps the deadline correct while the state object never changes', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;

    const readings = [0, 30_000, 89_999, 90_000, 300_000].map((elapsed) => restRemainingMs(state, T0 + elapsed));

    expect(readings).toEqual([90_000, 60_000, 1, 0, 0]);
  });

  it('summarises the session for the Resumen screen from stored sets only (I-6)', () => {
    let state = start();
    state = reduce(state, confirm(EXERCISE_1, 1, 100, 8), T0).state;
    state = reduce(state, confirm(EXERCISE_1, 2, 100, 10), T0 + MINUTE).state;
    state = reduce(state, skip(EXERCISE_1, 3), T0 + 2 * MINUTE).state;
    state = reduce(state, confirm(EXERCISE_2, 1, 60, 9), T0 + 3 * MINUTE).state;
    state = reduce(state, { type: 'session-finished', outcome: 'partial' }, T0 + 40 * MINUTE).state;

    const summary = summarise(state);

    expect(summary.durationMs).toBe(40 * MINUTE);
    expect(summary.setsConfirmed).toBe(3);
    expect(summary.setsPrescribed).toBe(5);
    expect(summary.volumeKg).toBe(100 * 8 + 100 * 10 + 60 * 9);
    expect(summary.exercises).toHaveLength(2);

    const first = summary.exercises[0];
    expect(first).toMatchObject({
      exerciseSessionId: EXERCISE_1,
      name: 'Sentadilla',
      status: 'done',
      setsConfirmed: 2,
      setsSkipped: 1,
      setsPrescribed: 3,
      volumeKg: 100 * 8 + 100 * 10,
      totalReps: 18,
      bestWeightKg: 100,
    });

    const second = summary.exercises[1];
    expect(second).toMatchObject({ exerciseSessionId: EXERCISE_2, setsConfirmed: 1, volumeKg: 60 * 9 });
  });

  it('reports no duration for a session that has not finished', () => {
    const state = apply(start(), confirm(EXERCISE_1, 1, 100), T0).state;

    expect(summarise(state).durationMs).toBeNull();
  });
});

/* --------------------------------------------------------- determinism (§7) */

describe('determinism', () => {
  /** Recorded seed: every run of this suite generates the same 220 steps. */
  const SEED = 0x5eed_0f7a;
  const STEPS = 220;

  function mulberry32(initial: number): () => number {
    let state = initial >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick<T>(random: () => number, values: readonly T[]): T {
    return values[Math.floor(random() * values.length)] as T;
  }

  function intBetween(random: () => number, min: number, max: number): number {
    return min + Math.floor(random() * (max - min + 1));
  }

  interface Step {
    readonly event: SessionEvent;
    readonly now: number;
  }

  const EFFORTS: readonly (Effort | null)[] = [null, EFFORT.failure, EFFORT.hard, EFFORT.correct, EFFORT.easy];
  const DISCOMFORTS: readonly (Discomfort | null)[] = [null, DISCOMFORT.none, DISCOMFORT.mild, DISCOMFORT.pain];
  const IDS = [EXERCISE_1, EXERCISE_2] as const;

  function generateCase(random: () => number): SessionEvent {
    const exerciseSessionId = pick(random, IDS);
    const slot = intBetween(random, 1, 3);

    switch (intBetween(random, 0, 11)) {
      case 0:
        return { type: 'session-started' };
      case 1:
      case 2:
      case 3:
        return confirm(
          exerciseSessionId,
          slot,
          intBetween(random, 0, 120),
          intBetween(random, 0, 12),
          pick(random, EFFORTS),
          pick(random, DISCOMFORTS),
        );
      case 4:
        return correction(
          exerciseSessionId,
          slot,
          intBetween(random, 0, 120),
          intBetween(random, 0, 12),
          pick(random, EFFORTS),
          pick(random, DISCOMFORTS),
        );
      case 5:
        return skip(exerciseSessionId, slot);
      case 6:
        return { type: 'weight-accepted', exerciseSessionId };
      case 7:
        return { type: 'weight-held', exerciseSessionId, previousWeightKg: intBetween(random, 0, 120) };
      case 8:
        return { type: 'weight-overridden', exerciseSessionId, kg: intBetween(random, 0, 120) };
      case 9:
        return pick(random, [
          { type: 'exercise-advanced' },
          { type: 'exercise-returned' },
        ] satisfies SessionEvent[]);
      case 10:
        return pick(random, [
          { type: 'rest-started', exerciseSessionId },
          { type: 'rest-extended', seconds: intBetween(random, 0, 30) },
          { type: 'rest-skipped' },
        ] satisfies SessionEvent[]);
      default:
        return {
          type: 'session-finished',
          outcome: pick(random, ['completed', 'partial', 'abandoned'] as const),
        };
    }
  }

  function generateSteps(): readonly Step[] {
    const random = mulberry32(SEED);
    const steps: Step[] = [];
    let now = T0;
    for (let index = 0; index < STEPS; index += 1) {
      now += intBetween(random, 1_000, 60_000);
      steps.push({ event: generateCase(random), now });
    }
    return steps;
  }

  function replay(steps: readonly Step[]): readonly SessionTransition[] {
    let state = start();
    const transitions: SessionTransition[] = [];
    for (const step of steps) {
      const transition = reduce(state, step.event, step.now);
      transitions.push(transition);
      state = transition.state;
    }
    return transitions;
  }

  it(`replays ${STEPS} generated steps identically twice (seed ${SEED})`, () => {
    const steps = generateSteps();
    expect(steps).toHaveLength(STEPS);
    expect(steps[0]?.now).toBeGreaterThan(T0);

    const first = replay(steps);
    const second = replay(steps);

    expect(second).toStrictEqual(first);

    const firstState = first[first.length - 1]?.state;
    const secondState = second[second.length - 1]?.state;
    expect(secondState).toStrictEqual(firstState);
    expect(JSON.stringify(secondState)).toBe(JSON.stringify(firstState));
  });

  it(`keeps every intermediate state and effect JSON-safe over ${STEPS} steps (seed ${SEED})`, () => {
    const steps = generateSteps();
    let state = start();

    for (const step of steps) {
      const transition = reduce(state, step.event, step.now);
      expect(JSON.parse(JSON.stringify(transition.state))).toStrictEqual(transition.state);
      expect(JSON.parse(JSON.stringify(transition.effects))).toStrictEqual(transition.effects);
      state = transition.state;
    }
  });

  it('only ever emits the four documented effect descriptors', () => {
    const steps = generateSteps();
    const kinds = new Set<string>();

    for (const transition of replay(steps)) {
      for (const effect of transition.effects) kinds.add(effect.type);
    }

    expect([...kinds].sort()).toEqual(['advance-exercise', 'finish-session', 'persist-set', 'start-rest']);
  });
});
