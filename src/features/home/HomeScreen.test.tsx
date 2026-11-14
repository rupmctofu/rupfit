/**
 * Inicio renders — the states the screen must keep working in, checked as markup.
 *
 * The project has no DOM tests and no DOM environment: `renderToStaticMarkup` draws the
 * same tree the browser gets, so what is pinned here is the screen's *output* — the
 * words it still says, the words T3 took away (S2), and the glyphs that replaced them
 * (S3). Interactions are not faked; the football write is exercised through the fake
 * port, which is where it actually happens.
 *
 * Four states, because each one is a different branch of `HomeBody`: an empty store, a
 * session in progress, a recorded activity, and a store that came back empty (the one
 * banner Inicio still announces).
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlanDay, StoragePort, UserProfile, WeekRecord, WorkoutSession } from '../../storage';
import { createFakeStorage } from '../session/fake-port';
import { HomeBody, TodaySwapSheet, currentWeekOf, matchReportedOf, offDayOf, saveTodaySwap, saveWeekMatch } from './HomeScreen';
import { weekFixtureOf } from '../week/week';
import { demoWeek, demoPort, demoRestNow } from './demo';
import { homeViewOf, startOfDay, type HomeInput } from './selectors';
import { recordFootball, reportMatch } from './football';
import { NO_DELETION, type ActivityDeletionState } from './deletion';

/** Wednesday 8 November 2023, 18:00 local. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();
const MONDAY = new Date(2023, 10, 6, 18, 0, 0).getTime();
/** The other two days of the same week: the match (Thursday) and the rest (Saturday). */
const THURSDAY = new Date(2023, 10, 9, 18, 0, 0).getTime();
const SATURDAY = new Date(2023, 10, 11, 12, 0, 0).getTime();

const PROFILE: UserProfile = {
  id: 'profile-1',
  displayName: 'Rup',
  massUnit: 'kilograms',
  weightGoal: null,
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell'],
  autoStartRestTimer: true,
};

/** Two days that prescribe work: one is the day to start, one is the rotation's next. */
const PLAN: readonly PlanDay[] = [
  {
    id: 'day-lower',
    name: 'SENTADILLA / PIERNA',
    order: 0,
    items: [
      {
        id: 's1',
        planDayId: 'day-lower',
        order: 0,
        exerciseId: 'lib-1',
        exerciseNameSnapshot: 'Sentadilla',
        prescription: {
          sets: 3,
          repRange: { lowerBound: 8, upperBound: 10 },
          targetRIR: { lowerBound: 2, upperBound: 3 },
          restSeconds: 180,
        },
      },
    ],
  },
  {
    id: 'day-pull',
    name: 'PESO MUERTO / TRACCIÓN',
    order: 1,
    items: [
      {
        id: 's2',
        planDayId: 'day-pull',
        order: 0,
        exerciseId: 'lib-2',
        exerciseNameSnapshot: 'Peso muerto',
        prescription: {
          sets: 3,
          repRange: { lowerBound: 6, upperBound: 8 },
          targetRIR: { lowerBound: 2, upperBound: 3 },
          restSeconds: 180,
        },
      },
    ],
  },
];

/** One of the four seeded days (L5, L7), with one exercise so the card previews it. */
function seededDay(id: string, name: string, order: number): PlanDay {
  return {
    id,
    name,
    order,
    items: [
      {
        id: `${id}-item`,
        planDayId: id,
        order: 0,
        exerciseId: 'lib-1',
        exerciseNameSnapshot: 'Sentadilla',
        prescription: {
          sets: 3,
          repRange: { lowerBound: 8, upperBound: 10 },
          targetRIR: { lowerBound: 2, upperBound: 3 },
          restSeconds: 180,
        },
      },
    ],
  };
}

/** The plan of a real device: the four seeded days, named as `weekDaysOf` expects. */
const WEEK_PLAN: readonly PlanDay[] = [
  seededDay('seed-day-leg', 'PIERNA', 0),
  seededDay('seed-day-torso-a', 'TORSO A', 1),
  seededDay('seed-day-torso-b', 'TORSO B', 2),
  seededDay('seed-day-fisico', 'MOVILIDAD Y CORE', 3),
];

/** T3: the league week of the fixture, Thursday's match, no exchange yet. */
const LEAGUE_WEEK: WeekRecord = { monday: '2023-11-06', match: 'league', swaps: [] };

