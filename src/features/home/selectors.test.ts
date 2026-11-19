/**
 * Inicio's decisions, without React.
 *
 * The screen is a layout; everything that can be wrong is decided here: which session
 * is today's, whether the session is already done, what the week strip claims, how many
 * series were hard, whether the body-weight number exists at all, and which notices are
 * honest to show. Nothing here reads a clock, a store or the DOM — the caller passes
 * `HomeInput` in, so each state of the design's Inicio row is one fixture away.
 */

import { describe, expect, it } from 'vitest';
import type {
  BodyMeasurement,
  ExerciseSession,
  PlanDay,
  SetRecord,
  UserProfile,
  WeekLayout,
  WeekRecord,
  WorkoutSession,
} from '../../storage';
import { EFFORT } from '../../core/domain';
import {
  estimateMinutes,
  hardSetCount,
  homeViewOf,
  layoutOf,
  prescribedSets,
  sessionVolumeKg,
  startOfWeek,
  todaySessionOf,
  weekSessionsOf,
  confirmedSetCount,
  lastVolumeLineOf,
  type HomeInput,
  type HomeView,
} from './selectors';
import { defaultLayoutOf } from '../week/agenda';

/* ------------------------------------------------------------------ fixtures */

/**
 * Tuesday 7 November 2023, 18:00 local: the mobility and core day of a league week since
 * `odd/tasks/leg-separation.md` S2 put the three heavy days on Monday, Wednesday and Friday.
 */
const NOW = new Date(2023, 10, 7, 18, 0, 0).getTime();
const MONDAY = new Date(2023, 10, 6, 18, 0, 0).getTime();
const MONDAY_END = new Date(2023, 10, 6, 18, 52, 0).getTime();
const FRIDAY = new Date(2023, 10, 10, 18, 0, 0).getTime();
const TUESDAY = new Date(2023, 10, 7, 18, 0, 0).getTime();
const THURSDAY = new Date(2023, 10, 9, 18, 0, 0).getTime();

const PROFILE: UserProfile = {
  id: 'profile-1',
  displayName: 'Rup',
  massUnit: 'kilograms',
  weightGoal: null,
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell'],
  autoStartRestTimer: true,
};

function set(index: number, weightKg: number, actualReps: number, effort: number | null = null): SetRecord {
  return {
    id: `set-${String(index)}`,
    index,
    weightKg,
    targetReps: 10,
    actualReps,
    effort: effort === null ? null : (effort as SetRecord['effort']),
    discomfort: null,
    confirmedAt: MONDAY,
  };
}

