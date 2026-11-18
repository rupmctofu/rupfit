/**
 * Inicio renders — the states the screen must keep working in, checked as markup.
 *
 * The project has no DOM tests and no DOM environment: `renderToStaticMarkup` draws the
 * same tree the browser gets, so what is pinned here is the screen's *output* — the
 * words it still says, the words T3 took away (S2), and the glyphs that replaced them
 * (S3). Interactions are not faked; the football write is exercised through the fake
 * port, which is where it actually happens.
 *
 * The states `HomeBody` still has after T9: an empty store, a session in progress, a
 * store that came back empty (the one banner Inicio still announces), the match and the
 * rest day on their rows, and the week with its fixture, its report and the kilos of the
 * last session. The activities are not one of them any more: they live in Progreso, and
 * `ProgressScreen.test.tsx` pins them there.
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
import { HomeBody, currentWeekOf, matchReportedOf, saveWeekMatch } from './HomeScreen';
import {
  AgendaRow,
  AgendaWeek,
  MatchSheet,
  agendaWeekViewOf,
  startRequestOf,
} from './agenda';
import { defaultLayoutOf } from '../week/agenda';
import { weekFixtureOf } from '../week/week';
import { demoWeek, demoPort, demoRestNow } from './demo';
import { activityViewOf, homeViewOf, startOfDay, type HomeInput } from './selectors';
import { recordFootball, reportMatch } from './football';

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

/**
 * The screen's markup for a fixture, with the actions a phone would have.
 */
