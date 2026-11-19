/**
 * T5 (odd/tasks/dark-premium-redesign.md) — the two readings above the agenda.
 *
 * The hero and the week's progress are derivations, so every state the redesign lists is
 * one fixture away: the workout of the day, the closed day, the match, the rest day, a day
 * with no exercises, and a store with no plan at all. The point of pinning them here is
 * that the card may never claim a fact the week does not hold: its title, its counts and
 * its plan day all come from the agenda's today row.
 */

import { describe, expect, it } from 'vitest';
import type { PlanDay, WeekRecord, WorkoutSession } from '../../storage';
import { homeViewOf, type HomeInput } from './selectors';
import { EMPTY_DAY_NOTE, NO_PLAN_TITLE, NO_PLAN_NOTE, todayHeroOf, weekProgressOf } from './today';

/* ------------------------------------------------------------------ fixtures */

/** Wednesday 8 November 2023, 18:00 local. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();
const MONDAY = new Date(2023, 10, 6, 18, 0, 0).getTime();
/** The mobility day of a league week since `odd/tasks/leg-separation.md` S2. */
const TUESDAY = new Date(2023, 10, 7, 18, 0, 0).getTime();
const THURSDAY = new Date(2023, 10, 9, 18, 0, 0).getTime();
const FRIDAY = new Date(2023, 10, 10, 18, 0, 0).getTime();
const SATURDAY = new Date(2023, 10, 11, 12, 0, 0).getTime();

function planDay(id: string, name: string, order: number, exercises: number): PlanDay {
  return {
    id,
    name,
    order,
    items: Array.from({ length: exercises }, (_, index) => ({
      id: `${id}-item-${String(index)}`,
      planDayId: id,
      order: index,
      exerciseId: `lib-${String(index)}`,
      exerciseNameSnapshot: 'Sentadilla',
      prescription: {
        sets: 3,
        repRange: { lowerBound: 8, upperBound: 10 },
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: 180,
      },
    })),
  };
}

/** The four days of the seed (L5, L7), with the counts the card states. */
const WEEK_PLAN: readonly PlanDay[] = [
  planDay('seed-day-leg', 'PIERNA', 0, 6),
  planDay('seed-day-torso-a', 'TORSO A', 1, 3),
  planDay('seed-day-torso-b', 'TORSO B', 2, 2),
  planDay('seed-day-fisico', 'MOVILIDAD Y CORE', 3, 4),
];

const LEAGUE_WEEK: WeekRecord = { monday: '2023-11-06', match: 'league' };

/** One closed Monday: the week's `doneCount` is 1, and the strip has its check. */
const CLOSED_MONDAY: WorkoutSession = {
  id: 'closed-monday',
  planDayId: 'seed-day-leg',
  dayNameSnapshot: 'PIERNA',
  scheduledDate: MONDAY,
  startedAt: MONDAY,
  endedAt: MONDAY + 45 * 60 * 1000,
  phase: { kind: 'readaptation', week: 1 },
  status: 'completed',
  exercises: [],
};

/** Today's own session, closed: the card says so and offers its summary. */
const CLOSED_TODAY: WorkoutSession = {
  ...CLOSED_MONDAY,
  id: 'closed-today',
  planDayId: 'seed-day-fisico',
  dayNameSnapshot: 'MOVILIDAD Y CORE',
  scheduledDate: TUESDAY,
  startedAt: TUESDAY,
  endedAt: TUESDAY + 30 * 60 * 1000,
};

function input(overrides: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW,
    profile: undefined,
    phaseState: { block: 2, passedBlocks: 1 },
    plan: WEEK_PLAN,
    recent: [],
    inProgress: undefined,
    measurements: [],
    activities: [],
    lostData: false,
    lastExportAt: null,
    week: LEAGUE_WEEK,
    ...overrides,
  };
}

/* --------------------------------------------------------------------- the hero */

