/**
 * T3 — the week as seven dated rows (S1), the owner's layout (S4, S5, S10) and the one
 * placement the drag and the day sheet both use (S2, S3).
 *
 * Every case names its own week through `now`, so the suite reads the same on any machine
 * and in any time zone. The plan days arrive as they are stored, with their items, because
 * the agenda counts exercises and sets per row instead of trusting a label.
 */

import { describe, expect, it } from 'vitest';
import type { MatchKind } from '../../core/engine/week-plan';
import type { PlanDay, SessionStatus, WeekLayout, WorkoutSession } from '../../storage';
import { defaultLayoutOf, placePlanDay, weekAgendaOf, type WeekAgenda } from './agenda';

/** Monday 2 March 2026 … Sunday 8 March, mid-morning local. */
const MONDAY = new Date(2026, 2, 2, 9, 0).getTime();
const TUESDAY = new Date(2026, 2, 3, 9, 0).getTime();
const WEDNESDAY = new Date(2026, 2, 4, 9, 0).getTime();
const THURSDAY = new Date(2026, 2, 5, 9, 0).getTime();
const SATURDAY = new Date(2026, 2, 7, 9, 0).getTime();

function planDay(id: string, name: string, order: number, exercises: number, sets: number): PlanDay {
  return {
    id,
    name,
    order,
    items: Array.from({ length: exercises }, (_, index) => ({
      id: `item-${id}-${index}`,
      planDayId: id,
      order: index,
      exerciseId: `lib-${index}`,
      exerciseNameSnapshot: 'Sentadilla',
      prescription: {
        sets,
        repRange: { lowerBound: 8, upperBound: 10 },
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: 180,
      },
    })),
  };
}

/** The four days of the seed, in rotation order (L5), with their real item counts. */
const LEG = planDay('seed-day-leg', 'PIERNA', 0, 4, 3); // 4 ejercicios · 12 series
const UPPER_A = planDay('seed-day-torso-a', 'TORSO A', 1, 3, 2); // 3 ejercicios · 6 series
const UPPER_B = planDay('seed-day-torso-b', 'TORSO B', 2, 2, 2); // 2 ejercicios · 4 series
const PREP = planDay('seed-day-fisico', 'MOVILIDAD Y CORE', 3, 1, 2); // 1 ejercicio · 2 series
const PLAN: readonly PlanDay[] = [LEG, UPPER_A, UPPER_B, PREP];

function session(
  planDayId: string,
  scheduledDate: number,
  status: SessionStatus = 'completed',
): WorkoutSession {
  return {
    id: `session-${planDayId}-${String(scheduledDate)}`,
    planDayId,
    dayNameSnapshot: 'PIERNA',
    scheduledDate,
    startedAt: scheduledDate,
    endedAt: scheduledDate,
    phase: { kind: 'normal' },
    status,
    exercises: [],
  };
}

/** Seven weekdays, Monday first; `null` leaves the weekday free. */
function layout(planDayIds: readonly (string | null)[]): WeekLayout {
  return { slots: planDayIds.map((planDayId, weekday) => ({ weekday, planDayId })) };
}

/** The league week the templates draw: legs Monday, TORSO A Tuesday, prep Wednesday. */
const LEAGUE_LAYOUT = layout([LEG.id, UPPER_A.id, PREP.id, null, UPPER_B.id, null, null]);

