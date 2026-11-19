/**
 * T3 — the week as seven dated rows (S1), derived from the fixture's template (S2, S3).
 *
 * Every case names its own week through `now`, so the suite reads the same on any machine
 * and in any time zone. The plan days arrive as they are stored, with their items, because
 * the agenda counts exercises and sets per row instead of trusting a label. The stored
 * placement, the drag and the day sheet are gone (`odd/tasks/backlog-closeout.md` T4), so
 * no case hands the agenda a layout.
 */

import { describe, expect, it } from 'vitest';
import type { MatchKind } from '../../core/engine/week-plan';
import type { PlanDay, SessionStatus, WorkoutSession } from '../../storage';
import { nextPlanDay } from '../session/start';
import { weekAgendaOf, weekProposalOf, type WeekAgenda } from './agenda';

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

describe('weekAgendaOf dates the week from the fixture (S4)', () => {
  it('T3 gives seven dated days, Monday first, from the Monday that contains now', () => {
    const agenda = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
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
      sessions: [],
    });
    expect(none.days.filter((day) => day.kind === 'match')).toEqual([]);
    expect(none.days.filter((day) => day.locked)).toEqual([]);
  });
});

describe("weekAgendaOf fills the days from the fixture's template (S2, S3)", () => {
  it('T3 reads every weekday from the template, with its work counted', () => {
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      sessions: [],
    });
    expect(agenda.days.map((day) => `${day.weekdayName} ${day.kind} ${day.planDay?.name ?? '-'}`)).toEqual([
      'Lunes workout PIERNA',
      'Martes workout MOVILIDAD Y CORE',
      'Miércoles workout TORSO A',
      'Jueves match -',
      'Viernes workout TORSO B',
      'Sábado rest -',
      'Domingo rest -',
    ]);
    expect(agenda.days[0]?.exerciseCount).toBe(4);
    expect(agenda.days[0]?.setCount).toBe(12);
    expect(agenda.days[6]?.exerciseCount).toBe(0);
    expect(agenda.days[6]?.setCount).toBe(0);
    // The four are reported in plan order, each with the weekday the template gives it.
    expect(agenda.planDays.map((entry) => `${entry.planDay.name} ${String(entry.weekday)}`)).toEqual([
      'PIERNA 0',
      'TORSO A 2',
      'TORSO B 4',
      'MOVILIDAD Y CORE 1',
    ]);
  });

  it('T3 leaves a weekday free where the plan lost the day the template asks for', () => {
    // The template names the day by role and the role is found by name: a plan the owner
    // renamed or deleted leaves its weekday empty instead of borrowing a stranger's day.
    const withoutPrep = PLAN.filter((day) => day.id !== PREP.id);
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: withoutPrep,
      sessions: [],
    });
    expect(agenda.days[1]?.kind).toBe('rest');
    expect(agenda.days[1]?.planDay).toBeNull();
    expect(agenda.days.filter((day) => day.kind === 'workout')).toHaveLength(3);
    expect(agenda.planDays.map((entry) => entry.weekday)).toEqual([0, 2, 4]);
  });
});

describe('weekAgendaOf marks a day done by its plan day and this week (S1, S6)', () => {
  it('T3 marks a day done from a closed session of that plan day', () => {
    const agenda = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
      sessions: [session(LEG.id, MONDAY, 'completed'), session(UPPER_A.id, TUESDAY, 'partial')],
    });
    // Monday holds the legs and Wednesday the press: both were trained, on other weekdays
    // than the ones their rows now hold, and both rows read done.
    expect(agenda.days.map((day) => day.done)).toEqual([
      true,
      false,
      true,
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
    // The owner trained TORSO B on Tuesday from the tab bar while the template keeps it on
    // Friday: the session is of this week and of that plan day, but Friday has not come,
    // so the row cannot claim a training that the calendar has not reached.
    const agenda = weekAgendaOf({
      now: TUESDAY,
      matchKind: 'cup',
      plan: PLAN,
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
    const sessions = [session(UPPER_B.id, TUESDAY)];
    const eve = weekAgendaOf({
      now: new Date(2026, 2, 5, 23, 59).getTime(),
      matchKind: 'league',
      plan: PLAN,
      sessions,
    });
    const day = weekAgendaOf({
      now: new Date(2026, 2, 6, 0, 1).getTime(),
      matchKind: 'league',
      plan: PLAN,
      sessions,
    });
    expect(eve.days[4]?.done).toBe(false);
    expect(day.days[4]?.done).toBe(true);
    expect(day.days[4]?.lockReason).toBe('done');
  });

  it('T3 ignores another week, an abandoned session and an open one (S6)', () => {
    const agenda = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
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
      sessions: [session(UPPER_B.id, sunday)],
    });
    expect(closedOnSunday.days[4]?.done).toBe(true);

    const closedNextWeek = weekAgendaOf({
      now: WEDNESDAY,
      matchKind: 'league',
      plan: PLAN,
      sessions: [session(UPPER_B.id, nextMonday)],
    });
    expect(closedNextWeek.days[4]?.done).toBe(false);
    expect(closedNextWeek.doneCount).toBe(0);
  });
});

