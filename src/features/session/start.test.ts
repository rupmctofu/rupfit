/**
 * Starting a session: the rotation, the aggregate, the gate and the write.
 *
 * Everything the design asks for is pinned here as a branch, because a wrong start is
 * silent and expensive: a duplicated session (I-9), a recommendation recomputed instead
 * of frozen (I-2), a second row for the same day, or a navigation that runs before the
 * write resolved. The last test is the one that matters most — a session created through
 * the real storage adapter must open in the sheet.
 *
 * No DOM: the pure module and the port seam are both exercised in `node`, the way the
 * rest of the suite is.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as fakeIndexedDb from 'fake-indexeddb';
import { DISCOMFORT, EFFORT, type ExerciseOutcome } from '../../core/domain';
import {
  createStorage,
  type Exercise,
  type ExercisePrescription,
  type ExerciseSession,
  type PlanDay,
  type PlanItem,
  type SessionStatus,
  type SetRecord,
  type UserProfile,
  type WorkoutSession,
} from '../../storage';
import { createSessionMachine } from './controller';
import { createFakeStorage, type FakeStorage } from './fake-port';
import {
  buildSession,
  nextPlanDay,
  phaseOf,
  planStart,
  progressionHistoryOf,
  START_COPY,
  type ProgressionHistory,
  type StartInput,
} from './start';
import { runStart, SESSION_HASH } from './startSession';

/* ------------------------------------------------------------------ fixtures */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Wednesday 4 March 2026, 18:00 local: the instant every fixture is placed around. */
const NOW = new Date(2026, 2, 4, 18, 0, 0).getTime();
const YESTERDAY = NOW - DAY_MS;
const THREE_DAYS_AGO = NOW - 3 * DAY_MS;

const PRESCRIPTION: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 8, upperBound: 10 },
  targetRIR: { lowerBound: 2, upperBound: 3 },
  restSeconds: 180,
};

const SQUAT: Exercise = {
  id: 'ex-squat',
  name: 'Sentadilla trasera',
  primaryMuscle: 'quadriceps',
  pattern: 'squat',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: false,
  isArchived: false,
};

/** An archived row: out of the picker, still named by a plan day that already had it. */
const ARCHIVED_SQUAT: Exercise = { ...SQUAT, isArchived: true };

const PULLUP: Exercise = {
  id: 'ex-pullup',
  name: 'Dominadas',
  primaryMuscle: 'lats',
  pattern: 'verticalPull',
  equipment: 'bodyweight',
  loadIncrementKg: 0,
  isCustom: false,
  isArchived: false,
};

const BENCH: Exercise = {
  id: 'ex-bench',
  name: 'Press de banca',
  primaryMuscle: 'chest',
  pattern: 'horizontalPush',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: false,
  isArchived: false,
};

const PROFILE: UserProfile = {
  id: 'profile-1',
  displayName: 'Rup',
  massUnit: 'kilograms',
  weightGoal: null,
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell', 'bodyweight'],
  autoStartRestTimer: true,
};

let counter = 0;
beforeEach(() => {
  counter = 0;
});

function ids(): () => string {
  return () => {
    counter += 1;
    return `new-${String(counter)}`;
  };
}

function planItem(
  dayId: string,
  order: number,
  exercise: Exercise,
  overrides: Partial<PlanItem> = {},
): PlanItem {
  return {
    id: `${dayId}-item-${String(order)}`,
    planDayId: dayId,
    order,
    exerciseId: exercise.id,
    exerciseNameSnapshot: exercise.name,
    prescription: PRESCRIPTION,
    ...overrides,
  };
}

function planDay(id: string, order: number, name: string, items: readonly PlanItem[]): PlanDay {
  return { id, name, order, items };
}

const LOWER = planDay('day-lower', 1, 'SENTADILLA / PIERNA', [planItem('day-lower', 1, SQUAT)]);
const PULL = planDay('day-pull', 2, 'TIRÓN / ESPALDA', [planItem('day-pull', 1, PULLUP)]);
const PUSH = planDay('day-push', 3, 'EMPUJE / PECHO', [planItem('day-push', 1, BENCH)]);
const PLAN: readonly PlanDay[] = [PULL, LOWER, PUSH]; // deliberately not in `order` order