function render(overrides: Partial<HomeInput> = {}): string {
  const fixture = input(overrides);
  const view = homeViewOf(fixture);
  return renderToStaticMarkup(
    <HomeBody
      view={view}
      agendaWeek={agendaWeekViewOf(fixture, view)}
      matchReported={matchReportedOf(fixture)}
      fixture={weekFixtureOf(fixture.week)}
      onStart={() => undefined}
      onReportMatch={() => undefined}
      onChooseFixture={() => undefined}
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

/** The `<button>` that carries a label, so a test can say what kind of control it is. */
function controlAround(markup: string, label: string): string {
  const at = markup.indexOf(label);
  if (at === -1) throw new Error(`no control reads ${label}`);
  const start = markup.lastIndexOf('<button', at);
  const end = markup.indexOf('</button>', at);
  if (start === -1 || end === -1) throw new Error(`${label} is not inside a button`);
  return markup.slice(start, end + '</button>'.length);
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
    // S12: the activity section left Inicio, so its empty state left with it.
    expect(markup).not.toContain('Todavía no hay actividad registrada');
    expect(markup).not.toContain('Registrar');
    // No closed session, no kilos: the line does not exist instead of reading `0 kg`.
    expect(markup).not.toContain('Última:');
  });

  it('draws the session in progress with the action that returns to its sets', () => {
    const open = session({
      id: 'open',
      status: 'inProgress',
      startedAt: MONDAY,
      planDayId: 'seed-day-fisico',
      dayNameSnapshot: 'MOVILIDAD Y CORE',
    });
    const markup = render({ recent: [open], inProgress: open, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // T5 of the redesign: the action moved up into the protagonist card, and it is still
    // the way back into the sets of an open session.
    expect(markup).toContain('Continuar entrenamiento');
    // The card names the day the week places, which is the only answer Inicio gives.
    expect(markup).toContain('home-today__title');
    expect(rowOf(markup, 2)).toContain('Hoy');
    // And the row above it carries no second filled control (one action per screen).
    expect(rowOf(markup, 2)).not.toContain('ds-primary');
    expect(markup).not.toContain('Vista previa');
  });

  it('does not draw the recorded activities any more: they are Progreso’s now (T9)', () => {
    const markup = render({
      recent: [session({ id: 'closed', status: 'completed', startedAt: MONDAY, endedAt: NOW })],
      activities: [FOOTBALL_ACTIVITY],
    });

    // The section moved with its copy (`ProgressScreen.test.tsx` pins it there).
    expect(markup).not.toContain('Fútbol registrado');
    expect(markup).not.toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
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

  it('does not explain the football capture any more: it left with its section (T9)', () => {
    const markup = render();

    expect(markup).not.toContain('dos partes de 25');
    expect(markup).not.toContain('no cuenta como sesión ni cambia el orden de tus días de fuerza');
    expect(markup).not.toContain('home__football');
    expect(markup).not.toContain('Registrar');
  });

  it('does not narrate a preview: the card and the row name the day (T9, T5)', () => {
    const markup = render({ plan: WEEK_PLAN });

    expect(markup).not.toContain('La sesión se crea al empezar.');
    // The day, its numbers, and the one action — on the card now, in the day's own words.
    expect(markup).toContain('Movilidad y core');
    expect(markup).toContain('Empezar entrenamiento');
    expect(rowOf(markup, 2)).toContain('Movilidad y core');
  });
});

describe('the match day and the rest day have their own state (T8, S1, S12)', () => {
  it('says the match is today on its row, and offers the training the app proposes', () => {
    const markup = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // S12: the row is the day. The match, its fixture, its ball and its word — and, since
    // T2, the way to train on it (S2). The card's filled action is not one of them.
    const thursday = rowOf(markup, 3);
    expect(thursday).toContain('Partido · Liga');
    expect(thursday).toContain('Hoy');
    expect(thursday).toContain('home-agenda__mark--ball');
    expect(thursday).toContain('Entrenar también');
    expect(markup).not.toContain('El siguiente día de tu rutina todavía no tiene ejercicios');
    expect(markup).not.toContain('Empezar entrenamiento');
  });

  it('offers nothing on a rest day, and does not borrow the empty-day sentence either', () => {
    const markup = render({ now: SATURDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // Saturday carries no workout of the owner's, so the shortened list hides it (S11)
    // and nothing on the screen asks for a training or a report.
    expect(markup).not.toContain('data-weekday="5"');
    expect(markup).not.toContain('El siguiente día de tu rutina todavía no tiene ejercicios');
    expect(markup).not.toContain('Empezar entrenamiento');
    expect(markup).not.toContain('Informar el partido');
    expect(markup).not.toContain('Hoy descansas');
  });
});

describe('the match is reported, never trained (T8, S1)', () => {
  const matchClock = { now: () => THURSDAY };
  const report = (storage: StoragePort, id: string) => ({ storage, clock: matchClock, newId: () => id });

  it('offers the report and the training on the match day', () => {
    const markup = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // T8 gave the fifth day its report and T2 gave it the day the rotation proposes: both
    // are on the same row, and neither borrows the card's filled control.
    const thursday = rowOf(markup, 3);
    expect(thursday).toContain('Informar el partido');
    expect(thursday).toContain('Entrenar también');
    expect(markup).not.toContain('Empezar entrenamiento');
  });

  it('writes exactly one activity, and the row then says the day is done', async () => {
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
    expect(rowOf(markup, 3)).toContain('Partido informado');
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
    // The demo draws its own week, and today is the day that week places: the mobility and
    // core day, with the preview the row of today starts (T4, T6).
    expect(view.agenda?.agenda.days.find((day) => day.today)?.planDay?.name).toBe(
      'MOVILIDAD Y CORE',
    );
    expect(view.today?.state).toBe('preview');
  });
});

describe('the week says which fixture it has (T3, S7, S11)', () => {
  it('names the fixture of the week on the match row, in the owner’s words (S12)', () => {
    const league = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(rowOf(league, 3)).toContain('Liga · jueves');
    // The flip left the screen: the fixture sheet, opened from the row, offers every
    // choice, so `Esta semana jugamos copa` is not a line of Inicio any more.
    expect(league).not.toContain('Esta semana jugamos copa');
    expect(league).not.toContain('Copa · martes');

    const cup = render({ plan: WEEK_PLAN, week: { ...LEAGUE_WEEK, match: 'cup' } });
    expect(rowOf(cup, 1)).toContain('Copa · martes');
    expect(cup).not.toContain('Liga · jueves');
  });

  it('says nothing about a match in a week with no fixture, and keeps the way to declare one', () => {
    const markup = render({ plan: WEEK_PLAN, week: { ...LEAGUE_WEEK, match: 'none' } });
    expect(markup).not.toContain('Liga · jueves');
    expect(markup).not.toContain('Copa · martes');
    // No match day means no match row: one quiet line under the rows opens the same
    // sheet, so the owner is never left without a way to say what he plays (S7).
    expect(markup).toContain('Sin partido esta semana');
    expect(markup).toContain('Esta semana jugamos copa');
  });

  it('flipping to the cup writes the fixture and clears the exchanges of the other layout', async () => {
    const { port, writes } = weekPort({ ...LEAGUE_WEEK, swaps: [{ from: 2, to: 0 }] });

    expect(await saveWeekMatch(port, NOW, 'cup')).toBe(true);
    // The swap traded Monday and Wednesday of a league week; in a cup week those weekdays
    // hold other days, so the list goes with the layout it was made on (T5, L7).
    expect(writes).toEqual([{ monday: '2023-11-06', match: 'cup', swaps: [] }]);

    // The week the re-read draws is the cup week: today is the upper body, not the
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
    expect(rowOf(before, 3)).toContain('Partido · Liga');
    expect(rowOf(before, 3)).toContain('Hoy');

    // L7: the cup match is Tuesday, so Thursday is the leg day of that layout.
    const after = render({ now: THURSDAY, plan: WEEK_PLAN, week: writes[0] });
    expect(rowOf(after, 3)).toContain('Pierna');
    expect(after).not.toContain('Partido · Liga');
    expect(rowOf(after, 1)).toContain('Copa · martes');
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
    expect(rowOf(thursday, 3)).toContain('Partido · Liga');
    expect(rowOf(thursday, 3)).toContain('Hoy');
  });

  it('leaves the league week on screen when the write fails, never half a cup week', async () => {
    const failing: StoragePort = {
      meta: {
        readWeek: async (): Promise<WeekRecord | undefined> => LEAGUE_WEEK,
        saveWeek: async (): Promise<void> => Promise.reject(new Error('denied')),
      },
    } as unknown as StoragePort;

    expect(await saveWeekMatch(failing, NOW, 'cup')).toBe(false);

    // S7: a write that did not happen re-reads nothing, so the week keeps what it was
    // drawn from — the league day for today, not the cup's day with the league's numbers.
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(rowOf(markup, 3)).toContain('Liga · jueves');
    expect(rowOf(markup, 2)).toContain('Movilidad y core');
    expect(markup).not.toContain('Copa · martes');
  });
});

describe('the football row writes through the port', () => {
  it('writes a recorded activity the Progreso rows can read, without touching sessions', async () => {
    const storage = createFakeStorage();
    const outcome = await recordFootball({
      storage,
      clock: { now: () => NOW },
      newId: () => 'football-1',
    });
    const activities = await storage.activities.all();

    expect(outcome).toBe('saved');
    expect(storage.calls.filter((call) => call.startsWith('sessions.'))).toEqual([]);

    // T9: the row it writes is drawn by Progreso now (`ActivitySection`), and the view
    // model it reads is still the one Inicio used to read (`activityViewOf`).
    const activity = activityViewOf(activities);
    expect(activity.recorded).toEqual([
      {
        id: 'football-1',
        label: 'Fútbol registrado',
        detail: '8 nov · 50 min',
        removeLabel: 'Eliminar fútbol del 8 de noviembre',
      },
    ]);

    // And Inicio shows nothing of it: the section is not the week's business.
    const markup = renderToStaticMarkup(
      <HomeBody view={homeViewOf(input({ activities }))} onStart={() => undefined} />,
    );
    expect(markup).not.toContain('Fútbol registrado');
  });
});

/* ----------------------------------------------------------------------------
 * T4 — the week agenda.
 *
 * The screen has no DOM environment (see the header), so what is pinned here is the
 * markup the rows draw and the one seam a row's press goes through (`startRequestOf`).
 * The week is derived from the fixture's template every time (S2, S3): nothing here drags
 * a day, swaps two of them or writes a layout.
 * ------------------------------------------------------------------------- */

/** The league template materialised: Monday legs … Friday TORSO B (L7). */
const LEAGUE_LAYOUT: WeekLayout = defaultLayoutOf({ matchKind: 'league', plan: WEEK_PLAN });

/** A cup week: the match takes Tuesday, and the league layout has nothing to say about it. */
const CUP_WEEK: WeekRecord = { ...LEAGUE_WEEK, match: 'cup' };

/** A layout written as the seven weekdays read, so an expectation says what it means. */
function layoutWith(days: readonly (string | null)[]): WeekLayout {
  return { slots: days.map((planDayId, weekday) => ({ weekday, planDayId })) };
}

/** The agenda of a fixture, with the action its today row carries. */
function agendaWeekOf(overrides: Partial<HomeInput>) {
  const fixture = input(overrides);
  const view = homeViewOf(fixture);
  const week = agendaWeekViewOf(fixture, view);
  if (week === null) throw new Error('the fixture drew no agenda');
  return { fixture, view, week };
}

describe('the week agenda of Inicio (T4, S1, S2, S3, S9, S10, S11)', () => {
  it('draws the weekdays, each with its state in words, and stops at Friday (S11)', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // Monday to Friday: the owner asked for the weekend out of the list (S11), and a
    // weekend that carries nothing has nothing to say. The derivation still holds seven
    // days; only the list is short.
    expect(markup.split('data-weekday="').length - 1).toBe(5);
    expect(markup).not.toContain('data-weekday="5"');
    expect(markup).not.toContain('data-weekday="6"');
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
    // S12: neither the count the meter drew nor the hint paragraph is on Inicio any more.
    expect(markup).not.toContain('entrenos hechos');
    expect(markup).not.toContain('Arrastra un renglón');
    // No plan, no week to date: the honest empty state keeps its place.
    expect(render({ plan: [] })).not.toContain('home-agenda__row');
  });

  it('keeps the weekend out of the list in all three fixtures, because the template never places a day there (S3, S11)', () => {
    // A short list may never hide a training: the four days are placed Monday to Friday in
    // a league week, in a cup week and in a week with no match, so no row is hidden.
    for (const week of [LEAGUE_WEEK, CUP_WEEK, { ...LEAGUE_WEEK, match: 'none' }] as const) {
      const markup = render({ plan: WEEK_PLAN, week });
      expect(markup, week.match).not.toContain('data-weekday="5"');
      expect(markup, week.match).not.toContain('data-weekday="6"');
    }
  });

  it('says a done day is done with the check, and draws no control that could move it', () => {
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
    // A row with nothing to offer is not a control, and it carries no placement handle.
    expect(monday).not.toContain('<button');
    expect(monday).not.toContain('home-agenda__handle');
  });

  it('puts the ball on the match day, and no handle on it', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const thursday = rowOf(markup, 3);

    // S9: the ball is the system's icon, and the word says the same thing.
    expect(thursday).toContain('home-agenda__mark--ball');
    expect(thursday).toContain('Fijo');
    // S12: the match row stays a control — it opens the fixture sheet, which writes the
    // week's fixture and never a layout — and the match itself does not move.
    expect(thursday).toContain('aria-haspopup="dialog"');
    expect(thursday).not.toContain('home-agenda__handle');
  });

  it('draws no placement control and no displaced-days section (S4)', () => {
    // A cup week carrying the league layout: the placement the old read honoured, and the
    // exact case that produced the section the owner asked about.
    const markup = render({ plan: WEEK_PLAN, week: CUP_WEEK, weekLayout: LEAGUE_LAYOUT });

    // Nothing on the week writes a layout any more: no handle, no grip, no hint, no sheet.
    expect(markup).not.toContain('home-agenda__handle');
    expect(markup).not.toContain('home-agenda__grip');
    expect(markup).not.toContain('Arrastra un renglón');
    expect(markup).not.toContain('¿Qué entrenas el');
    // A workout row asks nothing of the owner: it is not a control, and the only row that
    // opens a dialog is the match, whose sheet writes the fixture and never a layout.
    expect(rowOf(markup, 0)).not.toContain('<button');
    expect(rowOf(markup, 2)).not.toContain('<button');
    expect(rowOf(markup, 1)).toContain('aria-haspopup="dialog"');
    // And the block that listed the days the match left without a date is gone with it.
    expect(markup).not.toContain('Días que el partido dejó sin fecha');
    expect(markup).not.toContain('Sin fecha');
    expect(markup).not.toContain('home-agenda__unplaced');
  });

  it('places the four days by the template, whatever layout the store holds (S2, S3)', () => {
    const markup = render({ plan: WEEK_PLAN, week: CUP_WEEK, weekLayout: LEAGUE_LAYOUT });

    expect(rowOf(markup, 1)).toContain('Partido · Copa');
    // The league layout put TORSO A on Tuesday, under the cup match. Derived, it is on
    // Wednesday and Thursday carries the legs: the four days are all beside the match.
    expect(rowOf(markup, 0)).toContain('Movilidad y core');
    expect(rowOf(markup, 2)).toContain('Torso A');
    expect(rowOf(markup, 3)).toContain('Pierna');
    expect(rowOf(markup, 3)).not.toContain('Descanso');

    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: CUP_WEEK, weekLayout: LEAGUE_LAYOUT });
    expect(week.agenda.planDays.every((entry) => entry.weekday !== null)).toBe(true);
  });

  it('names the day the template places when the store holds a layout that moved it (S2)', () => {
    const moved = layoutWith(['seed-day-leg', 'seed-day-torso-a', null, null, 'seed-day-torso-b', 'seed-day-fisico', null]);
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK, weekLayout: moved });

    // The stored placement put the preparation on Saturday and left Wednesday empty. The
    // week no longer reads it: Wednesday is the prep day, and today is placed.
    expect(rowOf(markup, 2)).toContain('Movilidad y core');
    expect(rowOf(markup, 2)).toContain('Hoy');
    expect(rowOf(markup, 2)).not.toContain('Descanso');
    expect(markup).not.toContain('data-weekday="5"');
    expect(markup).toContain('Empezar entrenamiento');
  });

  it('starts exactly the day the template puts on today (T5, T6)', () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const today = week.agenda.days.find((day) => day.today) ?? null;

    // The row carries the one filled action and hands `start.start` the day it names.
    expect(week.action).toEqual({ kind: 'start', label: 'Empezar' });
    expect(startRequestOf(today)).toBe('seed-day-fisico');
  });

  it('carries the action of today into the card, as the one filled action', () => {
    const { week, view } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // The row's own derivation is still the answer to "can today start", and it is what
    // the card is gated on; the words are the view's (`Empezar entrenamiento`).
    expect(week.action).toEqual({ kind: 'start', label: 'Empezar' });
    const today = week.agenda.days.find((day) => day.today) ?? null;
    expect(today?.weekday).toBe(2);
    expect(startRequestOf(today)).toBe('seed-day-fisico');

    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(markup).toContain('Empezar entrenamiento');
    expect(markup).toContain('home-today');
    // One filled action per screen (§7.1): the rows carry none, the card carries the one.
    expect(markup.split('ds-action ds-primary').length - 1).toBe(1);
    expect(rowOf(markup, 2)).not.toContain('ds-primary');
    expect(view.today?.dayName).toBe('MOVILIDAD Y CORE');
  });

  it('keeps the match row a control and the rows plain text, with no lock state left over (S4)', () => {
    const { week } = agendaWeekOf({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const match = week.agenda.days[3];
    if (match === undefined) throw new Error('the week has no Thursday');

    const markup = renderToStaticMarkup(
      <AgendaRow day={match} matchKind="league" onOpenFixture={() => undefined} />,
    );

    // The match row opens the fixture sheet; the lock and `Cerrado` belonged to a drag
    // that could be refused, and there is no drag left to refuse it.
    expect(markup).toContain('home-agenda__mark--ball');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).not.toContain('home-agenda__lock');
    expect(markup).not.toContain('Cerrado');
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

    // And the week is still there: the fixture on its match row, the done Monday on its
    // own row, and the kilos of the last session as the one line under it (T9).
    expect(rowOf(markup, 3)).toContain('Liga · jueves');
    expect(rowOf(markup, 0)).toContain('Hecho');
    expect(markup).toContain('Última: PIERNA ·');
    expect(markup).not.toContain('entrenos hechos');
  });
});

