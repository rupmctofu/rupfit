/*
 * T4 (S1, S2, S3, S9, S10) — the week on Inicio: seven rows, the row in the hand and the
 * sheet that changes what a day carries.
 *
 * The week itself is not derived here. `features/week/agenda.ts` already answers what each
 * dated day is, whether it is done, today, locked and what the legs rule has to say, from
 * `now`, the fixture, the plan, the owner's layout and the sessions. This file only:
 *
 * 1. **The week is the screen (S12).** The layout and the seven dated rows arrive from
 *    `homeViewOf` as one object (`HomeWeek`), and since T9 the rows are all Inicio draws:
 *    the day card that used to sit under them is gone, so nothing can disagree with the
 *    week about what today carries.
 * 2. **Turns the gesture into one operation.** A drop and a tap of the day sheet both call
 *    `placePlanDay` and write the layout it returns. A refusal changes nothing and says
 *    one quiet sentence; a write that fails keeps the previous week on screen and offers
 *    one retry.
 * 3. **Draws what the artboard fixes** (`design/week-calendar/02-agenda-semanal.html`):
 *    the weekday and its number, the name in full, its exercises and sets, the state in a
 *    word, the ball on the match and the lock on the days that refuse the row.
 * 4. **Keeps the two things that left the card where they belong (S12).** The fixture of
 *    the week is the match row's own line, and the row opens the sheet that writes it;
 *    the report of the match is that row's action. The hint the list used to print lives
 *    in the day sheet now, and the count line is not drawn at all: each row already says
 *    `Hecho` or `Pendiente`.
 *
 * Three rules the code below keeps.
 *
 * - **Dragging is never required** (S2/S3): every change is reachable by tapping a row,
 *   and the handle is `aria-hidden` because the row is the control. The pointer path only
 *   names the weekday under the finger and hands it to the same placement.
 * - **Colour is never the only carrier** (§9): a done day says `Hecho` and draws the check,
 *   a refusing day says `Cerrado` and draws the lock, and today adds the word `Hoy` to the
 *   accent edge.
 * - **No clock and no port of its own.** The instant, the plan and the sessions arrive in
 *   `HomeInput`; the write arrives as `onPlace`, performed by `HomeScreenWithPort`, which
 *   is the only place that knows a `StoragePort` exists.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  Icon,
  PrimaryAction,
  SectionLabel,
  TextButton,
} from '../../design-system';
import type { EpochMs, StoragePort, WeekLayout } from '../../storage';
import type { MatchKind } from '../../core/engine/week-plan';
import {
  placePlanDay,
  type AgendaDay,
  type AgendaPlanDay,
  type PlacementRefusal,
  type PlacementResult,
  type WeekAgenda,
} from '../week/agenda';
import type { WeekFixture } from '../week/week';
import { formatDayName, formatExerciseCount, formatWeekdayInitial } from './format';
import { agendaOver, type HomeActionView, type HomeInput, type HomeView } from './selectors';
import './agenda.css';

/* ------------------------------------------------------------------- the words */

/** How a row states itself, in one word (S1, S6, S9). */
export type AgendaStateWord = 'Hecho' | 'Hoy' | 'Pendiente' | 'Fijo' | 'Libre';

/**
 * Today says `Hoy` even when it is the match day: the artboard's third screen does exactly
 * that, and the ball already says what the day is. `Hecho` still wins, because a closed
 * session is the strongest fact a row can carry.
 */
export function stateWordOf(day: AgendaDay): AgendaStateWord {
  if (day.done) return 'Hecho';
  if (day.today) return 'Hoy';
  if (day.kind === 'match') return 'Fijo';
  if (day.kind === 'rest') return 'Libre';
  return 'Pendiente';
}

/** What an unchangeable row says while a row is in the air: the lock and this word. */
export const CLOSED_WORD = 'Cerrado';

/**
 * The one sentence about the gesture, in the owner's words (the artboard's hint).
 *
 * S12 moved it off Inicio and into the day sheet: the week is the screen now, and the
 * sentence that explains how to move a row belongs where the move is made, not under a
 * list the owner already understands.
 */
export const AGENDA_HINT =
  'Arrastra un renglón a otro día, o tócalo para cambiar el entreno que lleva.';