function exercise(
  id: string,
  name: string,
  sets: readonly SetRecord[],
  prescribed = 3,
): ExerciseSession {
  return {
    id,
    order: 0,
    exerciseId: `lib-${id}`,
    exerciseNameSnapshot: name,
    prescription: { sets: prescribed, repRange: { lowerBound: 8, upperBound: 10 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 120 },
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    sets,
    status: sets.length > 0 ? 'done' : 'pending',
    completedAt: null,
  };
}

function session(overrides: Partial<WorkoutSession> & Pick<WorkoutSession, 'id' | 'status'>): WorkoutSession {
  return {
    id: overrides.id,
    planDayId: overrides.planDayId ?? 'day-monday',
    dayNameSnapshot: overrides.dayNameSnapshot ?? 'SENTADILLA / PIERNA',
    scheduledDate: overrides.scheduledDate ?? MONDAY,
    startedAt: overrides.startedAt ?? MONDAY,
    endedAt: overrides.endedAt ?? MONDAY_END,
    phase: overrides.phase ?? { kind: 'readaptation', week: 2 },
    status: overrides.status,
    exercises: overrides.exercises ?? [],
  };
}

const MONDAY_SESSION = session({
  id: 'sessions-monday',
  planDayId: 'day-monday',
  dayNameSnapshot: 'SENTADILLA / PIERNA',
  status: 'completed',
  exercises: [
    exercise('es-1', 'Sentadilla trasera', [
      set(1, 90, 10, EFFORT.correct),
      set(2, 90, 10, EFFORT.hard),
      set(3, 90, 8, EFFORT.hard),
    ]),
    exercise('es-2', 'Prensa', [set(1, 120, 12, EFFORT.easy), set(2, 120, 12, EFFORT.hard)], 2),
  ],
});

const WEDNESDAY_SESSION = session({
  id: 'sessions-wednesday',
  planDayId: 'day-wednesday',
  dayNameSnapshot: 'PESO MUERTO / TRACCIÓN',
  scheduledDate: NOW,
  startedAt: null,
  endedAt: null,
  status: 'scheduled',
  exercises: [
    exercise('es-3', 'Peso muerto', []),
    exercise('es-4', 'Remo con barra', [], 2),
  ],
});

/**
 * The Wednesday of the seeded week, with a stored row of its own.
 *
 * The week places the preparation on Wednesday (L7), so this is the session of the day the
 * card names: a session only reaches the card when it is the session of *that* plan day
 * (T6).
 */
const WEDNESDAY_PREP = session({
  id: 'sessions-wednesday-prep',
  planDayId: 'seed-day-fisico',
  dayNameSnapshot: 'PREPARACIÓN FÚTBOL',
  scheduledDate: NOW,
  startedAt: null,
  endedAt: null,
  status: 'scheduled',
  exercises: [exercise('es-3', 'Movilidad de cadera', []), exercise('es-4', 'Plancha', [], 2)],
});

const PLAN: readonly PlanDay[] = [
  {
    id: 'day-monday',
    name: 'SENTADILLA / PIERNA',
    order: 0,
    items: [
      { id: 'i1', planDayId: 'day-monday', order: 0, exerciseId: 'lib-1', exerciseNameSnapshot: 'Sentadilla', prescription: { sets: 3, repRange: { lowerBound: 8, upperBound: 10 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 180 } },
      { id: 'i2', planDayId: 'day-monday', order: 1, exerciseId: 'lib-2', exerciseNameSnapshot: 'Prensa', prescription: { sets: 3, repRange: { lowerBound: 8, upperBound: 10 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 120 } },
    ],
  },
  { id: 'day-wednesday', name: 'PESO MUERTO / TRACCIÓN', order: 1, items: [] },
  { id: 'day-friday', name: 'PRESS BANCA / EMPUJE', order: 2, items: [] },
];

/** Two days that both prescribe work: the rotation has somewhere to go after the first. */
const STARTER_PLAN: readonly PlanDay[] = [
  {
    id: 'day-lower',
    name: 'SENTADILLA / PIERNA',
    order: 0,
    items: [
      { id: 's1', planDayId: 'day-lower', order: 0, exerciseId: 'lib-1', exerciseNameSnapshot: 'Sentadilla', prescription: { sets: 3, repRange: { lowerBound: 8, upperBound: 10 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 180 } },
    ],
  },
  {
    id: 'day-pull',
    name: 'PESO MUERTO / TRACCIÓN',
    order: 1,
    items: [
      { id: 's2', planDayId: 'day-pull', order: 0, exerciseId: 'lib-2', exerciseNameSnapshot: 'Peso muerto', prescription: { sets: 3, repRange: { lowerBound: 6, upperBound: 8 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 180 } },
      { id: 's3', planDayId: 'day-pull', order: 1, exerciseId: 'lib-3', exerciseNameSnapshot: 'Remo con barra', prescription: { sets: 2, repRange: { lowerBound: 8, upperBound: 10 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 120 } },
    ],
  },
];

/** The four days of the seed (L5, L7), named exactly as the store holds them. */
function seededDay(id: string, name: string, order: number): PlanDay {
  return {
    id,
    name,
    order,
    items: [
      {
        id: `item-${id}`,
        planDayId: id,
        order: 0,
        exerciseId: 'lib-1',
        exerciseNameSnapshot: 'Sentadilla',
        prescription: { sets: 2, repRange: { lowerBound: 8, upperBound: 10 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 180 },
      },
    ],
  };
}

const SEED_PLAN: readonly PlanDay[] = [
  seededDay('seed-day-leg', 'PIERNA', 0),
  seededDay('seed-day-torso-a', 'TORSO A', 1),
  seededDay('seed-day-torso-b', 'TORSO B', 2),
  seededDay('seed-day-fisico', 'PREPARACIÓN FÚTBOL', 3),
];

/** T3: the Monday of the week `NOW` falls in, with no fixture and therefore a free Friday. */
const NO_MATCH_WEEK: WeekRecord = { monday: '2023-11-06', match: 'none', swaps: [] };

function measurement(id: string, at: number, weightKg: number | null): BodyMeasurement {
  return {
    id,
    date: at,
    weightKg,
    waistCm: null,
    chestCm: null,
    armCm: null,
    thighCm: null,
    hipCm: null,
    bodyFatPercent: null,
    provenance: 'manual',
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const WEIGHTS: readonly BodyMeasurement[] = [
  measurement('m1', NOW - 6 * DAY_MS, 80.4),
  measurement('m2', NOW - 4 * DAY_MS, 80.1),
  measurement('m3', NOW - 2 * DAY_MS, 79.6),
  measurement('m4', NOW - 1 * DAY_MS, 79.5),
  measurement('m5', NOW - 2 * 60 * 60 * 1000, 79.4),
];

function input(overrides: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW,
    profile: PROFILE,
    phaseState: { block: 2, passedBlocks: 1 },
    plan: PLAN,
    recent: [WEDNESDAY_SESSION, MONDAY_SESSION],
    inProgress: undefined,
    measurements: [],
    activities: [],
    lostData: false,
    lastExportAt: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ calendar */

describe('calendar helpers', () => {
  it('starts the week on Monday', () => {
    expect(new Date(startOfWeek(NOW)).getDay()).toBe(1);
    expect(startOfWeek(NOW)).toBe(new Date(2023, 10, 6).getTime());
  });
});

/* ------------------------------------------------------------------- session */

describe('todaySessionOf', () => {
  it('finds the session scheduled for the injected day', () => {
    expect(todaySessionOf([WEDNESDAY_SESSION, MONDAY_SESSION], NOW)?.id).toBe('sessions-wednesday');
  });

  it('prefers the session that is in progress over the one already closed', () => {
    const closed = session({ id: 'closed', status: 'completed', scheduledDate: NOW });
    const open = session({ id: 'open', status: 'inProgress', scheduledDate: NOW });
    expect(todaySessionOf([closed, open], NOW)?.id).toBe('open');
  });

  it('finds nothing on a day with no session, instead of guessing from the template', () => {
    expect(todaySessionOf([MONDAY_SESSION], NOW)).toBeUndefined();
  });
});

describe('weekSessionsOf', () => {
  it('keeps the week around the injected day, oldest first', () => {
    const nextWeek = session({ id: 'next-week', status: 'scheduled', scheduledDate: NOW + 7 * DAY_MS });
    expect(weekSessionsOf([WEDNESDAY_SESSION, nextWeek, MONDAY_SESSION], NOW).map((s) => s.id)).toEqual([
      'sessions-monday',
      'sessions-wednesday',
    ]);
  });

  it('ignores a session from a different week', () => {
    expect(weekSessionsOf([session({ id: 'friday', status: 'scheduled', scheduledDate: FRIDAY + 7 * DAY_MS })], NOW)).toEqual([]);
  });
});

/* ------------------------------------------------------------------- numbers */

describe('derived numbers', () => {
  it('counts confirmed sets and prescribed sets separately', () => {
    expect(confirmedSetCount(MONDAY_SESSION)).toBe(5);
    expect(prescribedSets(MONDAY_SESSION)).toBe(5);
    expect(confirmedSetCount(WEDNESDAY_SESSION)).toBe(0);
    expect(prescribedSets(WEDNESDAY_SESSION)).toBe(5);
  });

  it('sums weight times repetitions over confirmed sets only', () => {
    // 90×10 + 90×10 + 90×8 + 120×12 + 120×12 = 5400
    expect(sessionVolumeKg(MONDAY_SESSION)).toBe(5400);
    expect(sessionVolumeKg(WEDNESDAY_SESSION)).toBe(0);
  });

  it('counts the sets that were actually hard', () => {
    expect(hardSetCount([MONDAY_SESSION])).toBe(3);
  });

  it('estimates a duration from what the prescriptions say, and rounds it', () => {
    expect(estimateMinutes([{ sets: 3, restSeconds: 120 }])).toBe(15);
    expect(estimateMinutes([])).toBe(0);
  });
});

/* --------------------------------------------------------------- the view */

describe('homeViewOf', () => {
  it('says the greeting and the date', () => {
    const view = homeViewOf(input());
    expect(view.greeting).toBe('Hola, Rup');
    expect(view.dateLine).toBe('Martes, 7 de noviembre');
  });

  it('offers to start the session of the day the week places today, which re-reads the store', () => {
    const view = homeViewOf(input({ recent: [WEDNESDAY_PREP], plan: SEED_PLAN }));
    expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
    expect(view.today?.detail).toContain('2 ejercicios');
    expect(view.today?.detail).toContain('aprox.');
    expect(view.today?.phase).toBe('Readaptación · semana 2 de 4');
    expect(view.today?.series).toBe('5 series');
    expect(view.today?.state).toBe('pending');
    expect(view.action).toEqual({
      kind: 'start',
      label: 'Empezar entrenamiento',
      sessionId: null,
    });
  });

  it('offers to continue the session that is already open', () => {
    const open = session({
      id: 'open',
      status: 'inProgress',
      scheduledDate: NOW,
      startedAt: NOW,
      planDayId: 'seed-day-fisico',
    });
    const view = homeViewOf(
      input({ recent: [open, MONDAY_SESSION], inProgress: open, plan: SEED_PLAN }),
    );
    expect(view.today?.state).toBe('inProgress');
    expect(view.action).toEqual({ kind: 'resume', label: 'Continuar entrenamiento', sessionId: 'open' });
  });

  it('says the session is done instead of offering to start it again', () => {
    const done = session({
      id: 'done',
      status: 'completed',
      scheduledDate: NOW,
      endedAt: NOW,
      planDayId: 'seed-day-fisico',
      exercises: WEDNESDAY_PREP.exercises,
    });
    const view = homeViewOf(input({ recent: [done, MONDAY_SESSION], plan: SEED_PLAN }));
    expect(view.today?.state).toBe('done');
    expect(view.today?.done).toBe('Sesión completada hoy · 0 de 5 series.');
    expect(view.action).toEqual({ kind: 'summary', label: 'Ver el resumen', sessionId: 'done' });
    // The row of today reads the very same week the card does (T6).
    expect(view.agenda?.agenda.days.find((day) => day.today)?.done).toBe(true);
  });

  it('offers the day the week places today when nothing is scheduled today', () => {
    const last = session({
      id: 'last-lower',
      planDayId: 'day-lower',
      dayNameSnapshot: 'SENTADILLA / PIERNA',
      status: 'completed',
      scheduledDate: MONDAY,
    });
    const view = homeViewOf(input({ recent: [last], plan: SEED_PLAN }));

    expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
    expect(view.today?.state).toBe('preview');
    expect(view.today?.sessionId).toBeNull();
    expect(view.today?.series).toBe('2 series');
    expect(view.today?.detail).toContain('aprox.');
    expect(view.nothingToday).toBeNull();
    expect(view.action).toEqual({
      kind: 'start',
      label: 'Empezar entrenamiento',
      sessionId: null,
    });
  });

  it('offers the day the template places when the store has never trained', () => {
    const view = homeViewOf(input({ now: MONDAY, recent: [], plan: SEED_PLAN }));
    expect(view.today?.dayName).toBe('PIERNA');
    expect(view.today?.state).toBe('preview');
    expect(view.action?.kind).toBe('start');
  });

  it('says the day the week places has no exercises instead of inventing a session for it', () => {
    const emptyPrep = SEED_PLAN.map((day) =>
      day.id === 'seed-day-fisico' ? { ...day, items: [] } : day,
    );
    const view = homeViewOf(input({ recent: [MONDAY_SESSION], plan: emptyPrep }));

    expect(view.today).toBeNull();
    expect(view.nothingToday).toBe('emptyDay');
    expect(view.action).toBeNull();
    // The week still names the day it carries: the card is the empty one, not the row.
    // The mobility day is Tuesday in a league week since `odd/tasks/leg-separation.md` S2.
    expect(view.agenda?.agenda.days[1]?.planDay?.name).toBe('PREPARACIÓN FÚTBOL');
  });

  describe('the week the rows read (T3, T4, T6)', () => {
    const LEAGUE_WEEK: WeekRecord = { ...NO_MATCH_WEEK, match: 'league' };
    const CUP_WEEK: WeekRecord = { ...NO_MATCH_WEEK, match: 'cup' };

    /** A saved placement, written as the seven weekdays read. */
    function layoutWith(days: readonly (string | null)[]): WeekLayout {
      return { slots: days.map((planDayId, weekday) => ({ weekday, planDayId })) };
    }

    /** A saved placement, saved under this fixture and different from its template. */
    const SAVED_LAYOUT = layoutWith([
      'seed-day-leg',
      'seed-day-torso-a',
      'seed-day-torso-b',
      null,
      'seed-day-fisico',
      null,
      null,
    ]);

    /** Every seeded day with the weekday it holds this week, so a wrong one names itself. */
    function placedOf(view: HomeView): readonly string[] {
      return (view.agenda?.agenda.planDays ?? []).map(
        (entry) => `${entry.planDay.name}@${String(entry.weekday)}`,
      );
    }

    it('T4 takes today from the week instead of the rotation (S5)', () => {
      const view = homeViewOf(input({ recent: [], plan: SEED_PLAN, week: NO_MATCH_WEEK }));
      // A week without a fixture: Wednesday is the football preparation day.
      expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
      expect(view.today?.state).toBe('preview');
      expect(view.today?.series).toBe('2 series');
      expect(view.nothingToday).toBeNull();
    });

    it('T4 draws the template when the store has no week record', () => {
      const view = homeViewOf(input({ recent: [], plan: SEED_PLAN, week: undefined }));
      // With no record the fixture is `none`, and its template still places a day on
      // Wednesday: the card reads the week the rows read, never the rotation.
      expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
      expect(view.today?.state).toBe('preview');
    });

    it('T3 ignores a record from another week and reads this one', () => {
      // Last week was the cup: read here, its Tuesday match would make Wednesday TORSO A.
      const lastWeek: WeekRecord = { ...NO_MATCH_WEEK, monday: '2023-11-13', match: 'cup' };
      const view = homeViewOf(input({ recent: [], plan: SEED_PLAN, week: lastWeek }));
      expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
    });

    it('says a saved placement under another fixture displaces nothing (S2)', () => {
      // The league week has no saved layout; the cup week is handed the league's one, which
      // puts TORSO A on the day the cup match takes. Read, it left the day without a
      // weekday; derived, the four days still land Monday to Friday.
      const view = homeViewOf(
        input({ recent: [], plan: SEED_PLAN, week: CUP_WEEK, weekLayout: SAVED_LAYOUT }),
      );

      expect(view.agenda?.agenda.days[1]?.kind).toBe('match');
      expect(placedOf(view)).toEqual([
        'PIERNA@2',
        'TORSO A@0',
        'TORSO B@4',
        'PREPARACIÓN FÚTBOL@3',
      ]);
      expect(view.agenda?.agenda.planDays.filter((entry) => entry.weekday === null)).toEqual([]);
    });

    it('derives the week from the template even when the store holds a saved layout (S2)', () => {
      const view = homeViewOf(
        input({ recent: [], plan: SEED_PLAN, week: LEAGUE_WEEK, weekLayout: SAVED_LAYOUT }),
      );

      // The owner chose a week that is always derived: the template answers, and today is
      // the day it places on Tuesday whatever the record says.
      expect(placedOf(view)).toEqual([
        'PIERNA@0',
        'TORSO A@2',
        'TORSO B@4',
        'PREPARACIÓN FÚTBOL@1',
      ]);
      expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
      expect(view.today?.state).toBe('preview');
      expect(view.action?.kind).toBe('start');
    });

    it('places the four days Monday to Friday in all three fixtures (S3)', () => {
      const expected = [
        ['league', ['PIERNA@0', 'TORSO A@2', 'TORSO B@4', 'PREPARACIÓN FÚTBOL@1']],
        ['cup', ['PIERNA@2', 'TORSO A@0', 'TORSO B@4', 'PREPARACIÓN FÚTBOL@3']],
        ['none', ['PIERNA@0', 'TORSO A@2', 'TORSO B@4', 'PREPARACIÓN FÚTBOL@1']],
      ] as const;

      for (const [match, placed] of expected) {
        const view = homeViewOf(
          input({ recent: [], plan: SEED_PLAN, week: { ...NO_MATCH_WEEK, match } }),
        );
        expect(placedOf(view), match).toEqual(placed);
        // No plan day is left without a weekday, and none lands on the weekend.
        expect(view.agenda?.agenda.planDays.every((entry) => entry.weekday !== null)).toBe(true);
      }
    });

    it('does not let a legacy exchange in the week record bend the card (S4)', () => {
      // `WeekRecord.swaps` belonged to the exchange T5 replaced: the layout decides now,
      // and an old swap left in the record must not move a day the owner never moved.
      const view = homeViewOf(
        input({
          recent: [],
          plan: SEED_PLAN,
          week: { ...LEAGUE_WEEK, swaps: [{ from: 2, to: 0 }] },
        }),
      );
      expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
    });

    it('does not hand today’s card to a stored row of another plan day (S2)', () => {
      const stale = session({
        id: 'stale',
        status: 'scheduled',
        scheduledDate: NOW,
        startedAt: null,
        endedAt: null,
        planDayId: 'seed-day-leg',
      });
      const view = homeViewOf(
        input({ recent: [stale], plan: SEED_PLAN, week: LEAGUE_WEEK, weekLayout: SAVED_LAYOUT }),
      );

      // Wednesday carries the preparation day, so the legs stored for today are not the
      // card: the week answers what the day is, and the row still holds its own session.
      expect(view.today?.dayName).toBe('PREPARACIÓN FÚTBOL');
      expect(view.today?.state).toBe('preview');
    });

    it('says when a day was trained when it was closed on another weekday (S6)', () => {
      const closed = session({
        id: 'closed',
        status: 'completed',
        scheduledDate: MONDAY,
        endedAt: MONDAY,
        planDayId: 'seed-day-fisico',
        exercises: WEDNESDAY_PREP.exercises,
      });
      const view = homeViewOf(input({ recent: [closed], plan: SEED_PLAN, week: LEAGUE_WEEK }));

      expect(view.today?.state).toBe('done');
      expect(view.today?.done).toBe('Sesión completada el lunes · 0 de 5 series.');
      expect(view.action).toEqual({ kind: 'summary', label: 'Ver el resumen', sessionId: 'closed' });
    });

    it('T3 does not hand the rotation the day of the match (S11)', () => {
      // Thursday in a league week is the match: the week answers, and nothing offers a
      // strength day instead of it.
      const view = homeViewOf(
        input({ now: THURSDAY, recent: [], plan: SEED_PLAN, week: LEAGUE_WEEK }),
      );
      expect(view.today).toBeNull();
    });
  });

  describe('the layout the week draws (S2)', () => {
    it('is the fixture’s template, whatever placement the store holds', () => {
      const saved: WeekLayout = {
        slots: ['seed-day-fisico', null, null, null, null, null, null].map(
          (planDayId, weekday) => ({ weekday, planDayId }),
        ),
      };

      // A placement saved under another fixture used to displace days. The layout is read
      // from the fixture now, so the record changes nothing in either week.
      expect(layoutOf(input({ plan: SEED_PLAN, week: NO_MATCH_WEEK, weekLayout: saved }))).toEqual(
        defaultLayoutOf({ matchKind: 'none', plan: SEED_PLAN }),
      );
      expect(
        layoutOf(input({ plan: SEED_PLAN, week: { ...NO_MATCH_WEEK, match: 'cup' }, weekLayout: saved })),
      ).toEqual(defaultLayoutOf({ matchKind: 'cup', plan: SEED_PLAN }));
      // And with no record at all the same template answers.
      expect(layoutOf(input({ plan: SEED_PLAN, week: undefined }))).toEqual(
        defaultLayoutOf({ matchKind: 'none', plan: SEED_PLAN }),
      );
    });
  });

  it('does not dress an empty store up as a first session', () => {
    const view = homeViewOf(input({ recent: [], plan: [] }));
    expect(view.today).toBeNull();
    expect(view.nothingToday).toBe('noPlan');
    expect(view.hasHistory).toBe(false);
    expect(view.last).toBeNull();
    // No plan, no week to date: the agenda is absent, not empty (T4).
    expect(view.agenda).toBeNull();
    expect(view.weight).toBeNull();
  });

  it('summarises the last finished session in kilos, minutes and sets', () => {
    const view = homeViewOf(input());
    expect(view.last).toEqual({
      label: 'Última sesión · lunes',
      dayName: 'SENTADILLA / PIERNA',
      detail: '52 min · 5 de 5 series',
      volume: '5.400',
    });
  });

  it('states the last session in one line of kilograms, and draws nothing without one (T9)', () => {
    // The only number S12 keeps on Inicio: one line, the day and its volume in kilos.
    expect(lastVolumeLineOf(homeViewOf(input()).last)).toBe(
      'Última: SENTADILLA / PIERNA · 5.400 kg',
    );
    // No closed session, no line: the screen must not dress a zero as a measurement.
    expect(lastVolumeLineOf(homeViewOf(input({ recent: [] })).last)).toBeNull();
    expect(lastVolumeLineOf(null)).toBeNull();
  });

  it('writes the seven-day mean and the weigh-ins behind it', () => {
    const view = homeViewOf(input({ measurements: WEIGHTS }));
    expect(view.weight?.value).toBe('79,8');
    expect(view.weight?.caption).toBe('media 7 días · 5 pesajes');
    expect(view.weight?.series).toEqual([80.4, 80.1, 79.6, 79.5, 79.4]);
  });

  it('shows a single weigh-in without pretending it is a trend', () => {
    const view = homeViewOf(input({ measurements: [measurement('only', NOW - DAY_MS, 80)] }));
    expect(view.weight?.value).toBe('80');
    expect(view.weight?.caption).toBe('media 7 días · 1 pesaje');
    expect(view.weight?.series).toHaveLength(1);
  });

  it('ignores weigh-ins outside the window instead of reporting an old mean as today’s', () => {
    const view = homeViewOf(input({ measurements: [measurement('old', NOW - 30 * DAY_MS, 84)] }));
    expect(view.weight).toBeNull();
  });

  it('states that there is nothing recorded, without inventing an activity', () => {
    expect(homeViewOf(input()).activity).toEqual({ recorded: [], imported: 0, empty: true });
  });

  it('names a manually recorded football match as such, with its date and duration', () => {
    const view = homeViewOf(
      input({
        activities: [
          {
            id: 'football-1',
            date: NOW,
            kind: 'other',
            durationSeconds: 50 * 60,
            activeEnergyKcal: null,
            provenance: 'manual',
            externalSampleId: null,
          },
        ],
      }),
    );

    expect(view.activity.empty).toBe(false);
    expect(view.activity.recorded).toEqual([
      {
        id: 'football-1',
        label: 'Fútbol registrado',
        detail: '7 nov · 50 min',
        // The bin carries no visible text, so its name says which row it deletes (§9).
        removeLabel: 'Eliminar fútbol del 7 de noviembre',
      },
    ]);
    // Nothing was imported, so the old wording must not appear at all.
    expect(view.activity.imported).toBe(0);
  });

  it('keeps the manual rows and the imported count apart, newest manual first', () => {
    const view = homeViewOf(
      input({
        activities: [
          {
            id: 'football-old',
            date: NOW - 7 * DAY_MS,
            kind: 'other',
            durationSeconds: 50 * 60,
            activeEnergyKcal: null,
            provenance: 'manual',
            externalSampleId: null,
          },
          {
            id: 'imported-1',
            date: NOW,
            kind: 'cardio',
            durationSeconds: 1800,
            activeEnergyKcal: 210,
            provenance: 'imported',
            externalSampleId: 'x',
          },
          {
            id: 'football-new',
            date: NOW - DAY_MS,
            kind: 'other',
            durationSeconds: 50 * 60,
            activeEnergyKcal: null,
            provenance: 'manual',
            externalSampleId: null,
          },
        ],
      }),
    );

    expect(view.activity.recorded.map((row) => row.id)).toEqual(['football-new', 'football-old']);
    expect(view.activity.imported).toBe(1);
  });

  it('leaves the week exactly as it was when an activity exists', () => {
    const withoutActivity = homeViewOf(input({ plan: SEED_PLAN }));
    const football = {
      id: 'football-1',
      date: NOW,
      kind: 'other' as const,
      durationSeconds: 50 * 60,
      activeEnergyKcal: null,
      provenance: 'manual' as const,
      externalSampleId: null,
    };

    // Today, the day it names, its numbers and the action are all the week's answer, and
    // no derivation of the week reads an activity.
    const withActivity = homeViewOf(input({ plan: SEED_PLAN, activities: [football] }));
    expect(withActivity.today).toEqual(withoutActivity.today);
    expect(withActivity.action).toEqual(withoutActivity.action);
    expect(withActivity.agenda).toEqual(withoutActivity.agenda);
    expect(withActivity.last).toEqual(withoutActivity.last);

    // And the same happens the other way round: deleting the row puts the screen back
    // exactly where it was, so the card and the week never saw it.
    const afterDelete = homeViewOf(input({ plan: SEED_PLAN, activities: [] }));
    expect(afterDelete.today).toEqual(withActivity.today);
    expect(afterDelete.action).toEqual(withActivity.action);
    expect(afterDelete.agenda?.agenda.doneCount).toBe(withActivity.agenda?.agenda.doneCount);
    expect(afterDelete.activity.recorded).toEqual([]);

    // And a match recorded on a day with no session does not become one: the week still
    // previews the day it places, and `doneCount` still counts sessions only.
    const restDay = homeViewOf(input({ recent: [], plan: SEED_PLAN, activities: [football] }));
    expect(restDay.today?.state).toBe('preview');
    expect(restDay.action?.kind).toBe('start');
    expect(restDay.hasHistory).toBe(false);
    expect(restDay.agenda?.agenda.doneCount).toBe(0);
  });

  it('carries only the eviction notice: the install advisory left Inicio (S2, S5)', () => {
    // Perfil keeps the advisory; Inicio stopped explaining the platform, so the notice
    // carries the one thing this screen still has to say — that data was lost.
    expect(homeViewOf(input()).notice).toEqual({ evicted: false, lastExport: null });
  });

  it('shows the eviction state only when the store says data was lost', () => {
    expect(homeViewOf(input()).notice.evicted).toBe(false);
    const lost = homeViewOf(input({ recent: [], plan: [], lostData: true, lastExportAt: MONDAY }));
    expect(lost.notice.evicted).toBe(true);
    expect(lost.notice.lastExport).toBe('6 nov');
  });
});