/* ----------------------------------------------------------------------------
 * T9 (S12, S13) — Inicio is the week and very little else.
 *
 * The owner: «lo que sobre de ahí de ese inicio lo quites porque ... había muchas cosas y
 * era muy lioso», and then «si, recorta». The card, the count line, the hint, the
 * activities with their bin and the imported notice leave; the fixture and the match
 * report move onto the match row; the kilos of the last session stay as one line.
 * ------------------------------------------------------------------------- */

/** A closed session with a volume to state: 3 × 116 kg × 10 reps = 3.480 kg. */
const CLOSED_WITH_VOLUME = session({
  id: 'closed-volume',
  status: 'completed',
  planDayId: 'seed-day-leg',
  dayNameSnapshot: 'PIERNA',
  scheduledDate: MONDAY,
  startedAt: MONDAY,
  endedAt: NOW,
  exercises: [
    {
      id: 'es-volume',
      order: 0,
      exerciseId: 'lib-1',
      exerciseNameSnapshot: 'Sentadilla',
      prescription: {
        sets: 3,
        repRange: { lowerBound: 8, upperBound: 10 },
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: 180,
      },
      recommendation: null,
      decision: null,
      recommendedWeightKg: null,
      usedWeightKg: 116,
      loadDeltaKg: null,
      sets: [1, 2, 3].map((index) => ({
        id: `set-volume-${String(index)}`,
        index,
        weightKg: 116,
        targetReps: 10,
        actualReps: 10,
        effort: null,
        discomfort: null,
        confirmedAt: MONDAY,
      })),
      status: 'done' as const,
      completedAt: NOW,
    },
  ],
});

