/**
 * Inicio's decisions, without React — and the shared day arithmetic of the app tier.
 *
 * Three rules decide every branch below:
 *
 * 1. **Nothing is read here.** No clock, no port, no DOM: `HomeInput` is the whole
 *    world of the screen, so every state the design lists for Inicio is one fixture
 *    away and the screen keeps no logic worth testing.
 * 2. **Absence is an answer.** An empty store produces empty states, never zeros:
 *    `last`, `week` and `weight` are `null` when the store has nothing to say, and the
 *    screen renders the dashed, honest version instead of a cheerful fake.
 * 3. **Never claim a fact the store cannot prove.** The week strip is built from the
 *    sessions that exist, not from the weekday template (`PlanDay` carries no weekday);
 *    the estimate says `aprox.`; a duration is only written when `startedAt` and an end
 *    instant are both stored. With a plan but no session today the screen offers the day
 *    the rotation names (`nextPlanDay`, session/start.ts) instead of claiming a rest day:
 *    the app has no calendar, so "nothing is scheduled" means "not started yet".
 */

import type { PhaseState } from '../../core/domain';
import type {
  ActivityRecord,
  BodyMeasurement,
  EpochMs,
  PlanDay,
  UserProfile,
  WorkoutSession,
} from '../../storage';
import { formatVolume, formatWeight } from '../session/format';
import { nextPlanDay } from '../session/start';
import {
  formatDuration,
  formatEstimate,
  formatExerciseCount,
  formatLongDate,
  formatSetProgress,
  formatShortDate,
  formatWeekdayInitial,
  formatWeekdayName,
  greeting,
} from './format';

/** How many stored sessions Inicio reads: one week past the last session is enough. */
export const HOME_SESSION_WINDOW = 8;

/** The readaptation programme is four blocks (docs/training-science.md §6). */
export const READAPTATION_BLOCKS = 4;

/** The body-weight card: a seven-day mean, and at most this many points in the line. */
export const WEIGHT_WINDOW_DAYS = 7;
const SPARKLINE_POINTS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

/**
 * The estimate of the today card, and the two numbers it is made of.
 *
 * A set costs about 40 s of work; the rest is the prescription's own `restSeconds`;
 * getting ready adds eight minutes. The sum is rounded to five minutes and always
 * labelled `aprox.` — it is a forecast, not a measurement.
 */
const WORK_SECONDS_PER_SET = 40;
const WARMUP_MINUTES = 8;

export interface HomeInput {
  readonly now: EpochMs;
  readonly profile: UserProfile | undefined;
  readonly phaseState: PhaseState | undefined;
  readonly plan: readonly PlanDay[];
  /** Most recent first, as `sessions.recent` answers. */
  readonly recent: readonly WorkoutSession[];
  readonly inProgress: WorkoutSession | undefined;
  readonly measurements: readonly BodyMeasurement[];
  readonly activities: readonly ActivityRecord[];
  readonly installed: boolean;
  /**
   * `true` when the store opened but the data the app had written is gone. The storage
   * tier records no such marker yet (see the task report): the screen is built for the
   * state and shows it the moment that evidence exists.
   */
  readonly lostData: boolean;
  readonly lastExportAt: EpochMs | null;
}

export interface TodayView {
  readonly dayName: string;
  /** `6 ejercicios · 55 min aprox.` */
  readonly detail: string;
  /** `Readaptación · semana 2 de 4`, or `null` outside a readaptation block. */
  readonly phase: string | null;
  /** The one line of explanation the phase banner uses (§7.6). */
  readonly phaseNote: string | null;
  /** `12 series` — what the day prescribes in total. */
  readonly series: string | null;
  /**
   * `preview` is a day the rotation names but no session row exists for yet: the card
   * shows what would be trained, and the primary action is what creates it.
   */
  readonly state: 'preview' | 'pending' | 'inProgress' | 'done';
  /** `Sesión completada hoy · 8 de 9 series.` when the day is already trained. */
  readonly done: string | null;
  /** The stored session behind the card; `null` while the day is only a preview. */
  readonly sessionId: string | null;
}

export type HomeActionKind = 'start' | 'resume' | 'summary';

export interface HomeActionView {
  readonly kind: HomeActionKind;
  readonly label: string;
  /**
   * The session the action names. Only `summary` needs it: a start re-reads the store
   * (`planStart`) because the day may have been created on another screen, and the sheet
   * finds its own session by asking for the open or the next scheduled one.
   */
  readonly sessionId: string | null;
}

/** Why there is nothing to show for today. Both are states, never a guess. */
export type NothingToday = 'noPlan' | 'emptyDay';

