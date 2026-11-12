/**
 * T1 — the match-aware week: seven days, one match, three accepted layouts.
 *
 * The layouts are **data** (L8). These tests pin the three tables of L7 day by day, so a
 * day that moves is a day that fails here, and they pin what has to hold for every week
 * whatever the table says: Monday to Sunday once each, a weekend at rest, the caller's
 * four days used exactly once, and the same input twice giving the same answer.
 */

import { describe, expect, it } from 'vitest';
import { WEEK_TEMPLATES, weekPlan, type MatchKind, type WeekDay } from '../src/core/engine/week-plan';

/** A Monday of March 2026, so the dates of the week are easy to read and stable forever. */
const MONDAY = '2026-03-02';

/**
 * The caller's four plan days, by role, exactly as the app hands them over: one list for
 * every week. The positions they land on are the table's business, not the caller's — the
 * order of a strength list is what used to put the legs the day after a cup match.
 */
const DAYS = { leg: 'pierna', upperA: 'torso-a', upperB: 'torso-b', prep: 'prep' } as const;

const ALL_KINDS: readonly MatchKind[] = ['league', 'cup', 'none'];

function week(match: MatchKind): readonly WeekDay[] {
  return weekPlan({ monday: MONDAY, match, days: DAYS });
}

/** One line per day: `date weekday kind planDayId`, so a week reads as the table it is. */
function rows(days: readonly WeekDay[]): readonly string[] {
  return days.map((day) => `${day.date} ${day.weekday} ${day.kind} ${day.planDayId ?? '-'}`);
}

describe('T1 weekPlan league week (match on Thursday) — L7', () => {
  it('T1 stamps Monday to Sunday with strength, prep and the Thursday match', () => {
    expect(rows(week('league'))).toEqual([
      '2026-03-02 Lunes training pierna',
      '2026-03-03 Martes training torso-a',
      '2026-03-04 Miércoles prep prep',
      '2026-03-05 Jueves match -',
      '2026-03-06 Viernes training torso-b',
      '2026-03-07 Sábado rest -',
      '2026-03-08 Domingo rest -',
    ]);
  });
});

describe('T1 weekPlan cup week (match on Tuesday) — L7', () => {
  it('T1 stamps prep on Monday and the leg day on Thursday, not the day after the match', () => {
    expect(rows(week('cup'))).toEqual([
      '2026-03-02 Lunes prep prep',
      '2026-03-03 Martes match -',
      '2026-03-04 Miércoles training torso-a',
      '2026-03-05 Jueves training pierna',
      '2026-03-06 Viernes training torso-b',
      '2026-03-07 Sábado rest -',
      '2026-03-08 Domingo rest -',
    ]);
  });
});

describe('T1 weekPlan week without a match — L7', () => {
  it('T1 stamps Monday to Thursday of work and leaves Friday to Sunday at rest', () => {
    expect(rows(week('none'))).toEqual([
      '2026-03-02 Lunes training pierna',
      '2026-03-03 Martes training torso-a',
      '2026-03-04 Miércoles prep prep',
      '2026-03-05 Jueves training torso-b',
      '2026-03-06 Viernes rest -',
      '2026-03-07 Sábado rest -',
      '2026-03-08 Domingo rest -',
    ]);
  });
});

describe('T1 weekPlan every week', () => {
  it('T1 stamps the seven days of the week once each, from its own Monday', () => {
    for (const kind of ALL_KINDS) {
      expect(week(kind).map((day) => day.date)).toEqual([
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
      ]);
      expect(new Set(week(kind).map((day) => day.weekday)).size).toBe(7);
    }
  });

  it('T1 leaves Saturday and Sunday at rest in every kind of week (S12)', () => {
    for (const kind of ALL_KINDS) {
      expect(week(kind).slice(5).map((day) => day.kind)).toEqual(['rest', 'rest']);
    }
  });

  it('T1 plays exactly one match in a league or cup week and none without a fixture (S11)', () => {
    const matches = (kind: MatchKind): number => week(kind).filter((day) => day.kind === 'match').length;
    expect(matches('league')).toBe(1);
    expect(matches('cup')).toBe(1);
    expect(matches('none')).toBe(0);
  });

  it('T1 uses the caller four plan days once each, and only on training and prep', () => {
    for (const kind of ALL_KINDS) {
      const days = week(kind);
      const used = days.flatMap((day) => (day.planDayId === undefined ? [] : [day.planDayId]));
      expect([...used].sort()).toEqual(['pierna', 'prep', 'torso-a', 'torso-b']);
      for (const day of days.filter((entry) => entry.kind === 'match' || entry.kind === 'rest')) {
        expect(day).not.toHaveProperty('planDayId');
      }
    }
  });

  it('T1 answers the same week twice with the same plan', () => {
    for (const kind of ALL_KINDS) {
      expect(week(kind)).toEqual(week(kind));
    }
  });

  it('T1 moves the leg day with the match, from one list of plan days (L7)', () => {
    // The same `leg` id, Monday in a league week and Thursday in a cup week: the caller is
    // never asked to reorder its days, so a cup week cannot load the legs on Wednesday.
    expect(week('league')[0]?.planDayId).toBe(DAYS.leg);
    expect(week('cup')[3]?.planDayId).toBe(DAYS.leg);
    expect(week('cup')[2]?.planDayId).toBe(DAYS.upperA);
    expect(week('none')[0]?.planDayId).toBe(DAYS.leg);
  });

  it('T1 stamps the week that contains the March clock change without losing a day', () => {
    // 2026-03-29 is the last Sunday of March: a week summed as 7 × 24 h could land a day off.
    const plan = weekPlan({ monday: '2026-03-23', match: 'league', days: DAYS });
    expect(plan.map((day) => day.date)).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
  });

  it('T1 refuses a day that is not the Monday of a week', () => {
    const input = { monday: '2026-03-03', match: 'league', days: DAYS } as const;
    expect(() => weekPlan(input)).toThrow(RangeError);
    expect(() => weekPlan({ ...input, monday: '2026-02-30' })).toThrow(RangeError);
  });
});

describe('T1 WEEK_TEMPLATES is the accepted table of L7, not a derivation', () => {
  it('T1 lays every kind of week out over seven days and names the match day', () => {
    expect(WEEK_TEMPLATES.league).toHaveLength(7);
    expect(WEEK_TEMPLATES.cup).toHaveLength(7);
    expect(WEEK_TEMPLATES.none).toHaveLength(7);
    // Thursday in a league week, Tuesday in a cup week, no match at all without a fixture.
    expect(WEEK_TEMPLATES.league[3]?.kind).toBe('match');
    expect(WEEK_TEMPLATES.cup[1]?.kind).toBe('match');
    expect(WEEK_TEMPLATES.none.some((slot) => slot.kind === 'match')).toBe(false);
  });

  it('T1 writes the table with roles, and no numbered strength position', () => {
    const roles = (kind: MatchKind): readonly string[] =>
      WEEK_TEMPLATES[kind].map((slot) => (slot.kind === 'training' ? slot.role : slot.kind));
    expect(roles('league')).toEqual(['leg', 'upper-a', 'prep', 'match', 'upper-b', 'rest', 'rest']);
    expect(roles('cup')).toEqual(['prep', 'match', 'upper-a', 'leg', 'upper-b', 'rest', 'rest']);
    expect(roles('none')).toEqual(['leg', 'upper-a', 'prep', 'upper-b', 'rest', 'rest', 'rest']);
  });
});