describe('weekAgendaOf dates the week from the fixture (S4)', () => {
  it('T3 gives seven dated days, Monday first, from the Monday that contains now', () => {
    const agenda = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: undefined,
      sessions: [],
    });
    expect(agenda.monday).toBe('2026-03-02');
    expect(agenda.days).toHaveLength(7);
    expect(agenda.days.map((day) => `${day.weekday} ${day.weekdayName} ${day.date}`)).toEqual([
      '0 Lunes 2026-03-02',
      '1 Martes 2026-03-03',
      '2 Miércoles 2026-03-04',
      '3 Jueves 2026-03-05',
      '4 Viernes 2026-03-06',
      '5 Sábado 2026-03-07',
      '6 Domingo 2026-03-08',
    ]);
    // Exactly one row is today, and it is the day the clock named.
    expect(agenda.days.filter((day) => day.today).map((day) => day.date)).toEqual(['2026-03-04']);
  });

  it('T3 puts the match on Thursday in a league week, and locks it against every move', () => {
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [],
    });
    const match = agenda.days[3];
    expect(match?.kind).toBe('match');
    expect(match?.planDay).toBeNull();
    expect(match?.exerciseCount).toBe(0);
    expect(match?.setCount).toBe(0);
    expect(match?.done).toBe(false);
    expect(match?.locked).toBe(true);
    expect(match?.lockReason).toBe('match');
  });

  it('T3 puts the cup match on Tuesday, and leaves a fixture-less week without one', () => {
    const cup = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [],
    });
    expect(cup.matchKind).toBe('cup');
    expect(cup.days.filter((day) => day.kind === 'match').map((day) => day.weekdayName)).toEqual([
      'Martes',
    ]);

    const none = weekAgendaOf({
      now: MONDAY,
      matchKind: 'none',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [],
    });
    expect(none.days.filter((day) => day.kind === 'match')).toEqual([]);
    expect(none.days.filter((day) => day.locked)).toEqual([]);
  });

  it('T3 keeps the match on Thursday whatever the layout put there (S10)', () => {
    // The owner's layout has no opinion about the fixture: the calendar of the league
    // places the match, and it takes the weekday it lands on.
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: layout([LEG.id, UPPER_A.id, PREP.id, UPPER_B.id, null, null, null]),
      sessions: [],
    });
    expect(agenda.days[3]?.kind).toBe('match');
    expect(agenda.days[3]?.planDay).toBeNull();
  });
});

describe("weekAgendaOf fills the days from the owner's layout, or from the template (S4, S5)", () => {
  it('T3 reads every non-match weekday from the layout, with its work counted', () => {
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [],
    });
    expect(agenda.days.map((day) => `${day.weekdayName} ${day.kind} ${day.planDay?.name ?? '-'}`)).toEqual([
      'Lunes workout PIERNA',
      'Martes workout TORSO A',
      'Miércoles workout MOVILIDAD Y CORE',
      'Jueves match -',
      'Viernes workout TORSO B',
      'Sábado rest -',
      'Domingo rest -',
    ]);
    expect(agenda.days[0]?.exerciseCount).toBe(4);
    expect(agenda.days[0]?.setCount).toBe(12);
    expect(agenda.days[6]?.exerciseCount).toBe(0);
    expect(agenda.days[6]?.setCount).toBe(0);
    // The four are reported in plan order, each with the weekday it holds (S10).
    expect(agenda.planDays.map((entry) => `${entry.planDay.name} ${String(entry.weekday)}`)).toEqual([
      'PIERNA 0',
      'TORSO A 1',
      'TORSO B 4',
      'MOVILIDAD Y CORE 2',
    ]);
  });

  it('T3 follows the owner when the layout disagrees with the template (S3, S4)', () => {
    // S3 is "cambiar qué entreno va ese día": the legs go to Friday and TORSO B to Monday.
    const own = layout([UPPER_B.id, UPPER_A.id, PREP.id, null, LEG.id, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: own,
      sessions: [],
    });
    expect(agenda.days[0]?.planDay?.name).toBe('TORSO B');
    expect(agenda.days[4]?.planDay?.name).toBe('PIERNA');
    expect(agenda.days[4]?.lockReason).toBeNull();
  });

  it('T3 falls back to the templates when this device has no layout yet (S4)', () => {
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: undefined,
      sessions: [],
    });
    expect(agenda.days.map((day) => `${day.weekdayName} ${day.planDay?.name ?? '-'}`)).toEqual([
      'Lunes PIERNA',
      'Martes TORSO A',
      'Miércoles MOVILIDAD Y CORE',
      'Jueves -',
      'Viernes TORSO B',
      'Sábado -',
      'Domingo -',
    ]);
  });

  it('T3 leaves a weekday free where the layout names no plan day', () => {
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: layout([null, null, null, null, null, null, null]),
      sessions: [],
    });
    expect(agenda.days.filter((day) => day.kind === 'workout')).toEqual([]);
    expect(agenda.days.filter((day) => day.kind === 'rest')).toHaveLength(6);
    expect(agenda.planDays.map((entry) => entry.weekday)).toEqual([null, null, null, null]);
  });
});