export interface LastSessionView {
  /** `Última sesión · lunes` */
  readonly label: string;
  readonly dayName: string;
  /** `52 min · 14 de 15 series` */
  readonly detail: string;
  /** `8.280` — already grouped, the unit is the component's business. */
  readonly volume: string;
}

export type WeekCellState = 'done' | 'today' | 'pending';

export interface WeekCellView {
  readonly key: string;
  /** `LUN` */
  readonly initial: string;
  readonly state: WeekCellState;
  /** `Lunes, hecha` — the accessible name, never a colour alone (§9). */
  readonly label: string;
}

export interface WeekView {
  readonly cells: readonly WeekCellView[];
  /** `2 de 3 sesiones` — done out of the sessions this week actually has. */
  readonly done: string;
  /** `14 series duras` */
  readonly hard: string;
}

export interface WeightView {
  /** `79,8` — the seven-day mean. */
  readonly value: string;
  /** `media 7 días · 5 pesajes` */
  readonly caption: string;
  /** Oldest first. One point is not a trend, so the screen draws no line for it. */
  readonly series: readonly number[];
}

export interface NoticeView {
  readonly evicted: boolean;
  readonly notInstalled: boolean;
  /** `6 nov` — the last export the app knows about, when it knows one. */
  readonly lastExport: string | null;
}

export interface HomeView {
  readonly greeting: string;
  readonly dateLine: string;
  readonly today: TodayView | null;
  /** `null` when there is something to show; otherwise what is missing, in words. */
  readonly nothingToday: NothingToday | null;
  readonly action: HomeActionView | null;
  readonly last: LastSessionView | null;
  readonly week: WeekView | null;
  readonly weight: WeightView | null;
  /** `imported`: how many imported activity rows exist. Always present (§8 Inicio). */
  readonly activity: { readonly imported: number } | null;
  readonly notice: NoticeView;
  readonly hasHistory: boolean;
}

/* ------------------------------------------------------------------ calendar */

/** Midnight of the injected instant. */
export function startOfDay(at: EpochMs): EpochMs {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Monday 00:00 of the week that contains the injected instant. */
export function startOfWeek(at: EpochMs): EpochMs {
  const date = new Date(at);
  const weekday = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday).getTime();
}

export function sameDay(left: EpochMs, right: EpochMs): boolean {
  return startOfDay(left) === startOfDay(right);
}

/* ------------------------------------------------------------- the aggregates */

/**
 * The session of the injected day. A session that is already open wins over one that is
 * merely scheduled, and a closed one wins over a scheduled one: the screen must offer
 * `Continuar` before it offers `Empezar`, and must not offer to start a finished day.
 */
export function todaySessionOf(
  sessions: readonly WorkoutSession[],
  now: EpochMs,
): WorkoutSession | undefined {
  const rank = (session: WorkoutSession): number => {
    switch (session.status) {
      case 'inProgress':
        return 0;
      case 'completed':
      case 'partial':
        return 1;
      case 'scheduled':
        return 2;
      case 'abandoned':
        return 3;
    }
  };

  let best: WorkoutSession | undefined;
  for (const session of sessions) {
    if (!sameDay(session.scheduledDate, now)) continue;
    if (best === undefined) {
      best = session;
      continue;
    }
    const difference = rank(session) - rank(best);
    if (difference < 0 || (difference === 0 && session.scheduledDate > best.scheduledDate)) {
      best = session;
    }
  }
  return best;
}

/** The sessions of the week around the injected day, oldest first. */
export function weekSessionsOf(
  sessions: readonly WorkoutSession[],
  now: EpochMs,
): readonly WorkoutSession[] {
  const from = startOfWeek(now);
  const to = new Date(from);
  to.setDate(to.getDate() + WEEK_DAYS);
  const until = to.getTime();
  return sessions
    .filter((session) => session.scheduledDate >= from && session.scheduledDate < until)
    .sort((left, right) => left.scheduledDate - right.scheduledDate);
}

/** Every confirmed set of the session (skipped slots are never stored). */
export function confirmedSetCount(session: WorkoutSession): number {
  return session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
}

/** Every set the session prescribed, whether it happened or not. */
export function prescribedSets(session: WorkoutSession): number {
  return session.exercises.reduce((total, exercise) => total + exercise.prescription.sets, 0);
}

/** Weight × repetitions over the confirmed sets — the summary's `VOLUMEN`. */
export function sessionVolumeKg(session: WorkoutSession): number {
  return session.exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.reduce((sum, set) => sum + set.weightKg * set.actualReps, 0),
    0,
  );
}

/** Sets confirmed at `duro` or `fallo` (EFFORT ≤ hard, data-model §2). */
export function hardSetCount(sessions: readonly WorkoutSession[]): number {
  return sessions.reduce(
    (total, session) =>
      total +
      session.exercises.reduce(
        (sum, exercise) =>
          sum + exercise.sets.filter((set) => set.effort !== null && set.effort <= 1).length,
        0,
      ),
    0,
  );
}