function setRecord(index: number, weightKg: number, actualReps: number): SetRecord {
  return {
    id: `set-${String(index)}`,
    index,
    weightKg,
    targetReps: PRESCRIPTION.repRange.lowerBound,
    actualReps,
    effort: EFFORT.hard,
    discomfort: DISCOMFORT.none,
    confirmedAt: NOW - DAY_MS,
  };
}

function exerciseSessionOf(
  id: string,
  exercise: Exercise,
  sets: readonly SetRecord[],
  overrides: Partial<ExerciseSession> = {},
): ExerciseSession {
  return {
    id,
    order: 1,
    exerciseId: exercise.id,
    exerciseNameSnapshot: exercise.name,
    prescription: PRESCRIPTION,
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    sets,
    status: 'done',
    completedAt: NOW - DAY_MS,
    ...overrides,
  };
}

function sessionOf(
  planDayId: string,
  status: SessionStatus,
  at: number,
  exercises: readonly ExerciseSession[] = [],
): WorkoutSession {
  return {
    id: `session-${planDayId}-${String(at)}`,
    planDayId,
    dayNameSnapshot: planDayId,
    scheduledDate: at,
    startedAt: status === 'scheduled' ? null : at,
    endedAt: status === 'scheduled' || status === 'inProgress' ? null : at,
    phase: { kind: 'normal' },
    status,
    exercises,
  };
}

function outcome(dayOffset: number, weightKg: number, actualReps: number): ExerciseOutcome {
  return {
    date: new Date(NOW - dayOffset * DAY_MS),
    weightKg,
    recommendedWeightKg: weightKg,
    sets: Array.from({ length: PRESCRIPTION.sets }, () => ({
      targetReps: PRESCRIPTION.repRange.lowerBound,
      actualReps,
      effort: EFFORT.hard,
      discomfort: DISCOMFORT.none,
    })),
  };
}

/* ------------------------------------------------------------------- rotation */

describe('nextPlanDay', () => {
  it('starts at the first day by order when there is no history', () => {
    expect(nextPlanDay(PLAN, [])?.id).toBe(LOWER.id);
  });

  it('returns the day after the last closed session', () => {
    const sessions = [sessionOf(PULL.id, 'completed', THREE_DAYS_AGO)];
    expect(nextPlanDay(PLAN, sessions)?.id).toBe(PUSH.id);
  });

  it('wraps to the first day after the last day of the rotation', () => {
    const sessions = [sessionOf(PUSH.id, 'completed', THREE_DAYS_AGO)];
    expect(nextPlanDay(PLAN, sessions)?.id).toBe(LOWER.id);
  });

  it('walks back past a session whose plan day no longer exists', () => {
    const sessions = [
      sessionOf('day-deleted', 'completed', YESTERDAY),
      sessionOf(LOWER.id, 'completed', THREE_DAYS_AGO),
    ];
    expect(nextPlanDay(PLAN, sessions)?.id).toBe(PULL.id);
  });

  it('falls back to the first day when no closed session names a day of the plan', () => {
    const sessions = [sessionOf('day-deleted', 'completed', YESTERDAY)];
    expect(nextPlanDay(PLAN, sessions)?.id).toBe(LOWER.id);
  });

  it('is null when the plan is empty', () => {
    expect(nextPlanDay([], [sessionOf(LOWER.id, 'completed', YESTERDAY)])).toBeNull();
  });

  it('does not advance for an abandoned or an open session', () => {
    const sessions = [
      sessionOf(PUSH.id, 'abandoned', YESTERDAY),
      sessionOf(LOWER.id, 'inProgress', YESTERDAY),
      sessionOf(PULL.id, 'completed', THREE_DAYS_AGO),
    ];
    expect(nextPlanDay(PLAN, sessions)?.id).toBe(PUSH.id);
  });

  it('reads the closed session by its end, not by the order the store returned', () => {
    const sessions = [
      sessionOf(LOWER.id, 'completed', THREE_DAYS_AGO),
      sessionOf(PULL.id, 'completed', YESTERDAY),
    ];
    expect(nextPlanDay(PLAN, sessions)?.id).toBe(PUSH.id);
  });
});

/* -------------------------------------------------------------------- history */

