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
import type {
  PlanDay,
  StoragePort,
  UserProfile,
  WeekLayout,
  WeekRecord,
  WorkoutSession,
} from '../../storage';
import { createFakeStorage } from '../session/fake-port';
import { HomeBody, currentWeekOf, matchReportedOf, offDayOf, saveWeekMatch } from './HomeScreen';
import {
  AGENDA_HINT,
  AgendaRow,
  AgendaWeek,
  DaySheet,
  PLACEMENT_FAILED_COPY,
  agendaWeekViewOf,
  placementOf,
  startRequestOf,
  writePlacement,
} from './agenda';
import { defaultLayoutOf } from '../week/agenda';
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
  const view = homeViewOf(fixture);
  return renderToStaticMarkup(
    <HomeBody
      view={view}
      agendaWeek={agendaWeekViewOf(fixture, view.action)}
      offDay={offDayOf(fixture)}
      matchReported={matchReportedOf(fixture)}
      fixture={weekFixtureOf(fixture.week)}
      onStart={() => undefined}
      onRecordFootball={() => undefined}
      onReportMatch={() => undefined}
      onFlipWeek={() => undefined}
      onPlace={() => undefined}
      deletion={DELETION}
    />,
  );
}

/** One row of the agenda, from its `data-weekday` to the next row. */
function rowOf(markup: string, weekday: number): string {
  const found = markup
    .split('data-weekday="')
    .slice(1)
    .find((part) => part.startsWith(`${String(weekday)}"`));
  if (found === undefined) throw new Error(`the agenda drew no row for weekday ${String(weekday)}`);
  return found;
}

/**
 * A port holding only the owner's layout: the one write the agenda performs (T4).
 *
 * The session fake refuses `meta.saveWeekLayout` because the session screen never needs
 * it, so the write the drag makes gets its own small port here — the same shape
 * `weekPort` already has for the week record.
 */
function layoutPort(failing = false): {
  readonly port: StoragePort;
  readonly writes: readonly WeekLayout[];
} {
  const writes: WeekLayout[] = [];
  const port = {
    meta: {
      saveWeekLayout: async (layout: WeekLayout): Promise<void> => {
        if (failing) throw new Error('denied');
        writes.push(layout);
      },
    },
  } as unknown as StoragePort;
  return { port, writes };
}

/** A port holding only the week record: what `currentWeekOf` and `saveWeekMatch` use. */
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
    // The record is what buys the fixture line and, with it, the week the agenda dates.
    expect(render({ plan: WEEK_PLAN, week: expected })).toContain('Liga · jueves');
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
    expect(render({ plan: WEEK_PLAN })).not.toContain('Liga · jueves');
    expect(render({ plan: WEEK_PLAN })).not.toContain('Esta semana jugamos copa');
  });
});