function session(
  overrides: Partial<WorkoutSession> & Pick<WorkoutSession, 'id' | 'status'>,
): WorkoutSession {
  return {
    id: overrides.id,
    planDayId: overrides.planDayId ?? 'day-lower',
    dayNameSnapshot: overrides.dayNameSnapshot ?? 'SENTADILLA / PIERNA',
    scheduledDate: overrides.scheduledDate ?? NOW,
    startedAt: overrides.startedAt ?? null,
    endedAt: overrides.endedAt ?? null,
    phase: overrides.phase ?? { kind: 'readaptation', week: 2 },
    status: overrides.status,
    exercises: overrides.exercises ?? [],
  };
}

function input(overrides: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW,
    profile: PROFILE,
    phaseState: { block: 2, passedBlocks: 1 },
    plan: PLAN,
    recent: [],
    inProgress: undefined,
    measurements: [],
    activities: [],
    lostData: false,
    lastExportAt: null,
    ...overrides,
  };
}

/** The bin's seam, idle: the app always hands the screen one, so the test does too. */
const DELETION: ActivityDeletionState = {
  ...NO_DELETION,
  ask: () => undefined,
  cancel: () => undefined,
  confirm: () => undefined,
};

/** The screen's markup for a fixture, with the actions a phone would have. */
function render(overrides: Partial<HomeInput> = {}): string {
  const fixture = input(overrides);
  return renderToStaticMarkup(
    <HomeBody
      view={homeViewOf(fixture)}
      offDay={offDayOf(fixture)}
      matchReported={matchReportedOf(fixture)}
      fixture={weekFixtureOf(fixture.week)}
      onStart={() => undefined}
      onRecordFootball={() => undefined}
      onReportMatch={() => undefined}
      onSwapToday={() => undefined}
      onFlipWeek={() => undefined}
      deletion={DELETION}
    />,
  );
}

/** A port holding only the week record: what `saveTodaySwap` and `currentWeekOf` use. */
function weekPort(record: WeekRecord | undefined): {
  readonly port: StoragePort;
  readonly writes: readonly WeekRecord[];
} {
  const writes: WeekRecord[] = [];
  let stored = record;
  const port = {
    meta: {
      readWeek: async (): Promise<WeekRecord | undefined> => stored,
      saveWeek: async (next: WeekRecord): Promise<void> => {
        writes.push(next);
        stored = next;
      },
    },
  } as unknown as StoragePort;
  return { port, writes };
}

describe('Inicio renders', () => {
  it('draws an empty store with its honest empty states, and no zero dressed as data', () => {
    const markup = render({ recent: [], plan: [], profile: undefined });

    expect(markup).toContain('Todavía no hay rutina ni sesiones programadas');
    expect(markup).toContain('Todavía no hay sesiones. La primera aparecerá aquí cuando la termines.');
    expect(markup).toContain('Todavía no hay actividad registrada. Esto no impide entrenar.');
    // The football capture is offered even when nothing has ever been recorded.
    expect(markup).toContain('Fútbol');
    expect(markup).toContain('Registrar');
  });

  it('draws the session in progress with the action that returns to its sets', () => {
    const open = session({ id: 'open', status: 'inProgress', startedAt: MONDAY });
    const markup = render({ recent: [open], inProgress: open });

    expect(markup).toContain('Continuar entrenamiento');
    // The card title is the day name, formatted for reading (`formatDayName`).
    expect(markup).toContain('Sentadilla / Pierna');
    expect(markup).not.toContain('Vista previa');
  });

  it('draws a recorded activity as a row, with the bin that names what it deletes', () => {
    const markup = render({
      recent: [session({ id: 'closed', status: 'completed', startedAt: MONDAY, endedAt: NOW })],
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
    });

    expect(markup).toContain('Fútbol registrado');
    expect(markup).toContain('8 nov · 50 min');
    // The bin shows a glyph and no word, so its accessible name has to do the talking.
    expect(markup).toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
  });

  it('keeps the banner that reports a real loss, and only that one', () => {
    const markup = render({
      recent: [session({ id: 'closed', status: 'completed', startedAt: MONDAY, endedAt: NOW })],
      lostData: true,
      lastExportAt: MONDAY,
    });

    expect(markup).toContain('Los datos guardados ya no están. Importa tu copia si la tienes.');
    expect(markup).toContain('La última copia que se exportó es del 6 nov.');
    expect(markup).toContain('Importar copia');
  });
});