describe('progressionHistoryOf', () => {
  it('keeps closed sessions only, newest first, keyed by exercise id', () => {
    const closed = sessionOf(PULL.id, 'completed', YESTERDAY, [
      exerciseSessionOf('es-1', PULLUP, [setRecord(1, 0, 10), setRecord(2, 0, 9)]),
    ]);
    const abandoned = sessionOf(PUSH.id, 'abandoned', NOW - 2 * DAY_MS, [
      exerciseSessionOf('es-2', BENCH, [setRecord(1, 100, 8)]),
    ]);

    const history = progressionHistoryOf([abandoned, closed]);
    expect(Object.keys(history)).toEqual([PULLUP.id]);
    expect(history[PULLUP.id]).toHaveLength(1);
    expect(history[PULLUP.id]?.[0]?.sets).toHaveLength(2);
  });

  it('takes the heaviest confirmed set as the weight of the outcome', () => {
    const session = sessionOf(LOWER.id, 'completed', YESTERDAY, [
      exerciseSessionOf('es-1', SQUAT, [setRecord(1, 100, 10), setRecord(2, 90, 10)], {
        recommendedWeightKg: 100,
      }),
    ]);

    const [first] = progressionHistoryOf([session])[SQUAT.id] ?? [];
    expect(first?.weightKg).toBe(100);
    expect(first?.recommendedWeightKg).toBe(100);
  });
});

/* --------------------------------------------------------------- the aggregate */