/** The same hint while something is in the hand: what accepts it and what does not. */
export const DRAG_HINT =
  'Los días hechos llevan candado y el partido no se mueve. El resto acepta el renglón.';

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

/** A failed write, said once, next to the retry that can fix it (S5). */
export const PLACEMENT_FAILED_COPY =
  'No se pudo guardar el cambio. La semana sigue como estaba.';

/** Why a placement did not happen, in the owner's words, and never as a code. */
const REFUSAL_COPY: Readonly<Record<PlacementRefusal, string | null>> = {
  matchDay: 'El día del partido no se mueve.',
  doneDay: 'Un día hecho no se cambia.',
  // A row dropped on its own day asked for what is already true: nothing to explain.
  sameDay: null,
  unknownDay: 'Ese día no está en la semana.',
  unknownPlanDay: 'Ese entreno no está en tu plan.',
};

/** `Partido · Liga` — the match row names the fixture it belongs to (S9). */
const MATCH_TITLES: Readonly<Record<MatchKind, string>> = {
  league: 'Partido · Liga',
  cup: 'Partido · Copa',
  none: 'Partido',
};

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
 * The week Inicio draws: the agenda, the layout it came from, the action its today row
 * carries, and the way to ask what a candidate placement would warn about.
 *
 * The week itself is not derived here any more (T6): `view.agenda` is the one object
 * `homeViewOf` already built, so the day card below the rows reads the very same
 * `WeekAgenda` this screen draws. `warningFor` re-derives the week with the candidate
 * layout so the sheet warns *before* the owner confirms (S4) — the same `weekAgendaOf`
 * the screen already trusts, never a second opinion about the legs rule.
 */
export interface AgendaWeekView {
  readonly agenda: WeekAgenda;
  readonly layout: WeekLayout;
  readonly action: AgendaRowAction | null;
  warningFor(planDayId: string, weekday: number): string | null;
}

/**
 * The rows the list actually draws (S11).
 *
 * Monday to Friday is the owner's week, and he asked for the weekend out of the list. The
 * rule is not "cut the last two days": a Saturday or a Sunday comes back the moment it
 * carries a plan day of his, because a shorter list may never hide a training. Nothing is
 * filtered out of `WeekAgenda` — the derivation still holds the seven dated days, and the
 * count, the done marks and the placement all read it — only out of the list.
 */
export function visibleDaysOf(agenda: WeekAgenda): WeekAgenda['days'] {
  return agenda.days.filter((day) => day.weekday < 5 || day.planDay !== null);
}

/** The whole view model of the agenda, from the screen's own view. No plan, no agenda. */
export function agendaWeekViewOf(input: HomeInput, view: HomeView): AgendaWeekView | null {
  const home = view.agenda;
  if (home === null) return null;
  const { layout, agenda } = home;
  return {
    agenda,
    layout,
    action: actionOnRowOf(agenda.days.find((day) => day.today) ?? null, view.action),
    warningFor: (planDayId, weekday) => {
      const attempt = placementOf({ agenda, layout, planDayId, toWeekday: weekday });
      if (!attempt.result.ok) return null;
      return agendaOver(input, attempt.result.layout).warning;
    },
  };
}

