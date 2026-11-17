/**
 * T3 (S1, S4, S6, S10) — the week as seven dated rows, the owner's layout, and the one
 * placement that both the drag and the day sheet use.
 *
 * The week is still deduced from the fixture, exactly as `core/engine/week-plan.ts` and
 * `features/week/week.ts` already deduce it: the match keeps its weekday (Thursday in the
 * league, Tuesday in the cup, none at all in a week without a fixture) and it takes that
 * weekday whatever the owner decided (S4, S10). What changes here is who fills the rest of
 * the days: the owner's stored `WeekLayout` wins where it can, and the template bridge of
 * `week.ts` answers only while there is no layout yet, so a fresh install shows the same
 * week it shows today.
 *
 * Three rules decide the shapes below.
 *
 * 1. **Done is keyed by the plan day, not by the clock** (S1). A day reads done because a
 *    closed session of that plan day was scheduled inside this week, wherever the owner
 *    moved the day to; a past day without a session stays movable (S6).
 * 2. **A displaced day is shown, not moved** (S10). When the match lands on a weekday the
 *    layout gave to a plan day, the plan day is reported with no weekday at all and the
 *    agenda never invents one for it.
 * 3. **The legs-after-the-match rule warns, never blocks** (S4). The warning is a sentence
 *    for the owner, and the placement it advises against still succeeds.
 *
 * Pure: no React, no port, no storage and no clock of its own. `now`, the fixture, the
 * plan, the layout and the sessions all arrive as parameters.
 */

import {
  WEEK_TEMPLATES,
  type MatchKind,
  type StrengthRole,
  type WeekSlot,
} from '../../core/engine/week-plan';
import type { EpochMs, PlanDay, WeekLayout, WeekLayoutSlot, WorkoutSession } from '../../storage';
import { formatDayName, formatWeekdayName } from '../home/format';
import { localDayOf, mondayInstantOf, planDayIdOfRole } from './week';

/** What a day is. The preparation and a strength day are both `workout` here (S4). */
export type AgendaKind = 'workout' | 'match' | 'rest';

/** One dated row of the agenda. */
export interface AgendaDay {
  /** 0 = Monday … 6 = Sunday. */
  readonly weekday: number;
  /** `Lunes` … `Domingo`, from the app's one weekday formatter (R9). */
  readonly weekdayName: string;
  /** Local `YYYY-MM-DD`. */
  readonly date: string;
  readonly kind: AgendaKind;
  /** Present on `workout` only. */
  readonly planDay: PlanDay | null;
  /** 0 when there is no plan day. */
  readonly exerciseCount: number;
  /** 0 when there is no plan day. */
  readonly setCount: number;
  /** S1: a closed session of that plan day was scheduled inside this week. */
  readonly done: boolean;
  readonly today: boolean;
  /** S6. */
  readonly locked: boolean;
  readonly lockReason: 'match' | 'done' | null;
}

/** One of the owner's plan days, with the weekday it holds this week. */
export interface AgendaPlanDay {
  readonly planDay: PlanDay;
  /** `null` when the owner's week has no room for it (S10). */
  readonly weekday: number | null;
  readonly exerciseCount: number;
  readonly setCount: number;
}

/** The whole week, as Inicio reads it. */
export interface WeekAgenda {
  /** Local `YYYY-MM-DD`. */
  readonly monday: string;
  readonly matchKind: MatchKind;
  /** Exactly seven, Monday first. */
  readonly days: readonly AgendaDay[];
  /** The four, in plan order. */
  readonly planDays: readonly AgendaPlanDay[];
  /** S4: worded for the owner, never a code. */
  readonly warning: string | null;
  readonly doneCount: number;
}

/** The role a strength slot of the template asks for, in the names `week.ts` bridges. */
const ROLE_OF: Readonly<Record<StrengthRole, 'leg' | 'upperA' | 'upperB'>> = {
  leg: 'leg',
  'upper-a': 'upperA',
  'upper-b': 'upperB',
};