describe('buildSession', () => {
  it('starts a first-time exercise cold: no weight, the plan prescription', () => {
    const built = buildSession({
      day: LOWER,
      library: [SQUAT],
      history: {},
      profile: PROFILE,
      phaseState: undefined,
      now: NOW,
      newId: ids(),
    });

    const [entry] = built.session.exercises;
    expect(entry?.recommendation).toMatchObject({
      action: 'insufficientData',
      reason: 'insufficientData',
      suggestedWeightKg: null,
      suggestedSets: PRESCRIPTION.sets,
      suggestedTargetReps: PRESCRIPTION.repRange.lowerBound,
    });
  });

  it('raises the weight of an exercise with history at the top of the range', () => {
    const history: ProgressionHistory = { [SQUAT.id]: [outcome(7, 100, 10)] };
    const built = buildSession({
      day: LOWER,
      library: [SQUAT],
      history,
      profile: PROFILE,
      phaseState: undefined,
      now: NOW,
      newId: ids(),
    });

    expect(built.session.exercises[0]?.recommendation).toMatchObject({
      action: 'increase',
      reason: 'topOfRangeReached',
      suggestedWeightKg: 102.5,
      suggestedTargetReps: PRESCRIPTION.repRange.lowerBound,
    });
  });

  it('never invents a load for a bodyweight exercise', () => {
    const history: ProgressionHistory = { [PULLUP.id]: [outcome(7, 0, 10)] };
    const built = buildSession({
      day: PULL,
      library: [PULLUP],
      history,
      profile: PROFILE,
      phaseState: undefined,
      now: NOW,
      newId: ids(),
    });

    expect(built.session.exercises[0]?.recommendation).toMatchObject({
      action: 'hold',
      reason: 'bodyweightTopOfRange',
      suggestedWeightKg: 0,
    });
  });

  it('still builds a plan item whose library row is archived', () => {
    const built = buildSession({
      day: LOWER,
      library: [ARCHIVED_SQUAT],
      history: {},
      profile: PROFILE,
      phaseState: undefined,
      now: NOW,
      newId: ids(),
    });

    const [entry] = built.session.exercises;
    expect(built.session.exercises).toHaveLength(1);
    expect(entry?.exerciseId).toBe(SQUAT.id);
    expect(entry?.exerciseNameSnapshot).toBe(SQUAT.name);
    expect(entry?.recommendation).not.toBeNull();
  });

  it('keeps the name snapshot and a null recommendation when the library row is gone', () => {
    const day = planDay('day-lower', 1, 'SENTADILLA / PIERNA', [
      planItem('day-lower', 1, SQUAT),
      planItem('day-lower', 2, { ...BENCH }, { exerciseId: 'ex-deleted' }),
    ]);
    const built = buildSession({
      day,
      library: [SQUAT],
      history: {},
      profile: PROFILE,
      phaseState: undefined,
      now: NOW,
      newId: ids(),
    });

    expect(built.session.exercises.map((entry) => entry.exerciseId)).toEqual([SQUAT.id, null]);
    expect(built.session.exercises[1]?.exerciseNameSnapshot).toBe(BENCH.name);
    expect(built.session.exercises[1]?.recommendation).toBeNull();
  });

  it('reports the autoStartRest setting and never writes it into the aggregate', () => {
    const input = {
      day: LOWER,
      library: [SQUAT],
      history: {},
      phaseState: undefined,
      now: NOW,
    };

    const restOff = buildSession({ ...input, profile: { ...PROFILE, autoStartRestTimer: false }, newId: ids() });
    counter = 0;
    const restOn = buildSession({ ...input, profile: PROFILE, newId: ids() });

    expect(restOff.autoStartRest).toBe(false);
    expect(restOn.autoStartRest).toBe(true);
    // `WorkoutSession` has no such field (data-model §3): the aggregate cannot differ.
    expect(restOff.session).toEqual(restOn.session);
  });

  it('creates a scheduled session for today with nothing pre-confirmed', () => {
    const built = buildSession({
      day: LOWER,
      library: [SQUAT],
      history: {},
      profile: PROFILE,
      phaseState: { block: 2, passedBlocks: 1 },
      now: NOW,
      newId: ids(),
    });

    const session = built.session;
    expect(session).toMatchObject({
      planDayId: LOWER.id,
      dayNameSnapshot: LOWER.name,
      scheduledDate: new Date(2026, 2, 4, 0, 0, 0).getTime(),
      startedAt: null,
      endedAt: null,
      status: 'scheduled',
      phase: { kind: 'readaptation', week: 2 },
    });

    const [entry] = session.exercises;
    expect(entry).toMatchObject({
      order: 1,
      exerciseId: SQUAT.id,
      decision: null,
      recommendedWeightKg: null,
      usedWeightKg: null,
      loadDeltaKg: null,
      sets: [],
      status: 'pending',
      completedAt: null,
    });
    // Frozen at creation (I-2): its instant is the injected one, never a later read.
    expect(entry?.recommendation?.computedAt.getTime()).toBe(NOW);
  });

  it('numbers the exercises by their position, not by the plan item number', () => {
    const day = planDay('day-lower', 1, 'SENTADILLA / PIERNA', [
      planItem('day-lower', 7, SQUAT),
      planItem('day-lower', 9, PULLUP),
    ]);
    const built = buildSession({
      day,
      library: [SQUAT, PULLUP],
      history: {},
      profile: PROFILE,
      phaseState: undefined,
      now: NOW,
      newId: ids(),
    });

    expect(built.session.exercises.map((entry) => entry.order)).toEqual([1, 2]);
    expect(built.session.exercises.map((entry) => entry.exerciseNameSnapshot)).toEqual([
      SQUAT.name,
      PULLUP.name,
    ]);
  });
});

describe('phaseOf', () => {
  it('is normal with no stored phase state and carries the block as the week', () => {
    expect(phaseOf(undefined)).toEqual({ kind: 'normal' });
    expect(phaseOf({ block: 3, passedBlocks: 2 })).toEqual({ kind: 'readaptation', week: 3 });
  });
});

/* -------------------------------------------------------------------- the gate */

function startInput(overrides: Partial<StartInput> = {}): StartInput {
  return {
    now: NOW,
    plan: PLAN,
    sessions: [],
    inProgress: undefined,
    library: [SQUAT, PULLUP, BENCH],
    profile: PROFILE,
    phaseState: undefined,
    newId: ids(),
    ...overrides,
  };
}