/** A weigh-in, so the test can prove the body-weight number left the screen too. */
const A_WEIGH_IN = {
  id: 'm1',
  date: NOW,
  weightKg: 80,
  waistCm: null,
  chestCm: null,
  armCm: null,
  thighCm: null,
  hipCm: null,
  bodyFatPercent: null,
  provenance: 'manual' as const,
};

const FOOTBALL_ACTIVITY = {
  id: 'football-1',
  date: NOW,
  kind: 'other' as const,
  durationSeconds: 50 * 60,
  activeEnergyKcal: null,
  provenance: 'manual' as const,
  externalSampleId: null,
};

const IMPORTED_ACTIVITY = {
  id: 'imported-1',
  date: NOW,
  kind: 'cardio' as const,
  durationSeconds: 1800,
  activeEnergyKcal: 210,
  provenance: 'imported' as const,
  externalSampleId: 'sample-1',
};

/** The match of Thursday, as the report writes it: the football row of that date. */
const MATCH_ACTIVITY = {
  ...FOOTBALL_ACTIVITY,
  id: 'match-1',
  date: startOfDay(THURSDAY),
};

describe('Inicio is the week and very little else (T9, S12)', () => {
  it('leaves the big today card, the count and the hint behind', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(markup).not.toContain('home__hero');
    expect(markup).not.toContain('home-agenda__count');
    expect(markup).not.toContain('entrenos hechos');
    expect(markup).not.toContain('Arrastra un renglón');
    // The day is still named, by the row that is now the only thing holding it.
    expect(rowOf(markup, 2)).toContain('Movilidad y core');
    expect(rowOf(markup, 2)).toContain('Hoy');
  });

  it('carries the fixture on the match row, and the sheet writes the week record', async () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const thursday = rowOf(markup, 3);

    // S12: `Liga · jueves` left the card and lives in the row it talks about, which is a
    // control now: tapping the match opens the fixture sheet.
    expect(thursday).toContain('Liga · jueves');
    expect(thursday).toContain('aria-haspopup="dialog"');
    // The quiet flip button left with the card; the three choices are the sheet's.
    expect(markup).not.toContain('Esta semana jugamos copa');

    const sheet = renderToStaticMarkup(
      <MatchSheet matchKind="league" onChoose={() => undefined} onClose={() => undefined} />,
    );
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain('Liga');
    expect(sheet).toContain('Copa');
    expect(sheet).toContain('Sin partido');
    // The week's own fixture is the selected choice, and the choice can be none at all.
    expect(sheet).toContain('aria-pressed="true"');

    // The sheet writes the same record the flip wrote, whichever of the three is chosen.
    const { port, writes } = weekPort(LEAGUE_WEEK);
    expect(await saveWeekMatch(port, NOW, 'cup')).toBe(true);
    expect(await saveWeekMatch(port, NOW, 'none')).toBe(true);
    expect(writes).toEqual([
      { monday: '2023-11-06', match: 'cup', swaps: [] },
      { monday: '2023-11-06', match: 'none', swaps: [] },
    ]);
  });

  it('keeps a way to declare the fixture in a week with no match row', () => {
    // `none` has no match day, so no row carries the line: one quiet line under the rows
    // opens the same sheet, and the owner is never left without a way to say what he plays.
    const markup = render({ plan: WEEK_PLAN, week: { ...LEAGUE_WEEK, match: 'none' } });

    expect(markup).toContain('Sin partido esta semana');
    expect(markup).toContain('Esta semana jugamos copa');
    expect(markup).not.toContain('Liga · jueves');
  });

  it('reaches the match report from its row, and the row says when it is done', () => {
    const markup = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // S12: the report is an action of the row, not a card under it.
    expect(rowOf(markup, 3)).toContain('Informar el partido');
    expect(markup).not.toContain('Hoy es el día del partido');

    const reported = render({
      now: THURSDAY,
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      activities: [MATCH_ACTIVITY],
    });
    expect(rowOf(reported, 3)).toContain('Partido informado');
    expect(rowOf(reported, 3)).not.toContain('Informar el partido');
  });

  it('states the kilos of the last session in one line, and keeps no other number', () => {
    const withoutSession = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    expect(withoutSession).not.toContain('Última:');

    const markup = render({
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      recent: [CLOSED_WITH_VOLUME],
      measurements: [A_WEIGH_IN],
    });
    expect(markup).toContain('Última: PIERNA · 3.480 kg');
    // A line, not a card: the last-session card and the body-weight tile are gone.
    expect(markup).not.toContain('Última sesión ·');
    expect(markup).not.toContain('home__last-main');
    expect(markup).not.toContain('home__last-volume');
    expect(markup).not.toContain('Peso corporal');
  });

  it('leaves the activities and their bin to Progreso', () => {
    const markup = render({
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      activities: [FOOTBALL_ACTIVITY, IMPORTED_ACTIVITY],
    });

    // S12: the section moved to Progreso, it was not deleted.
    expect(markup).not.toContain('Fútbol registrado');
    expect(markup).not.toContain('Registrar');
    expect(markup).not.toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
    // The imported notice is Perfil's bookkeeping now, not Inicio's.
    expect(markup).not.toContain('actividades importadas');
  });

  it('still starts today from the card, as the only filled action (T5)', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(markup).toContain('Empezar entrenamiento');
    expect(markup.split('ds-action ds-primary').length - 1).toBe(1);
    expect(rowOf(markup, 2)).not.toContain('ds-primary');
  });
});