describe('Inicio after the purge (S2, S3)', () => {
  it('no longer explains the platform: the install advisory left the screen', () => {
    const markup = render({
      recent: [session({ id: 'closed', status: 'completed', startedAt: MONDAY, endedAt: NOW })],
    });

    expect(markup).not.toContain('Guarda Rupfit en la pantalla de inicio');
    expect(markup).not.toContain('Añadir a pantalla de inicio');
  });

  it('drops the football prose and keeps the numbers in one compact row', () => {
    const markup = render();

    expect(markup).not.toContain('dos partes de 25');
    expect(markup).not.toContain('no cuenta como sesión ni cambia el orden de tus días de fuerza');
    // Glyph, word, duration as a figure, action: the row is all that is left.
    expect(markup).toContain('home__football');
    expect(markup).toContain('Fútbol');
    expect(markup).toContain('50');
    expect(markup).toContain('min');
    expect(markup).toContain('Registrar');
  });

  it('says a day is a preview in one chip instead of a sentence', () => {
    const markup = render();

    expect(markup).toContain('Vista previa');
    expect(markup).not.toContain('La sesión se crea al empezar.');
  });
});

describe('Inicio offers to change today (T5, S6, S9)', () => {
  it('offers the exchange of today, and the sheet lists each partner and its weekday', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // Wednesday of a league week holds the mobility and core day: that is today.
    expect(markup).toContain('Movilidad y core');
    expect(markup).toContain('Cambiar el entreno de hoy');

    const swap = homeViewOf(input({ plan: WEEK_PLAN, week: LEAGUE_WEEK })).today?.swap;
    if (swap === null || swap === undefined) throw new Error('the week offered no exchange');

    const sheet = renderToStaticMarkup(
      <TodaySwapSheet swap={swap} onChoose={() => undefined} onClose={() => undefined} />,
    );

    // The sheet pattern of the app, not a second one (`train-sheet`, RoutineEditor).
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain('aria-modal="true"');
    expect(sheet).toContain('¿Qué toca hoy?');
    // One row per partner: the day and its weekday, and where today's day lands (S9).
    expect(sheet).toContain('Torso A');
    expect(sheet).toContain('Martes');
    expect(sheet).toContain('Se mueve a Martes');
  });

  it('writes the chosen exchange and the card then shows the exchanged week', async () => {
    const { port, writes } = weekPort(LEAGUE_WEEK);
    const swap = homeViewOf(input({ plan: WEEK_PLAN, week: LEAGUE_WEEK })).today?.swap;
    const monday = swap?.options.find((option) => option.weekday === 'Lunes');
    if (monday === undefined) throw new Error('Monday was not offered as an exchange');

    expect(await saveTodaySwap(port, monday.swap)).toBe(true);
    // Wednesday and Monday trade places: the record is the week's only memory (T5).
    expect(writes).toEqual([{ ...LEAGUE_WEEK, swaps: [{ from: 2, to: 0 }] }]);

    const markup = render({ plan: WEEK_PLAN, week: writes[0] });
    expect(markup).toContain('Pierna');
    // The mobility day left Wednesday: the card shows the exchanged week, not both days.
    expect(markup).not.toContain('Movilidad y core');
    // The exchanged week still offers the way back, so nothing was locked in.
    expect(markup).toContain('Cambiar el entreno de hoy');
  });

  it('keeps an exchange of other weekdays instead of losing it', async () => {
    const { port, writes } = weekPort({ ...LEAGUE_WEEK, swaps: [{ from: 0, to: 1 }] });

    expect(await saveTodaySwap(port, { from: 2, to: 4 })).toBe(true);
    // Monday and Tuesday were already exchanged, and Wednesday and Friday move no
    // weekday twice, so the engine can hold both (applySwaps, week-plan.ts).
    expect(writes.map((record) => record.swaps)).toEqual([
      [
        { from: 0, to: 1 },
        { from: 2, to: 4 },
      ],
    ]);
  });

  it('writes nothing when the store has no week to change, and renders as before', async () => {
    const { port, writes } = weekPort(undefined);
    const fixture = input({ plan: WEEK_PLAN });
    const markup = render({ plan: WEEK_PLAN });

    expect(await saveTodaySwap(port, { from: 2, to: 0 })).toBe(false);
    expect(writes).toEqual([]);
    // No record: the rotation answers, and nothing of the week shows (S5).
    expect(offDayOf(fixture)).toBeNull();
    expect(markup).toContain('Vista previa');
    expect(markup).not.toContain('Cambiar el entreno de hoy');
    expect(markup).not.toContain('Hoy es el día del partido');
    expect(markup).not.toContain('Hoy descansas');
    // T3: no record, no fixture to name and no action to flip one.
    expect(markup).not.toContain('Liga · jueves');
    expect(markup).not.toContain('Esta semana jugamos copa');
  });
});

