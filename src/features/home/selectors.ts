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
 * 3. **Never claim a fact the store cannot prove.** The week indicator is built from the
 *    sessions that exist, not from the weekday template (`PlanDay` carries no weekday);
 *    the estimate says `aprox.`; a duration is only written when `startedAt` and an end
 *    instant are both stored. With a plan and no session today the card reads the day from
 *    the same `WeekAgenda` the rows read (T4, T6): the week's layout answers what the day
 *    carries, so the card and the row below it can never name two different days.
 */

import type { PhaseState } from '../../core/domain';
import type { MatchKind } from '../../core/engine/week-plan';
import type {
  ActivityRecord,
  BodyMeasurement,
  EpochMs,
  PlanDay,
  UserProfile,
  WeekLayout,
  WeekRecord,
  WorkoutSession,
} from '../../storage';
import { formatVolume, formatWeight } from '../session/format';
import {
  defaultLayoutOf,
  weekAgendaOf,
  type AgendaDay,
  type WeekAgenda,
} from '../week/agenda';
import { localDayOf, mondayInstantOf } from '../week/week';
import {
  formatDayAndMonth,
  formatDuration,
  formatEstimate,
  formatExerciseCount,
  formatLongDate,
  formatSetProgress,
  formatShortDate,
  formatWeekdayName,
  greeting,
} from './format';

/** How many stored sessions Inicio reads: one week past the last session is enough. */
export const HOME_SESSION_WINDOW = 8;

/** The readaptation programme is four blocks (docs/training-science.md §6). */
export const READAPTATION_BLOCKS = 4;

/**
 * What a manually recorded row is called, per kind.
 *
 * `other` reads `Fútbol registrado` because the only manual `other` row Rupfit writes is
 * the football capture (`features/home/football.ts`, spec S1). A second manual kind would
 * have to bring its own wording instead of reusing this map.
 */
const MANUAL_ACTIVITY_LABELS: Readonly<Record<ActivityRecord['kind'], string>> = {
  strength: 'Fuerza registrada',
  cardio: 'Cardio registrado',
  other: 'Fútbol registrado',
};

/**
 * What the bin of a manual row says it deletes, per kind.
 *
 * The button shows a glyph and no word, so its accessible name has to name the row:
 * `Eliminar fútbol del 8 de noviembre` (§9). Lower case because it sits mid-sentence.
 */
const MANUAL_ACTIVITY_NAMES: Readonly<Record<ActivityRecord['kind'], string>> = {
  strength: 'fuerza',
  cardio: 'cardio',
  other: 'fútbol',
};

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
  /**
   * `true` when the store opened but the data the app had written is gone. The storage
   * tier records no such marker yet (see the task report): the screen is built for the
   * state and shows it the moment that evidence exists.
   */
  readonly lostData: boolean;
  readonly lastExportAt: EpochMs | null;
  /**
   * T3 — the stored week of the match, when this device has planned one. Optional so a
   * store without a record (and every caller that has not adopted the week yet) keeps the
   * rotation's answer unchanged.
   */
  readonly week?: WeekRecord | undefined;
  /**
   * T4 — the owner's fixed week layout, when this device has one. Optional for the same
   * reason: with no record the agenda materialises the template of the fixture, which is
   * the week a fresh install already shows.
   */
  readonly weekLayout?: WeekLayout | undefined;
}