describe('weekAgendaOf reports a plan day the match displaced, and never moves it (S10)', () => {
  it('T3 leaves the legs without a weekday when the cup match lands on theirs', () => {
    // The owner had the legs on Tuesday; this week the cup plays on Tuesday. The app does
    // not hunt for a hole: the day is shown without a day, to be placed with a gesture.
    const own = layout([PREP.id, LEG.id, UPPER_A.id, null, UPPER_B.id, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: own,
      sessions: [],
    });
    expect(agenda.days[1]?.kind).toBe('match');
    expect(agenda.days.some((day) => day.planDay?.id === LEG.id)).toBe(false);
    // Thursday of this layout was free, and it stays free: nothing moved on its own.
    expect(agenda.days[3]?.kind).toBe('rest');
    expect(agenda.planDays.map((entry) => `${entry.planDay.name} ${String(entry.weekday)}`)).toEqual([
      'PIERNA null',
      'TORSO A 2',
      'TORSO B 4',
      'MOVILIDAD Y CORE 0',
    ]);
    // It is still one of the four, with the work it asks for.
    expect(agenda.planDays[0]?.exerciseCount).toBe(4);
    expect(agenda.planDays).toHaveLength(4);
  });
});

describe('weekAgendaOf marks a day done by its plan day and this week (S1, S6)', () => {
  it('T3 marks a day done from a closed session of that plan day', () => {
    const agenda = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [session(LEG.id, MONDAY, 'completed'), session(UPPER_A.id, TUESDAY, 'partial')],
    });
    expect(agenda.days.map((day) => day.done)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(agenda.days[0]?.locked).toBe(true);
    expect(agenda.days[0]?.lockReason).toBe('done');
    expect(agenda.doneCount).toBe(2);
  });

  it('T1 never closes a row whose date has not arrived (home-feedback S1)', () => {
    // The owner trained TORSO B on Tuesday from the tab bar while the layout keeps it on
    // Friday: the session is of this week and of that plan day, but Friday has not come,
    // so the row cannot claim a training that the calendar has not reached.
    const own = layout([LEG.id, null, PREP.id, UPPER_A.id, UPPER_B.id, null, null]);
    const agenda = weekAgendaOf({
      now: TUESDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: own,
      sessions: [session(UPPER_B.id, TUESDAY)],
    });
    expect(agenda.days[4]?.planDay?.id).toBe(UPPER_B.id);
    expect(agenda.days[4]?.done).toBe(false);
    expect(agenda.days[4]?.locked).toBe(false);
    expect(agenda.days[4]?.lockReason).toBeNull();
    // The tally counts plan days trained this week, so the session still counts there.
    expect(agenda.doneCount).toBe(1);
  });

  it('T1 closes the row on its own date, not one minute before (home-feedback S1)', () => {
    // The guard is the date, so the boundary has to be the boundary: the Friday row is
    // still open at 23:59 on Thursday and closes a minute into Friday.
    const own = layout([LEG.id, null, PREP.id, UPPER_A.id, UPPER_B.id, null, null]);
    const sessions = [session(UPPER_B.id, TUESDAY)];
    const eve = weekAgendaOf({
      now: new Date(2026, 2, 5, 23, 59).getTime(),
      matchKind: 'league',
      plan: PLAN,
      layout: own,
      sessions,
    });
    const day = weekAgendaOf({
      now: new Date(2026, 2, 6, 0, 1).getTime(),
      matchKind: 'league',
      plan: PLAN,
      layout: own,
      sessions,
    });
    expect(eve.days[4]?.done).toBe(false);
    expect(day.days[4]?.done).toBe(true);
    expect(day.days[4]?.lockReason).toBe('done');
  });

  it('T3 follows the plan day once that date has arrived (S1)', () => {
    // The legs were trained on Monday and the owner then moved the day to Friday: from
    // Friday on, the row that shows the legs reads done. Before Friday it does not, however
    // trained the plan day already is (home-feedback S1).
    const own = layout([UPPER_B.id, UPPER_A.id, PREP.id, null, LEG.id, null, null]);
    const agenda = weekAgendaOf({
      now: SATURDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: own,
      sessions: [session(LEG.id, MONDAY)],
    });
    expect(agenda.days[4]?.done).toBe(true);
    expect(agenda.days[4]?.locked).toBe(true);
    expect(agenda.days[4]?.lockReason).toBe('done');
    // Monday holds TORSO B this week, and TORSO B was not trained.
    expect(agenda.days[0]?.done).toBe(false);
    expect(agenda.days[0]?.locked).toBe(false);
  });

  it('T3 ignores another week, an abandoned session and an open one (S6)', () => {
    const agenda = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [
        session(LEG.id, new Date(2026, 1, 23, 18, 0).getTime()), // last Monday
        session(UPPER_A.id, TUESDAY, 'abandoned'),
        session(PREP.id, WEDNESDAY, 'inProgress'),
      ],
    });
    expect(agenda.days.map((day) => day.done)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(agenda.doneCount).toBe(0);
    // A past day without a session is not locked: it stays movable (S6).
    expect(agenda.days[0]?.locked).toBe(false);
    expect(agenda.days.filter((day) => day.locked).map((day) => day.weekdayName)).toEqual(['Jueves']);
  });

  it('T3 keeps Sunday inside the week and the next Monday outside it (R11)', () => {
    const sunday = new Date(2026, 2, 8, 20, 0).getTime();
    const nextMonday = new Date(2026, 2, 9, 0, 30).getTime();
    const closedOnSunday = weekAgendaOf({
      // Sunday, so the Friday row's own date has already arrived (home-feedback S1).
      now: sunday,
      matchKind: 'league',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [session(UPPER_B.id, sunday)],
    });
    expect(closedOnSunday.days[4]?.done).toBe(true);

    const closedNextWeek = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [session(UPPER_B.id, nextMonday)],
    });
    expect(closedNextWeek.days[4]?.done).toBe(false);
    expect(closedNextWeek.doneCount).toBe(0);
  });
});