describe('the match day and the rest day have their own state (T8, S1, S12)', () => {
  it('says the match is today instead of «no exercises», and offers nothing', () => {
    const markup = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(markup).toContain('Hoy es el día del partido');
    expect(markup).not.toContain('El siguiente día de tu rutina todavía no tiene ejercicios');
    expect(markup).not.toContain('Empezar entrenamiento');
    expect(markup).not.toContain('Cambiar el entreno de hoy');
  });

  it('says today is rest on Saturday, and does not borrow the empty-day sentence either', () => {
    const markup = render({ now: SATURDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(markup).toContain('Hoy descansas');
    expect(markup).not.toContain('El siguiente día de tu rutina todavía no tiene ejercicios');
    expect(markup).not.toContain('Empezar entrenamiento');
    // T8: a rest day has nothing to report, so the match's action is not offered on it.
    expect(markup).not.toContain('Informar el partido');
    // A training day of the same week is not an off day, in the league and in the cup.
    expect(offDayOf(input({ plan: WEEK_PLAN, week: LEAGUE_WEEK }))).toBeNull();
    expect(offDayOf(input({ plan: WEEK_PLAN, week: { ...LEAGUE_WEEK, match: 'cup' } }))).toBeNull();
  });
});

describe('the match is reported, never trained (T8, S1)', () => {
  const matchClock = { now: () => THURSDAY };
  const report = (storage: StoragePort, id: string) => ({ storage, clock: matchClock, newId: () => id });

  it('offers the report on the match day, and no way to start a training', () => {
    const markup = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(markup).toContain('Hoy es el día del partido');
    // S1: the fifth day of the week is informed, in the owner's words.
    expect(markup).toContain('Informar el partido');
    expect(markup).not.toContain('Empezar entrenamiento');
  });

  it('writes exactly one activity, and the card then shows the day is done', async () => {
    const storage = createFakeStorage();

    expect(await reportMatch(report(storage, 'match-1'))).toBe('saved');

    const activities = await storage.activities.all();
    expect(activities).toHaveLength(1);
    // The row the app already writes for football: same kind, same duration, same shape.
    expect(activities[0]).toMatchObject({
      id: 'match-1',
      date: startOfDay(THURSDAY),
      kind: 'other',
      durationSeconds: 50 * 60,
      provenance: 'manual',
    });
    // And no session: a match is reported with an activity (T8).
    expect(storage.calls.filter((call) => call.startsWith('sessions.'))).toEqual([]);

    const markup = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK, activities });
    expect(markup).toContain('Partido informado');
    expect(markup).not.toContain('Informar el partido');
  });

  it('writes nothing on a second attempt, and the week keeps saying it is done', async () => {
    const storage = createFakeStorage();
    expect(await reportMatch(report(storage, 'match-1'))).toBe('saved');
    const activities = await storage.activities.all();

    // The week reads the row instead of keeping a flag, so a second visit offers nothing.
    const week = { now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK, activities };
    expect(matchReportedOf(input(week))).toBe(true);
    // And a write that arrives anyway finds the day reported and adds no second row.
    expect(await reportMatch(report(storage, 'match-2'))).toBe('already');
    expect(await storage.activities.all()).toHaveLength(1);
  });

  it('does not take a football activity from another day for the match of this week', async () => {
    const storage = createFakeStorage();
    // Today is Wednesday and the match is Thursday: the loose row is not this week's match.
    expect(await reportMatch({ storage, clock: { now: () => NOW }, newId: () => 'football-1' })).toBe(
      'saved',
    );
    const activities = await storage.activities.all();

    const week = { now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK, activities };
    expect(matchReportedOf(input(week))).toBe(false);
    const markup = render(week);
    expect(markup).toContain('Informar el partido');
    expect(markup).not.toContain('Partido informado');

    // The other day kept its own row, and Thursday still gets its own: one match a week.
    expect(await reportMatch(report(storage, 'match-1'))).toBe('saved');
    expect(await storage.activities.all()).toHaveLength(2);
  });
});