describe('planStart', () => {
  it('resumes the open session instead of creating a second one (I-9)', () => {
    const open = sessionOf(PULL.id, 'inProgress', NOW - 2 * 60 * 60 * 1000);
    const decision = planStart(startInput({ inProgress: open }));

    expect(decision).toMatchObject({
      kind: 'resume',
      sessionId: open.id,
      message: START_COPY.resume,
    });
  });

  it('refuses with no plan', () => {
    const decision = planStart(startInput({ plan: [] }));
    expect(decision).toMatchObject({ kind: 'blocked', refusal: 'noPlan', message: START_COPY.noPlan });
  });

  it('refuses without a profile and asks for one', () => {
    const decision = planStart(startInput({ profile: undefined }));
    expect(decision).toMatchObject({
      kind: 'blocked',
      refusal: 'noProfile',
      message: START_COPY.noProfile,
    });
  });

  it('refuses a day with no exercises', () => {
    const empty = planDay('day-empty', 4, 'VACÍO', []);
    const decision = planStart(startInput({ plan: [...PLAN, empty], planDayId: empty.id }));
    expect(decision).toMatchObject({ kind: 'blocked', refusal: 'emptyDay' });
  });

  it('refuses a day the plan no longer has', () => {
    const decision = planStart(startInput({ planDayId: 'day-deleted' }));
    expect(decision).toMatchObject({ kind: 'blocked', refusal: 'unknownDay' });
  });

  it("opens today's session for the same day instead of writing a second", () => {
    const scheduled = sessionOf(PULL.id, 'scheduled', NOW - 60 * 60 * 1000);
    const decision = planStart(startInput({ sessions: [scheduled], planDayId: PULL.id }));

    expect(decision).toMatchObject({ kind: 'open', sessionId: scheduled.id });
  });

  it('creates the day after the last closed session', () => {
    const decision = planStart(
      startInput({ sessions: [sessionOf(LOWER.id, 'completed', THREE_DAYS_AGO)] }),
    );

    expect(decision.kind).toBe('create');
    if (decision.kind !== 'create') return;
    expect(decision.built.session.planDayId).toBe(PULL.id);
  });

  it('creates the day Entrenar names, even out of rotation', () => {
    const decision = planStart(
      startInput({ sessions: [sessionOf(LOWER.id, 'completed', THREE_DAYS_AGO)], planDayId: PUSH.id }),
    );

    expect(decision.kind).toBe('create');
    if (decision.kind !== 'create') return;
    expect(decision.built.session.planDayId).toBe(PUSH.id);
  });
});

/* -------------------------------------------------------------- the write path */

interface PortOptions {
  readonly plan?: readonly PlanDay[];
  readonly sessions?: readonly WorkoutSession[];
  readonly exercises?: readonly Exercise[];
  readonly profile?: UserProfile | undefined;
  readonly failOn?: ((call: string) => boolean) | undefined;
}

function portOf(options: PortOptions = {}): FakeStorage {
  const base = createFakeStorage({
    sessions: options.sessions ?? [],
    exercises: options.exercises ?? [SQUAT, PULLUP, BENCH],
    ...(options.profile === undefined ? {} : { profile: options.profile }),
    ...(options.failOn === undefined ? {} : { failOn: options.failOn }),
  });
  const plan = [...(options.plan ?? PLAN)];

  return {
    ...base,
    // `calls` is a getter on the fake: spreading would freeze it at the empty array.
    get calls(): readonly string[] {
      return base.calls;
    },
    plan: {
      ...base.plan,
      all: () => Promise.resolve(plan),
      byId: (id) => Promise.resolve(plan.find((day) => day.id === id)),
    },
  };
}

const CLOCK = { now: () => NOW };