/** The one filled action a row can carry (T5's seam, drawn where the day is). */
export interface AgendaRowAction {
  readonly kind: 'start' | 'resume';
  readonly label: string;
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

/** The plan day the row hands to `start.start(planDayId)` — the seam T5 opens. */
export function startRequestOf(day: AgendaDay | null): string | null {
  if (day === null || day.kind !== 'workout' || day.planDay === null) return null;
  return day.planDay.id;
}

/** The plan days this week has no weekday for — the one the match displaced (S10). */
export function unplacedPlanDaysOf(agenda: WeekAgenda): readonly AgendaPlanDay[] {
  return agenda.planDays.filter((entry) => entry.weekday === null);
}


/* -------------------------------------------------------------------- the write */

/** One placement, with the sentence the owner reads when it cannot happen. */
export interface PlacementAttempt {
  readonly result: PlacementResult;
  readonly notice: string | null;
}

/**
 * S2, S3, S6 — the one operation behind both the drag and the sheet.
 *
 * `placePlanDay` decides; this only turns its refusal into a sentence, once, quietly. A
 * drop on the row's own day returns `sameDay` with no words: nothing happened and nothing
 * needs explaining.
 */
export function placementOf(input: {
  readonly agenda: WeekAgenda;
  readonly layout: WeekLayout;
  readonly planDayId: string;
  readonly toWeekday: number;
}): PlacementAttempt {
  const result = placePlanDay(input);
  return { result, notice: result.ok ? null : REFUSAL_COPY[result.reason] };
}

export type PlacementOutcome = 'saved' | 'refused' | 'failed';

/** What the screen has to draw after a placement: the week, and what to say about it. */
export interface PlacementWrite {
  readonly outcome: PlacementOutcome;
  /** The layout to draw: the new one when saved, the previous one otherwise. */
  readonly layout: WeekLayout;
  readonly notice: string | null;
}

/**
 * S2, S5, S6 — place, then save through `storage.meta.saveWeekLayout`.
 *
 * The three outcomes are the only three states the screen has: a saved week (re-read), a
 * refusal (nothing changed, one sentence) and a failed write (the previous week stays,
 * and `placementNotice` offers the one retry).
 */
export async function writePlacement(input: {
  readonly storage: StoragePort;
  readonly agenda: WeekAgenda;
  readonly layout: WeekLayout;
  readonly planDayId: string;
  readonly toWeekday: number;
}): Promise<PlacementWrite> {
  const attempt = placementOf(input);
  if (!attempt.result.ok) {
    return { outcome: 'refused', layout: input.layout, notice: attempt.notice };
  }
  try {
    await input.storage.meta.saveWeekLayout(attempt.result.layout);
    return { outcome: 'saved', layout: attempt.result.layout, notice: null };
  } catch {
    return { outcome: 'failed', layout: input.layout, notice: PLACEMENT_FAILED_COPY };
  }
}

/* ------------------------------------------------------------------- the glyphs */

/**
 * The handle's grip and the lock (S9's ball is the system's `ball` icon).
 *
 * The design system's icon set has neither one, and §4 keeps the shared glyphs in one
 * place while the artboard fixes these two shapes; they live here for the same reason the
 * bin lives in `HomeScreen.tsx` — only this surface draws them.
 */
function GripGlyph(): React.ReactElement {
  return (
    <svg
      className="home-agenda__grip"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 7h.01M9 12h.01M9 17h.01M15 7h.01M15 12h.01M15 17h.01" />
    </svg>
  );
}

function LockGlyph(): React.ReactElement {
  return (
    <svg
      className="home-agenda__lock"
      viewBox="0 0 24 24"
      width={12}
      height={12}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/* --------------------------------------------------------------------- the row */

export interface AgendaRowProps {
  readonly day: AgendaDay;
  readonly matchKind: MatchKind;
  /** This row is the one in the hand. */
  readonly dragging?: boolean | undefined;
  /** The finger is over this row and it can take the one in the hand. */
  readonly over?: boolean | undefined;
  /** A row is in the air and this one refuses it: the lock and `Cerrado`. */
  readonly refusing?: boolean | undefined;
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
  readonly onOpen?: ((weekday: number) => void) | undefined;
  readonly onStart?: ((planDayId: string) => void) | undefined;
  readonly onGrab?: ((event: React.PointerEvent<HTMLSpanElement>, day: AgendaDay) => void) | undefined;
  readonly onDragMove?: ((event: React.PointerEvent<HTMLSpanElement>) => void) | undefined;
  readonly onDragEnd?: ((event: React.PointerEvent<HTMLSpanElement>) => void) | undefined;
  readonly onDragCancel?: ((event: React.PointerEvent<HTMLSpanElement>) => void) | undefined;
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
 * A row the owner can change is a real `<button>` whose own content is its accessible name
 * — weekday, number, the workout and the state (§9) — and tapping it opens the day sheet.
 * A locked row (a done day) is not a control at all: it has nothing to offer, and a button
 * that can only refuse is worse than plain text.
 *
 * The one locked row that is a control is the match (S12): it carries the fixture of the
 * week and opens the sheet that changes it, which is what the day card's flip used to do.
 * Its report is the row's own action, drawn where the day is.
 *
 * The handle is a `<span>` beside the button, `aria-hidden`, because dragging is never
 * required: the sheet is the accessible path and the handle only serves a finger.
 */
export function AgendaRow({
  day,
  matchKind,
  dragging = false,
  over = false,
  refusing = false,
  action = null,
  starting = false,
  fixture = null,
  reported = false,
  onOpenFixture,
  report = null,
  onOpen,
  onStart,
  onGrab,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: AgendaRowProps): React.ReactElement {
  const state = stateWordOf(day);
  const opensDay = !day.locked && onOpen !== undefined;
  const opensMatch = day.kind === 'match' && onOpenFixture !== undefined;
  const canDrag = !day.locked && day.planDay !== null && onGrab !== undefined;
  const planDayId = startRequestOf(day);
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
    day.done ? 'home-agenda__row--done' : '',
    day.today ? 'home-agenda__row--today' : '',
    dragging ? 'home-agenda__row--dragging' : '',
    over ? 'home-agenda__row--over' : '',
    refusing ? 'home-agenda__row--refusing' : '',
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
        {day.done ? (
          <span className="home-agenda__mark home-agenda__mark--check">
            <Icon name="check" size={13} />
          </span>
        ) : null}
        {day.kind === 'match' ? (
          <span className="home-agenda__mark home-agenda__mark--ball">
            <Icon name="ball" size={13} />
          </span>
        ) : null}
        {refusing ? <LockGlyph /> : null}
        {refusing ? CLOSED_WORD : state}
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
      ) : opensDay ? (
        <button
          type="button"
          className="ds-action home-agenda__body"
          aria-haspopup="dialog"
          onClick={() => onOpen?.(day.weekday)}
        >
          {content}
        </button>
      ) : (
        <div className="home-agenda__body">{content}</div>
      )}
      {canDrag ? (
        <span
          className="home-agenda__handle"
          aria-hidden="true"
          onPointerDown={(event) => onGrab?.(event, day)}
          onPointerMove={(event) => onDragMove?.(event)}
          onPointerUp={(event) => onDragEnd?.(event)}
          onPointerCancel={(event) => onDragCancel?.(event)}
        >
          <GripGlyph />
        </span>
      ) : null}
      {action === null || planDayId === null ? null : (
        <span className="home-agenda__action">
          <PrimaryAction
            icon="play"
            disabled={starting}
            onClick={() => onStart?.(planDayId)}
          >
            {starting ? 'Empezando…' : action.label}
          </PrimaryAction>
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

/* ------------------------------------------------------------- the day's sheet */

export interface DaySheetProps {
  readonly week: AgendaWeekView;
  /** 0 = Monday … 6 = Sunday: the day the owner tapped. */
  readonly weekday: number;
  /** The last refusal, still on screen while the sheet stays open. */
  readonly notice?: string | null | undefined;
  /** The plan day the sheet opens on; the day's current one unless a caller says otherwise. */
  readonly initial?: string | null | undefined;
  readonly onConfirm: (planDayId: string) => void;
  readonly onClose: () => void;
}

/** What an option says about the plan day it offers, in the owner's words. */
export function optionMetaOf(entry: AgendaPlanDay, weekday: number, agenda: WeekAgenda): string {
  const numbers = `${formatExerciseCount(entry.exerciseCount)} · ${seriesText(entry.setCount)}`;
  if (entry.weekday === weekday) return `Lo que toca · ${numbers}`;
  if (entry.weekday === null) return 'Sin día esta semana · se colocaría aquí';
  const name = agenda.days[entry.weekday]?.weekdayName.toLowerCase() ?? '';
  return `Ya el ${name} · se cambiaría de sitio`;
}

/**
 * «¿Qué entrenas el viernes 10?» — the same operation as the drag, without the finger.
 *
 * A `role="dialog"` with `aria-modal`, moved into focus on open, cycling Tab inside itself
 * and closing on Escape: the brief's accessible path, so dragging is never required. The
 * options are the four plan days of the week — including the one the match displaced (S10)
 * — and the legs warning appears before the owner confirms, not after (S4).
 *
 * The rest of the modal contract is the caller's (T6, §9): `AgendaWeek` marks the week and
 * the screen behind this sheet `inert` and `aria-hidden` while it is open, and gives the
 * focus back to the row that opened it when it closes.
 */
export function DaySheet({
  week,
  weekday,
  notice = null,
  initial = null,
  onConfirm,
  onClose,
}: DaySheetProps): React.ReactElement {
  const { agenda, warningFor } = week;
  const day = agenda.days[weekday];
  const currentId = day?.planDay?.id ?? null;
  const [chosenId, setChosenId] = useState<string | null>(
    initial ?? currentId ?? agenda.planDays[0]?.planDay.id ?? null,
  );
  const sheet = useRef<HTMLDivElement | null>(null);

  // One small focus behaviour, the system's: the sheet takes focus when it opens so the
  // keyboard and VoiceOver land inside it instead of staying on the row behind.
  useEffect(() => {
    sheet.current?.focus();
  }, []);

  const weekdayName = day?.weekdayName.toLowerCase() ?? '';
  const chosen = agenda.planDays.find((entry) => entry.planDay.id === chosenId) ?? null;
  const warning =
    chosenId === null || chosenId === currentId ? null : warningFor(chosenId, weekday);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // The trap: the sheet is a dialog over a week that is still visible, so Tab must not
    // walk out of it into the rows behind.
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
      aria-label={`¿Qué entrenas el ${weekdayName} ${day === undefined ? '' : dayNumberTextOf(day)}?`}
      tabIndex={-1}
      ref={sheet}
      onKeyDown={onKeyDown}
    >
      <span className="home-agenda-sheet__grab" aria-hidden="true" />
      <div className="home-agenda-sheet__head">
        <div>
          <h2 className="ds-card-title">
            {`¿Qué entrenas el ${weekdayName} ${day === undefined ? '' : dayNumberTextOf(day)}?`}
          </h2>
          <p className="ds-meta">El día no cambia: cambia lo que haces ese día.</p>
        </div>
        <TextButton onClick={onClose}>Cerrar</TextButton>
      </div>

      <ul className="home-agenda-sheet__options">
        {agenda.planDays.map((entry) => {
          const selected = entry.planDay.id === chosenId;
          return (
            <li key={entry.planDay.id}>
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
                onClick={() => setChosenId(entry.planDay.id)}
              >
                <span className="home-agenda-sheet__radio" aria-hidden="true">
                  {selected ? <Icon name="check" size={10} /> : null}
                </span>
                <span className="home-agenda-sheet__option-body">
                  <span className="home-agenda-sheet__option-name">
                    {formatDayName(entry.planDay.name)}
                  </span>
                  <span className="ds-meta">{optionMetaOf(entry, weekday, agenda)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {warning === null ? null : <Banner tone="warning" title={warning} />}
      {notice === null ? null : <p className="ds-meta" role="status">{notice}</p>}

      <PrimaryAction
        disabled={chosenId === null || chosenId === currentId}
        onClick={() => {
          if (chosenId !== null) onConfirm(chosenId);
        }}
      >
        {chosen === null
          ? 'Poner el entreno'
          : chosenId === currentId
            ? 'Ya es el entreno de ese día'
            : `Poner ${formatDayName(chosen.planDay.name)} el ${weekdayName}`}
      </PrimaryAction>

      {/* S12: the sentence about dragging lives here now, where the change is made. */}
      <p className="ds-meta home-agenda-sheet__hint">{AGENDA_HINT}</p>
    </div>
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

/* ------------------------------------------------------------------ the week */

export interface AgendaWeekProps {
  readonly week: AgendaWeekView;
  readonly onPlace?: ((planDayId: string, weekday: number) => void) | undefined;
  /** The sentence of a write that failed; the screen keeps the previous week. */
  readonly placementNotice?: string | null | undefined;
  readonly onRetryPlacement?: (() => void) | undefined;
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
}

/**
 * The attributes that take the rows out of the dialog's way while it is open (§9).
 *
 * The sheet is drawn in the week, not over it, so the rows are its background and not a
 * second pane: `inert` and `aria-hidden` are what keep Tab inside the dialog and keep a
 * screen reader from reading the week twice.
 */
const BACKGROUND_WHILE_OPEN = { inert: true, 'aria-hidden': true } as const;

/** The weekday under a point, from the rows' own `data-weekday` (pointer events only). */
function weekdayUnderPoint(x: number, y: number): number | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
    return null;
  }
  const row = document.elementFromPoint(x, y)?.closest('[data-weekday]') ?? null;
  const raw = row?.getAttribute('data-weekday') ?? null;
  if (raw === null) return null;
  const weekday = Number(raw);
  return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : null;
}

interface DragState {
  readonly planDayId: string;
  readonly over: number | null;
}

/**
 * The seven rows, the drag in flight, the sheet and the two notices.
 *
 * The gesture is deliberately thin: pointer capture happens on the handle, `pointermove`
 * names the weekday under the finger, and `pointerup` hands that weekday to `placementOf`
 * — the same function the sheet's confirm calls. Nothing is saved here; `onPlace` belongs
 * to the screen that owns the port.
 */
export function AgendaWeek({
  week,
  onPlace,
  placementNotice = null,
  onRetryPlacement,
  onSheetChange,
  fixture = null,
  matchReported = false,
  onChooseFixture,
  onReportMatch,
  reporting = false,
}: AgendaWeekProps): React.ReactElement {
  const { agenda, layout } = week;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sheet, setSheet] = useState<{ readonly weekday: number; readonly notice: string | null } | null>(
    null,
  );
  // S12: the fixture sheet, opened from the match row (or from the quiet line that stands
  // in for it in a week with no match day).
  const [matchSheet, setMatchSheet] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const unplaced = unplacedPlanDaysOf(agenda);
  // The row that opened the sheet, so closing it puts the focus back where the owner was
  // (§9): a dialog that returns focus to the top of the page loses the place in the week.
  const rows = useRef<HTMLOListElement | null>(null);
  const opener = useRef<number | null>(null);
  const restoreTo = useRef<number | null>(null);

  // §9 — the screen behind the dialog learns that the dialog exists. One effect, and the
  // parent decides what to hide. Both sheets are dialogs, so either one counts.
  useEffect(() => {
    onSheetChange?.(sheet !== null || matchSheet);
  }, [sheet, matchSheet, onSheetChange]);

  // §9 — the focus goes back to the row that opened the sheet on the render *after* the
  // close: the rows are `inert` while the dialog is open, and a `focus()` into an inert
  // subtree is silently dropped, so it cannot be done in the click handler itself.
  useEffect(() => {
    if (sheet !== null) return;
    const weekday = restoreTo.current;
    if (weekday === null) return;
    restoreTo.current = null;
    rows.current
      ?.querySelector<HTMLElement>(`[data-weekday="${String(weekday)}"] button`)
      ?.focus();
  }, [sheet]);

  const openSheet = (weekday: number): void => {
    opener.current = weekday;
    setSheet({ weekday, notice: null });
  };

  /** Closes the sheet; the effect above gives the focus back to the row (§9). */
  const closeSheet = (): void => {
    restoreTo.current = opener.current ?? sheet?.weekday ?? null;
    opener.current = null;
    setSheet(null);
  };

  const place = (planDayId: string, weekday: number): void => {
    const attempt = placementOf({ agenda, layout, planDayId, toWeekday: weekday });
    if (!attempt.result.ok) {
      setRefusal(attempt.notice);
      return;
    }
    setRefusal(null);
    onPlace?.(planDayId, weekday);
  };

  const release = (event: React.PointerEvent<HTMLSpanElement>): void => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser had already forgotten the capture, or never took it.
    }
  };

  const grab = (event: React.PointerEvent<HTMLSpanElement>, day: AgendaDay): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const planDayId = day.planDay?.id ?? null;
    if (planDayId === null || day.locked) return;
    try {
      // Pointer capture, so the finger keeps the row even when it leaves the handle: the
      // capture is what makes this work on an iPhone and with a mouse alike.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A browser without capture still taps the row, which is the accessible path.
    }
    setRefusal(null);
    setDrag({ planDayId, over: null });
  };

  const dragOver = (event: React.PointerEvent<HTMLSpanElement>): void => {
    if (drag === null) return;
    setDrag({ planDayId: drag.planDayId, over: weekdayUnderPoint(event.clientX, event.clientY) });
  };

  const dropHere = (event: React.PointerEvent<HTMLSpanElement>): void => {
    if (drag === null) return;
    const over = weekdayUnderPoint(event.clientX, event.clientY) ?? drag.over;
    release(event);
    setDrag(null);
    if (over !== null) place(drag.planDayId, over);
  };

  const cancelDrag = (event: React.PointerEvent<HTMLSpanElement>): void => {
    release(event);
    setDrag(null);
  };

  // While a dialog is open, the week it was opened from is its background (§9).
  const background = sheet === null && !matchSheet ? {} : BACKGROUND_WHILE_OPEN;

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

      <ol className="home-agenda" aria-label="Días de la semana" ref={rows} {...background}>
        {visibleDaysOf(agenda).map((day) => (
          <AgendaRow
            key={day.date}
            day={day}
            matchKind={agenda.matchKind}
            dragging={drag !== null && drag.planDayId === day.planDay?.id}
            over={drag !== null && drag.over === day.weekday && !day.locked}
            refusing={drag !== null && day.locked}
            fixture={day.kind === 'match' ? (fixture?.label ?? null) : null}
            reported={day.kind === 'match' && matchReported}
            report={reportOf(day)}
            onOpenFixture={
              day.kind === 'match' && onChooseFixture !== undefined
                ? () => setMatchSheet(true)
                : undefined
            }
            onOpen={openSheet}
            onGrab={grab}
            onDragMove={dragOver}
            onDragEnd={dropHere}
            onDragCancel={cancelDrag}
          />
        ))}
      </ol>

      {fixtureLine}

      {/* S12: while a row is in the hand, the sentence says what takes it and what refuses
          it. It is live feedback, not the permanent hint the week no longer carries. */}
      {drag === null ? null : (
        <p className="ds-meta home-agenda__hint" {...background}>
          {DRAG_HINT}
        </p>
      )}

      {/* A refusal says itself once, in the smallest voice the screen has (S6). */}
      {refusal === null ? null : (
        <p className="ds-meta home-agenda__refusal" role="status" {...background}>
          {refusal}
        </p>
      )}

      {/* S10: the day the match displaced is shown, not moved by the app on its own. */}
      {unplaced.length === 0 ? null : (
        <div className="home-agenda__unplaced" {...background}>
          <SectionLabel icon={<Icon name="calendar" size={14} />}>Sin día esta semana</SectionLabel>
          <Card padding="dense">
            <ul className="home-agenda__unplaced-list">
              {unplaced.map((entry) => (
                <li key={entry.planDay.id} className="home-agenda__unplaced-row">
                  <span className="ds-body">{formatDayName(entry.planDay.name)}</span>
                  <span className="home-agenda__unplaced-meta">
                    <span className="ds-meta">
                      {countsTextOf(entry.exerciseCount, entry.setCount)}
                    </span>
                    <Chip>Sin día</Chip>
                  </span>
                </li>
              ))}
            </ul>
            <p className="ds-meta">
              El partido ocupó su día. Toca un día de la semana para colocarlo.
            </p>
          </Card>
        </div>
      )}

      {/* A write that failed keeps the previous week and offers the one retry (S5). */}
      {placementNotice === null ? null : (
        <Banner
          tone="danger"
          title={placementNotice}
          {...(onRetryPlacement === undefined
            ? {}
            : { action: { label: 'Reintentar el cambio', onClick: onRetryPlacement } })}
        />
      )}

      {matchSheet ? (
        <MatchSheet
          matchKind={agenda.matchKind}
          onClose={() => setMatchSheet(false)}
          onChoose={(match) => onChooseFixture?.(match)}
        />
      ) : null}

      {sheet === null ? null : (
        <DaySheet
          week={week}
          weekday={sheet.weekday}
          notice={sheet.notice}
          onClose={closeSheet}
          onConfirm={(planDayId) => {
            const attempt = placementOf({
              agenda,
              layout,
              planDayId,
              toWeekday: sheet.weekday,
            });
            if (!attempt.result.ok) {
              setSheet({ weekday: sheet.weekday, notice: attempt.notice });
              return;
            }
            closeSheet();
            setRefusal(null);
            onPlace?.(planDayId, sheet.weekday);
          }}
        />
      )}
    </section>
  );
}
