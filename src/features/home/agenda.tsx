/*
 * T4 (S1, S2, S3, S7, S9, S12) — the week on Inicio: seven rows, and the sheet that says
 * which fixture the week has.
 *
 * The week itself is not derived here. `features/week/agenda.ts` already answers what each
 * dated day is, whether it is done, today, locked and what the legs rule has to say, from
 * `now`, the fixture, the plan and the sessions. This file only:
 *
 * 1. **The week is the screen (S12).** The layout and the seven dated rows arrive from
 *    `homeViewOf` as one object (`HomeWeek`), and since T9 the rows are all Inicio draws:
 *    the day card that used to sit under them is gone, so nothing can disagree with the
 *    week about what today carries.
 * 2. **Draws what the artboard fixes** (`design/week-calendar/02-agenda-semanal.html`):
 *    the weekday and its number, the name in full, its exercises and sets, the state in a
 *    word, and the ball on the match.
 * 3. **Keeps the two things that left the card where they belong (S12).** The fixture of
 *    the week is the match row's own line, and the row opens the sheet that writes it;
 *    the report of the match is that row's action. The count line is not drawn at all:
 *    each row already says `Hecho` or `Pendiente`.
 *
 * The week offers no placement any more (S4). The read path derives the four days from the
 * fixture's template every time (S2, S3), so there is no week to rearrange: the drop of a
 * day, the exchange of two of them, the sheet that wrote a layout and the section that
 * listed the days the match left without a date all left with it. A control that writes
 * nothing is not drawn.
 *
 * Two rules the code below keeps.
 *
 * - **Colour is never the only carrier** (§9): a done day says `Hecho` and draws the check,
 *   a match day draws the ball, and today adds the word `Hoy` to the accent edge.
 * - **No clock and no port of its own.** The instant, the plan and the sessions arrive in
 *   `HomeInput`; the fixture write arrives as `onChooseFixture`, performed by the screen
 *   that owns the port.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Icon,
  PrimaryAction,
  SectionLabel,
  TextButton,
} from '../../design-system';
import type { EpochMs } from '../../storage';
import type { MatchKind } from '../../core/engine/week-plan';
import type { AgendaDay, WeekAgenda } from '../week/agenda';
import type { WeekFixture } from '../week/week';
import { dayFocus, formatDayName, formatExerciseCount, formatWeekdayInitial } from './format';
import type { HomeActionView, HomeInput, HomeView } from './selectors';
import './agenda.css';

/* ------------------------------------------------------------------- the words */

/** How a row states itself, in one word (S1, S6, S9). */
export type AgendaStateWord = 'Hecho' | 'Hoy' | 'Pendiente' | 'Fijo' | 'Libre';

/**
 * Today says `Hoy` even when it is the match day: the artboard's third screen does exactly
 * that, and the ball already says what the day is. `Hecho` still wins, because a closed
 * session is the strongest fact a row can carry.
 *
 * T4 (S6) — a match day whose date was trained reads `Hecho` too, in the same word every
 * other trained day uses: closing the session updates the row like any other day.
 */
export function stateWordOf(day: AgendaDay): AgendaStateWord {
  if (day.done) return 'Hecho';
  if (day.kind === 'match' && day.trained) return 'Hecho';
  if (day.today) return 'Hoy';
  if (day.kind === 'match') return 'Fijo';
  if (day.kind === 'rest') return 'Libre';
  return 'Pendiente';
}

/**
 * S12 — what a match row says once its match has been reported.
 *
 * The card used to carry the sentence; the row it belongs to carries it now, in the same
 * muted meta line as the fixture, because a day that is done has nothing left to offer.
 */
export const MATCH_REPORTED_WORD = 'Partido informado';

/**
 * The three ways a week can answer the fixture question (S7, S12).
 *
 * The card's flip offered two (`liga` ↔ `copa`) and could not say «this week there is no
 * match»; the sheet the match row opens offers all three, in the owner's words.
 */