describe('weekAgendaOf warns about legs the day after the match, and never blocks (S4)', () => {
  it('T3 warns in a cup week when the legs sit the day after the match', () => {
    // Cup on Tuesday, legs on Wednesday: the one placement the layouts exist to avoid (L7).
    const own = layout([PREP.id, null, LEG.id, UPPER_A.id, UPPER_B.id, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: own,
      sessions: [],
    });
    expect(agenda.warning).toBe(
      'Pierna el miércoles cae el día después del partido. Se puede, pero la app prefiere las piernas lejos del partido.',
    );
  });

  it('T3 says nothing when the legs are somewhere else (S4)', () => {
    const own = layout([LEG.id, null, PREP.id, UPPER_A.id, UPPER_B.id, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      layout: own,
      sessions: [],
    });
    expect(agenda.days[3]?.kind).toBe('match');
    expect(agenda.days[0]?.planDay?.name).toBe('PIERNA');
    expect(agenda.warning).toBeNull();
  });

  it('T3 says nothing in a week without a match, because there is no day after it', () => {
    const own = layout([PREP.id, LEG.id, UPPER_A.id, UPPER_B.id, null, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'none',
      plan: PLAN,
      layout: own,
      sessions: [],
    });
    expect(agenda.warning).toBeNull();
  });

  it('T3 warns, never blocks: the placement the warning advises against still succeeds', () => {
    const own = layout([PREP.id, null, null, UPPER_A.id, UPPER_B.id, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: own,
      sessions: [],
    });
    expect(agenda.warning).toBeNull();
    const placed = placePlanDay({ agenda, layout: own, planDayId: LEG.id, toWeekday: 2 });
    expect(placed.ok).toBe(true);
    if (placed.ok) {
      // Wednesday, the day after the cup match: the app does not forbid it (S4).
      expect(placed.layout.slots[2]?.planDayId).toBe(LEG.id);
    }
    // The agenda built from the new layout is the one that carries the warning.
    const warned = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: placed.ok ? placed.layout : own,
      sessions: [],
    });
    expect(warned.warning).toBe(
      'Pierna el miércoles cae el día después del partido. Se puede, pero la app prefiere las piernas lejos del partido.',
    );
  });
});