/**
 * The weekday the fixture falls on, read from the table the week is stamped with (S4).
 *
 * Read instead of written again, for the reason `week.ts` gives about the fixture label: a
 * day that moves in `WEEK_TEMPLATES` moves here too, so the agenda can never put the match
 * somewhere the rest of the app does not.
 */
function matchWeekdayOf(matchKind: MatchKind): number | null {
  const weekday = WEEK_TEMPLATES[matchKind].findIndex((slot) => slot.kind === 'match');
  return weekday === -1 ? null : weekday;
}

/**
 * The seven local days of a week, Monday first, from the Monday that starts it.
 *
 * Built from calendar parts and never from `monday + n * 24h`: the days of a week have
 * different lengths twice a year, and a millisecond offset would date one row wrong.
 */
function weekDatesOf(monday: Date): readonly Date[] {
  return Array.from(
    { length: 7 },
    (_, offset) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset),
  );
}

/** How much work a plan day asks for, as the row states it. */
function countsOf(planDay: PlanDay | null): { exerciseCount: number; setCount: number } {
  if (planDay === null) return { exerciseCount: 0, setCount: 0 };
  return {
    exerciseCount: planDay.items.length,
    setCount: planDay.items.reduce((total, item) => total + item.prescription.sets, 0),
  };
}

/**
 * The plan day a template slot asks for, through the same name bridge the week uses (S4).
 *
 * A slot the template fills with a match or a rest day asks for no plan day, and a role the
 * plan no longer holds leaves its weekday free instead of borrowing a stranger's day.
 */
function templatePlanDayIdOf(slot: WeekSlot, plan: readonly PlanDay[]): string | null {
  switch (slot.kind) {
    case 'training':
      return planDayIdOfRole(plan, ROLE_OF[slot.role]);
    case 'prep':
      return planDayIdOfRole(plan, 'prep');
    case 'match':
    case 'rest':
      return null;
  }
}

/**
 * Seven weekdays of the owner's layout, in weekday order.
 *
 * Looked up by `WeekLayoutSlot.weekday` and not by position: the stored shape is ascending
 * today, and reading the weekday it declares costs nothing and survives a hand-cut list.
 */
function sevenPlanDayIdsOf(layout: WeekLayout): readonly (string | null)[] {
  return Array.from(
    { length: 7 },
    (_, weekday) =>
      layout.slots.find((slot) => slot.weekday === weekday)?.planDayId ?? null,
  );
}

/**
 * What each weekday holds before the fixture takes its own (S4, S5).
 *
 * The owner's layout wins wherever it speaks; with no layout at all the week is the one the
 * templates draw, which is what a fresh install already shows. Falling back is not a
 * second opinion about the week: it is the same four days, from the same bridge.
 */
function placedPlanDayIdsOf(input: {
  readonly matchKind: MatchKind;
  readonly plan: readonly PlanDay[];
  readonly layout: WeekLayout | undefined;
}): readonly (string | null)[] {
  if (input.layout !== undefined) return sevenPlanDayIdsOf(input.layout);
  return WEEK_TEMPLATES[input.matchKind].map((slot) => templatePlanDayIdOf(slot, input.plan));
}

/**
 * S4 — the one rule of the layouts the owner can break, said out loud instead of enforced.
 *
 * The app prefers the legs far from the match (L7), and S4 keeps that as advice: the
 * sentence names the day and the plan day, so the owner knows what he is choosing, and
 * `placePlanDay` still accepts the move. A week without a match has no "day after" to
 * protect, and a plan that lost its leg day has nothing to warn about.
 */
