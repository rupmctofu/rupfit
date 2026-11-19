/**
 * T3 (S1, S4, S6) — the week as seven dated rows, derived from the fixture's template.
 *
 * The week is deduced from the fixture, exactly as `core/engine/week-plan.ts` and
 * `features/week/week.ts` deduce it: the match keeps its weekday (Thursday in the league,
 * Tuesday in the cup, none at all in a week without a fixture) and it takes that weekday
 * whatever the owner decided (S4). Every other day is filled by the template bridge of
 * `week.ts`, so the four days always land Monday to Friday and no plan day is left without
 * a weekday (`odd/tasks/derived-week.md` S2, S3). The stored placement the rows used to
 * honour is gone with its drag and its day sheet (`odd/tasks/backlog-closeout.md` T4).
 *
 * Two rules decide the shapes below.
 *
 * 1. **Done is keyed by the plan day, not by the clock** (S1). A day reads done because a
 *    closed session of that plan day was scheduled inside this week; a past day without a
 *    session stays open (S6).
 * 2. **The legs-after-the-match rule warns, never blocks** (S4). The warning is a sentence
 *    for the owner, and it names a placement the derived cup week does hold by design
 *    (`odd/tasks/leg-separation.md` S3).
 *
 * Pure: no React, no port, no storage and no clock of its own. `now`, the fixture, the
 * plan and the sessions all arrive as parameters.
 */

import {
  WEEK_TEMPLATES,
  type MatchKind,
  type StrengthRole,
  type WeekSlot,
} from '../../core/engine/week-plan';
import type { EpochMs, PlanDay, WorkoutSession } from '../../storage';
import { formatDayName, formatWeekdayName } from '../home/format';
import { nextPlanDay } from '../session/start';
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
  /**
   * T2 (S2, S3) — the plan day this row would start when it has no plan day of its own.
   *
   * Only the match row carries one: on every other row `planDay` already answers, and a
   * second answer would be a second rotation rule. It is `weekProposalOf`'s day, never a
   * figure re-derived here, and `null` on a week whose plan proposes nothing.
   */
  readonly proposal: PlanDay | null;
  /** 0 when there is no plan day. */
  readonly exerciseCount: number;
  /** 0 when there is no plan day. */
  readonly setCount: number;
  /** S1: a closed session of that plan day was scheduled inside this week. */
  readonly done: boolean;
  /**
   * T4 (S6) — a closed session was scheduled on this row's own date.
   *
   * About the date and not about the plan day, which is why the match row can be trained
   * and still `done: false`: what `done` answers is «this row's day has been trained», and
   * the match row has no day of the owner's to be done with. Read by the row that has no
   * plan day, and true on any row a closed session happened on.
   */
  readonly trained: boolean;
  readonly today: boolean;
  /** S6. */
  readonly locked: boolean;
  readonly lockReason: 'match' | 'done' | null;
}

/** One of the owner's plan days, with the weekday it holds this week. */
export interface AgendaPlanDay {
  readonly planDay: PlanDay;
  /** `null` when the template cannot place it — the plan lost the name it is found by. */
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
 * What each weekday holds, from the template of this week's fixture (S2, S3).
 *
 * `WEEK_TEMPLATES` is the whole answer: the four days are found by the name bridge of
 * `week.ts` and a slot that asks for no day stays free, so a plan that lost a seeded day
 * leaves its weekday empty instead of borrowing a stranger's session.
 */
function placedPlanDayIdsOf(input: {
  readonly matchKind: MatchKind;
  readonly plan: readonly PlanDay[];
}): readonly (string | null)[] {
  return WEEK_TEMPLATES[input.matchKind].map((slot) => templatePlanDayIdOf(slot, input.plan));
}

/**
 * S4 — the one rule of the layouts, said out loud instead of silently broken.
 *
 * The app prefers the legs far from the match (L7), and the cup template places the squat
 * on the weekday after it by decision (`odd/tasks/leg-separation.md` S3), so that week says
 * so: the sentence names the day and the plan day. Nothing is refused — there is no
 * placement to refuse any more — and a week without a match has no "day after" to protect,
 * just as a plan that lost its leg day has nothing to warn about.
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
 * T4 (S6) — the dates a closed session was scheduled on, as local `YYYY-MM-DD`.
 *
 * The same two statuses `donePlanDayIdsOf` counts as closed, keyed by the date instead of
 * by the plan day: the match row has no plan day of its own, so the date is the only thing
 * that can tell it a training happened on it. Open, scheduled and abandoned sessions are
 * not a training that happened.
 */
function closedDateTextsOf(sessions: readonly WorkoutSession[]): ReadonlySet<string> {
  const dates = new Set<string>();
  for (const session of sessions) {
    if (session.status !== 'completed' && session.status !== 'partial') continue;
    dates.add(localDayOf(session.scheduledDate));
  }
  return dates;
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
  const closedDateTexts = closedDateTextsOf(input.sessions);
  // S2, S3 — the day the match row would start, read from the one rule that answers it
  // (`weekProposalOf`) and only on a week that has a match row at all.
  const proposal =
    matchWeekday === null ? null : weekProposalOf(input.plan, input.sessions, localDayOf(monday.getTime()));

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
      proposal: isMatch ? proposal : null,
      ...countsOf(planDay),
      done,
      trained: closedDateTexts.has(dateText),
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
    monday: localDayOf(monday.getTime()),
    matchKind: input.matchKind,
    days,
    planDays,
    warning: legWarningOf(days, input.plan),
    // "3 de 4 entrenos hechos": the count is of plan days, so a day whose row is not on
    // screen still counts as done instead of vanishing from the tally.
    doneCount: input.plan.filter((planDay) => donePlanDayIds.has(planDay.id)).length,
  };
}

/**
 * Local midnight of the Monday a local `YYYY-MM-DD` week starts on.
 *
 * Built from the calendar parts and never from `new Date('2026-03-02')`, which is UTC and
 * would date the week a day off west of Greenwich. `mondayInstantOf` snaps the answer to
 * the Monday, so the week asked about is the same week the agenda of that Monday shows.
 */
function mondayOfText(monday: string): Date {
  const [year = 1970, month = 1, day = 1] = monday.split('-').map(Number);
  return mondayInstantOf(new Date(year, month - 1, day).getTime());
}

/**
 * S4 — the plan day the app proposes when the owner asks to train on the match day.
 *
 * The week, not the history, decides first: the proposal is the first day of the rotation
 * that this week has no closed session for, so pressing the match row twice in a week
 * walks the four days instead of proposing the same one again. Closed is the same word
 * the agenda uses (`donePlanDayIdsOf`): `completed` or `partial`, keyed by the plan day and
 * inside this week only, so a session of last week neither marks nor unmarks anything.
 *
 * With all four closed the week is done and the answer is the app's own rotation, called
 * and never copied (S3): the day the training day would propose, which is also why a fifth
 * session stays possible. An empty plan has no first undone day and no rotation to fall
 * back on, so it proposes nothing.
 */
export function weekProposalOf(
  plan: readonly PlanDay[],
  sessions: readonly WorkoutSession[],
  monday: string,
): PlanDay | null {
  const weekDateTexts = new Set(
    weekDatesOf(mondayOfText(monday)).map((date) => localDayOf(date.getTime())),
  );
  const done = donePlanDayIdsOf(sessions, weekDateTexts);
  // `order` is the rotation and the id only settles a tie: two days cannot share a place
  // in the cycle, and a stored pair that does must still be answered the same way twice.
  const rotation = plan.toSorted(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  return rotation.find((planDay) => !done.has(planDay.id)) ?? nextPlanDay(plan, sessions);
}
