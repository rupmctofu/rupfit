/**
 * T4/T5 — the week of the match, in the app tier.
 *
 * Two questions are answered here and nowhere else: which day of the week today is
 * (S5, "hoy toca esto"), and which days today can exchange places with (S6, S9 — "se
 * mueve a otro día de la semana" is the trade, not a hole to find). The stored plan days
 * arrive as they are stored, so the tests also pin the two ways the week has to fail soft:
 * a record of another week, and a plan that lost one of the four seeded days.
 */

import { describe, expect, it } from 'vitest';
import type { PlanDay, WeekRecord } from '../../storage';
import { weekDaysOf, weekFixtureOf, weekTodayOf } from './week';

/** Monday 2 March 2026 and the Wednesday and Thursday of that same week, 18:00 local. */
const MONDAY = new Date(2026, 2, 2, 18, 0, 0).getTime();
const WEDNESDAY = new Date(2026, 2, 4, 18, 0, 0).getTime();
const THURSDAY = new Date(2026, 2, 5, 18, 0, 0).getTime();

const MONDAY_OF_WEEK = '2026-03-02';

function planDay(id: string, name: string, order: number): PlanDay {
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
        prescription: {
          sets: 2,
          repRange: { lowerBound: 8, upperBound: 10 },
          targetRIR: { lowerBound: 2, upperBound: 3 },
          restSeconds: 180,
        },
      },
    ],
  };
}

/** The four days of the seed, in rotation order (L5, L7). */
const PLAN: readonly PlanDay[] = [
  planDay('seed-day-leg', 'PIERNA', 0),
  planDay('seed-day-torso-a', 'TORSO A', 1),
  planDay('seed-day-torso-b', 'TORSO B', 2),
  planDay('seed-day-fisico', 'MOVILIDAD Y CORE', 3),
];

/** T3: the league is the default, Thursday, and the record is the whole week's memory. */
const LEAGUE: WeekRecord = { monday: MONDAY_OF_WEEK, match: 'league', swaps: [] };

describe('weekDaysOf maps the stored plan days by name', () => {
  it('T4 names the four roles from the seed names, whatever the stored order', () => {
    const days = weekDaysOf([...PLAN].reverse());
    expect(days).toEqual({
      leg: 'seed-day-leg',
      upperA: 'seed-day-torso-a',
      upperB: 'seed-day-torso-b',
      prep: 'seed-day-fisico',
    });
  });

  it('T4 returns nothing when one of the four is missing instead of guessing', () => {
    expect(weekDaysOf(PLAN.slice(0, 3))).toBeNull();
  });

  it('T4 finds a day the owner renamed in another case, through the one formatter', () => {
    const renamed = PLAN.map((day) => (day.name === 'PIERNA' ? { ...day, name: 'Pierna' } : day));
    expect(weekDaysOf(renamed)?.leg).toBe('seed-day-leg');
  });

  it('T4 keeps reading the fourth day under the name S1 replaced', () => {
    // A store the launch refresh has not rewritten, the demo fixture and a day the owner
    // edited all still say `PREPARACIÓN FÚTBOL`; the role and the day id did not change.
    const legacy = PLAN.map((day) =>
      day.id === 'seed-day-fisico' ? { ...day, name: 'PREPARACIÓN FÚTBOL' } : day,
    );
    expect(weekDaysOf(legacy)?.prep).toBe('seed-day-fisico');
  });
});

describe('weekTodayOf reads today from the week plan (S5, T4)', () => {
  it('T4 answers Monday from the league layout instead of the rotation', () => {
    const today = weekTodayOf({ now: MONDAY, plan: PLAN, week: LEAGUE });
    expect(today?.day.date).toBe('2026-03-02');
    expect(today?.day.weekday).toBe('Lunes');
    expect(today?.day.kind).toBe('training');
    expect(today?.planDay?.id).toBe('seed-day-leg');
    expect(today?.planDay?.name).toBe('PIERNA');
  });

  it('T3 answers the match day on Thursday, without a plan day behind it (S11)', () => {
    const today = weekTodayOf({ now: THURSDAY, plan: PLAN, week: LEAGUE });
    expect(today?.day.date).toBe('2026-03-05');
    expect(today?.day.kind).toBe('match');
    expect(today?.planDay).toBeNull();
    // Nothing to exchange on the day of the match, and nothing offered either.
    expect(today?.targets).toEqual([]);
  });

  it('T5 moves today when the stored week holds a swap', () => {
    const swapped: WeekRecord = { ...LEAGUE, swaps: [{ from: 0, to: 1 }] };
    const today = weekTodayOf({ now: MONDAY, plan: PLAN, week: swapped });
    // The owner trained the upper body A day on Monday, so the legs are the ones that
    // moved: the weekday is still Monday, what changed is which day fills it (S9).
    expect(today?.day.weekday).toBe('Lunes');
    expect(today?.planDay?.id).toBe('seed-day-torso-a');
    // The targets read back from the exchanged week: Tuesday holds the leg day now.
    expect(today?.targets.map((target) => `${target.weekday} ${target.planDay.name}`)).toEqual([
      'Martes PIERNA',
      'Miércoles MOVILIDAD Y CORE',
      'Viernes TORSO B',
    ]);
  });

  it('T3 ignores a record from another week and leaves the rotation to answer', () => {
    const lastWeek: WeekRecord = { ...LEAGUE, monday: '2026-03-09' };
    expect(weekTodayOf({ now: MONDAY, plan: PLAN, week: lastWeek })).toBeNull();
    expect(weekTodayOf({ now: MONDAY, plan: PLAN, week: undefined })).toBeNull();
  });

  it('T4 fails soft when a seeded day is missing, so the rotation keeps answering', () => {
    expect(weekTodayOf({ now: MONDAY, plan: PLAN.slice(0, 3), week: LEAGUE })).toBeNull();
  });

  it('T5 fails soft when the stored swap is one the engine refuses', () => {
    // A hand-edited record could name Saturday, or exchange the legs onto the day after
    // a cup match. The screen falls back to the rotation instead of throwing at the owner.
    const saturday: WeekRecord = { ...LEAGUE, swaps: [{ from: 0, to: 5 }] };
    expect(weekTodayOf({ now: MONDAY, plan: PLAN, week: saturday })).toBeNull();
    const legsAfterTheCup: WeekRecord = {
      ...LEAGUE,
      match: 'cup',
      swaps: [{ from: 3, to: 2 }],
    };
    expect(weekTodayOf({ now: THURSDAY, plan: PLAN, week: legsAfterTheCup })).toBeNull();
  });
});

