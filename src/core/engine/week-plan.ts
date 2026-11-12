/**
 * T1 — the week plan: seven dated days, one match, three accepted layouts.
 *
 * **The layouts are a table, not a derivation.** An earlier design computed the week from
 * priorities (strength far from the match, the preparation as the last day before it) and
 * it did not converge: two sets of rules pulled on the same days and the answer depended on
 * which one ran first (L8). So `WEEK_TEMPLATES` states, per kind of week, what Monday to
 * Sunday holds, and this module only stamps dates and hands back the caller's days. If the
 * owner moves a day, the table is edited; the code stays as it is.
 *
 * **The caller names its days by role, not by position.** An earlier version of this
 * function took three strength ids in order, and it was rejected: L7 makes the leg day the
 * first strength day of a league week and the second of a cup week, so "position 1" meant
 * two different sessions, and a caller that did not reorder its list loaded the legs on the
 * Wednesday after a Tuesday match — exactly the one thing L7 rules out. `days` is keyed by
 * role instead, in no order at all, so the meaning of a day cannot change with the week.
 *
 * The layouts are L7. Saturday is not a training day, so the window is Monday to Friday
 * (S12); a match week puts the match inside those five days and keeps three strength days
 * and one preparation day (S1). Thursday in a league week, Tuesday in a cup week, never
 * both (S11). The app answers "hoy toca esto" without anyone planning anything (S5), and
 * changing today's training is a separate decision: this module is given the caller's plan
 * days and never invents one (S6, S7).
 *
 * **A week can be swapped, but not redrawn.** T5 lets the owner change today's training
 * and move the day it displaces to another weekday (S6, S9). `applySwaps` exchanges two
 * weekdays of a template — kinds and roles together — and refuses anything that would
 * touch the match, the rest days, the caller's list of days or the weekday right after
 * the match: the dates and the weekdays never move, so a swap cannot invent a fixture, a
 * training day in the weekend (S11, S12) or legs on the day after the match (L7).
 *
 * Pure: no React, no storage, no clock, no I/O. A day is a local `YYYY-MM-DD` from local
 * getters and never `toISOString`, which would answer in UTC — the convention `isoDayOf`
 * in `features/progress` follows. That module is the app tier, so the two helpers are
 * repeated here instead of imported upwards (architecture §4).
 */

import { formatWeekdayName } from '../format/dates';

/** Which fixture the week has. S11: one match a week, Thursday in the league, Tuesday in the cup. */
export type MatchKind = 'league' | 'cup' | 'none';

/** What a day is. A match and a rest day ask nothing of the gym. */
export type WeekDayKind = 'training' | 'prep' | 'match' | 'rest';

/**
 * The strength day a slot asks for, by role. A role names a session that exists in the
 * plan (legs, upper body A, upper body B); it never names an exercise or a weekday.
 */
export type StrengthRole = 'leg' | 'upper-a' | 'upper-b';

/**
 * One day of a template, before any date exists: what it is and, for the two kinds that
 * train, which of the caller's days fills it. The training rows point at a role, so the
 * table can move a session without any caller reordering anything.
 */
export type WeekSlot =
  | { readonly kind: 'training'; readonly role: StrengthRole }
  | { readonly kind: 'prep' }
  | { readonly kind: 'match' }
  | { readonly kind: 'rest' };

/** Seven slots, Monday first. A wrong length is a compile error, not a runtime surprise. */
export type WeekTemplate = readonly [
  WeekSlot,
  WeekSlot,
  WeekSlot,
  WeekSlot,
  WeekSlot,
  WeekSlot,
  WeekSlot,
];

/**
 * The accepted layouts (L7), Monday to Sunday, one per kind of week. This constant is the
 * whole specification of the week: `weekPlan` reads it and adds nothing to it.
 */