describe('the current week gets its record on its own (S11, L5)', () => {
  it('writes exactly one record for this week when the store has none, and the control shows', async () => {
    const { port, writes } = weekPort(undefined);
    const expected: WeekRecord = { monday: '2023-11-06', match: 'league', swaps: [] };

    // The league is every Thursday and the cup is the exception (L5), so a week nobody
    // has touched starts as a league week with no exchange (S11).
    expect(await currentWeekOf(port, NOW)).toEqual(expected);
    expect(writes).toEqual([expected]);

    // A reload must not add a second record, and the record is what buys the control.
    expect(await currentWeekOf(port, NOW)).toEqual(expected);
    expect(writes).toHaveLength(1);
    expect(render({ plan: WEEK_PLAN, week: expected })).toContain('Cambiar el entreno de hoy');
  });

  it('leaves a record of this week alone, the swaps included', async () => {
    const swapped: WeekRecord = { ...LEAGUE_WEEK, swaps: [{ from: 2, to: 0 }] };
    const { port, writes } = weekPort(swapped);

    expect(await currentWeekOf(port, NOW)).toBe(swapped);
    expect(writes).toEqual([]);
  });

  it('replaces a record from last week, because a new week starts from its template', async () => {
    const lastWeek: WeekRecord = { ...LEAGUE_WEEK, monday: '2023-10-30', swaps: [{ from: 0, to: 1 }] };
    const { port, writes } = weekPort(lastWeek);

    expect(await currentWeekOf(port, NOW)).toEqual(LEAGUE_WEEK);
    expect(writes).toEqual([LEAGUE_WEEK]);
  });

  it('lets the rotation answer when the record cannot be written', async () => {
    const failing = {
      meta: {
        readWeek: async (): Promise<WeekRecord | undefined> => undefined,
        saveWeek: async (): Promise<void> => Promise.reject(new Error('denied')),
      },
    } as unknown as StoragePort;

    // S5: the screen is not a place where a storage failure shows. Without a record the
    // rotation names the day, exactly as it did before the week existed.
    expect(await currentWeekOf(failing, NOW)).toBeUndefined();
    expect(render({ plan: WEEK_PLAN })).not.toContain('Cambiar el entreno de hoy');
  });
});

describe('the demo can show the exchange (?demo=inicio)', () => {
  it('has this week’s record and the four days the week needs, so the control appears', async () => {
    // The scenario a reviewer opens for this state: `Sin sesión hoy`, the Wednesday the
    // week names and no session backs.
    const now = demoRestNow(NOW);
    const fixture = demoWeek('rest', now);
    const week = await demoPort(fixture).meta.readWeek();

    expect(week?.monday).toBe('2023-11-06');
    const view = homeViewOf(input({ now, plan: fixture.plan, recent: fixture.sessions, week }));
    expect(view.today?.swap?.label).toBe('Cambiar el entreno de hoy');
  });
});