function legWarningOf(days: readonly AgendaDay[], plan: readonly PlanDay[]): string | null {
  const legs = planDayIdOfRole(plan, 'leg');
  if (legs === null) return null;
  const matchAt = days.findIndex((day) => day.kind === 'match');
  if (matchAt === -1) return null;
  const afterMatch = days[matchAt + 1];
  const planDay = afterMatch?.planDay ?? null;
  if (planDay === null || planDay.id !== legs) return null;
  const name = formatDayName(planDay.name);
  const weekday = afterMatch?.weekdayName.toLowerCase() ?? '';
  return `${name} el ${weekday} cae el día después del partido. Se puede, pero la app prefiere las piernas lejos del partido.`;
}

/**
 * S1 — the plan days this week has already trained, from the sessions themselves.
 *
 * Keyed by the plan day and not by the weekday, because the owner may move a day after
 * training it: what is closed is the session of that day, wherever the row sits now. The
 * week is the one `dates` names, so a session of last Monday neither marks this Monday nor
 * unlocks anything; and only a closed session counts — `scheduled`, `inProgress` and
 * `abandoned` are not a training that happened.
 *
 * This set answers "what has been trained this week", which is not the same question as
 * "is this row done": the row reads it through `dateText <= todayText` (`weekAgendaOf`),
 * because a session of Tuesday cannot close a Friday that has not arrived (home-feedback S1).
 */
function donePlanDayIdsOf(
  sessions: readonly WorkoutSession[],
  weekDates: ReadonlySet<string>,
): ReadonlySet<string> {
  const done = new Set<string>();
  for (const session of sessions) {
    if (session.status !== 'completed' && session.status !== 'partial') continue;
    if (!weekDates.has(localDayOf(session.scheduledDate))) continue;
    done.add(session.planDayId);
  }
  return done;
}

export function weekAgendaOf(input: {
  readonly now: EpochMs;
  readonly matchKind: MatchKind;
  readonly plan: readonly PlanDay[];
  readonly layout: WeekLayout | undefined;
  readonly sessions: readonly WorkoutSession[];
}): WeekAgenda {
  const monday = mondayInstantOf(input.now);
  const dates = weekDatesOf(monday);
  const todayText = localDayOf(input.now);
  const matchWeekday = matchWeekdayOf(input.matchKind);
  const placed = placedPlanDayIdsOf(input);
  const planById = new Map(input.plan.map((planDay) => [planDay.id, planDay]));
  const weekDateTexts = new Set(dates.map((date) => localDayOf(date.getTime())));
  const donePlanDayIds = donePlanDayIdsOf(input.sessions, weekDateTexts);

  const days = dates.map((date, weekday): AgendaDay => {
    const dateText = localDayOf(date.getTime());
    const isMatch = weekday === matchWeekday;
    const placedId = isMatch ? null : (placed[weekday] ?? null);
    // A stored id the plan no longer holds is not a training day: the slot goes free
    // rather than the agenda inventing a name for a day that is gone.
    const planDay = placedId === null ? null : (planById.get(placedId) ?? null);
    // The set answers the week; the row answers its own date. A row whose day has not come
    // is never closed, however trained that plan day already is (home-feedback S1).
    const done = planDay !== null && donePlanDayIds.has(planDay.id) && dateText <= todayText;
    return {
      weekday,
      weekdayName: formatWeekdayName(date.getTime()),
      date: dateText,
      kind: isMatch ? 'match' : planDay === null ? 'rest' : 'workout',
      planDay,
      ...countsOf(planDay),
      done,
      today: dateText === todayText,
      locked: isMatch || done,
      // A done day is done: the reason names the training that closed it, and the match
      // reason is only what is left to say about a day that cannot train.
      lockReason: done ? 'done' : isMatch ? 'match' : null,
    };
  });

  const planDays = input.plan.map((planDay): AgendaPlanDay => {
    const row = days.find((day) => day.planDay?.id === planDay.id) ?? null;
    return { planDay, weekday: row === null ? null : row.weekday, ...countsOf(planDay) };
  });

  return {
    monday: localDayOf(monday.getTime()),    matchKind: input.matchKind,
    days,
    planDays,
    warning: legWarningOf(days, input.plan),
    // "3 de 4 entrenos hechos": the count is of plan days, so a day the match displaced
    // still counts as done instead of vanishing from the tally.
    doneCount: input.plan.filter((planDay) => donePlanDayIds.has(planDay.id)).length,
  };
}