/** `startedAt` → the end the store can prove, or `null` when the session never started. */
export function sessionDurationMs(session: WorkoutSession): number | null {
  if (session.startedAt === null) return null;
  if (session.endedAt !== null) return Math.max(0, session.endedAt - session.startedAt);
  let last: number | null = null;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (last === null || set.confirmedAt > last) last = set.confirmedAt;
    }
  }
  return last === null ? null : Math.max(0, last - session.startedAt);
}

export interface EstimateItem {
  readonly sets: number;
  readonly restSeconds: number;
}

/** The forecast of the today card, in whole minutes rounded to five. */
export function estimateMinutes(items: readonly EstimateItem[]): number {
  if (items.length === 0) return 0;
  const seconds = items.reduce(
    (total, item) => total + item.sets * (item.restSeconds + WORK_SECONDS_PER_SET),
    0,
  );
  const minutes = WARMUP_MINUTES + seconds / 60;
  return Math.round(minutes / 5) * 5;
}

function formatSeries(sets: number): string {
  return sets === 1 ? '1 serie' : `${sets} series`;
}

function round1(value: number): string {
  return formatWeight(Math.round(value * 10) / 10);
}

/* ------------------------------------------------------------------- the view */

function phaseLine(phaseState: PhaseState | undefined): { line: string | null; note: string | null } {
  if (phaseState === undefined) return { line: null, note: null };
  const block = Math.min(Math.max(Math.trunc(phaseState.block), 1), READAPTATION_BLOCKS);
  return {
    line: `Readaptación · semana ${block} de ${READAPTATION_BLOCKS}`,
    note: `Semana ${block} de readaptación: menos series y margen de sobra. El peso se propone, tú decides.`,
  };
}

function todayViewOf(
  session: WorkoutSession | undefined,
  phaseState: PhaseState | undefined,
): TodayView | null {
  if (session === undefined) return null;
  const phase = phaseLine(phaseState);
  const prescribed = prescribedSets(session);
  const done = confirmedSetCount(session);
  const closed = session.status === 'completed' || session.status === 'partial';
  const state: TodayView['state'] = closed ? 'done' : session.status === 'inProgress' ? 'inProgress' : 'pending';

  const estimated = estimateMinutes(
    session.exercises.map((exercise) => ({
      sets: exercise.prescription.sets,
      restSeconds: exercise.prescription.restSeconds,
    })),
  );

  return {
    dayName: session.dayNameSnapshot,
    detail:
      estimated === 0
        ? formatExerciseCount(session.exercises.length)
        : `${formatExerciseCount(session.exercises.length)} · ${formatEstimate(estimated)}`,
    phase: phase.line,
    phaseNote: phase.note,
    series: prescribed === 0 ? null : formatSeries(prescribed),
    state,
    done:
      state === 'done'
        ? `${session.status === 'completed' ? 'Sesión completada hoy' : 'Sesión guardada como parcial hoy'} · ${formatSetProgress(done, prescribed)}.`
        : null,
    sessionId: session.id,
  };
}

function actionOf(today: TodayView | null, inProgress: WorkoutSession | undefined): HomeActionView | null {
  if (inProgress !== undefined) {
    // An open session is resumable whatever day it started on: it is the only way back
    // into the sets that are already stored.
    return { kind: 'resume', label: 'Continuar entrenamiento', sessionId: inProgress.id };
  }
  if (today === null) return null;
  if (today.state === 'done') {
    return {
      kind: 'summary',
      label: 'Ver el resumen',
      sessionId: today.sessionId === null ? null : today.sessionId,
    };
  }
  // `preview` (nothing written yet) and `pending` (a scheduled row) are the same action:
  // `planStart` opens the row when it exists and creates it when it does not.
  return { kind: 'start', label: 'Empezar entrenamiento', sessionId: null };
}

/**
 * The day the rotation names, shown before any session row exists.
 *
 * It is a preview, not a session: it carries the plan's own numbers and says `preview`,
 * so nothing downstream can mistake it for something stored. A day with no exercises is
 * not previewed — there is nothing to start, and the screen says which state it is in.
 */
function previewDayOf(day: PlanDay | null, phaseState: PhaseState | undefined): TodayView | null {
  if (day === null || day.items.length === 0) return null;
  const phase = phaseLine(phaseState);
  const prescribed = day.items.reduce((total, item) => total + item.prescription.sets, 0);
  const estimated = estimateMinutes(
    day.items.map((item) => ({
      sets: item.prescription.sets,
      restSeconds: item.prescription.restSeconds,
    })),
  );

  return {
    dayName: day.name,
    detail:
      estimated === 0
        ? formatExerciseCount(day.items.length)
        : `${formatExerciseCount(day.items.length)} · ${formatEstimate(estimated)}`,
    phase: phase.line,
    phaseNote: phase.note,
    series: prescribed === 0 ? null : formatSeries(prescribed),
    state: 'preview',
    done: null,
    sessionId: null,
  };
}

