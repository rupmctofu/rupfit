/**
 * T4 → T4 of `odd/tasks/backlog-closeout.md` — the week of the match, in the app tier.
 *
 * One question is answered here and nowhere else: which day of the week today is (S5,
 * "hoy toca esto"), read from the fixture's template. The stored plan days arrive as they
 * are stored, so the tests also pin the ways the week has to fail soft: a record of
 * another week, a plan that lost one of the four seeded days, and a stored kind of week
 * the template table does not have.
 */

import { describe, expect, it } from 'vitest';
import type { PlanDay, WeekRecord } from '../../storage';
import { seedPlanDays } from '../../core/seed';
import {
  localDayOf,
  mondayInstantOf,
  planDayIdOfRole,
  weekDaysOf,
  weekFixtureOf,
  weekTodayOf,
} from './week';

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

/** T3: the league is the default, Thursday, and the record keeps the Monday and the kind. */
const LEAGUE: WeekRecord = { monday: MONDAY_OF_WEEK, match: 'league' };

describe('weekDaysOf maps the stored plan days by name', () => {
  it('T4 finds the four days the seed ships today, which is what the app reads', () => {
    // The seed's names and the engine's roles are joined by a string, so this is the test
    // that fails when a release renames a day and forgets the bridge
    // (odd/tasks/three-lift-plan.md S2, S11). The fixtures below deliberately keep the
    // retired names: they are the alias path.
    expect(weekDaysOf(seedPlanDays())).toEqual({
      leg: 'seed-day-leg',
      upperA: 'seed-day-torso-a',
      upperB: 'seed-day-torso-b',
      prep: 'seed-day-fisico',
    });
  });

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
    const renamed = PLAN.map((day) =>
      day.name === 'PIERNA' ? { ...day, name: 'Pierna' } : day,
    );
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

describe('planDayIdOfRole bridges one role at a time (T3, S10)', () => {
  it('names the stored day behind a role, and no other', () => {
    expect(planDayIdOfRole(PLAN, 'leg')).toBe('seed-day-leg');
    expect(planDayIdOfRole(PLAN, 'prep')).toBe('seed-day-fisico');
  });

  it('answers null for a role the plan lost, without losing the other three', () => {
    // The owner's default layout is materialised slot by slot (S10): a missing day is one
    // free weekday, not a week with no layout at all.
    const withoutLegs = PLAN.slice(1);
    expect(planDayIdOfRole(withoutLegs, 'leg')).toBeNull();
    expect(planDayIdOfRole(withoutLegs, 'upperA')).toBe('seed-day-torso-a');
  });

  it('keeps reading the name an earlier release used for the fourth role', () => {
    const legacy = PLAN.map((day) =>
      day.id === 'seed-day-fisico' ? { ...day, name: 'PREPARACIÓN FÚTBOL' } : day,
    );
    expect(planDayIdOfRole(legacy, 'prep')).toBe('seed-day-fisico');
  });
});

describe('mondayInstantOf dates the week for the agenda (T3)', () => {
  it('answers local midnight of the Monday that contains the instant', () => {
    const monday = mondayInstantOf(WEDNESDAY);
    expect(monday.getDay()).toBe(1);
    expect(monday.getHours()).toBe(0);
    expect(localDayOf(monday.getTime())).toBe(MONDAY_OF_WEEK);
  });

  it('keeps Sunday in the week that started the Monday before it (R11)', () => {
    const sunday = new Date(2026, 2, 8, 23, 30).getTime();
    expect(localDayOf(mondayInstantOf(sunday).getTime())).toBe(MONDAY_OF_WEEK);
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
  });

  it('T3 ignores a record from another week and leaves the rotation to answer', () => {
    const lastWeek: WeekRecord = { ...LEAGUE, monday: '2026-03-09' };
    expect(weekTodayOf({ now: MONDAY, plan: PLAN, week: lastWeek })).toBeNull();
    expect(weekTodayOf({ now: MONDAY, plan: PLAN, week: undefined })).toBeNull();
  });

  it('T4 fails soft when a seeded day is missing, so the rotation keeps answering', () => {
    expect(weekTodayOf({ now: MONDAY, plan: PLAN.slice(0, 3), week: LEAGUE })).toBeNull();
  });

  it('fails soft when the stored record names a kind of week the table does not have', () => {
    // A hand-edited record can say anything. The screen falls back to the rotation instead
    // of throwing at the owner: there is no template to stamp, so there is no week.
    const unknownKind = { ...LEAGUE, match: 'friendly' } as unknown as WeekRecord;
    expect(weekTodayOf({ now: MONDAY, plan: PLAN, week: unknownKind })).toBeNull();
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
