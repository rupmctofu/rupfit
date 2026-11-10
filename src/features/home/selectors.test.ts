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
  WorkoutSession,
} from '../../storage';
import { EFFORT } from '../../core/domain';
import {
  estimateMinutes,
  hardSetCount,
  homeViewOf,
  prescribedSets,
  sessionVolumeKg,
  startOfWeek,
  todaySessionOf,
  weekSessionsOf,
  confirmedSetCount,
  type HomeInput,
} from './selectors';

/* ------------------------------------------------------------------ fixtures */

/** Wednesday 8 November 2023, 18:00 local. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();
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
    installed: true,
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
    expect(view.dateLine).toBe('Miércoles, 8 de noviembre');
  });

  it('offers to start the session scheduled for today, which re-reads the store', () => {
    const view = homeViewOf(input());
    expect(view.today?.dayName).toBe('PESO MUERTO / TRACCIÓN');
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
    const open = session({ id: 'open', status: 'inProgress', scheduledDate: NOW });
    const view = homeViewOf(input({ recent: [open, MONDAY_SESSION], inProgress: open }));
    expect(view.today?.state).toBe('inProgress');
    expect(view.action).toEqual({ kind: 'resume', label: 'Continuar entrenamiento', sessionId: 'open' });
  });

  it('says the session is done instead of offering to start it again', () => {
    const done = session({
      id: 'done',
      status: 'completed',
      scheduledDate: NOW,
      endedAt: NOW,
      exercises: WEDNESDAY_SESSION.exercises,
    });
    const view = homeViewOf(input({ recent: [done, MONDAY_SESSION] }));
    expect(view.today?.state).toBe('done');
    expect(view.today?.done).toBe('Sesión completada hoy · 0 de 5 series.');
    expect(view.action).toEqual({ kind: 'summary', label: 'Ver el resumen', sessionId: 'done' });
    expect(view.week?.cells.find((cell) => cell.state === 'today')?.initial).toBe('MIÉ');
  });

  it('offers the next day of the rotation when nothing is scheduled today', () => {
    const last = session({
      id: 'last-lower',
      planDayId: 'day-lower',
      dayNameSnapshot: 'SENTADILLA / PIERNA',
      status: 'completed',
      scheduledDate: MONDAY,
    });
    const view = homeViewOf(input({ recent: [last], plan: STARTER_PLAN }));

    expect(view.today?.dayName).toBe('PESO MUERTO / TRACCIÓN');
    expect(view.today?.state).toBe('preview');
    expect(view.today?.sessionId).toBeNull();
    expect(view.today?.series).toBe('5 series');
    expect(view.today?.detail).toContain('aprox.');
    expect(view.nothingToday).toBeNull();
    expect(view.action).toEqual({
      kind: 'start',
      label: 'Empezar entrenamiento',
      sessionId: null,
    });
  });

  it('offers the first day of the rotation on a store that has never trained', () => {
    const view = homeViewOf(input({ recent: [], plan: STARTER_PLAN }));
    expect(view.today?.dayName).toBe('SENTADILLA / PIERNA');
    expect(view.today?.state).toBe('preview');
    expect(view.action?.kind).toBe('start');
  });

  it('says the next day has no exercises instead of inventing a session for it', () => {
    const view = homeViewOf(input({ recent: [MONDAY_SESSION] }));
    expect(view.today).toBeNull();
    expect(view.nothingToday).toBe('emptyDay');
    expect(view.action).toBeNull();
  });

  it('does not dress an empty store up as a first session', () => {
    const view = homeViewOf(input({ recent: [], plan: [] }));
    expect(view.today).toBeNull();
    expect(view.nothingToday).toBe('noPlan');
    expect(view.hasHistory).toBe(false);
    expect(view.last).toBeNull();
    expect(view.week).toBeNull();
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

  it('builds the week indicator from the sessions that exist, not from the template', () => {
    const view = homeViewOf(input());
    expect(view.week?.cells).toEqual([
      { key: 'sessions-monday', initial: 'LUN', state: 'done', label: 'Lunes, hecha' },
      { key: 'sessions-wednesday', initial: 'MIÉ', state: 'today', label: 'Miércoles, hoy' },
    ]);
    // The header draws this arithmetic and nothing else: how many of the week's own
    // planned sessions are closed. The old `1 de 2 sesiones` sentence is gone.
    expect(view.week?.doneCount).toBe(1);
    expect(view.week?.plannedCount).toBe(2);
    expect(view.week?.hard).toBe('3 series duras');
  });

  it('names the week indicator for a screen reader, count and hard sets in one line', () => {
    expect(homeViewOf(input()).week?.label).toBe('1 de 2 sesiones hechas · 3 series duras');
    // One planned session: the line agrees in the singular instead of reading `1 de 1
    // sesiones hechas`.
    expect(homeViewOf(input({ recent: [MONDAY_SESSION] })).week?.label).toBe(
      '1 de 1 sesión hecha · 3 series duras',
    );
  });

  it('counts a four-session week as the indicator draws it, one segment per session', () => {
    const tuesday = session({ id: 'sessions-tuesday', status: 'completed', scheduledDate: TUESDAY });
    const thursday = session({
      id: 'sessions-thursday',
      status: 'scheduled',
      scheduledDate: THURSDAY,
      startedAt: null,
      endedAt: null,
    });
    const view = homeViewOf(
      input({ recent: [MONDAY_SESSION, tuesday, WEDNESDAY_SESSION, thursday] }),
    );

    // `2 de 4`: the two closed sessions of the week, out of the four it plans.
    expect(view.week?.plannedCount).toBe(4);
    expect(view.week?.doneCount).toBe(2);
    expect(view.week?.cells.map((cell) => cell.state)).toEqual([
      'done',
      'done',
      'today',
      'pending',
    ]);
    // The days a session was already trained on are what the segments fill, in order.
    expect(view.week?.cells.map((cell) => cell.initial)).toEqual(['LUN', 'MAR', 'MIÉ', 'JUE']);
  });

  it('fills every segment of a week that is completely trained', () => {
    const tuesday = session({ id: 'sessions-tuesday', status: 'completed', scheduledDate: TUESDAY });
    const doneToday = session({
      id: 'sessions-today',
      status: 'completed',
      scheduledDate: NOW,
      endedAt: NOW,
      exercises: WEDNESDAY_SESSION.exercises,
    });
    const view = homeViewOf(input({ recent: [MONDAY_SESSION, tuesday, doneToday] }));

    expect(view.week?.plannedCount).toBe(3);
    expect(view.week?.doneCount).toBe(view.week?.plannedCount);
  });

  it('counts the today session as a planned session before it is done', () => {
    // A scheduled row is planned and not closed: 1 of 2, never 1 of 1.
    expect(homeViewOf(input()).week?.doneCount).toBe(1);
    expect(homeViewOf(input()).week?.plannedCount).toBe(2);
    // A session of another week never enters the indicator.
    const nextWeek = session({
      id: 'next-week',
      status: 'scheduled',
      scheduledDate: NOW + 7 * DAY_MS,
      startedAt: null,
      endedAt: null,
    });
    expect(homeViewOf(input({ recent: [MONDAY_SESSION, nextWeek] })).week?.plannedCount).toBe(1);
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
        detail: '8 nov · 50 min',
        // The bin carries no visible text, so its name says which row it deletes (§9).
        removeLabel: 'Eliminar fútbol del 8 de noviembre',
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

  it('leaves the strength rotation exactly as it was when an activity exists', () => {
    const withoutActivity = homeViewOf(input());
    const football = {
      id: 'football-1',
      date: NOW,
      kind: 'other' as const,
      durationSeconds: 50 * 60,
      activeEnergyKcal: null,
      provenance: 'manual' as const,
      externalSampleId: null,
    };

    // Today, the day it names, its numbers and the action are all the session/plan
    // rotation's answer, and `nextPlanDay` never reads an activity.
    const withActivity = homeViewOf(input({ activities: [football] }));
    expect(withActivity.today).toEqual(withoutActivity.today);
    expect(withActivity.action).toEqual(withoutActivity.action);
    expect(withActivity.week).toEqual(withoutActivity.week);
    expect(withActivity.last).toEqual(withoutActivity.last);

    // And the same happens the other way round: deleting the row puts the screen back
    // exactly where it was, so the hero block and the rotation never saw it.
    const afterDelete = homeViewOf(input({ activities: [] }));
    expect(afterDelete.today).toEqual(withActivity.today);
    expect(afterDelete.action).toEqual(withActivity.action);
    expect(afterDelete.week?.doneCount).toBe(withActivity.week?.doneCount);
    expect(afterDelete.activity.recorded).toEqual([]);

    // And a match recorded on a day with no session does not become one: the rotation
    // still previews the next plan day, and the week indicator still counts sessions
    // only — from zero, because that is exactly the week the owner wants to see.
    const restDay = homeViewOf(input({ recent: [], activities: [football] }));
    expect(restDay.today?.state).toBe('preview');
    expect(restDay.action?.kind).toBe('start');
    expect(restDay.hasHistory).toBe(false);
    expect(restDay.week?.doneCount).toBe(0);
    expect(restDay.week?.plannedCount).toBeGreaterThan(0);
  });

  it('warns once about not being installed, and only when there is something to lose', () => {
    expect(homeViewOf(input({ installed: false })).notice.notInstalled).toBe(true);
    expect(homeViewOf(input({ installed: false, recent: [], plan: [], profile: undefined })).notice.notInstalled).toBe(false);
    expect(homeViewOf(input()).notice.notInstalled).toBe(false);
  });

  it('shows the eviction state only when the store says data was lost', () => {
    expect(homeViewOf(input()).notice.evicted).toBe(false);
    const lost = homeViewOf(input({ recent: [], plan: [], lostData: true, lastExportAt: MONDAY }));
    expect(lost.notice.evicted).toBe(true);
    expect(lost.notice.lastExport).toBe('6 nov');
  });
});
