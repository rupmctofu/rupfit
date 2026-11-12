/**
 * T4/T5 — the week of the match, in the app tier.
 *
 * The engine (`src/core/engine/week-plan.ts`) knows the three accepted layouts and how to
 * stamp them; this module is the one that reads the store and answers the two questions
 * Inicio asks: **which day is today** (S5, "hoy toca esto") and **which days today can
 * exchange places with** (S6, and S9's "se mueve a otro día de la semana").
 *
 * Three rules decide everything below:
 *
 * 1. **The record is the week's only memory.** `WeekRecord` holds the Monday, the fixture
 *    and the swaps of that week. A record from another week says nothing about today, so
 *    it is ignored and the rotation keeps answering — the same for a store with no record
 *    at all.
 * 2. **Fail soft, never guess.** `PlanDay` stores no weekday, so the four seeded days are
 *    found by name. If one of them is missing — the owner deleted or renamed it — there is
 *    no week to build, and answering `null` leaves the rotation in charge instead of
 *    putting a stranger's day on Monday.
 * 3. **A moved day is an exchange, not a hunt for a hole.** S9 says the day left behind
 *    moves to another day of the week, and the L7 layouts fill Monday to Friday, so the
 *    two days trade weekdays. What is offered is therefore never the match (S11), never a
 *    rest day (S12) and never a day the legs cannot take (L7).
 *
 * Pure: no React, no port, no clock. `now` is injected, exactly as the selectors do it.
 */

import {
  weekPlan,
  type DayOffset,
  type WeekDay,
  type WeekPlan,
  type WeekPlanDays,
  type WeekSwap,
} from '../../core/engine/week-plan';
import type { EpochMs, PlanDay, WeekRecord } from '../../storage';
import { formatDayName } from '../home/format';

/**
 * The four days of the seed, by role (L5, L7). `PlanDay` keeps no key, only a name, so
 * the names are the bridge between the stored plan and the engine's roles.
 */
