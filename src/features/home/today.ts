/**
 * T5 (odd/tasks/dark-premium-redesign.md) — what Inicio puts above the fold, without React.
 *
 * The screen has two blocks above the agenda, and both of them are *readings* of data that
 * already exists: today's workout (the agenda's today row) and the week's progress (the
 * agenda's own `doneCount` over the plan days the week holds). Nothing is computed here
 * that the week did not already answer, and nothing is invented: a day with no exercises
 * says so, a day with no workout says `Descanso`, and a week with no plan says there is
 * no plan — three honest states instead of a card full of zeros.
 *
 * Two rules the shapes below keep:
 *
 * 1. **One source of "what today carries".** Both blocks read `view.agenda` — the same
 *    `WeekAgenda` the rows under them read (T4/T6 of the previous task) — so the card can
 *    never name a day the week does not. That is why the hero takes the whole `HomeView`
 *    instead of a handful of strings: a second argument would be a second answer.
 * 2. **Words come from the agenda, not from here.** The title of the day is `rowTitleOf`,
 *    the state is `stateWordOf`, the weekday letters are `shortWeekdayOf`: the row and the
 *    card above it say the same thing because they ask the same function.
 *
 * Pure: no clock, no port, no DOM. `HomeView` is the whole world of the screen.
 */

import type { AgendaKind } from '../week/agenda';
import { dayFocus } from './format';
import {
  rowMetaOf,
  rowTitleOf,
  shortWeekdayOf,
  startRequestOf,
  stateWordOf,
} from './agenda';
import type { HomeView } from './selectors';

/** What today is, in the five states the screen has. */
export type TodayKind = 'workout' | 'match' | 'rest' | 'emptyDay' | 'noPlan';

/**
 * Today's workout, as the protagonist card reads it.
 *
 * `exercises` and `sets` are the plan day's own counts (the same numbers its row states),
 * so the two figures under the title are the prescription and not a measurement of
 * anything the owner has done. `done` is the closed line the view already writes
 * (`Sesión completada hoy · 8 de 9 series.`), and it only exists once the day is done.
 */
export interface TodayHero {
  readonly kind: TodayKind;
  /** `HOY · MIÉRCOLES` — the eyebrow, dated by the agenda's own row. */
  readonly eyebrow: string;
  /** `Pierna` / `Partido · Liga` / `Descanso` / `Tu plan`. */
  readonly title: string;
  /** The attributes that have a word: the muscle group of a compound name, the phase. */
  readonly chips: readonly string[];
  /** What the plan day prescribes, or `null` when there is nothing to prescribe. */
  readonly exercises: number | null;
  readonly sets: number | null;
  /** One honest sentence for the states that have no workout to start. */
  readonly note: string | null;
  /** `Sesión completada hoy · 8 de 9 series.` when the day is closed. */
  readonly done: string | null;
  /** The plan day the card starts; `null` on a match, a rest day and an empty store. */
  readonly planDayId: string | null;
}

/** The empty store's sentence, kept word for word from the note it used to be (T9). */
export const NO_PLAN_NOTE =
  'Todavía no hay rutina ni sesiones programadas. La plantilla de la semana está en Entrenar.';

/** A day of the plan with no exercises: there is nothing to start, and it says so. */
export const EMPTY_DAY_NOTE = 'Sin ejercicios todavía.';

/** What the card is called when the store holds no plan at all. */
export const NO_PLAN_TITLE = 'Tu plan';

/** `HOY · MIÉRCOLES` — the eyebrow of a dated row, or plain `HOY` with no week. */
function eyebrowOf(weekdayName: string | null): string {
  return weekdayName === null ? 'HOY' : `HOY · ${weekdayName.toUpperCase()}`;
}

/**
 * Today's card. Reads the agenda's today row and `view.today` — never the clock.
 *
 * The order of the branches is the order of the week's own facts: a store with no plan has
 * no day to name; the match and the rest day are days, and they say what they are; a
 * workout day with no exercises is an honest empty day; everything else is the workout the
 * owner is about to start.
 */