describe('placePlanDay is the one placement the drag and the day sheet use (S2, S3, S6, S10)', () => {
  function agendaOf(
    own: WeekLayout,
    sessions: readonly WorkoutSession[] = [],
    matchKind: MatchKind = 'league',
  ): WeekAgenda {
    return weekAgendaOf({ now: MONDAY, matchKind, plan: PLAN, layout: own, sessions });
  }

  it('T3 moves a day to a free weekday and leaves the weekday it left free', () => {
    const agenda = agendaOf(LEAGUE_LAYOUT);
    const placed = placePlanDay({ agenda, layout: LEAGUE_LAYOUT, planDayId: LEG.id, toWeekday: 5 });
    expect(placed).toEqual({
      ok: true,
      layout: layout([null, UPPER_A.id, PREP.id, null, UPPER_B.id, LEG.id, null]),
      placed: LEG.id,
      displaced: null,
    });
  });

  it('T3 exchanges the two days when the weekday is taken, and names the displaced one', () => {
    const agenda = agendaOf(LEAGUE_LAYOUT);
    const placed = placePlanDay({ agenda, layout: LEAGUE_LAYOUT, planDayId: LEG.id, toWeekday: 1 });
    expect(placed).toMatchObject({ ok: true, placed: LEG.id, displaced: UPPER_A.id });
    if (!placed.ok) return;
    expect(placed.layout.slots.map((slot) => slot.planDayId)).toEqual([
      UPPER_A.id,
      LEG.id,
      PREP.id,
      null,
      UPPER_B.id,
      null,
      null,
    ]);
    // Complete, ascending, and the owner's stored layout is not the one that changed.
    expect(placed.layout.slots.map((slot) => slot.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(LEAGUE_LAYOUT.slots.map((slot) => slot.planDayId)).toEqual([
      LEG.id,
      UPPER_A.id,
      PREP.id,
      null,
      UPPER_B.id,
      null,
      null,
    ]);
  });

  it('T3 refuses the match, a closed day, the weekday it already has, a bad weekday and a stranger (S6)', () => {
    const agenda = agendaOf(LEAGUE_LAYOUT, [session(LEG.id, MONDAY)]);
    const ask = (planDayId: string, toWeekday: number) =>
      placePlanDay({ agenda, layout: LEAGUE_LAYOUT, planDayId, toWeekday });

    expect(ask(UPPER_A.id, 3)).toEqual({ ok: false, reason: 'matchDay' });
    // Monday holds the closed leg day: nothing lands on a day that is done.
    expect(ask(UPPER_A.id, 0)).toEqual({ ok: false, reason: 'doneDay' });
    expect(ask(UPPER_A.id, 1)).toEqual({ ok: false, reason: 'sameDay' });
    expect(ask(UPPER_A.id, 7)).toEqual({ ok: false, reason: 'unknownDay' });
    expect(ask(UPPER_A.id, -1)).toEqual({ ok: false, reason: 'unknownDay' });
    expect(ask(UPPER_A.id, 2.5)).toEqual({ ok: false, reason: 'unknownDay' });
    expect(ask('gone', 1)).toEqual({ ok: false, reason: 'unknownPlanDay' });
  });

  it('T3 refuses to drag a day that is already done (S6)', () => {
    const agenda = agendaOf(LEAGUE_LAYOUT, [session(LEG.id, MONDAY)]);
    expect(placePlanDay({ agenda, layout: LEAGUE_LAYOUT, planDayId: LEG.id, toWeekday: 5 })).toEqual({
      ok: false,
      reason: 'doneDay',
    });
  });

  it('T3 places a day the match displaced, on a weekday that was free (S10)', () => {
    const own = layout([PREP.id, LEG.id, UPPER_A.id, null, UPPER_B.id, null, null]);
    const agenda = agendaOf(own, [], 'cup');
    expect(agenda.planDays[0]?.weekday).toBeNull();

    const placed = placePlanDay({ agenda, layout: own, planDayId: LEG.id, toWeekday: 3 });
    expect(placed).toMatchObject({ ok: true, placed: LEG.id, displaced: null });
    if (!placed.ok) return;
    expect(placed.layout.slots.map((slot) => slot.planDayId)).toEqual([
      PREP.id,
      null,
      UPPER_A.id,
      LEG.id,
      UPPER_B.id,
      null,
      null,
    ]);
    // The match keeps Tuesday, and the agenda reads the move back.
    expect(placed.layout.slots[1]?.planDayId).toBeNull();
    const moved = agendaOf(placed.layout, [], 'cup');
    expect(moved.days[3]?.planDay?.name).toBe('PIERNA');
    expect(moved.planDays[0]?.weekday).toBe(3);
  });

  it('T3 lets the displaced day lose its weekday when it lands on a taken one (S10)', () => {
    const own = layout([PREP.id, LEG.id, UPPER_A.id, null, UPPER_B.id, null, null]);
    const agenda = agendaOf(own, [], 'cup');
    const placed = placePlanDay({ agenda, layout: own, planDayId: LEG.id, toWeekday: 4 });
    expect(placed).toMatchObject({ ok: true, placed: LEG.id, displaced: UPPER_B.id });
    if (!placed.ok) return;
    // The layout still names Tuesday — the owner's assignment outlives the match week — so
    // TORSO B takes Tuesday in the layout and the match displaces it when the week is read.
    expect(placed.layout.slots.map((slot) => slot.planDayId)).toEqual([
      PREP.id,
      UPPER_B.id,
      UPPER_A.id,
      null,
      LEG.id,
      null,
      null,
    ]);
    const moved = agendaOf(placed.layout, [], 'cup');
    expect(moved.days[1]?.kind).toBe('match');
    expect(moved.planDays.find((entry) => entry.planDay.id === UPPER_B.id)?.weekday).toBeNull();
  });
});

describe('defaultLayoutOf materialises the templates through the name bridge (S4, S10)', () => {
  it('T3 writes the league week as seven slots of plan day ids', () => {
    expect(defaultLayoutOf({ matchKind: 'league', plan: PLAN })).toEqual(
      layout([LEG.id, UPPER_A.id, PREP.id, null, UPPER_B.id, null, null]),
    );
  });

  it('T3 writes the cup week and the fixture-less week the same way', () => {
    expect(defaultLayoutOf({ matchKind: 'cup', plan: PLAN }).slots.map((slot) => slot.planDayId)).toEqual([
      PREP.id,
      null,
      UPPER_A.id,
      LEG.id,
      UPPER_B.id,
      null,
      null,
    ]);
    expect(defaultLayoutOf({ matchKind: 'none', plan: PLAN }).slots.map((slot) => slot.planDayId)).toEqual([
      LEG.id,
      UPPER_A.id,
      PREP.id,
      UPPER_B.id,
      null,
      null,
      null,
    ]);
  });

  it('T3 never invents a plan day: the one the plan lost leaves its weekday free', () => {
    const withoutPrep = PLAN.filter((day) => day.id !== PREP.id);
    const materialised = defaultLayoutOf({ matchKind: 'league', plan: withoutPrep });
    expect(materialised.slots.map((slot) => slot.planDayId)).toEqual([
      LEG.id,
      UPPER_A.id,
      null,
      null,
      UPPER_B.id,
      null,
      null,
    ]);
    expect(materialised.slots.map((slot) => slot.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("T3 starts the first drag from the week the owner already sees", () => {
    const fromTemplates = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: undefined,
      sessions: [],
    });
    const fromDefault = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: defaultLayoutOf({ matchKind: 'cup', plan: PLAN }),
      sessions: [],
    });
    expect(fromDefault.days).toEqual(fromTemplates.days);
    expect(fromDefault.planDays).toEqual(fromTemplates.planDays);
  });
});

describe('the agenda keeps its edges (T3)', () => {
  it('T3 dates a Sunday as the last day of the week that started six days before', () => {
    const sunday = new Date(2026, 2, 8, 9, 0).getTime();
    const agenda = weekAgendaOf({
      now: sunday,
      matchKind: 'league',
      plan: PLAN,
      layout: LEAGUE_LAYOUT,
      sessions: [],
    });
    expect(agenda.monday).toBe('2026-03-02');
    expect(agenda.days[6]?.today).toBe(true);
    expect(agenda.days.filter((day) => day.today)).toHaveLength(1);
  });

  it('T3 still counts a done day the match displaced, with no row to show it (S1, S10)', () => {
    // The legs were trained on a Tuesday, in a week the cup plays on Tuesday: no row holds
    // them, and the tally of the week still says one of the four is done.
    const own = layout([PREP.id, LEG.id, UPPER_A.id, null, UPPER_B.id, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      layout: own,
      sessions: [session(LEG.id, TUESDAY)],
    });
    expect(agenda.days.some((day) => day.done)).toBe(false);
    expect(agenda.doneCount).toBe(1);
  });

  it('T3 places a day on a weekend in a week without a match, and nothing changes it', () => {
    const own = layout([LEG.id, UPPER_A.id, PREP.id, UPPER_B.id, null, null, null]);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'none',
      plan: PLAN,
      layout: own,
      sessions: [],
    });
    const placed = placePlanDay({ agenda, layout: own, planDayId: UPPER_B.id, toWeekday: 6 });
    expect(placed).toMatchObject({ ok: true, placed: UPPER_B.id, displaced: null });
    if (!placed.ok) return;
    const moved = weekAgendaOf({
      now: MONDAY,
      matchKind: 'none',
      plan: PLAN,
      layout: placed.layout,
      sessions: [],
    });
    expect(moved.days[6]?.kind).toBe('workout');
    expect(moved.days[6]?.planDay?.name).toBe('TORSO B');
    expect(moved.days[3]?.kind).toBe('rest');
  });
});