describe('runStart', () => {
  it('writes one scheduled session and only then navigates', async () => {
    const storage = portOf({ profile: PROFILE });
    const visited: string[] = [];

    const outcome = await runStart(
      { storage, clock: CLOCK, onNavigate: (href) => visited.push(href), newId: ids() },
      null,
    );

    expect(outcome).toMatchObject({ kind: 'opened', created: true });
    expect(storage.calls).toContain('sessions.create');
    expect(visited).toEqual([SESSION_HASH]);
    expect(storage.stored()).toHaveLength(1);
    expect(storage.stored()[0]?.status).toBe('scheduled');
    expect(storage.stored()[0]?.exercises.every((entry) => entry.sets.length === 0)).toBe(true);
  });

  it('reads the history the rotation and the engine need, before deciding', async () => {
    const storage = portOf({ profile: PROFILE });
    await runStart({ storage, clock: CLOCK, onNavigate: () => undefined, newId: ids() }, null);

    const reads = storage.calls;
    expect(reads).toContain('sessions.recent');
    expect(reads).toContain('sessions.inProgress');
    expect(reads).toContain('meta.readPhaseState');
    // The reads happen before the write: the decision cannot be made from stale numbers.
    expect(reads.indexOf('sessions.create')).toBeGreaterThan(reads.indexOf('sessions.recent'));
  });

  it('navigates to the open session without writing, and says so', async () => {
    const open = sessionOf(PULL.id, 'inProgress', NOW - 60 * 60 * 1000);
    const storage = portOf({ profile: PROFILE, sessions: [open] });
    const visited: string[] = [];

    const outcome = await runStart(
      { storage, clock: CLOCK, onNavigate: (href) => visited.push(href), newId: ids() },
      null,
    );

    expect(outcome).toMatchObject({ kind: 'opened', sessionId: open.id, created: false });
    expect(storage.calls).not.toContain('sessions.create');
    expect(visited).toEqual([SESSION_HASH]);
  });

  it('refuses without a profile and writes nothing', async () => {
    const storage = portOf({});
    const visited: string[] = [];

    const outcome = await runStart(
      { storage, clock: CLOCK, onNavigate: (href) => visited.push(href), newId: ids() },
      null,
    );

    expect(outcome).toMatchObject({ kind: 'refused', refusal: 'noProfile' });
    expect(storage.calls).not.toContain('sessions.create');
    expect(visited).toEqual([]);
    expect(storage.stored()).toHaveLength(0);
  });

  it('reports a failed write, keeps the session uncreated and does not navigate', async () => {
    const storage = portOf({ profile: PROFILE, failOn: (call) => call === 'sessions.create' });
    const visited: string[] = [];

    const outcome = await runStart(
      { storage, clock: CLOCK, onNavigate: (href) => visited.push(href), newId: ids() },
      null,
    );

    expect(outcome).toMatchObject({
      kind: 'failed',
      failure: 'write',
      message: START_COPY.createFailed,
    });
    expect(visited).toEqual([]);
    expect(storage.stored()).toHaveLength(0);
  });

  it('reports a failed read and does not navigate', async () => {
    const storage = portOf({ profile: PROFILE, failOn: (call) => call === 'sessions.recent' });
    const visited: string[] = [];

    const outcome = await runStart(
      { storage, clock: CLOCK, onNavigate: (href) => visited.push(href), newId: ids() },
      null,
    );

    expect(outcome).toMatchObject({ kind: 'failed', failure: 'read', message: START_COPY.readFailed });
    expect(visited).toEqual([]);
  });
});

/* ---------------------------------------------------------- the real round trip */

function freshIndexedDb(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(fakeIndexedDb)) {
    globals[name] = value;
  }
  const factory = new (fakeIndexedDb as unknown as { IDBFactory: new () => unknown }).IDBFactory();
  globals['indexedDB'] = factory;
}

describe('a session created through the real port', () => {
  it('opens in the sheet with its frozen recommendation', async () => {
    freshIndexedDb();
    const storage = createStorage();
    const clock = { now: () => NOW };

    try {
      await storage.open();
      await storage.exercises.save(SQUAT);
      await storage.plan.save(LOWER);
      await storage.profile.save(PROFILE);

      const visited: string[] = [];
      const outcome = await runStart(
        { storage, clock, onNavigate: (href) => visited.push(href), newId: ids() },
        null,
      );
      expect(outcome.kind).toBe('opened');
      expect(visited).toEqual([SESSION_HASH]);
      if (outcome.kind !== 'opened') return;

      const stored = await storage.sessions.byId(outcome.sessionId);
      expect(stored?.exercises[0]?.recommendation?.suggestedWeightKg).toBeNull();

      const runtime = await createSessionMachine({ storage, clock }).boot();
      expect(runtime.phase).toBe('ready');
      expect(runtime.session?.id).toBe(outcome.sessionId);
      expect(runtime.session?.dayNameSnapshot).toBe(LOWER.name);
      expect(runtime.session?.exercises.map((entry) => entry.exerciseNameSnapshot)).toEqual([
        SQUAT.name,
      ]);
      expect(runtime.session?.exercises[0]?.recommendation?.action).toBe('insufficientData');
    } finally {
      storage.close();
    }
  });
});