export function todayHeroOf(view: HomeView): TodayHero {
  const week = view.agenda?.agenda ?? null;
  const row = week === null ? null : (week.days.find((day) => day.today) ?? null);

  if (week === null || row === null) {
    return {
      kind: 'noPlan',
      eyebrow: eyebrowOf(null),
      title: NO_PLAN_TITLE,
      chips: [],
      exercises: null,
      sets: null,
      note: NO_PLAN_NOTE,
      done: null,
      planDayId: null,
    };
  }

  const title = rowTitleOf(row, week.matchKind);
  const eyebrow = eyebrowOf(row.weekdayName);

  if (row.kind !== 'workout') {
    return {
      kind: row.kind,
      eyebrow,
      title,
      chips: [],
      exercises: null,
      sets: null,
      // The row's own second line: `Sólo se informa` on the match, `Sin entreno` on a rest
      // day. The card does not get a second vocabulary for the same day.
      note: rowMetaOf(row),
      done: null,
      planDayId: null,
    };
  }

  if (row.exerciseCount === 0) {
    return {
      kind: 'emptyDay',
      eyebrow,
      title,
      chips: [],
      exercises: null,
      sets: null,
      note: EMPTY_DAY_NOTE,
      done: null,
      planDayId: startRequestOf(row),
    };
  }

  // Two attributes, in the order they read: what the name compacts (`SENTADILLA / PIERNA`
  // → `Pierna`, the muscle group the day is for) and the readaptation block, when the
  // store holds one. Neither is a statistic: both are words the app already writes.
  const focus = dayFocus(row.planDay?.name ?? '');
  const phase = view.today?.phase ?? null;
  const chips = [focus, phase].filter((part): part is string => part !== null);

  return {
    kind: 'workout',
    eyebrow,
    title,
    chips,
    exercises: row.exerciseCount,
    sets: row.setCount,
    note: null,
    done: view.today?.done ?? null,
    planDayId: startRequestOf(row),
  };
}

/** One day of the week strip: three letters, and the state in words for the reader. */
export interface WeekDayMark {
  readonly weekday: number;
  /** `LUN` — the same three letters the agenda's day column draws. */
  readonly initial: string;
  /** `Lunes` */
  readonly name: string;
  readonly done: boolean;
  readonly today: boolean;
  readonly kind: AgendaKind;
  /** What a screen reader hears: `Lunes, hecho`. */
  readonly label: string;
}

/**
 * The week as the progress block states it.
 *
 * `done` and `target` are the agenda's own numbers: `doneCount` counts the plan days whose
 * session closed this week, and `planDays.length` is the week's plan — the tally the week
 * module already documents (`features/week/agenda.ts`, «3 de 4 entrenos hechos»). The
 * percentage is the bar's width and nothing else: the same fact is always written in
 * words next to it, so the bar is never the only carrier (§9).
 */
export interface WeekProgress {
  readonly done: number;
  readonly target: number;
  /** 0…100, rounded: the bar's width, never a fact on its own. */
  readonly percent: number;
  /** All seven days, Monday first — the week, not the shortened list. */
  readonly days: readonly WeekDayMark[];
}

/** The week's progress, or `null` on a store with no plan (there is no week to count). */
export function weekProgressOf(view: HomeView): WeekProgress | null {
  const week = view.agenda?.agenda ?? null;
  if (week === null) return null;
  const target = week.planDays.length;
  const done = week.doneCount;

  return {
    done,
    target,
    percent: target === 0 ? 0 : Math.min(100, Math.round((done / target) * 100)),
    days: week.days.map((day) => ({
      weekday: day.weekday,
      initial: shortWeekdayOf(day),
      name: day.weekdayName,
      done: day.done,
      today: day.today,
      kind: day.kind,
      label: `${day.weekdayName}, ${stateWordOf(day).toLowerCase()}`,
    })),
  };
}