export interface TodayView {
  readonly dayName: string;
  /** `6 ejercicios · 55 min aprox.` */
  readonly detail: string;
  /** `Readaptación · semana 2 de 4`, or `null` outside a readaptation block. */
  readonly phase: string | null;
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

/**
 * T4 — the week Inicio draws: the layout it came from and the seven rows dated over it.
 *
 * One object, derived once: the agenda's rows and the day card below them both read it,
 * so there is no state in which the row says `Descanso` and the card names a training
 * (T6). `null` on a screen with no plan, which draws no week at all.
 */
export interface HomeWeek {
  /** The effective layout: the owner's, or the template materialised (S4, S5). */
  readonly layout: WeekLayout;
  readonly agenda: WeekAgenda;
}

export interface WeightView {
  /** `79,8` — the seven-day mean. */
  readonly value: string;
  /** `media 7 días · 5 pesajes` */
  readonly caption: string;
  /** Oldest first. One point is not a trend, so the screen draws no line for it. */
  readonly series: readonly number[];
}

/**
 * What a manually recorded activity says: the label is what the row *is*, the detail is
 * the stored date and duration. Nothing here is estimated and nothing is derived from a
 * health import, because the row came from the owner's own tap.
 */
export interface ActivityEntryView {
  readonly id: string;
  /** `Fútbol registrado` */
  readonly label: string;
  /** `8 nov · 50 min` */
  readonly detail: string;
  /** The bin's accessible name: `Eliminar fútbol del 8 de noviembre`. */
  readonly removeLabel: string;
}

/**
 * The activity section of Inicio.
 *
 * Two buckets, never mixed: `recorded` is what the owner typed (a `provenance: 'manual'`
 * row), and `imported` is the count of the rows that arrived from somewhere else. The
 * old view collapsed both into one "imported" count, which would have called a manually
 * recorded football match an imported health sample.
 */
export interface ActivityView {
  /** Manual rows, newest first. The football capture writes exactly one of these. */
  readonly recorded: readonly ActivityEntryView[];
  /** Rows Rupfit did not write by hand: counts only, and read-only for the owner. */
  readonly imported: number;
  /** `true` only when the store holds no activity at all: the honest empty state. */
  readonly empty: boolean;
}

/**
 * The one bad news Inicio still tells: the store opened and what was in it is gone.
 *
 * The install advisory used to live here too. It belongs to Perfil now (S2, S5): Inicio
 * stopped explaining the platform, and the only notice left on this screen is the one
 * that reports a real loss.
 */
export interface NoticeView {
  readonly evicted: boolean;
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
  /** T4: the week, derived once from the layout — the one answer today comes from. */
  readonly agenda: HomeWeek | null;
  readonly weight: WeightView | null;
  /** Always present (§8 Inicio): the manual rows and the imported count, apart. */
  readonly activity: ActivityView;
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

/* --------------------------------------------------------------------- the week */

/**
 * The fixture of the week the owner is looking at, or none.
 *
 * A record of another week says nothing about this one, so a stale record draws the
 * no-match week instead of last week's Thursday.
 */
export function matchKindOf(input: HomeInput): MatchKind {
  const week = input.week;
  if (week === undefined) return 'none';
  const monday = localDayOf(mondayInstantOf(input.now).getTime());
  return week.monday === monday ? week.match : 'none';
}

/** The sessions the week looks at: the recent ones and the one that is open right now. */
export function sessionsOf(input: HomeInput): readonly WorkoutSession[] {
  return input.inProgress === undefined ? input.recent : [...input.recent, input.inProgress];
}

/**
 * The effective layout: the owner's, or the template materialised (S4, S5).
 *
 * The drag has to start somewhere, and the week on screen is the answer: when the store
 * holds no layout the template *is* the layout, so `placePlanDay` gets a real one to move
 * instead of a hole to fill from scratch.
 */
export function layoutOf(input: HomeInput): WeekLayout {
  return input.weekLayout ?? defaultLayoutOf({ matchKind: matchKindOf(input), plan: input.plan });
}

/** The seven dated rows of a week, over a given layout — the one derivation of `now`. */
export function agendaOver(input: HomeInput, layout: WeekLayout): WeekAgenda {
  return weekAgendaOf({
    now: input.now,
    matchKind: matchKindOf(input),
    plan: input.plan,
    layout,
    sessions: sessionsOf(input),
  });
}

/**
 * T4, T6 — the week of this screen, derived exactly once.
 *
 * The rows and the day card both read this object: the layout decides what each weekday
 * carries, and the card no longer asks the template or the rotation what today is. With
 * no plan there is no week to date, and the screen keeps its honest empty state.
 */
export function homeAgendaOf(input: HomeInput): HomeWeek | null {
  if (input.plan.length === 0) return null;
  const layout = layoutOf(input);
  return { layout, agenda: agendaOver(input, layout) };
}

/** The row the week calls today, or `null` when there is no week to date. */
export function todayRowOf(input: HomeInput): AgendaDay | null {
  return homeAgendaOf(input)?.agenda.days.find((day) => day.today) ?? null;
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

function phaseLine(phaseState: PhaseState | undefined): string | null {
  if (phaseState === undefined) return null;
  const block = Math.min(Math.max(Math.trunc(phaseState.block), 1), READAPTATION_BLOCKS);
  return `Readaptación · semana ${block} de ${READAPTATION_BLOCKS}`;
}

function todayViewOf(
  session: WorkoutSession | undefined,
  phaseState: PhaseState | undefined,
): TodayView | null {
  if (session === undefined) return null;
  const phase = phaseLine(phaseState);
  const prescribed = prescribedSets(session);
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
    phase: phase,
    series: prescribed === 0 ? null : formatSeries(prescribed),
    state,
    done:
      state === 'done' ? doneLineOf(session, 'hoy') : null,
    sessionId: session.id,
  };
}

/**
 * `Sesión completada hoy · 8 de 9 series.` — the closed line, and the day it happened on.
 *
 * The word is a parameter because a closed session of this week is not always today's: the
 * owner may train a day and move it afterwards, and the card then says which weekday it
 * was, instead of claiming the training happened today (S6).
 */
function doneLineOf(session: WorkoutSession, when: string): string {
  const verb = session.status === 'completed' ? 'Sesión completada' : 'Sesión guardada como parcial';
  return `${verb} ${when} · ${formatSetProgress(confirmedSetCount(session), prescribedSets(session))}.`;
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

/** How much work a plan day asks for, as the card states it, with the phase. */
function planDayPartsOf(
  day: PlanDay,
  phaseState: PhaseState | undefined,
): { readonly detail: string; readonly phase: string | null; readonly series: string | null } {
  const prescribed = day.items.reduce((total, item) => total + item.prescription.sets, 0);
  const estimated = estimateMinutes(
    day.items.map((item) => ({
      sets: item.prescription.sets,
      restSeconds: item.prescription.restSeconds,
    })),
  );
  return {
    detail:
      estimated === 0
        ? formatExerciseCount(day.items.length)
        : `${formatExerciseCount(day.items.length)} · ${formatEstimate(estimated)}`,
    phase: phaseLine(phaseState),
    series: prescribed === 0 ? null : formatSeries(prescribed),
  };
}

/**
 * The day the week places today, shown before any session row exists.
 *
 * It is a preview, not a session: it carries the plan's own numbers and says `preview`,
 * so nothing downstream can mistake it for something stored. A day with no exercises is
 * not previewed — there is nothing to start, and the screen says which state it is in.
 */
function previewDayOf(day: PlanDay, phaseState: PhaseState | undefined): TodayView | null {
  if (day.items.length === 0) return null;
  return {
    dayName: day.name,
    ...planDayPartsOf(day, phaseState),
    state: 'preview',
    done: null,
    sessionId: null,
  };
}

/**
 * The closed session of a plan day this week, wherever the owner moved the day to.
 *
 * The agenda already said the row is done; this finds the training that closed it so the
 * card can name the weekday it happened on and offer its summary.
 */
function closingSessionOf(
  sessions: readonly WorkoutSession[],
  planDayId: string,
): WorkoutSession | null {
  const closed = sessions.filter(
    (session) =>
      session.planDayId === planDayId &&
      (session.status === 'completed' || session.status === 'partial'),
  );
  return closed.reduce<WorkoutSession | null>(
    (latest, session) =>
      latest === null || session.scheduledDate > latest.scheduledDate ? session : latest,
    null,
  );
}

/**
 * T6 — the card of today, read from the agenda's today row.
 *
 * This is the repair of the verifier's blocker: the card used to ask the template and the
 * stored `WeekRecord` what today was, while the row above it asked the owner's layout, so a
 * day the owner moved away still appeared below as the day to train. Now the row is the
 * only source of "what today carries":
 *
 * - a rest day or the match asks the agenda, and the card says so with nothing to start;
 * - a workout day shows *its* plan day — a stored session of that same plan day if there is
 *   one, the closed session that made it done if it is done, and the preview otherwise.
 *
 * A session scheduled for today whose plan day the owner moved off today is not the card:
 * the store's row is still there, but today's plan says rest. An open session stays
 * reachable through `actionOf`'s `resume`, which is the one action that does not claim a
 * day.
 */
function todayCardOf(
  row: AgendaDay | null,
  sessions: readonly WorkoutSession[],
  phaseState: PhaseState | undefined,
  now: EpochMs,
): TodayView | null {
  if (row === null || row.kind !== 'workout' || row.planDay === null) return null;
  const stored = todaySessionOf(
    sessions.filter((session) => session.planDayId === row.planDay?.id),
    now,
  );
  if (stored !== undefined) return todayViewOf(stored, phaseState);
  if (row.done) {
    const closing = closingSessionOf(sessions, row.planDay.id);
    return {
      dayName: row.planDay.name,
      ...planDayPartsOf(row.planDay, phaseState),
      state: 'done',
      done:
        closing === null
          ? 'Ya está hecho esta semana.'
          : doneLineOf(closing, `el ${formatWeekdayName(closing.scheduledDate).toLowerCase()}`),
      sessionId: closing === null ? null : closing.id,
    };
  }
  return previewDayOf(row.planDay, phaseState);
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

/**
 * The activity section: the rows the owner recorded, apart from the imported ones.
 *
 * Only `provenance: 'manual'` is "registered": it is the only provenance the app itself
 * writes, and calling it imported would be a lie about where the number came from.
 * Anything else (an import, or an estimate from a bridge) is a count the owner cannot
 * edit here, exactly as before.
 */
function activityViewOf(activities: readonly ActivityRecord[]): ActivityView {
  const manual = activities
    .filter((row) => row.provenance === 'manual')
    .sort((left, right) => right.date - left.date);

  return {
    recorded: manual.map((row) => ({
      id: row.id,
      label: MANUAL_ACTIVITY_LABELS[row.kind],
      detail: `${formatShortDate(row.date)} · ${formatDuration(row.durationSeconds * 1000)}`,
      removeLabel: `Eliminar ${MANUAL_ACTIVITY_NAMES[row.kind]} del ${formatDayAndMonth(row.date)}`,
    })),
    imported: activities.length - manual.length,
    empty: activities.length === 0,
  };
}

export function homeViewOf(input: HomeInput): HomeView {
  const { now, recent, inProgress, profile, phaseState } = input;
  const pool = inProgress === undefined ? recent : [...recent, inProgress];
  // T4, T6: the week is derived once, from the owner's layout, and both the rows and the
  // card of today read that one object. The card no longer asks the template, the stored
  // `WeekRecord` or the rotation what today is: those three answered the same question a
  // second time, and disagreed with the rows the moment the owner moved a day.
  const agenda = homeAgendaOf(input);
  const todayRow = agenda === null ? null : (agenda.agenda.days.find((day) => day.today) ?? null);
  const today = todayCardOf(todayRow, pool, phaseState, now);

  return {
    greeting: greeting(profile?.displayName ?? null),
    dateLine: formatLongDate(now),
    today,
    // Two honest states remain once the card has nothing to draw: no plan at all, or the
    // plan day the week places today has no exercises to start. A rest day and the match
    // are neither — they are days, and they say so.
    nothingToday:
      today !== null
        ? null
        : agenda === null
          ? 'noPlan'
          : todayRow === null || todayRow.kind !== 'workout'
            ? null
            : 'emptyDay',
    action: actionOf(today, inProgress),
    last: lastSessionOf(recent),
    agenda,
    weight: weightViewOf(input.measurements, now),
    // Read only, and never handed to the rotation: `nextPlanDay` above sees `plan` and
    // `recent` (sessions) and nothing else, so a recorded football match cannot move the
    // strength day that comes next (S6).
    activity: activityViewOf(input.activities),
    notice: {
      // §7.8: Inicio keeps only the state that reports a loss. The install advisory is
      // Perfil's alone now (S2, S5).
      evicted: input.lostData,
      lastExport: input.lastExportAt === null ? null : formatShortDate(input.lastExportAt),
    },
    hasHistory: recent.length > 0,
  };
}