export const MATCH_CHOICE_LABELS: Readonly<Record<MatchKind, string>> = {
  league: 'Liga',
  cup: 'Copa',
  none: 'Sin partido',
};

/** The order the choices are offered in: the two fixtures, then no match. */
const MATCH_CHOICES: readonly MatchKind[] = ['league', 'cup', 'none'];

/** `Partido · Liga` — the match row names the fixture it belongs to (S9). */
const MATCH_TITLES: Readonly<Record<MatchKind, string>> = {
  league: 'Partido · Liga',
  cup: 'Partido · Copa',
  none: 'Partido',
};

/**
 * T2 (S2) — what the match row offers, in the owner's words.
 *
 * «Entrenar también», and not «Empezar entrenamiento»: the filled word belongs to the today
 * card, and this one is the extra session of a day that already carries its match.
 */
export const MATCH_TRAIN_LABEL = 'Entrenar también';

function seriesText(count: number): string {
  return count === 1 ? '1 serie' : `${count} series`;
}

/**
 * Midnight of a local `YYYY-MM-DD`.
 *
 * Built from calendar parts on purpose: `new Date('2023-11-06')` parses as UTC and would
 * date one row wrong west of Greenwich, the mistake `week.ts` warns about.
 */
function instantOfDay(date: string): EpochMs {
  const [year, month, day] = date.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

/** `LUN` — the three letters of the artboard's day column. */
export function shortWeekdayOf(day: AgendaDay): string {
  return formatWeekdayInitial(instantOfDay(day.date));
}

/** `6` — the day of the month the row sits on. */
export function dayNumberTextOf(day: AgendaDay): string {
  return String(Number(day.date.slice(8, 10)));
}

/** The name in full: the plan day, the match, or the rest day. */
export function rowTitleOf(day: AgendaDay, matchKind: MatchKind): string {
  if (day.kind === 'match') return MATCH_TITLES[matchKind];
  if (day.planDay === null) return 'Descanso';
  return formatDayName(day.planDay.name);
}

/** `6 ejercicios · 18 series` — what a plan day asks for, as the row states it. */
export function countsTextOf(exerciseCount: number, setCount: number): string {
  return `${formatExerciseCount(exerciseCount)} · ${seriesText(setCount)}`;
}

/** The row's second line: its numbers, or what the day does instead of training. */
export function rowMetaOf(day: AgendaDay): string {
  if (day.planDay === null) {
    return day.kind === 'match' ? 'Sólo se informa' : 'Sin entreno';
  }
  return countsTextOf(day.exerciseCount, day.setCount);
}

/* --------------------------------------------------------------- the derivation */

/**
 * The week Inicio draws: the agenda and the action its today row carries.
 *
 * The week itself is not derived here any more (T6): `view.agenda` is the one object
 * `homeViewOf` already built, so the rows read the very same `WeekAgenda` the card of
 * today was decided from. There is no candidate layout to warn about: the week is the
 * template (S2), and nothing on this screen proposes another one.
 */
export interface AgendaWeekView {
  readonly agenda: WeekAgenda;
  readonly action: AgendaRowAction | null;
}

/**
 * The rows the list actually draws (S11).
 *
 * Monday to Friday is the owner's week, and he asked for the weekend out of the list. The
 * rule is not "cut the last two days": a Saturday or a Sunday comes back the moment it
 * carries a plan day of his, because a shorter list may never hide a training. Nothing is
 * filtered out of `WeekAgenda` — the derivation still holds the seven dated days, and the
 * count and the done marks read it — only out of the list.
 */
export function visibleDaysOf(agenda: WeekAgenda): WeekAgenda['days'] {
  return agenda.days.filter((day) => day.weekday < 5 || day.planDay !== null);
}

/** The whole view model of the agenda, from the screen's own view. No plan, no agenda. */
export function agendaWeekViewOf(_input: HomeInput, view: HomeView): AgendaWeekView | null {
  const home = view.agenda;
  if (home === null) return null;
  const { agenda } = home;
  return {
    agenda,
    action: actionOnRowOf(agenda.days.find((day) => day.today) ?? null, view.action),
  };
}

/** The one action a row can carry (T5's seam, drawn where the day is). */
export interface AgendaRowAction {
  readonly kind: 'start' | 'resume';
  readonly label: string;
  /**
   * T2 (S2) — `quiet` draws the action as the secondary control instead of the filled one.
   *
   * Only the match row asks for it: Inicio keeps exactly one filled action, and that one
   * is the today card's (or the report's, on a match day with nothing to start). A row
   * that says nothing keeps the filled control it always had.
   */
  readonly weight?: 'filled' | 'quiet' | undefined;
}

/**
 * What today's row offers, or `null`.
 *
 * The row carries the action so the screen keeps one filled violet control (§7.1). Only a
 * workout that is not closed can start: the match and the rest day ask nothing of the gym,
 * and a done day has nothing left to open from here. A summary is not a row action — it
 * belongs to the card that holds the closed session — and an open session is only resumed
 * by a row when that row is today's, so a stale open session never borrows a day.
 */
export function actionOnRowOf(
  day: AgendaDay | null,
  action: HomeActionView | null,
): AgendaRowAction | null {
  if (day === null || action === null || !day.today) return null;
  if (day.done || day.kind !== 'workout' || day.planDay === null) return null;
  if (action.kind === 'resume') return { kind: 'resume', label: 'Continuar' };
  if (action.kind === 'start') return { kind: 'start', label: 'Empezar' };
  return null;
}

/**
 * The plan day the row hands to `start.start(planDayId)` — the seam T5 opens, and the one
 * T2 reads for the match row.
 *
 * The row's own plan day when it has one, and otherwise the day the week proposes for it
 * (S2): the match row has no day of the owner's, so the rotation's answer is the day it
 * would start. `null` when the row has neither — a rest day, or a week with no plan.
 */
export function startRequestOf(day: AgendaDay | null): string | null {
  if (day === null) return null;
  return day.planDay?.id ?? day.proposal?.id ?? null;
}

/* ------------------------------------------------------------------- the glyphs */

/* --------------------------------------------------------------------- the row */

export interface AgendaRowProps {
  readonly day: AgendaDay;
  readonly matchKind: MatchKind;
  readonly action?: AgendaRowAction | null | undefined;
  readonly starting?: boolean | undefined;
  /**
   * S12 — the fixture of the week (`Liga · jueves`), drawn on the match row instead of on
   * the card. A week with no fixture has no match row to carry it.
   */
  readonly fixture?: string | null | undefined;
  /** S12 — the match of this week has been reported: the row says so and offers nothing. */
  readonly reported?: boolean | undefined;
  /** S12 — the match row is a control that opens the fixture sheet. */
  readonly onOpenFixture?: (() => void) | undefined;
  /** S12 — the match report, on the match row and only on the day of the match. */
  readonly report?: AgendaRowReport | null | undefined;
  readonly onStart?: ((planDayId: string) => void) | undefined;
}

/** The report a row can carry, shaped like the start action: a label and a guarded press. */
export interface AgendaRowReport {
  readonly label: string;
  readonly busy: boolean;
  readonly onPress: () => void;
}

/**
 * One day of the week, as a row.
 *
 * The week is derived from the fixture's template (S2), so a row does not offer to move:
 * it is plain text — weekday, number, the workout and the state (§9) — and carries only
 * the action the day really has.
 *
 * The one row that is a control is the match (S12): it carries the fixture of the week and
 * opens the sheet that changes that fixture, which writes the week's record and never a
 * layout. Its report is the row's own action, drawn where the day is.
 */
export function AgendaRow({
  day,
  matchKind,
  action = null,
  starting = false,
  fixture = null,
  reported = false,
  onOpenFixture,
  report = null,
  onStart,
}: AgendaRowProps): React.ReactElement {
  const state = stateWordOf(day);
  const opensMatch = day.kind === 'match' && onOpenFixture !== undefined;
  const planDayId = startRequestOf(day);
  // T4 (S6): the match row has no plan day of the owner's, so its training is read from
  // its date — and it reads as closed, with the check and the word, like any other day.
  const closed = day.done || (day.kind === 'match' && day.trained);
  // S12: the match row's second line is the fixture it belongs to. It replaces the old
  // `Sólo se informa`, which said what the row does instead of which match it is.
  const meta =
    day.kind !== 'match'
      ? rowMetaOf(day)
      : reported
        ? MATCH_REPORTED_WORD
        : (fixture ?? rowMetaOf(day));

  const classes = [
    'home-agenda__row',
    `home-agenda__row--${day.kind}`,
    closed ? 'home-agenda__row--done' : '',
    day.today ? 'home-agenda__row--today' : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
  const content = (
    <>
      <span className="home-agenda__day">
        <span className="home-agenda__wd" aria-hidden="true">
          {shortWeekdayOf(day)}
        </span>
        {/* The reader gets the weekday in full; the three letters are a sighted shortcut. */}
        <span className="ds-visually-hidden">{day.weekdayName}</span>
        <span className="home-agenda__num">{dayNumberTextOf(day)}</span>
      </span>
      <span className="home-agenda__main">
        <span className="home-agenda__name">{rowTitleOf(day, matchKind)}</span>
        <span className="home-agenda__meta">{meta}</span>
      </span>
      <span className="home-agenda__state">
        {closed ? (
          <span className="home-agenda__mark home-agenda__mark--check">
            <Icon name="check" size={13} />
          </span>
        ) : null}
        {day.kind === 'match' ? (
          <span className="home-agenda__mark home-agenda__mark--ball">
            <Icon name="ball" size={13} />
          </span>
        ) : null}
        {state}
      </span>
    </>
  );

  return (
    <li data-weekday={day.weekday} className={classes}>
      {opensMatch ? (
        <button
          type="button"
          className="ds-action home-agenda__body"
          aria-haspopup="dialog"
          onClick={() => onOpenFixture?.()}
        >
          {content}
        </button>
      ) : (
        <div className="home-agenda__body">{content}</div>
      )}
      {action === null || planDayId === null ? null : (
        <span className="home-agenda__action">
          {action.weight === 'quiet' ? (
            // T2 (S2): the match row's action is the secondary control — the accent fill
            // stays on the screen's one filled action and this one never competes for it.
            <TextButton
              icon="play"
              tone="accent"
              disabled={starting}
              onClick={() => onStart?.(planDayId)}
            >
              {starting ? 'Empezando…' : action.label}
            </TextButton>
          ) : (
            <PrimaryAction icon="play" disabled={starting} onClick={() => onStart?.(planDayId)}>
              {starting ? 'Empezando…' : action.label}
            </PrimaryAction>
          )}
        </span>
      )}
      {report === null ? null : (
        <span className="home-agenda__action">
          <PrimaryAction icon="check" disabled={report.busy} onClick={report.onPress}>
            {report.label}
          </PrimaryAction>
        </span>
      )}
    </li>
  );
}

/* --------------------------------------------------------- the fixture's sheet */

/** «¿Qué partido juegas esta semana?» — the title of the sheet the match row opens. */
export const MATCH_SHEET_TITLE = '¿Qué partido juegas esta semana?';

export interface MatchSheetProps {
  /** The fixture of this week: the choice that is already written. */
  readonly matchKind: MatchKind;
  /** Writes the record and closes: one tap, exactly like the flip the card used to have. */
  readonly onChoose: (match: MatchKind) => void;
  readonly onClose: () => void;
}

/**
 * S12 — the fixture of the week, changed from the match row.
 *
 * The card's line offered two kinds and one action; this offers the three answers a week
 * can have — league, cup, no match — and writes the same record `saveWeekMatch` already
 * writes (`HomeScreen.tsx`). It is a dialog for the same reason the day sheet is: the week
 * behind it has to leave the accessibility tree, and the caller marks it (`AgendaWeek`).
 *
 * Choosing closes the sheet: the record is written and the screen re-reads, so there is no
 * second confirm step between the choice and the week it changes.
 */
export function MatchSheet({ matchKind, onChoose, onClose }: MatchSheetProps): React.ReactElement {
  const sheet = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sheet.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="home-agenda-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={MATCH_SHEET_TITLE}
      tabIndex={-1}
      ref={sheet}
      onKeyDown={onKeyDown}
    >
      <span className="home-agenda-sheet__grab" aria-hidden="true" />
      <div className="home-agenda-sheet__head">
        <div>
          <h2 className="ds-card-title">{MATCH_SHEET_TITLE}</h2>
          <p className="ds-meta">La semana entera cambia: el partido lleva su día.</p>
        </div>
        <TextButton onClick={onClose}>Cerrar</TextButton>
      </div>

      <ul className="home-agenda-sheet__options">
        {MATCH_CHOICES.map((kind) => {
          const selected = kind === matchKind;
          return (
            <li key={kind}>
              <button
                type="button"
                className={[
                  'ds-action',
                  'home-agenda-sheet__option',
                  selected ? 'home-agenda-sheet__option--current' : '',
                ]
                  .filter((part) => part !== '')
                  .join(' ')}
                aria-pressed={selected}
                onClick={() => {
                  onChoose(kind);
                  onClose();
                }}
              >
                <span className="home-agenda-sheet__radio" aria-hidden="true">
                  {selected ? <Icon name="check" size={10} /> : null}
                </span>
                <span className="home-agenda-sheet__option-body">
                  <span className="home-agenda-sheet__option-name">
                    {MATCH_CHOICE_LABELS[kind]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------- the workout the owner chose */

/** The quiet control the card of today draws: the offer, not the filling one (§7.1). */
export const CHOOSE_TRIGGER_LABEL = 'Elegir otro entreno';

/** The sheet's name, and the name a screen reader hears when it opens. */
export const CHOOSE_SHEET_TITLE = 'Elige el entreno de hoy';

/** A plan with nothing to start in any of its days offers no list to read. */
export const CHOOSE_EMPTY_NOTE = 'No hay ningún entreno con ejercicios todavía.';

/** One plan day, as the sheet offers it. */
export interface ChooseDayOption {
  readonly planDayId: string;
  /** `Press banca / Empuje` — the name in full, as the card and the row write it. */
  readonly title: string;
  /** The muscle group the compound name compacts, when it has one. */
  readonly chips: readonly string[];
  /** `3 ejercicios · 9 series` — the day's own counts, as its row states them. */
  readonly meta: string;
}

/**
 * The days the sheet offers, derived from the week the card was read from (S6).
 *
 * The agenda already holds every plan day with its counts (`planDays`), so the list is a
 * projection of it and not a second question to the store. A day with no exercises is left
 * out: `planStart` refuses it, so offering it would be a control that cannot do its job.
 */
export function chooseOptionsOf(agenda: WeekAgenda): readonly ChooseDayOption[] {
  return agenda.planDays
    .filter((entry) => entry.exerciseCount > 0)
    .toSorted(
      (left, right) =>
        left.planDay.order - right.planDay.order || left.planDay.id.localeCompare(right.planDay.id),
    )
    .map((entry) => ({
      planDayId: entry.planDay.id,
      title: formatDayName(entry.planDay.name),
      chips: [dayFocus(entry.planDay.name)].filter((part): part is string => part !== null),
      meta: countsTextOf(entry.exerciseCount, entry.setCount),
    }));
}

export interface ChooseDaySheetProps {
  readonly days: readonly ChooseDayOption[];
  /** Starts the day that was tapped. The sheet closes before it, so nothing covers it. */
  readonly onChoose: (planDayId: string) => void;
  readonly onClose: () => void;
}

/**
 * S1 — the plan's days, to pick the one the owner is going to train.
 *
 * The week proposes a day per weekday, and it is only a proposal: this is where the owner
 * walks past it (`odd/tasks/choose-today-workout.md`). Choosing starts that day's session
 * through `planStart` and writes nothing else — no placement, no preference, no layout —
 * so tomorrow's week proposes exactly what it proposed before (S2).
 *
 * A dialog for the same reason the fixture's sheet is one: the card behind it has to leave
 * the accessibility tree, and the caller marks it (`HomeScreen.tsx`, `MODAL_BACKGROUND`).
 */
export function ChooseDaySheet({
  days,
  onChoose,
  onClose,
}: ChooseDaySheetProps): React.ReactElement {
  const sheet = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sheet.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="home-agenda-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={CHOOSE_SHEET_TITLE}
      tabIndex={-1}
      ref={sheet}
      onKeyDown={onKeyDown}
    >
      <span className="home-agenda-sheet__grab" aria-hidden="true" />
      <div className="home-agenda-sheet__head">
        <div>
          <h2 className="ds-card-title">{CHOOSE_SHEET_TITLE}</h2>
          <p className="ds-meta">La semana propone un día. Tú escoges el que entrenas.</p>
        </div>
        <TextButton onClick={onClose}>Cerrar</TextButton>
      </div>

      {days.length === 0 ? (
        <p className="ds-meta">{CHOOSE_EMPTY_NOTE}</p>
      ) : (
        <ul className="home-agenda-sheet__options">
          {days.map((day) => (
            <li key={day.planDayId}>
              <button
                type="button"
                className="ds-action home-agenda-sheet__option"
                data-plan-day-id={day.planDayId}
                onClick={() => {
                  onChoose(day.planDayId);
                  onClose();
                }}
              >
                <span className="home-agenda-sheet__option-body">
                  <span className="home-agenda-sheet__option-name">{day.title}</span>
                  <span className="ds-meta">{day.meta}</span>
                </span>
                {day.chips.length === 0 ? null : (
                  <span className="home-agenda-sheet__chips">
                    {day.chips.map((chip) => (
                      <span key={chip} className="ds-meta">
                        {chip}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the week */

export interface AgendaWeekProps {
  readonly week: AgendaWeekView;
  /**
   * T6 (§9) — the sheet opened or closed. The screen behind a modal has to leave the
   * accessibility tree, and that screen is not this component's to touch; the parent owns
   * it and this only says when.
   */
  readonly onSheetChange?: ((open: boolean) => void) | undefined;
  /**
   * S12 — the fixture of this week, once the store holds a record. It is drawn on the
   * match row and nowhere else; `null` means a store that cannot say which week it is.
   */
  readonly fixture?: WeekFixture | null | undefined;
  /** S12 — the match of this week has already been reported (the row is done). */
  readonly matchReported?: boolean | undefined;
  /** S12 — writes the chosen fixture into this week's record. */
  readonly onChooseFixture?: ((match: MatchKind) => void) | undefined;
  /** S12 — reports the match of the day, from the match row. */
  readonly onReportMatch?: (() => void) | undefined;
  readonly reporting?: boolean | undefined;
  /**
   * T2 (S2) — the way into a session, for the one row that offers it without owning a day:
   * the match row hands `start.start` the day the week proposes for it.
   */
  readonly onStart?: ((planDayId: string) => void) | undefined;
  readonly starting?: boolean | undefined;
}

/**
 * The attributes that take the rows out of the dialog's way while it is open (§9).
 *
 * The sheet is drawn in the week, not over it, so the rows are its background and not a
 * second pane: `inert` and `aria-hidden` are what keep Tab inside the dialog and keep a
 * screen reader from reading the week twice.
 */
const BACKGROUND_WHILE_OPEN = { inert: true, 'aria-hidden': true } as const;

/**
 * The seven rows, the fixture's sheet, and the two actions a row can carry.
 *
 * Nothing here rearranges the week: it is derived from the fixture's template (S2), so the
 * week has no placement to make, no drop to refuse and no layout to save (S4). What is
 * left is the reading — the rows, their state, the fixture on the match row and its report
 * — and the one press the match row adds: the day it would train (S7).
 */
export function AgendaWeek({
  week,
  onSheetChange,
  fixture = null,
  matchReported = false,
  onChooseFixture,
  onReportMatch,
  reporting = false,
  onStart,
  starting = false,
}: AgendaWeekProps): React.ReactElement {
  const { agenda } = week;
  // S12: the fixture sheet, opened from the match row (or from the quiet line that stands
  // in for it in a week with no match day).
  const [matchSheet, setMatchSheet] = useState(false);

  // §9 — the screen behind the dialog learns that the dialog exists. One effect, and the
  // parent decides what to hide.
  useEffect(() => {
    onSheetChange?.(matchSheet);
  }, [matchSheet, onSheetChange]);

  // While the fixture sheet is open, the week it was opened from is its background (§9).
  const background = matchSheet ? BACKGROUND_WHILE_OPEN : {};

  /**
   * S12 — the report a row carries. Only the day of the match reports it, only once, and
   * only when the screen behind this week can write it.
   */
  const reportOf = (day: AgendaDay): AgendaRowReport | null => {
    if (!day.today || day.kind !== 'match') return null;
    if (matchReported || onReportMatch === undefined) return null;
    return {
      label: reporting ? 'Informando…' : 'Informar el partido',
      busy: reporting,
      onPress: onReportMatch,
    };
  };

  /**
   * T2 (S2) — the action the match row carries.
   *
   * Only the match row gets one here: every other row either carries its own plan day (and
   * today's action lives on the card) or has nothing to start. It is drawn quiet, because
   * the screen keeps one filled control. A week with no proposal, or a screen that cannot
   * start anything, offers nothing — exactly as the row read before (S7).
   */
  const trainActionOf = (day: AgendaDay): AgendaRowAction | null => {
    if (day.kind !== 'match' || day.proposal === null || onStart === undefined) return null;
    return { kind: 'start', label: MATCH_TRAIN_LABEL, weight: 'quiet' };
  };

  // A week with no fixture has no match day, and therefore no row to carry the line: one
  // quiet line under the rows opens the same sheet, so the owner can always say what he
  // plays (S7). It keeps the flip's own words.
  const hasMatchRow = agenda.days.some((day) => day.kind === 'match');
  const fixtureLine =
    hasMatchRow || fixture === null || onChooseFixture === undefined ? null : (
      <p className="ds-meta home-agenda__fixture" {...background}>
        <span>{fixture.label ?? 'Sin partido esta semana'}</span>
        <TextButton align="start" onClick={() => setMatchSheet(true)}>
          {fixture.action}
        </TextButton>
      </p>
    );

  return (
    <section className="home-agenda-block" aria-label="La semana">
      {/* The block's own label, so the week below the card reads as one object and not as
          four loose lines (T5 of the redesign). It is the list's heading; the section keeps
          its accessible name. */}
      <SectionLabel icon={<Icon name="calendar" size={14} />}>La semana</SectionLabel>

      <ol className="home-agenda" aria-label="Días de la semana" {...background}>
        {visibleDaysOf(agenda).map((day) => (
          <AgendaRow
            key={day.date}
            day={day}
            matchKind={agenda.matchKind}
            fixture={day.kind === 'match' ? (fixture?.label ?? null) : null}
            reported={day.kind === 'match' && matchReported}
            report={reportOf(day)}
            action={trainActionOf(day)}
            starting={starting}
            onStart={onStart}
            onOpenFixture={
              day.kind === 'match' && onChooseFixture !== undefined
                ? () => setMatchSheet(true)
                : undefined
            }
          />
        ))}
      </ol>

      {fixtureLine}

      {matchSheet ? (
        <MatchSheet
          matchKind={agenda.matchKind}
          onClose={() => setMatchSheet(false)}
          onChoose={(match) => onChooseFixture?.(match)}
        />
      ) : null}
    </section>
  );
}