describe('the demo can show the week (?demo=inicio)', () => {
  it('has this week’s record and the four days the week needs', async () => {
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
    // The agenda dates the whole cup week: the match lands on Tuesday and the mobility
    // day is still Monday's, so neither reading contradicts the other.
    expect(rowOf(markup, 2)).toContain('Torso A');
    expect(rowOf(markup, 1)).toContain('Partido · Copa');
    expect(rowOf(markup, 0)).toContain('Movilidad y core');
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
    expect(rowOf(thursday, 3)).toContain('Partido · Liga');
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

/* ----------------------------------------------------------------------------
 * T4 — the week agenda.
 *
 * The screen has no DOM environment (see the header), so what is pinned here is the
 * markup the seven rows draw and the two pure steps the gesture goes through: the
 * placement (`placementOf`, which refuses) and the write (`writePlacement`, which saves
 * the layout through `storage.meta.saveWeekLayout`). The pointer wiring itself is thin on
 * purpose: it only names the weekday under the finger and hands it to those two.
 * ------------------------------------------------------------------------- */

/** The owner's league layout materialised: Monday legs … Friday TORSO B (L7). */
const LEAGUE_LAYOUT: WeekLayout = defaultLayoutOf({ matchKind: 'league', plan: WEEK_PLAN });

/** A cup week still carrying the league layout: the match takes TORSO A's Tuesday (S10). */
const CUP_WEEK: WeekRecord = { ...LEAGUE_WEEK, match: 'cup' };

/** A layout written as the seven weekdays read, so an expectation says what it means. */
function layoutWith(days: readonly (string | null)[]): WeekLayout {
  return { slots: days.map((planDayId, weekday) => ({ weekday, planDayId })) };
}

/** The agenda of a fixture, with the action its today row carries. */
function agendaWeekOf(overrides: Partial<HomeInput>) {
  const fixture = input(overrides);
  const view = homeViewOf(fixture);
  const week = agendaWeekViewOf(fixture, view.action);
  if (week === null) throw new Error('the fixture drew no agenda');
  return { fixture, view, week };
}

describe('the week agenda of Inicio (T4, S1, S2, S3, S9, S10)', () => {
  it('draws seven rows, Monday to Sunday, each with its state in words', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // Seven rows, Monday first: the week is a list, not a strip (direction 02).
    expect(markup.split('data-weekday="').length - 1).toBe(7);
    // The day, its number, the name in full, its numbers, then the state in one word.
    expect(rowOf(markup, 0)).toContain('LUN');
    expect(rowOf(markup, 0)).toContain('Lunes');
    expect(rowOf(markup, 0)).toContain('Pierna');
    expect(rowOf(markup, 0)).toContain('1 ejercicio · 3 series');
    expect(rowOf(markup, 0)).toContain('Pendiente');
    expect(rowOf(markup, 2)).toContain('Movilidad y core');
    expect(rowOf(markup, 2)).toContain('Hoy');
    expect(rowOf(markup, 3)).toContain('Partido · Liga');
    expect(rowOf(markup, 3)).toContain('Fijo');
    expect(rowOf(markup, 5)).toContain('Descanso');
    expect(rowOf(markup, 5)).toContain('Sin entreno');
    expect(rowOf(markup, 6)).toContain('Libre');
    // The count the meter drew is a sentence above the rows now.
    expect(markup).toContain('0 de 4 entrenos hechos');
    expect(markup).toContain(AGENDA_HINT);
    // No plan, no week to date: the honest empty state keeps its place.
    expect(render({ plan: [] })).not.toContain('home-agenda__row');
  });

  it('says a done day is done with the check, and refuses a drop on it', async () => {
    const done = session({
      id: 'closed',
      status: 'completed',
      planDayId: 'seed-day-leg',
      dayNameSnapshot: 'PIERNA',
      scheduledDate: MONDAY,
      startedAt: MONDAY,
      endedAt: MONDAY,
    });
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK, recent: [done] });
    const monday = rowOf(markup, 0);

    // Colour is never the only carrier: the row also says `Hecho` and draws the check.
    expect(monday).toContain('Hecho');
    expect(monday).toContain('home-agenda__row--done');
    expect(monday).toContain('home-agenda__mark--check');
    expect(monday).not.toContain('<button');

    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK, recent: [done] });
    const onto = placementOf({
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-torso-b',
      toWeekday: 0,
    });
    expect(onto.result).toEqual({ ok: false, reason: 'doneDay' });
    expect(onto.notice).toBe('Un día hecho no se cambia.');

    // S6: the closed day cannot leave either, from any end of the move.
    const away = placementOf({
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-leg',
      toWeekday: 5,
    });
    expect(away.result).toEqual({ ok: false, reason: 'doneDay' });
  });

  it('puts the ball on the match day and refuses a drop there', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const thursday = rowOf(markup, 3);

    // S9: the ball is the system's icon, and the word says the same thing.
    expect(thursday).toContain('home-agenda__mark--ball');
    expect(thursday).toContain('Fijo');
    expect(thursday).not.toContain('<button');

    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const drop = placementOf({
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-leg',
      toWeekday: 3,
    });
    expect(drop.result).toEqual({ ok: false, reason: 'matchDay' });
    expect(drop.notice).toBe('El día del partido no se mueve.');
  });

  it('moves a workout to a free day and saves the layout', async () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const port = layoutPort();

    const write = await writePlacement({
      storage: port.port,
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-leg',
      toWeekday: 5,
    });

    expect(write.outcome).toBe('saved');
    expect(write.notice).toBeNull();
    // S2: Saturday was free, so Monday goes without a day and Saturday gets the legs.
    expect(port.writes).toEqual([
      layoutWith([null, 'seed-day-torso-a', 'seed-day-fisico', null, 'seed-day-torso-b', 'seed-day-leg', null]),
    ]);

    // The week the screen re-reads is the one just saved, not the template.
    const after = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK, weekLayout: port.writes[0] });
    expect(after.week.agenda.days[5]?.planDay?.name).toBe('PIERNA');
    expect(after.week.agenda.days[0]?.kind).toBe('rest');
  });

  it('swaps the two workouts when the day already carries one', async () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const port = layoutPort();

    const write = await writePlacement({
      storage: port.port,
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-leg',
      toWeekday: 4,
    });

    expect(write.outcome).toBe('saved');
    // S3: the two days trade weekdays instead of one of them vanishing.
    expect(port.writes).toEqual([
      layoutWith([
        'seed-day-torso-b',
        'seed-day-torso-a',
        'seed-day-fisico',
        null,
        'seed-day-leg',
        null,
        null,
      ]),
    ]);

    // S4: the legs on Friday warn — and the move still happens, above.
    expect(week.warningFor('seed-day-leg', 4)).toBe(
      'Pierna el viernes cae el día después del partido. Se puede, pero la app prefiere las piernas lejos del partido.',
    );
  });

  it('opens the day sheet with the four plan days, the current one marked, and saves the choice', async () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const markup = renderToStaticMarkup(
      <DaySheet week={week} weekday={4} onConfirm={() => undefined} onClose={() => undefined} />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('¿Qué entrenas el viernes 10?');
    // The one that is there already, and the one that would be exchanged.
    expect(markup).toContain('Lo que toca');
    expect(markup).toContain('Ya el lunes · se cambiaría de sitio');
    // Friday already carries TORSO B, so the sheet does not offer to put it there again.
    expect(markup).toContain('Ya es el entreno de ese día');
    expect(markup).toContain('disabled=""');

    // S4: choosing the legs on the day after the match warns before confirming, and the
    // confirm is still there — the rule advises, it never blocks.
    const warned = renderToStaticMarkup(
      <DaySheet
        week={week}
        weekday={4}
        initial="seed-day-leg"
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(warned).toContain('Pierna el viernes cae el día después del partido');
    expect(warned).toContain('Poner Pierna el viernes');
    expect(warned).not.toContain('disabled=""');

    // The sheet and the drag are the same operation: one placement, one saved layout.
    const port = layoutPort();
    const write = await writePlacement({
      storage: port.port,
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-fisico',
      toWeekday: 4,
    });
    expect(write.outcome).toBe('saved');
    expect(port.writes).toEqual([
      layoutWith([
        'seed-day-leg',
        'seed-day-torso-a',
        'seed-day-torso-b',
        null,
        'seed-day-fisico',
        null,
        null,
      ]),
    ]);
  });

  it('changes nothing when the placement is refused', async () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const port = layoutPort();

    const write = await writePlacement({
      storage: port.port,
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-leg',
      toWeekday: 3,
    });

    // The same layout comes back by identity, and nothing was written.
    expect(write).toEqual({
      outcome: 'refused',
      layout: week.layout,
      notice: 'El día del partido no se mueve.',
    });
    expect(port.writes).toEqual([]);

    // Dropping a row on its own day is not even worth a sentence.
    const itself = placementOf({
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-leg',
      toWeekday: 0,
    });
    expect(itself.result).toEqual({ ok: false, reason: 'sameDay' });
    expect(itself.notice).toBeNull();
  });

  it('shows the plan day the match displaced, and the sheet can place it', async () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: CUP_WEEK, weekLayout: LEAGUE_LAYOUT });

    // S10: the cup match lands on Tuesday, so TORSO A keeps no weekday at all.
    expect(
      week.agenda.planDays.find((entry) => entry.planDay.id === 'seed-day-torso-a')?.weekday,
    ).toBeNull();

    const markup = render({ plan: WEEK_PLAN, week: CUP_WEEK, weekLayout: LEAGUE_LAYOUT });
    expect(rowOf(markup, 1)).toContain('Partido · Copa');
    expect(rowOf(markup, 3)).toContain('Descanso');
    expect(markup).toContain('Sin día esta semana');
    expect(markup).toContain('Torso A');

    // It is one of the four of the sheet, and the sheet says it has no day yet.
    const sheet = renderToStaticMarkup(
      <DaySheet week={week} weekday={4} onConfirm={() => undefined} onClose={() => undefined} />,
    );
    expect(sheet).toContain('Sin día esta semana · se colocaría aquí');

    const port = layoutPort();
    const write = await writePlacement({
      storage: port.port,
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-torso-a',
      toWeekday: 5,
    });
    expect(write.outcome).toBe('saved');
    expect(port.writes).toHaveLength(1);
  });

  it('carries the start of today on its own row, as the one filled action', () => {
    const { week, view } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(week.action).toEqual({ kind: 'start', label: 'Empezar' });
    const today = week.agenda.days.find((day) => day.today) ?? null;
    expect(today?.weekday).toBe(2);
    expect(startRequestOf(today)).toBe('seed-day-fisico');

    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(rowOf(markup, 2)).toContain('Empezar');
    // One filled action per screen (§7.1): the card below the agenda adds none.
    expect(markup.split('ds-action ds-primary').length - 1).toBe(1);
    expect(markup).not.toContain('Empezar entrenamiento');
    expect(view.today?.dayName).toBe('MOVILIDAD Y CORE');
  });

  it('keeps the previous week and offers one retry when the save fails', async () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    const write = await writePlacement({
      storage: layoutPort(true).port,
      agenda: week.agenda,
      layout: week.layout,
      planDayId: 'seed-day-leg',
      toWeekday: 5,
    });

    expect(write).toEqual({ outcome: 'failed', layout: week.layout, notice: PLACEMENT_FAILED_COPY });

    const markup = renderToStaticMarkup(
      <AgendaWeek
        week={week}
        placementNotice={PLACEMENT_FAILED_COPY}
        onRetryPlacement={() => undefined}
      />,
    );
    expect(markup).toContain(PLACEMENT_FAILED_COPY);
    expect(markup).toContain('Reintentar el cambio');
  });

  it('locks the days that refuse the row while it is in the air', () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const match = week.agenda.days[3];
    if (match === undefined) throw new Error('the week has no Thursday');

    const markup = renderToStaticMarkup(<AgendaRow day={match} matchKind="league" refusing />);

    // The artboard's drag state: the lock and the word carry the refusal, not the colour.
    expect(markup).toContain('home-agenda__lock');
    expect(markup).toContain('Cerrado');
    expect(markup).toContain('home-agenda__mark--ball');
  });

  it('leaves the week meter and the old swap sheet behind, and keeps the rest of Inicio', () => {
    const markup = render({
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      recent: [
        session({
          id: 'closed',
          status: 'completed',
          planDayId: 'seed-day-leg',
          dayNameSnapshot: 'PIERNA',
          scheduledDate: MONDAY,
          startedAt: MONDAY,
          endedAt: NOW,
        }),
      ],
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

    // One mechanism for one question: the agenda answers what the meter and the sheet did.
    expect(markup).not.toContain('home__meter');
    expect(markup).not.toContain('¿Qué toca hoy?');
    expect(markup).not.toContain('Cambiar el entreno de hoy');

    // And the rest of Inicio is still there.
    expect(markup).toContain('Liga · jueves');
    expect(markup).toContain('Esta semana jugamos copa');
    expect(markup).toContain('Última sesión · lunes');
    expect(markup).toContain('Fútbol registrado');
    expect(markup).toContain('Registrar');
    expect(markup).toContain('1 de 4 entrenos hechos');
  });
});