function lastSessionOf(sessions: readonly WorkoutSession[]): LastSessionView | null {
  const closed = sessions.filter(
    (session) => session.status === 'completed' || session.status === 'partial',
  );
  if (closed.length === 0) return null;
  const last = closed.reduce((best, session) => {
    const at = (candidate: WorkoutSession): number =>
      candidate.endedAt ?? candidate.startedAt ?? candidate.scheduledDate;
    return at(session) > at(best) ? session : best;
  });

  const duration = sessionDurationMs(last);
  const progress = formatSetProgress(confirmedSetCount(last), prescribedSets(last));
  return {
    label: `Última sesión · ${formatWeekdayName(last.scheduledDate).toLowerCase()}`,
    dayName: last.dayNameSnapshot,
    detail: duration === null ? progress : `${formatDuration(duration)} · ${progress}`,
    volume: formatVolume(sessionVolumeKg(last)),
  };
}

function weekViewOf(sessions: readonly WorkoutSession[], now: EpochMs): WeekView | null {
  const week = weekSessionsOf(sessions, now);
  if (week.length === 0) return null;

  const cells: WeekCellView[] = week.map((session) => {
    // Today's cell keeps its position even after the session is closed: the strip is
    // the anchor of "where am I in the week", and the count below says in words how
    // many sessions are already done.
    const closed = session.status === 'completed' || session.status === 'partial';
    const state: WeekCellState = sameDay(session.scheduledDate, now)
      ? 'today'
      : closed
        ? 'done'
        : 'pending';
    const name = formatWeekdayName(session.scheduledDate);
    const word = state === 'done' ? 'hecha' : state === 'today' ? 'hoy' : 'pendiente';
    return {
      key: session.id,
      initial: formatWeekdayInitial(session.scheduledDate),
      state,
      label: `${name}, ${word}`,
    };
  });

  const done = week.filter(
    (session) => session.status === 'completed' || session.status === 'partial',
  ).length;

  return {
    cells,
    done: `${done} de ${cells.length} sesiones`,
    hard: `${hardSetCount(week)} series duras`,
  };
}

function weightViewOf(measurements: readonly BodyMeasurement[], now: EpochMs): WeightView | null {
  const from = now - WEIGHT_WINDOW_DAYS * DAY_MS;
  const samples = measurements
    .filter(
      (measurement): measurement is BodyMeasurement & { readonly weightKg: number } =>
        measurement.weightKg !== null && measurement.date >= from && measurement.date <= now,
    )
    .slice()
    .sort((left, right) => left.date - right.date);

  if (samples.length === 0) return null;

  const mean = samples.reduce((total, sample) => total + sample.weightKg, 0) / samples.length;
  const series = samples.slice(-SPARKLINE_POINTS).map((sample) => sample.weightKg);

  return {
    value: round1(mean),
    caption: `media ${WEIGHT_WINDOW_DAYS} días · ${samples.length === 1 ? '1 pesaje' : `${samples.length} pesajes`}`,
    series,
  };
}

export function homeViewOf(input: HomeInput): HomeView {
  const { now, recent, inProgress, plan, profile, phaseState } = input;
  const pool = inProgress === undefined ? recent : [...recent, inProgress];
  const today =
    todayViewOf(todaySessionOf(pool, now), phaseState) ??
    previewDayOf(nextPlanDay(plan, recent), phaseState);

  return {
    greeting: greeting(profile?.displayName ?? null),
    dateLine: formatLongDate(now),
    today,
    // Two honest states remain once a session and a preview are both absent: there is no
    // plan at all, or the day the rotation names has no exercises to start.
    nothingToday: today !== null ? null : plan.length === 0 ? 'noPlan' : 'emptyDay',
    action: actionOf(today, inProgress),
    last: lastSessionOf(recent),
    week: weekViewOf(recent, now),
    weight: weightViewOf(input.measurements, now),
    activity: { imported: input.activities.length },
    notice: {
      evicted: input.lostData,
      // §7.8: the advisory lives in Perfil, plus at most one notice on Inicio — and
      // only once there is something to lose.
      notInstalled: !input.installed && (recent.length > 0 || profile !== undefined),
      lastExport: input.lastExportAt === null ? null : formatShortDate(input.lastExportAt),
    },
    hasHistory: recent.length > 0,
  };
}