/* ----------------------------------------------------------------------------
 * T5 (odd/tasks/dark-premium-redesign.md) — the composition of the screen.
 *
 * Header, today's workout as the protagonist, the week's progress, then the week's rows.
 * What is pinned here is the reading order and the one rule the redesign must not break:
 * nothing on the card is a figure the store did not already hold.
 * ------------------------------------------------------------------------- */

describe('the redesign composition (T5)', () => {
  it('opens with the lockup, the greeting and the way into the settings', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    // The owner's asset, never redrawn: the lockup is the same file the app has always shipped.
    expect(markup).toContain('logo-lockup.svg');
    // The greeting the app names itself, and the date under it.
    expect(markup).toContain('Hola, Rup');
    expect(markup).toContain('Miércoles, 8 de noviembre');
    // One control into Perfil, where every setting lives, with its accessible name.
    expect(markup).toContain('aria-label="Ajustes"');
    // The old screen title left with the redesign: the hero is the loudest line now.
    expect(markup).not.toContain('¡Vamos a entrenar!');
  });

  it('gives today’s workout the card, with its name, its counts and its own picture', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(markup).toContain('home-today');
    expect(markup).toContain('HOY · MIÉRCOLES');
    expect(markup).toContain('Movilidad y core');
    // The plan day's own prescription: 1 exercise of 3 sets in this fixture.
    expect(markup).toContain('Ejercicios');
    expect(markup).toContain('Series');
    // The picture is decorative and the card already names the day: this fixture's exercise
    // is not in the seeded library, so the plate holds the owner's mark, never a drawing
    // of a different movement.
    expect(markup).toContain('home-today__art');
    expect(markup).toContain('logo-mark.svg');
  });

  it('draws the picture the app already maps to the day’s first exercise', () => {
    // The seeded leg day opens on the back squat, which has one of the approved cut-outs.
    const legDay: PlanDay = {
      ...seededDay('seed-day-leg', 'PIERNA', 0),
      items: [
        {
          id: 'seed-item-leg',
          planDayId: 'seed-day-leg',
          order: 0,
          exerciseId: 'seed-ex-sentadilla-trasera',
          exerciseNameSnapshot: 'Sentadilla trasera',
          prescription: {
            sets: 3,
            repRange: { lowerBound: 8, upperBound: 10 },
            targetRIR: { lowerBound: 2, upperBound: 3 },
            restSeconds: 180,
          },
        },
      ],
    };
    // Monday is the day the league template gives the legs, so it is the day the card
    // names: the artboard reads the week the app derives, not a stored placement.
    const markup = render({ now: MONDAY, plan: [legDay], week: LEAGUE_WEEK });

    expect(markup).toContain('Pierna');
    expect(markup).toContain('art/squat-back.webp');
  });

  it('states the week’s progress from the agenda’s own numbers, in words and in a bar', () => {
    const closed = session({
      id: 'closed',
      status: 'completed',
      planDayId: 'seed-day-leg',
      dayNameSnapshot: 'PIERNA',
      scheduledDate: MONDAY,
    });
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK, recent: [closed] });

    expect(markup).toContain('Tu progreso');
    // `doneCount` over the plan days the week holds: one of four, never a second count.
    expect(markup).toContain('de 4 entrenos');
    expect(markup).toContain('width:25%');
    // The seven days, each with its state said out loud for the reader.
    expect(markup).toContain('Días de la semana');
    expect(markup).toContain('Lunes, hecho');
    expect(markup).toContain('Miércoles, hoy');
    expect(markup).toContain('Jueves, fijo');
  });

  it('invents no figure on a store with no plan and no history', () => {
    const markup = render({ plan: [], recent: [], profile: undefined });

    // No plan, no progress block: there is no week to count, and no `0 de 0` on screen.
    expect(markup).not.toContain('Tu progreso');
    expect(markup).not.toContain('entrenos');
    // The card is the empty state, and it says what is missing in the same words as before.
    expect(markup).toContain('home-today');
    expect(markup).toContain('Todavía no hay rutina ni sesiones programadas');
    expect(markup).not.toContain('Ejercicios');
  });

  it('names the match on its day, and keeps the report and the training on its row', () => {
    const markup = render({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });

    expect(markup).toContain('HOY · JUEVES');
    expect(markup).toContain('Partido · Liga');
    expect(markup).toContain('Sólo se informa');
    // The report stays where it was, the training joins it (S2), and the screen keeps one
    // filled action: the report itself, because the card has nothing to start today.
    const thursday = rowOf(markup, 3);
    expect(thursday).toContain('Informar el partido');
    expect(thursday).toContain('Entrenar también');
    expect(markup.split('ds-action ds-primary').length - 1).toBe(1);
    expect(markup).not.toContain('Empezar entrenamiento');
  });

  it('carries the summary of a closed day instead of a start', () => {
    const closed = session({
      id: 'closed-today',
      status: 'completed',
      planDayId: 'seed-day-fisico',
      dayNameSnapshot: 'MOVILIDAD Y CORE',
      scheduledDate: NOW,
    });
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK, recent: [closed] });

    expect(markup).toContain('Ver el resumen');
    expect(markup).not.toContain('Empezar entrenamiento');
    // The closed line the view already wrote, in the card.
    expect(markup).toContain('Sesión completada hoy');
  });
});