export const WEEK_TEMPLATES: Record<MatchKind, WeekTemplate> = {
  // Match on Thursday. Legs on Monday, as far from the match as the window allows; the
  // preparation on Wednesday, the last training day before it.
  league: [
    { kind: 'training', role: 'leg' }, // Monday
    { kind: 'training', role: 'upper-a' }, // Tuesday
    { kind: 'prep' }, // Wednesday
    { kind: 'match' }, // Thursday
    { kind: 'training', role: 'upper-b' }, // Friday
    { kind: 'rest' }, // Saturday
    { kind: 'rest' }, // Sunday
  ],
  // Match on Tuesday: the preparation on Monday, and legs on Thursday, never on Wednesday —
  // loading the legs the day after a match is the one thing L7 rules out.
  cup: [
    { kind: 'prep' }, // Monday
    { kind: 'match' }, // Tuesday
    { kind: 'training', role: 'upper-a' }, // Wednesday
    { kind: 'training', role: 'leg' }, // Thursday
    { kind: 'training', role: 'upper-b' }, // Friday
    { kind: 'rest' }, // Saturday
    { kind: 'rest' }, // Sunday
  ],
  // No fixture: the league shape without the match, and Friday free as well.
  none: [
    { kind: 'training', role: 'leg' }, // Monday
    { kind: 'training', role: 'upper-a' }, // Tuesday
    { kind: 'prep' }, // Wednesday
    { kind: 'training', role: 'upper-b' }, // Thursday
    { kind: 'rest' }, // Friday
    { kind: 'rest' }, // Saturday
    { kind: 'rest' }, // Sunday
  ],
};

/** One dated day of the plan. */
export interface WeekDay {
  /** Local `YYYY-MM-DD`. */
  readonly date: string;
  /** `Lunes` … `Domingo`, from the app's one weekday formatter (R9). */
  readonly weekday: string;
  readonly kind: WeekDayKind;
  /** The caller's plan day id, on `training` and `prep` only: a match or a rest day has none. */
  readonly planDayId?: string;
}

/** Seven days, Monday first — the guarantee of `WeekTemplate`, in the output. */
export type WeekPlan = readonly [WeekDay, WeekDay, WeekDay, WeekDay, WeekDay, WeekDay, WeekDay];

/** The caller's four plan days, by role: three strength days and the football preparation. */
export interface WeekPlanDays {
  readonly leg: string;
  readonly upperA: string;
  readonly upperB: string;
  readonly prep: string;
}

/** A weekday of the week, Monday first: 0 is Monday and 6 is Sunday (R11). */
export type DayOffset = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Two weekdays that exchange what they hold (S6, S9). The days stay where they are, with
 * their dates and their names: what moves is which of the caller's days fills each one.
 */
export interface WeekSwap {
  readonly from: DayOffset;
  readonly to: DayOffset;
}

export interface WeekPlanInput {
  /** The Monday the week starts on, local `YYYY-MM-DD` (R11: the week starts on Monday). */
  readonly monday: string;
  readonly match: MatchKind;
  /** The caller's four plan days, by role: three strength days and the football preparation. */
  readonly days: WeekPlanDays;
  /** T5 — this week's own exchanges, from the stored week record. None by default. */
  readonly swaps?: readonly WeekSwap[];
}