describe('weekAgendaOf warns about legs the day after the match (S4)', () => {
  const WARNING =
    'Pierna el miércoles cae el día después del partido. Se puede, pero la app prefiere las piernas lejos del partido.';

  it('T3 warns in a cup week, whose template puts the legs the day after the match', () => {
    // Cup on Tuesday, legs on Wednesday: the cup template places the squat there by
    // decision (`odd/tasks/leg-separation.md` S3), which is the case the sentence names.
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      sessions: [],
    });
    expect(agenda.days[1]?.kind).toBe('match');
    expect(agenda.days[2]?.planDay?.name).toBe('PIERNA');
    expect(agenda.warning).toBe(WARNING);
  });

  it('T3 says nothing when the legs are somewhere else (S4)', () => {
    // The league template puts the legs on Monday, four days before Thursday's match.
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'league',
      plan: PLAN,
      sessions: [],
    });
    expect(agenda.days[3]?.kind).toBe('match');
    expect(agenda.days[0]?.planDay?.name).toBe('PIERNA');
    expect(agenda.warning).toBeNull();
  });

  it('T3 says nothing in a week without a match, because there is no day after it', () => {
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'none',
      plan: PLAN,
      sessions: [],
    });
    expect(agenda.warning).toBeNull();
  });
});

describe('the agenda keeps its edges (T3)', () => {
  it('T3 dates a Sunday as the last day of the week that started six days before', () => {
    const sunday = new Date(2026, 2, 8, 9, 0).getTime();
    const agenda = weekAgendaOf({
      now: sunday,
      matchKind: 'league',
      plan: PLAN,
      sessions: [],
    });
    expect(agenda.monday).toBe('2026-03-02');
    expect(agenda.days[6]?.today).toBe(true);
    expect(agenda.days.filter((day) => day.today)).toHaveLength(1);
  });

  it('T3 still counts a day trained on another weekday, with no row reading done yet (S1)', () => {
    // The legs were trained on a Tuesday, in a cup week whose template holds them on
    // Wednesday: the row that shows them has not reached its date, so it is not done, and
    // the tally of the week still says one of the four is trained.
    const agenda = weekAgendaOf({
      now: MONDAY,
      matchKind: 'cup',
      plan: PLAN,
      sessions: [session(LEG.id, TUESDAY)],
    });
    expect(agenda.days[2]?.planDay?.id).toBe(LEG.id);
    expect(agenda.days.some((day) => day.done)).toBe(false);
    expect(agenda.doneCount).toBe(1);
  });
});

/**
 * T1 (S3, S4) — the day the match row proposes.
 *
 * The proposal is read from the week's own sessions: the first day of the rotation the
 * week has no closed session for, and the rotation's next day once the week has all four.
 * `monday` is the local `YYYY-MM-DD` the agenda already dates the week with.
 */