/* ----------------------------------------------------------------------------
 * S4 (odd/tasks/home-feedback.md) — the name is the app's, not the account's.
 *
 * The owner read his own handle in the greeting and asked for `Rup` and for nothing
 * editable: «pon rup y que no sea editable». What is pinned here is the visible half —
 * the greeting says `Rup` whatever the stored profile holds. The stored field is not
 * touched by this task, so the fixture below is deliberately the old derived name.
 * ------------------------------------------------------------------------- */

describe('the greeting shows the app name, not the stored one (S4)', () => {
  it('greets with Rup even when the profile still holds the account-derived name', () => {
    const markup = render({ profile: { ...PROFILE, displayName: 'robertovlopez' } });

    expect(markup).toContain('Hola, Rup');
    expect(markup).not.toContain('robertovlopez');
  });
});

/* ----------------------------------------------------------------------------
 * T2, T4 (odd/tasks/match-day-training.md S2, S3, S5, S6, S7) — the match day trains.
 *
 * The match row used to be the one day of the week with nothing to start. It now offers
 * the plan day the rotation proposes — without moving the match, the layout or the four
 * seeded days — and it says both things once that date has been trained.
 *
 * As everywhere in this file there is no DOM: what is pinned is the markup the row draws
 * and the pure seam the press goes through (`startRequestOf`, exactly the one the today
 * row already used), plus the write the press must not perform.
 * ------------------------------------------------------------------------- */