export type PlacementRefusal =
  | 'matchDay'
  | 'doneDay'
  | 'sameDay'
  | 'unknownDay'
  | 'unknownPlanDay';

export type PlacementResult =
  | {
      readonly ok: true;
      readonly layout: WeekLayout;
      readonly placed: string;
      readonly displaced: string | null;
    }
  | { readonly ok: false; readonly reason: PlacementRefusal };

/**
 * S4, S10 — the week the owner already sees, written down as a layout.
 *
 * The templates are the app's own answer to "which day trains", so the first drag of a
 * fresh install starts from them instead of from nothing: `WEEK_TEMPLATES` is stamped into
 * seven slots through the same name bridge the agenda reads, and a day the plan no longer
 * holds leaves its weekday free rather than being invented.
 */
export function defaultLayoutOf(input: {
  readonly matchKind: MatchKind;
  readonly plan: readonly PlanDay[];
}): WeekLayout {
  return {
    slots: WEEK_TEMPLATES[input.matchKind].map(
      (slot, weekday): WeekLayoutSlot => ({
        weekday,
        planDayId: templatePlanDayIdOf(slot, input.plan),
      }),
    ),
  };
}

/** Both the drag and the day sheet go through this one operation (S2, S3). */
export function placePlanDay(input: {
  readonly agenda: WeekAgenda;
  readonly layout: WeekLayout;
  readonly planDayId: string;
  readonly toWeekday: number;
}): PlacementResult {
  const { agenda, layout, planDayId, toWeekday } = input;

  // The four are the only days the owner can place: a layout is a week of this plan, and a
  // drag cannot introduce an id the plan does not hold.
  if (!agenda.planDays.some((entry) => entry.planDay.id === planDayId)) {
    return { ok: false, reason: 'unknownPlanDay' };
  }
  const target = Number.isInteger(toWeekday) ? agenda.days[toWeekday] : undefined;
  if (target === undefined) return { ok: false, reason: 'unknownDay' };
  if (target.kind === 'match') return { ok: false, reason: 'matchDay' };
  // S6 — only the closed days are blocked, in both ends of the move: the day that trains
  // cannot leave because its session is that day's, and nothing lands on a closed one.
  if (target.done) return { ok: false, reason: 'doneDay' };

  const slots = [...sevenPlanDayIdsOf(layout)];
  const from = slots.indexOf(planDayId);
  if (from === toWeekday) return { ok: false, reason: 'sameDay' };
  // The training that closed is the plan day's, wherever it sits: the agenda is asked
  // about the day the owner sees, not about the weekday the layout happens to hold.
  const sourceWeekday = agenda.planDays.find((entry) => entry.planDay.id === planDayId)?.weekday;
  if (sourceWeekday !== null && sourceWeekday !== undefined) {
    if (agenda.days[sourceWeekday]?.done === true) return { ok: false, reason: 'doneDay' };
  }

  const displaced = slots[toWeekday] ?? null;
  slots[toWeekday] = planDayId;
  // The two days trade weekdays. A day that had no weekday at all — the one the match
  // displaced (S10) — has nothing to trade back, so the day it lands on goes without a
  // weekday instead of the app hunting for a hole for it.
  if (from !== -1) slots[from] = displaced;

  return {
    ok: true,
    layout: {
      slots: slots.map((slotPlanDayId, weekday): WeekLayoutSlot => ({
        weekday,
        planDayId: slotPlanDayId,
      })),
    },
    placed: planDayId,
    displaced,
  };
}