describe('weekProposalOf proposes the first undone day of the week (S3, S4)', () => {
  const MONDAY_TEXT = '2026-03-02';
  /** The Monday of the week before, same weekday, so only the week separates the two. */
  const LAST_WEEK_MONDAY = new Date(2026, 1, 23, 9, 0).getTime();

  it('T1 proposes the first day of the rotation when the week has closed nothing', () => {
    expect(weekProposalOf(PLAN, [], MONDAY_TEXT)).toBe(LEG);
  });

  it('T1 follows the rotation order, not the order the plan was handed in', () => {
    const shuffled: readonly PlanDay[] = [PREP, UPPER_B, UPPER_A, LEG];
    expect(weekProposalOf(shuffled, [], MONDAY_TEXT)).toBe(LEG);
  });

  it('T1 skips the day this week already closed and proposes the next one', () => {
    expect(weekProposalOf(PLAN, [session(LEG.id, MONDAY)], MONDAY_TEXT)).toBe(UPPER_A);
  });

  it('T1 does not skip the day that was closed last week', () => {
    // Same weekday, same day of the plan, one week earlier: another week says nothing.
    expect(weekProposalOf(PLAN, [session(LEG.id, LAST_WEEK_MONDAY)], MONDAY_TEXT)).toBe(LEG);
  });

  it('T1 counts only a closed session: in progress and scheduled are not training', () => {
    const untrained = [
      session(LEG.id, MONDAY, 'inProgress'),
      session(LEG.id, TUESDAY, 'scheduled'),
    ];
    expect(weekProposalOf(PLAN, untrained, MONDAY_TEXT)).toBe(LEG);
  });

  it('T1 counts a partial session as closed, exactly as the rotation does', () => {
    expect(weekProposalOf(PLAN, [session(LEG.id, MONDAY, 'partial')], MONDAY_TEXT)).toBe(UPPER_A);
  });

  it('T1 breaks a tie in order by id', () => {
    const first = planDay('tie-a', 'A', 0, 1, 1);
    const second = planDay('tie-b', 'B', 0, 1, 1);
    expect(weekProposalOf([second, first], [], MONDAY_TEXT)).toBe(first);
  });

  it('T1 falls back to the rotation when the week already has all four', () => {
    // The last closed day of the week is TORSO B, so the rotation's next day is the
    // preparation day — a fifth session is still possible, and it is not the first day.
    const allTrained = [
      session(LEG.id, MONDAY),
      session(UPPER_A.id, TUESDAY),
      session(PREP.id, WEDNESDAY),
      session(UPPER_B.id, THURSDAY),
    ];
    expect(weekProposalOf(PLAN, allTrained, MONDAY_TEXT)).toBe(PREP);
    expect(weekProposalOf(PLAN, allTrained, MONDAY_TEXT)).toBe(nextPlanDay(PLAN, allTrained));
  });

  it('T1 proposes nothing when the plan is empty', () => {
    expect(weekProposalOf([], [], MONDAY_TEXT)).toBeNull();
  });
});

/**
 * T2, T4 (S2, S5, S6) — what the match row carries: the day the app proposes for it, and
 * whether that date was trained.
 *
 * Both are read from the sessions the week already has. The proposal is the one T1 pinned
 * (`weekProposalOf`, called and not copied) and it reaches the match row and no other row;
 * `trained` is about one date, not about one plan day, because the match row has no plan
 * day of its own.
 */
describe('the match row carries the proposal and its training (S2, S5, S6)', () => {
  /** Thursday 26 February 2026 — the same weekday, one week before `THURSDAY`. */
  const LAST_WEEK_THURSDAY = new Date(2026, 1, 26, 9, 0).getTime();

  const weekOf = (sessions: readonly WorkoutSession[]): WeekAgenda =>
    weekAgendaOf({
      now: THURSDAY,
      matchKind: 'league',
      plan: PLAN,
      sessions,
    });

  it('T2 puts the proposal on the match row, and on no other row', () => {
    const agenda = weekOf([]);

    expect(agenda.days[3]?.proposal).toBe(LEG);
    expect(agenda.days.filter((day) => day.proposal !== null).map((day) => day.weekday)).toEqual([3]);
  });

  it('T2 proposes the next day of the rotation once the week has closed the first', () => {
    // The same answer `weekProposalOf` gives: the match row reads it, it does not decide.
    expect(weekOf([session(LEG.id, MONDAY)]).days[3]?.proposal).toBe(UPPER_A);
  });

  it('T2 proposes nothing on a week with no plan', () => {
    const agenda = weekAgendaOf({
      now: THURSDAY,
      matchKind: 'league',
      plan: [],
      sessions: [],
    });

    expect(agenda.days[3]?.proposal).toBeNull();
  });

  it('T2 calls the row trained when a closed session sits on its own date', () => {
    expect(weekOf([session(LEG.id, THURSDAY, 'completed')]).days[3]?.trained).toBe(true);
    expect(weekOf([session(LEG.id, THURSDAY, 'partial')]).days[3]?.trained).toBe(true);
  });

  it('T2 does not call it trained for an open session, a scheduled one, or another date', () => {
    expect(weekOf([session(LEG.id, THURSDAY, 'inProgress')]).days[3]?.trained).toBe(false);
    expect(weekOf([session(LEG.id, THURSDAY, 'scheduled')]).days[3]?.trained).toBe(false);
    expect(weekOf([session(LEG.id, TUESDAY)]).days[3]?.trained).toBe(false);
    // Same weekday, same plan day, one week earlier: another week trained nothing here.
    expect(weekOf([session(LEG.id, LAST_WEEK_THURSDAY)]).days[3]?.trained).toBe(false);
  });

  it('T2 leaves the trained match row locked, with no plan day of its own', () => {
    const match = weekOf([session(LEG.id, THURSDAY)]).days[3];

    // The match lock and the `done` semantics are the match's own (S5): training on it
    // makes it a trained day to read, never a workout row.
    expect(match?.kind).toBe('match');
    expect(match?.planDay).toBeNull();
    expect(match?.done).toBe(false);
    expect(match?.locked).toBe(true);
    expect(match?.lockReason).toBe('match');
  });
});