/** Monday first, as the table is written. */
type DayRow = [WeekSlot, WeekSlot, WeekSlot, WeekSlot, WeekSlot, WeekSlot, WeekSlot];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local `YYYY-MM-DD` of a calendar day. `toISOString` is not used: it would answer in UTC. */
function localDay(year: number, month: number, day: number): string {
  return `${String(year)}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * The Monday of the week, or a refusal: stamping seven days from a Tuesday would name a
 * week that starts on the wrong day, and a day the calendar does not have is not sane
 * input. The round trip is what catches a rolled-over date.
 */
function mondayOf(iso: string): Date {
  const text = iso.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = new Date(Number(match?.[1]), Number(match?.[2]) - 1, Number(match?.[3]));
  const sameDay = localDay(date.getFullYear(), date.getMonth(), date.getDate()) === text;
  if (!sameDay || date.getDay() !== 1) {
    throw new RangeError(`weekPlan wants the Monday of the week as YYYY-MM-DD, not "${iso}".`);
  }
  return date;
}

/** The caller's strength day for a role. A role is one session, in every kind of week. */
function strengthIdOf(days: WeekPlanDays, role: StrengthRole): string {
  switch (role) {
    case 'leg':
      return days.leg;
    case 'upper-a':
      return days.upperA;
    case 'upper-b':
      return days.upperB;
  }
}

/** One slot, dated. A match or a rest day carries no plan day id at all, not `undefined`. */
function weekDayOf(slot: WeekSlot, date: string, weekday: string, days: WeekPlanDays): WeekDay {
  switch (slot.kind) {
    case 'training':
      return { date, weekday, kind: 'training', planDayId: strengthIdOf(days, slot.role) };
    case 'prep':
      return { date, weekday, kind: 'prep', planDayId: days.prep };
    case 'match':
      return { date, weekday, kind: 'match' };
    case 'rest':
      return { date, weekday, kind: 'rest' };
  }
}

function isDayOffset(value: number): value is DayOffset {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/** The weekday right after the match, or `null` when the table has no match at all. */
function dayAfterMatch(template: readonly WeekSlot[]): DayOffset | null {
  const matchAt = template.findIndex((slot) => slot.kind === 'match');
  return matchAt === -1 || matchAt >= 6 ? null : ((matchAt + 1) as DayOffset);
}

function holdsLeg(template: readonly WeekSlot[], offset: DayOffset): boolean {
  const slot = template[offset];
  return slot !== undefined && slot.kind === 'training' && slot.role === 'leg';
}

/**
 * The template with this week's swaps applied: a new table, never a mutation of the one
 * the caller passed in (`WEEK_TEMPLATES` is shared by every week).
 *
 * Five things are refused with a `RangeError`, and each one would silently load a wrong
 * day onto a wrong weekday: an offset outside Monday to Sunday, a weekday the list moves
 * twice (which includes a swap of a day with itself, and any list that is not a
 * permutation), a swap into the match or into a rest day — the match is reported and
 * never trained (S11) and the weekend is rest in every kind of week (S12) — and an
 * exchange that leaves the legs on the weekday right after the match, which is the rule
 * the whole layout is built around (L7).
 */
export function applySwaps(template: WeekTemplate, swaps: readonly WeekSwap[]): WeekTemplate {
  const rows: DayRow = [...template];
  const moved = new Set<DayOffset>();

  for (const swap of swaps) {
    for (const offset of [swap.from, swap.to]) {
      if (!isDayOffset(offset)) {
        throw new RangeError(
          `applySwaps wants weekday offsets from 0 (Monday) to 6 (Sunday), not "${String(offset)}".`,
        );
      }
      if (moved.has(offset)) {
        throw new RangeError(
          `applySwaps wants each weekday in one swap at most, not "${String(offset)}" twice.`,
        );
      }
      const kind = template[offset].kind;
      if (kind === 'match' || kind === 'rest') {
        throw new RangeError(
          `applySwaps swaps training days only: weekday ${String(offset)} is ${kind}.`,
        );
      }
      moved.add(offset);
    }
  }

  // Validation first, then the exchanges: a refused list leaves nothing half-applied, and
  // the endpoints are read from the template because no weekday is moved twice.
  for (const swap of swaps) {
    rows[swap.from] = template[swap.to];
    rows[swap.to] = template[swap.from];
  }

  // L7, checked on the result: the legs may land anywhere in the window except the
  // weekday right after the match, and an exchange is exactly how they would get there.
  const afterMatch = dayAfterMatch(template);
  if (afterMatch !== null && holdsLeg(rows, afterMatch) && !holdsLeg(template, afterMatch)) {
    throw new RangeError(
      `applySwaps refuses to load the legs the day after the match (weekday ${String(afterMatch)}).`,
    );
  }

  return rows;
}

/**
 * The week starting on `input.monday`, stamped from the accepted template of its kind.
 *
 * Deterministic and total over sane input: the same Monday and the same plan day ids give
 * the same seven days, today's date is never read, and no weight or exercise is decided
 * here — that belongs to the caller, and later to the plan.
 */
export function weekPlan(input: WeekPlanInput): WeekPlan {
  const monday = mondayOf(input.monday);
  const template = applySwaps(WEEK_TEMPLATES[input.match], input.swaps ?? []);

  // Calendar arithmetic on the local date, never a sum of milliseconds: a clock change
  // inside the week would otherwise move a day by an hour and could name a wrong weekday.
  const stamp = (offset: DayOffset): WeekDay => {
    const at = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
    const date = localDay(at.getFullYear(), at.getMonth(), at.getDate());
    return weekDayOf(template[offset], date, formatWeekdayName(at.getTime()), input.days);
  };

  return [stamp(0), stamp(1), stamp(2), stamp(3), stamp(4), stamp(5), stamp(6)];
}