describe('the week says which fixture it has (T3, S7, S11)', () => {
  it('names the fixture of the week on the card, in the owner’s words', () => {
    const league = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(league).toContain('Liga · jueves');
    // One quiet action next to it, naming the other fixture (S7).
    expect(league).toContain('Esta semana jugamos copa');
    expect(league).not.toContain('Copa · martes');

    const cup = render({ plan: WEEK_PLAN, week: { ...LEAGUE_WEEK, match: 'cup' } });
    expect(cup).toContain('Copa · martes');
    expect(cup).toContain('Esta semana jugamos liga');
    expect(cup).not.toContain('Liga · jueves');
  });

  it('says nothing about a match in a week with no fixture', () => {
    const markup = render({ plan: WEEK_PLAN, week: { ...LEAGUE_WEEK, match: 'none' } });
    expect(markup).not.toContain('Liga · jueves');
    expect(markup).not.toContain('Copa · martes');
    // The way to declare one is still there, so the owner is never stuck.
    expect(markup).toContain('Esta semana jugamos copa');
  });

  it('flipping to the cup writes the fixture and clears the exchanges of the other layout', async () => {
    const { port, writes } = weekPort({ ...LEAGUE_WEEK, swaps: [{ from: 2, to: 0 }] });

    expect(await saveWeekMatch(port, NOW, 'cup')).toBe(true);
    // The swap traded Monday and Wednesday of a league week; in a cup week those weekdays
    // hold other days, so the list goes with the layout it was made on (T5, L7).
    expect(writes).toEqual([{ monday: '2023-11-06', match: 'cup', swaps: [] }]);

    // The card the re-read draws is the cup week: today is the upper body, not the
    // mobility day the league layout puts on Wednesday.
    const markup = render({ plan: WEEK_PLAN, week: writes[0] });
    expect(markup).toContain('Copa · martes');
    expect(markup).toContain('Torso A');
    expect(markup).not.toContain('Movilidad y core');
  });

  it('restructures the week: a Thursday after the flip trains instead of hosting the match', async () => {
    const { port, writes } = weekPort(LEAGUE_WEEK);
    expect(await saveWeekMatch(port, NOW, 'cup')).toBe(true);

    const before = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(before).toContain('Hoy es el día del partido');

    // L7: the cup match is Tuesday, so Thursday is the leg day of that layout.
    const after = render({ now: THURSDAY, plan: WEEK_PLAN, week: writes[0] });
    expect(after).toContain('Pierna');
    expect(after).not.toContain('Hoy es el día del partido');
    expect(after).toContain('Copa · martes');
  });

  it('flipping back restores the league layout, on Wednesday and on Thursday', async () => {
    const cupWeek: WeekRecord = { ...LEAGUE_WEEK, match: 'cup' };
    const { port, writes } = weekPort(cupWeek);

    expect(await saveWeekMatch(port, NOW, 'league')).toBe(true);
    expect(writes).toEqual([LEAGUE_WEEK]);

    // Today, Wednesday: the cup week's upper body gives way to the mobility day.
    expect(render({ plan: WEEK_PLAN, week: cupWeek })).toContain('Torso A');
    const today = render({ plan: WEEK_PLAN, week: writes[0] });
    expect(today).toContain('Movilidad y core');
    expect(today).toContain('Liga · jueves');

    // Thursday: the league match takes the day the cup week trained the legs on.
    const thursday = render({ now: THURSDAY, plan: WEEK_PLAN, week: writes[0] });
    expect(thursday).toContain('Hoy es el día del partido');
    expect(thursday).not.toContain('Pierna');
  });

  it('leaves the league layout on the card when the write fails, never half a cup week', async () => {
    const failing: StoragePort = {
      meta: {
        readWeek: async (): Promise<WeekRecord | undefined> => LEAGUE_WEEK,
        saveWeek: async (): Promise<void> => Promise.reject(new Error('denied')),
      },
    } as unknown as StoragePort;

    expect(await saveWeekMatch(failing, NOW, 'cup')).toBe(false);

    // S7: a write that did not happen re-reads nothing, so the card keeps the week it was
    // drawn from — the league day for today, not the cup's day with the league's numbers.
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(markup).toContain('Liga · jueves');
    expect(markup).toContain('Movilidad y core');
    expect(markup).not.toContain('Copa · martes');
  });
});

describe('the football row writes through the port', () => {
  it('reaches the screen as a recorded activity, without touching sessions', async () => {
    const storage = createFakeStorage();
    const outcome = await recordFootball({
      storage,
      clock: { now: () => NOW },
      newId: () => 'football-1',
    });
    const activities = await storage.activities.all();

    expect(outcome).toBe('saved');
    expect(storage.calls.filter((call) => call.startsWith('sessions.'))).toEqual([]);

    const markup = renderToStaticMarkup(
      <HomeBody
        view={homeViewOf(input({ activities }))}
        onStart={() => undefined}
        onRecordFootball={() => undefined}
        deletion={DELETION}
      />,
    );

    // `Fútbol registrado` is what the row says a manual match is: the capture still
    // ends up somewhere the owner can see and delete (S5).
    expect(markup).toContain('Fútbol registrado');
    expect(markup).toContain('8 nov · 50 min');
    expect(markup).toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
  });
});