describe('the match row offers to train (T2, T4)', () => {
  /** The day of the week the match sits on in a league week. */
  const MATCH_WEEKDAY = 3;

  it('starts the day the week proposes, and not the first day of the plan', () => {
    // The week already closed its leg day, so the proposal is TORSO A: the row reads the
    // week (S4), it does not simply name the first day of the rotation.
    const closedMonday = session({
      id: 'closed-monday',
      status: 'completed',
      planDayId: 'seed-day-leg',
      dayNameSnapshot: 'PIERNA',
      scheduledDate: MONDAY,
    });
    const { week } = agendaWeekOf({
      now: THURSDAY,
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      recent: [closedMonday],
    });
    const match = week.agenda.days[MATCH_WEEKDAY];
    if (match === undefined) throw new Error('the week has no Thursday');

    expect(match.proposal?.id).toBe('seed-day-torso-a');
    // The seam the row's press calls: the day the row would start (`start.start` on the
    // real screen, which is the same call the today row makes).
    expect(startRequestOf(match)).toBe('seed-day-torso-a');

    const markup = render({
      now: THURSDAY,
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      recent: [closedMonday],
    });
    expect(rowOf(markup, MATCH_WEEKDAY)).toContain('Entrenar también');
  });

  it('draws that action as the secondary control, never as the filled primary', () => {
    // Whatever the day is, the action of the match row is a quiet control: Wednesday's
    // filled action is the card's, Thursday's is the report.
    for (const [label, overrides] of [
      ['the card', { plan: WEEK_PLAN, week: LEAGUE_WEEK }],
      ['the report', { now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK }],
    ] as const) {
      const markup = render(overrides);
      const train = controlAround(markup, 'Entrenar también');

      expect(markup.split('ds-action ds-primary').length - 1).toBe(1);
      expect(train).toContain('ds-text-button');
      expect(train).not.toContain('ds-primary');
      // The play glyph of the primary start, so the two read as the same kind of action.
      expect(train).toContain('M8 5.5v13l11-6.5Z');
      expect(train, label).not.toContain('disabled');
    }
  });

  it('says both things on a match day that was trained (S6)', () => {
    const closedOnThursday = session({
      id: 'closed-thursday',
      status: 'completed',
      planDayId: 'seed-day-leg',
      dayNameSnapshot: 'PIERNA',
      scheduledDate: THURSDAY,
    });
    const markup = render({
      now: THURSDAY,
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      recent: [closedOnThursday],
    });
    const thursday = rowOf(markup, MATCH_WEEKDAY);

    // The fixture and its identity, as it always said them…
    expect(thursday).toContain('Partido · Liga');
    expect(thursday).toContain('Liga · jueves');
    expect(thursday).toContain('home-agenda__mark--ball');
    // …and the fact that the date was trained, in the words every other trained day uses.
    expect(thursday).toContain('Hecho');
    expect(thursday).toContain('home-agenda__mark--check');
    expect(thursday).not.toContain('Fijo');
    // Its report is still its own (S6).
    expect(thursday).toContain('Informar el partido');
  });

  it('leaves an untrained match day reading exactly as it read before (S7)', () => {
    const markup = render({ plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const thursday = rowOf(markup, MATCH_WEEKDAY);

    expect(thursday).toContain('Partido · Liga');
    expect(thursday).toContain('Liga · jueves');
    expect(thursday).toContain('Fijo');
    expect(thursday).toContain('home-agenda__mark--ball');
    // Nothing says it trained: no check, no extra word, and no state of its own.
    expect(thursday).not.toContain('Hecho');
    expect(thursday).not.toContain('Entrenado');
    expect(thursday).not.toContain('home-agenda__mark--check');
    expect(thursday).not.toContain('home-agenda__row--done');
  });

  it('moves nothing when it starts: same match weekday, same four weekdays, no layout write (S5)', () => {
    const { week } = agendaWeekOf({ now: THURSDAY, plan: WEEK_PLAN, week: LEAGUE_WEEK });
    const match = week.agenda.days[MATCH_WEEKDAY];
    if (match === undefined) throw new Error('the week has no Thursday');

    const weekdaysBefore = week.agenda.planDays.map(
      (entry) => `${entry.planDay.id}@${String(entry.weekday)}`,
    );
    const matchWeekdayBefore = week.agenda.days.find((day) => day.kind === 'match')?.weekday;

    const started: string[] = [];
    const onStart = (planDayId: string): void => {
      started.push(planDayId);
    };
    const markup = renderToStaticMarkup(<AgendaWeek week={week} onStart={onStart} />);
    expect(rowOf(markup, MATCH_WEEKDAY)).toContain('Entrenar también');

    // The press, as the row wires it: the day it would start, handed to `onStart`.
    const request = startRequestOf(match);
    if (request === null) throw new Error('the match row offers nothing to start');
    onStart(request);
    expect(started).toHaveLength(1);

    // The session a start writes is open, so the week a moment later is the same week: the
    // match keeps its weekday and the four days keep theirs.
    const startedSession = session({
      id: 'started-on-the-match-day',
      status: 'inProgress',
      planDayId: started[0] ?? 'seed-day-leg',
      scheduledDate: THURSDAY,
    });
    const after = agendaWeekOf({
      now: THURSDAY,
      plan: WEEK_PLAN,
      week: LEAGUE_WEEK,
      recent: [startedSession],
      inProgress: startedSession,
    });
    expect(after.week.agenda.days.find((day) => day.kind === 'match')?.weekday).toBe(
      matchWeekdayBefore,
    );
    expect(
      after.week.agenda.planDays.map((entry) => `${entry.planDay.id}@${String(entry.weekday)}`),
    ).toEqual(weekdaysBefore);
    // The week is still the template of its fixture: nothing about a start redraws it, and
    // no `WeekLayout` is written by any of it — the week holds no write path at all (S4).
    expect(after.view.agenda?.layout).toEqual(LEAGUE_LAYOUT);
  });
});