describe('weekFixtureOf says which fixture the week has (T3, S11)', () => {
  it('names the league match on Thursday, and the way to the cup', () => {
    // L5: the league is every Thursday, and the cup is the exception, so a league week is
    // the one a record with no opinion describes.
    expect(weekFixtureOf(LEAGUE)).toEqual({
      label: 'Liga · jueves',
      action: 'Esta semana jugamos copa',
      next: 'cup',
    });
  });

  it('names the cup match on Tuesday, and the way back to the league', () => {
    expect(weekFixtureOf({ ...LEAGUE, match: 'cup' })).toEqual({
      label: 'Copa · martes',
      action: 'Esta semana jugamos liga',
      next: 'league',
    });
  });

  it('says nothing about a match in a week with no fixture, and still offers one', () => {
    // S11 gives the week one match or none at all: a fixture-less week has no day to name,
    // but the owner must still be able to say that this one is the cup.
    expect(weekFixtureOf({ ...LEAGUE, match: 'none' })).toEqual({
      label: null,
      action: 'Esta semana jugamos copa',
      next: 'cup',
    });
  });

  it('has nothing to say when the store holds no week at all', () => {
    expect(weekFixtureOf(undefined)).toBeNull();
  });
});

describe('weekTodayOf offers the training days today can exchange with (S6, S9)', () => {
  it('offers the other training days of a league week, never the match (S11)', () => {
    const today = weekTodayOf({ now: MONDAY, plan: PLAN, week: LEAGUE });
    // Monday holds the legs. Tuesday and Wednesday (the preparation) are exchangeable;
    // Thursday is the match and never moves; Friday is filtered by L7, because legs on
    // Friday are legs the day after the match.
    expect(today?.targets.map((target) => `${target.weekday} ${target.planDay.name}`)).toEqual([
      'Martes TORSO A',
      'Miércoles MOVILIDAD Y CORE',
    ]);
    expect(today?.targets.map((target) => target.swap)).toEqual([
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ]);
  });

  it('offers three targets in a cup week, so the change is never unavailable (S6)', () => {
    const cup: WeekRecord = { ...LEAGUE, match: 'cup' };
    const today = weekTodayOf({ now: MONDAY, plan: PLAN, week: cup });
    // Cup week: the match is Tuesday, and Monday holds the preparation. Wednesday,
    // Thursday and Friday all stay available — none of them puts the legs on Wednesday.
    expect(today?.targets.map((target) => `${target.weekday} ${target.planDay.name}`)).toEqual([
      'Miércoles TORSO A',
      'Jueves PIERNA',
      'Viernes TORSO B',
    ]);
  });

  it('filters the target that would load the legs the day after the match (L7)', () => {
    const cup: WeekRecord = { ...LEAGUE, match: 'cup' };
    // Thursday of a cup week holds the legs, so Wednesday is the only weekday L7 protects.
    const today = weekTodayOf({ now: THURSDAY, plan: PLAN, week: cup });
    expect(today?.planDay?.id).toBe('seed-day-leg');
    expect(today?.targets.map((target) => target.weekday)).toEqual(['Lunes', 'Viernes']);
  });

  it('offers every other training day of a week without a fixture', () => {
    const noMatch: WeekRecord = { ...LEAGUE, match: 'none' };
    // Wednesday holds the preparation; with no match there is no weekday to protect.
    const today = weekTodayOf({ now: WEDNESDAY, plan: PLAN, week: noMatch });
    expect(today?.targets.map((target) => target.weekday)).toEqual([
      'Lunes',
      'Martes',
      'Jueves',
    ]);
  });
});