describe('todayHeroOf', () => {
  it('names the workout the week places today, with its own counts', () => {
    // Tuesday is the mobility and core day of a league week: the prep moved there when the
    // three heavy days took Monday, Wednesday and Friday.
    const hero = todayHeroOf(homeViewOf(input({ now: TUESDAY })));

    expect(hero.kind).toBe('workout');
    expect(hero.eyebrow).toBe('HOY · MARTES');
    expect(hero.title).toBe('Movilidad y core');
    // The prescription, straight from the agenda's row — not a measurement of anything.
    expect(hero.exercises).toBe(4);
    expect(hero.sets).toBe(12);
    expect(hero.planDayId).toBe('seed-day-fisico');
    // The readaptation block is a word the app already writes, and the only chip here: the
    // day's name is not a compound, so there is no muscle group to say twice.
    expect(hero.chips).toEqual(['Readaptación · semana 2 de 4']);
    expect(hero.note).toBeNull();
    expect(hero.done).toBeNull();
  });

  it('says the muscle group when the day name carries one', () => {
    // `SENTADILLA / PIERNA` is the leg day, and the league template trains it on Monday
    // (S2, S3): the card is read from the derived week, so the fixture asks for the day the
    // template puts the day on instead of placing one itself.
    const compound = planDay('day-compound', 'SENTADILLA / PIERNA', 0, 2);
    const hero = todayHeroOf(
      homeViewOf(input({ now: MONDAY, plan: [compound], phaseState: undefined })),
    );

    expect(hero.title).toBe('Sentadilla / Pierna');
    expect(hero.chips).toEqual(['Pierna']);
    expect(hero.planDayId).toBe('day-compound');
  });

  it('says the day is done, with the closed line the view already wrote', () => {
    const hero = todayHeroOf(
      homeViewOf(input({ now: TUESDAY, recent: [CLOSED_TODAY], phaseState: undefined })),
    );

    expect(hero.kind).toBe('workout');
    expect(hero.done).toBe('Sesión completada hoy · 0 de 0 series.');
  });

  it('names the match on its day, and offers no workout to start', () => {
    const hero = todayHeroOf(homeViewOf(input({ now: THURSDAY })));

    expect(hero.kind).toBe('match');
    expect(hero.eyebrow).toBe('HOY · JUEVES');
    expect(hero.title).toBe('Partido · Liga');
    expect(hero.note).toBe('Sólo se informa');
    expect(hero.exercises).toBeNull();
    expect(hero.planDayId).toBeNull();
  });

  it('names a rest day as one, instead of borrowing a training', () => {
    const hero = todayHeroOf(homeViewOf(input({ now: SATURDAY })));

    expect(hero.kind).toBe('rest');
    expect(hero.title).toBe('Descanso');
    expect(hero.note).toBe('Sin entreno');
    expect(hero.planDayId).toBeNull();
  });

  it('says a day with no exercises is one, rather than offering to start nothing', () => {
    // `TORSO B` still names the third strength day, and the league template trains it on
    // Friday (S2, S3). A plan day with no exercises on the day the week gives it is the
    // state the title is about.
    const empty = planDay('day-empty', 'TORSO B', 0, 0);
    const hero = todayHeroOf(homeViewOf(input({ now: FRIDAY, plan: [empty] })));

    expect(hero.kind).toBe('emptyDay');
    expect(hero.title).toBe('Torso B');
    expect(hero.note).toBe(EMPTY_DAY_NOTE);
    expect(hero.exercises).toBeNull();
  });

  it('says there is no plan at all, in the sentence the screen already used', () => {
    const hero = todayHeroOf(homeViewOf(input({ plan: [] })));

    expect(hero.kind).toBe('noPlan');
    expect(hero.eyebrow).toBe('HOY');
    expect(hero.title).toBe(NO_PLAN_TITLE);
    expect(hero.note).toBe(NO_PLAN_NOTE);
  });
});

/* ------------------------------------------------------------------ the progress */

describe('weekProgressOf', () => {
  it('counts the closed plan days over the plan the week holds', () => {
    const progress = weekProgressOf(homeViewOf(input({ recent: [CLOSED_MONDAY] })));

    expect(progress?.done).toBe(1);
    expect(progress?.target).toBe(WEEK_PLAN.length);
    expect(progress?.percent).toBe(25);
  });

  it('states a zero week as a zero, not as an absence of the block', () => {
    const progress = weekProgressOf(homeViewOf(input()));

    expect(progress?.done).toBe(0);
    expect(progress?.percent).toBe(0);
  });

  it('draws the seven days with the week’s own words, and Monday first', () => {
    const progress = weekProgressOf(homeViewOf(input({ recent: [CLOSED_MONDAY] })));
    const days = progress?.days ?? [];

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.initial)).toEqual(['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']);
    expect(days[0]?.label).toBe('Lunes, hecho');
    expect(days[0]?.done).toBe(true);
    expect(days[2]?.label).toBe('Miércoles, hoy');
    expect(days[2]?.today).toBe(true);
    expect(days[3]?.label).toBe('Jueves, fijo');
    expect(days[3]?.kind).toBe('match');
    expect(days[5]?.label).toBe('Sábado, libre');
  });

  it('has nothing to count on a store with no plan', () => {
    expect(weekProgressOf(homeViewOf(input({ plan: [] })))).toBeNull();
  });
});