const ROLE_NAMES: Readonly<Record<keyof WeekPlanDays, string>> = {
  leg: 'PIERNA',
  upperA: 'TORSO A',
  upperB: 'TORSO B',
  prep: 'PREPARACIÓN FÚTBOL',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local `YYYY-MM-DD` of the day that contains `at`. Never `toISOString`, which is UTC. */
function localDayOf(at: EpochMs): string {
  const date = new Date(at);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Monday of the week that contains `at`, local `YYYY-MM-DD` (R11). */
function mondayOfWeek(at: EpochMs): string {
  const date = new Date(at);
  const weekday = (date.getDay() + 6) % 7;
  return localDayOf(new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday).getTime());
}

/** Where `at` sits in the week: Monday is 0 and Sunday is 6. */
function offsetOf(at: EpochMs): DayOffset {
  return ((new Date(at).getDay() + 6) % 7) as DayOffset;
}

/**
 * The four stored days, keyed by role, or `null` when one of them is gone.
 *
 * The comparison goes through `formatDayName`, the app's one day formatter, so `PIERNA`
 * and `Pierna` are the same day: the stored snapshot is in capitals (§3), and the owner
 * may edit the name in Ejercicios.
 */
export function weekDaysOf(plan: readonly PlanDay[]): WeekPlanDays | null {
  const byName = new Map<string, string>();
  for (const day of plan) byName.set(formatDayName(day.name), day.id);

  const idOf = (role: keyof WeekPlanDays): string | null =>
    byName.get(formatDayName(ROLE_NAMES[role])) ?? null;

  const leg = idOf('leg');
  const upperA = idOf('upperA');
  const upperB = idOf('upperB');
  const prep = idOf('prep');
  if (leg === null || upperA === null || upperB === null || prep === null) return null;
  return { leg, upperA, upperB, prep };
}

/** S6/S9 — a training day today can exchange places with. */
export interface WeekSwapTarget {
  /** `Martes` */
  readonly weekday: string;
  /** The stored day that fills that weekday right now: what today would become. */
  readonly planDay: PlanDay;
  /** What choosing it writes into the week record: the two weekdays exchange (T5). */
  readonly swap: WeekSwap;
}

/** Today, as the week of the match says it is. */
export interface WeekToday {
  /** Today, dated and named by the plan of this week. */
  readonly day: WeekDay;
  /** The stored plan day behind it; `null` on the match and on a rest day. */
  readonly planDay: PlanDay | null;
  /**
   * S6/S9 — the exchange partners of today's day, in weekday order: every other day that
   * trains, never the match, never a rest day, and never one the legs cannot take (L7).
   * A training day always has at least one, so the change is never offered as impossible.
   */
  readonly targets: readonly WeekSwapTarget[];
}

export interface WeekTodayInput {
  readonly now: EpochMs;
  readonly plan: readonly PlanDay[];
  /** The stored week record, or `undefined` when this device has not planned one. */
  readonly week: WeekRecord | undefined;
}

/**
 * The exchange partners of today's day (S6, S9).
 *
 * "Se mueve a otro día de la semana" is an exchange, not a search for a hole: the two
 * days trade weekdays, so a full league or cup week still offers a choice — a swap needs
 * no free slot, which is why an earlier design that looked for one offered nothing on the
 * weeks the owner actually plays. The match, the rest days and today itself are never
 * partners, and neither is a day that would put the legs on the weekday right after the
 * match (L7): that is the one placement the layouts exist to prevent.
 */
function targetsOf(
  week: WeekPlan,
  today: DayOffset,
  plan: readonly PlanDay[],
  days: WeekPlanDays,
): WeekSwapTarget[] {
  const matchAt = week.findIndex((day) => day.kind === 'match');
  const legAfterMatch = matchAt === -1 || matchAt >= 6 ? null : ((matchAt + 1) as DayOffset);
  const legAt = week.findIndex((day) => day.planDayId === days.leg);

  const targets: WeekSwapTarget[] = [];
  for (let index = 0; index < week.length; index += 1) {
    const offset = index as DayOffset;
    if (offset === today) continue;
    const day = week[offset];
    if (day.kind !== 'training' && day.kind !== 'prep') continue;
    const planDay = plan.find((candidate) => candidate.id === day.planDayId);
    if (planDay === undefined) continue;
    // The legs travel with whichever end of the exchange holds them.
    const legsAfter = legAt === today ? offset : legAt === offset ? today : legAt;
    if (legAfterMatch !== null && legsAfter === legAfterMatch) continue;
    targets.push({ weekday: day.weekday, planDay, swap: { from: today, to: offset } });
  }
  return targets;
}

/**
 * Today according to the stored week, or `null` when the week cannot speak for today: no
 * record, a record of another week, a seeded day missing, or a stored swap the engine
 * refuses. Every one of those leaves the rotation answering, which is the behaviour a
 * store without a record already has.
 */
export function weekTodayOf(input: WeekTodayInput): WeekToday | null {
  const record = input.week;
  if (record === undefined) return null;

  const monday = mondayOfWeek(input.now);
  // A record of another week is not stale data to repair here: the week it describes is
  // over, and its swaps belong to it.
  if (record.monday !== monday) return null;

  const days = weekDaysOf(input.plan);
  if (days === null) return null;

  let week: WeekPlan;
  try {
    week = weekPlan({ monday, match: record.match, days, swaps: record.swaps });
  } catch {
    // A hand-edited record can name a swap the engine refuses (Saturday, the match, the
    // legs the day after the match). The screen falls back to the rotation; it is never
    // asked to render a thrown error.
    return null;
  }

  const offset = offsetOf(input.now);
  const day = week[offset];
  const planDay =
    day.planDayId === undefined
      ? null
      : (input.plan.find((candidate) => candidate.id === day.planDayId) ?? null);
  // S6 only offers to change a training day: the match is reported (S1) and a rest day
  // asks nothing of the gym.
  const trainable = day.kind === 'training' || day.kind === 'prep';

  return { day, planDay, targets: trainable ? targetsOf(week, offset, input.plan, days) : [] };
}
