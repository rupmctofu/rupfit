/**
 * The derived values of the Progreso tab — computed, never stored
 * (`docs/data-model.md` §8, invariant I-6).
 *
 * Everything below is a pure function of rows the storage port already returned and
 * of an instant the caller injects. Nothing here reads a clock, touches IndexedDB or
 * formats a number; nothing here writes.
 *
 * The formulas, and where they come from:
 *
 * | Value | Formula | Source |
 * | --- | --- | --- |
 * | Session volume | `Σ weightKg × actualReps` over confirmed sets | data-model §8 |
 * | Hard sets | sets whose RIR bucket is ≤ 1 (`failure` or `hard`) | data-model §8, training-science §4 |
 * | e1RM | `weightKg × (1 + (actualReps + rir) / 30)`, suppressed above 12 effective reps | data-model §8, Epley with the RIR bucket as reserved reps |
 * | Weekly volume | volume and hard sets per 7-day week | data-model §8 |
 * | Personal record | max `weightKg` per exercise and target rep count, oldest date on a tie | data-model §8 |
 * | 7-day body-weight mean | mean of the available daily values in the trailing 7 days, needs ≥ 3 | data-model §8 |
 *
 * The `rir` of the e1RM formula is the stored effort bucket itself: `EFFORT.failure`
 * is 0 RIR, `hard` 1, `correct` 2, `easy` 3 (`src/core/domain/values.ts`). Raw RIR is
 * never stored, so the bucket is the most precise value that exists.
 *
 * Two deliberate refusals:
 *
 * - **A hole is a hole.** A week without a session has no value, and a body-weight
 *   day without a weigh-in has no value. Nothing is interpolated, and where the chart
 *   primitive cannot express the hole the honest rendering is chosen instead (no line,
 *   explicit points) — see `strengthState` and `weightLineDecision`.
 * - **Week boundaries are calendar days, not 7 × 86 400 000 ms.** A DST change would
 *   otherwise move a bucket to 23:00 the day before.
 */

import { EFFORT } from '../../core/domain';
import type {
  BodyMeasurement,
  ExerciseSession,
  Provenance,
  SetRecord,
  WorkoutSession,
} from '../../storage';

export const DAY_MS = 86_400_000;
/** `últimas 12 sem`, the window of both charts of `progreso-12w`. */
export const WEEKS_IN_WINDOW = 12;
/** The body-weight chart's span; the render's axis runs from `30 oct` to `6 nov`. */
export const WEIGHT_WINDOW_DAYS = 30;
/** The rolling mean's window: `la media de 7 días`. */
export const MEAN_WINDOW_DAYS = 7;
/** `Necesitamos 3 pesajes en 7 días para dibujar la media.` */
export const MEAN_MIN_SAMPLES = 3;
/** Above this many effective reps the Epley estimate is not credible (§8). */
export const E1RM_MAX_EFFECTIVE_REPS = 12;
/** Stamped on the estimate, so a future formula can be compared instead of trusted. */
export const E1RM_FORMULA_VERSION = 1;

/* ------------------------------------------------------------- calendar days */

/** Local midnight of the day `at` falls in. */
export function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Local midnight of the Monday of the week `at` falls in (weeks start on Monday). */
export function startOfWeek(at: number): number {
  const date = new Date(startOfDay(at));
  const weekday = date.getDay(); // 0 = Sunday … 6 = Saturday
  date.setDate(date.getDate() - ((weekday + 6) % 7));
  return date.getTime();
}

/** Whole calendar days, so a DST change cannot shift a boundary by an hour. */
export function addDays(at: number, days: number): number {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export interface WeekBucket {
  /** Inclusive local midnight of the Monday. */
  readonly start: number;
  /** Exclusive end: the next Monday. */
  readonly end: number;
}

/** `weeks` contiguous buckets, oldest first, the last one containing `now`. */
export function weekBuckets(now: number, weeks: number = WEEKS_IN_WINDOW): readonly WeekBucket[] {
  const current = startOfWeek(now);
  const buckets: WeekBucket[] = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const start = addDays(current, -7 * offset);
    buckets.push({ start, end: addDays(start, 7) });
  }
  return buckets;
}

function bucketIndex(buckets: readonly WeekBucket[], at: number): number {
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    if (bucket !== undefined && at >= bucket.start && at < bucket.end) return index;
  }
  return -1;
}

/* ------------------------------------------------------- per-set derivations */

/** `Σ weightKg × actualReps` (§8). Bodyweight sets contribute 0 kg·reps. */
export function sessionVolume(sets: readonly SetRecord[]): number {
  return sets.reduce((total, entry) => total + entry.weightKg * entry.actualReps, 0);
}

/** Sets at 1 RIR or closer. An unanswered effort is never claimed as a hard set (I-7). */
export function hardSetCount(sets: readonly SetRecord[]): number {
  return sets.filter((entry) => entry.effort !== null && entry.effort <= EFFORT.hard).length;
}

export interface E1rmInput {
  readonly weightKg: number;
  readonly actualReps: number;
  readonly effort: number | null;
}

/**
 * Epley with the RIR bucket as reserved reps, `formulaVersion = 1` (§8).
 * `null` when the effort is unanswered or the estimate is out of range (> 12 effective
 * reps): an estimate nobody can defend is not displayed.
 */
export function estimateOneRepMax(entry: E1rmInput): number | null {
  if (entry.effort === null) return null;
  const effectiveReps = entry.actualReps + entry.effort;
  if (effectiveReps > E1RM_MAX_EFFECTIVE_REPS) return null;
  return entry.weightKg * (1 + effectiveReps / 30);
}

/* ------------------------------------------------------- which sessions count */

const RECORDED_STATUSES = ['completed', 'partial', 'abandoned'] as const;

/** A session that happened: terminal, started, and with at least one confirmed set. */
export function isRecordedSession(session: WorkoutSession): boolean {
  if (!(RECORDED_STATUSES as readonly string[]).includes(session.status)) return false;
  return session.exercises.some((exercise) => exercise.sets.length > 0);
}

function recordedSessions(sessions: readonly WorkoutSession[]): readonly WorkoutSession[] {
  return sessions.filter(isRecordedSession);
}

function exerciseKey(exercise: ExerciseSession): string {
  return exercise.exerciseId ?? `name:${exercise.exerciseNameSnapshot}`;
}

/* --------------------------------------------------------- strength series */

export type StrengthState = 'empty' | 'single' | 'trend' | 'gap';

export interface StrengthWeek {
  readonly start: number;
  /** Heaviest confirmed set of the week. `null` = no weighted session that week. */
  readonly topSetKg: number | null;
  /** Heaviest e1RM of the week. `null` = no set week with an answered effort in range. */
  readonly e1rmKg: number | null;
  /** Recorded sessions of this exercise in the week. */
  readonly sessions: number;
}

export interface StrengthSeries {
  readonly exerciseKey: string;
  readonly exerciseName: string;
  readonly weeks: readonly StrengthWeek[];
  /** Weeks that hold a top set. */
  readonly dataWeeks: number;
  /** Empty weeks that sit *between* two weeks with a top set. */
  readonly gapWeeks: number;
  readonly hasGap: boolean;
  readonly firstIndex: number;
  readonly lastIndex: number;
  readonly firstTopSetKg: number | null;
  readonly lastTopSetKg: number | null;
  readonly changeKg: number | null;
}

interface ExerciseTally {
  readonly key: string;
  readonly name: string;
  weightedSets: number;
  volumeKg: number;
  readonly byWeek: Map<number, { topSetKg: number; e1rmKg: number | null; sessions: Set<string> }>;
}

/**
 * The per-exercise strength series of the window, or `null` when no weighted set
 * exists in it. The exercise is the one with the most weighted sets (ties by volume,
 * then by name) — a chart of the exercise you actually train.
 */
export function strengthSeries(
  sessions: readonly WorkoutSession[],
  options: { readonly now: number; readonly weeks?: number | undefined },
): StrengthSeries | null {
  const buckets = weekBuckets(options.now, options.weeks ?? WEEKS_IN_WINDOW);
  const tallies = new Map<string, ExerciseTally>();

  for (const stored of recordedSessions(sessions)) {
    const index = bucketIndex(buckets, stored.scheduledDate);
    if (index === -1) continue;

    for (const exercise of stored.exercises) {
      const key = exerciseKey(exercise);
      let tally = tallies.get(key);
      if (tally === undefined) {
        tally = { key, name: exercise.exerciseNameSnapshot, weightedSets: 0, volumeKg: 0, byWeek: new Map() };
        tallies.set(key, tally);
      }

      for (const entry of exercise.sets) {
        // A bodyweight set has no weight to plot: 0 kg would be a flat line at the
        // bottom of the chart, which is not a trend (FR-11.5).
        if (entry.weightKg <= 0) continue;
        tally.weightedSets += 1;
        tally.volumeKg += entry.weightKg * entry.actualReps;

        const week = tally.byWeek.get(index) ?? { topSetKg: 0, e1rmKg: null, sessions: new Set<string>() };
        week.topSetKg = Math.max(week.topSetKg, entry.weightKg);
        const estimate = estimateOneRepMax(entry);
        if (estimate !== null) {
          week.e1rmKg = week.e1rmKg === null ? estimate : Math.max(week.e1rmKg, estimate);
        }
        week.sessions.add(stored.id);
        tally.byWeek.set(index, week);
      }
    }
  }

  const chosen = [...tallies.values()]
    .filter((tally) => tally.weightedSets > 0)
    .sort((left, right) => {
      if (right.weightedSets !== left.weightedSets) return right.weightedSets - left.weightedSets;
      if (right.volumeKg !== left.volumeKg) return right.volumeKg - left.volumeKg;
      return left.name.localeCompare(right.name, 'es');
    })[0];

  if (chosen === undefined) return null;

  const weeks: StrengthWeek[] = buckets.map((bucket, index) => {
    const week = chosen.byWeek.get(index);
    return {
      start: bucket.start,
      topSetKg: week === undefined ? null : week.topSetKg,
      e1rmKg: week === undefined ? null : week.e1rmKg,
      sessions: week === undefined ? 0 : week.sessions.size,
    };
  });

  const dataIndexes = weeks.flatMap((week, index) => (week.topSetKg === null ? [] : [index]));
  const firstIndex = dataIndexes[0] ?? -1;
  const lastIndex = dataIndexes[dataIndexes.length - 1] ?? -1;
  const gapWeeks =
    firstIndex === -1
      ? 0
      : weeks
          .slice(firstIndex, lastIndex + 1)
          .filter((week) => week.topSetKg === null).length;

  const firstTopSetKg = firstIndex === -1 ? null : (weeks[firstIndex]?.topSetKg ?? null);
  const lastTopSetKg = lastIndex === -1 ? null : (weeks[lastIndex]?.topSetKg ?? null);

  return {
    exerciseKey: chosen.key,
    exerciseName: chosen.name,
    weeks,
    dataWeeks: dataIndexes.length,
    gapWeeks,
    hasGap: gapWeeks > 0,
    firstIndex,
    lastIndex,
    firstTopSetKg,
    lastTopSetKg,
    changeKg: firstTopSetKg === null || lastTopSetKg === null ? null : lastTopSetKg - firstTopSetKg,
  };
}

/** The three states of the strength card, and the one that turns the line off. */
export function strengthState(series: StrengthSeries | null): StrengthState {
  if (series === null || series.dataWeeks === 0) return 'empty';
  if (series.dataWeeks === 1) return 'single';
  return series.hasGap ? 'gap' : 'trend';
}

/** A line joins points only when the series has no hole and more than one point. */
export function strengthLineDecision(series: StrengthSeries | null): 'line' | 'points' {
  return strengthState(series) === 'trend' ? 'line' : 'points';
}

/* ----------------------------------------------------------- weekly volume */

export interface VolumeWeek {
  readonly start: number;
  readonly volumeKg: number;
  readonly hardSets: number;
  readonly sessions: number;
}

export interface WeeklyVolume {
  readonly weeks: readonly VolumeWeek[];
  /** Weeks that hold at least one confirmed set. */
  readonly weeksWithVolume: number;
  readonly lastVolumeKg: number;
  readonly lastHardSets: number;
  /** `Necesita al menos dos semanas para comparar.` */
  readonly enoughToCompare: boolean;
}

export function weeklyVolume(
  sessions: readonly WorkoutSession[],
  options: { readonly now: number; readonly weeks?: number | undefined },
): WeeklyVolume {
  const buckets = weekBuckets(options.now, options.weeks ?? WEEKS_IN_WINDOW);
  const weeks: VolumeWeek[] = buckets.map((bucket) => ({
    start: bucket.start,
    volumeKg: 0,
    hardSets: 0,
    sessions: 0,
  }));

  for (const stored of recordedSessions(sessions)) {
    const index = bucketIndex(buckets, stored.scheduledDate);
    if (index === -1) continue;
    const week = weeks[index];
    if (week === undefined) continue;

    let volume = 0;
    let hard = 0;
    let sets = 0;
    for (const exercise of stored.exercises) {
      volume += sessionVolume(exercise.sets);
      hard += hardSetCount(exercise.sets);
      sets += exercise.sets.length;
    }
    if (sets === 0) continue;

    weeks[index] = {
      start: week.start,
      volumeKg: week.volumeKg + volume,
      hardSets: week.hardSets + hard,
      sessions: week.sessions + 1,
    };
  }

  const weeksWithVolume = weeks.filter((week) => week.sessions > 0).length;
  const last = weeks[weeks.length - 1];

  return {
    weeks,
    weeksWithVolume,
    lastVolumeKg: last?.volumeKg ?? 0,
    lastHardSets: last?.hardSets ?? 0,
    enoughToCompare: weeksWithVolume >= 2,
  };
}

/* --------------------------------------------------------- personal records */

export interface PersonalRecord {
  readonly exerciseKey: string;
  readonly exerciseName: string;
  readonly targetReps: number;
  readonly weightKg: number;
  /** The instant the mark was first reached. Tie-break of §8. */
  readonly achievedAt: number;
  readonly sessionId: string;
  readonly exerciseSessionId: string;
}

interface SetMark {
  readonly weightKg: number;
  readonly confirmedAt: number;
  readonly sessionId: string;
  readonly exerciseSessionId: string;
  readonly exerciseName: string;
}

function marksPerTarget(sessions: readonly WorkoutSession[]): Map<string, Map<number, SetMark[]>> {
  const marks = new Map<string, Map<number, SetMark[]>>();
  for (const stored of recordedSessions(sessions)) {
    for (const exercise of stored.exercises) {
      const key = exerciseKey(exercise);
      for (const entry of exercise.sets) {
        if (entry.weightKg <= 0) continue;
        const byTarget = marks.get(key) ?? new Map<number, SetMark[]>();
        const list = byTarget.get(entry.targetReps) ?? [];
        list.push({
          weightKg: entry.weightKg,
          confirmedAt: entry.confirmedAt,
          sessionId: stored.id,
          exerciseSessionId: exercise.id,
          exerciseName: exercise.exerciseNameSnapshot,
        });
        byTarget.set(entry.targetReps, list);
        marks.set(key, byTarget);
      }
    }
  }
  return marks;
}

/** Best mark per (exercise, target reps); a tie keeps the date it was first reached. */
export function personalRecords(sessions: readonly WorkoutSession[]): readonly PersonalRecord[] {
  const records: PersonalRecord[] = [];

  for (const [key, byTarget] of marksPerTarget(sessions)) {
    for (const [targetReps, marks] of byTarget) {
      const best = marks.reduce((winner, mark) => {
        if (mark.weightKg !== winner.weightKg) return mark.weightKg > winner.weightKg ? mark : winner;
        return mark.confirmedAt < winner.confirmedAt ? mark : winner;
      });

      records.push({
        exerciseKey: key,
        exerciseName: best.exerciseName,
        targetReps,
        weightKg: best.weightKg,
        achievedAt: best.confirmedAt,
        sessionId: best.sessionId,
        exerciseSessionId: best.exerciseSessionId,
      });
    }
  }

  return records.sort((left, right) => {
    if (right.achievedAt !== left.achievedAt) return right.achievedAt - left.achievedAt;
    if (right.weightKg !== left.weightKg) return right.weightKg - left.weightKg;
    return left.exerciseName.localeCompare(right.exerciseName, 'es');
  });
}

/** The record the Récords row shows: the heaviest mark, ties to the date first reached. */
export function topRecord(records: readonly PersonalRecord[]): PersonalRecord | null {
  return records.reduce<PersonalRecord | null>((winner, record) => {
    if (winner === null) return record;
    if (record.weightKg !== winner.weightKg) return record.weightKg > winner.weightKg ? record : winner;
    if (record.achievedAt !== winner.achievedAt) {
      return record.achievedAt < winner.achievedAt ? record : winner;
    }
    return record.exerciseName.localeCompare(winner.exerciseName, 'es') < 0 ? record : winner;
  }, null);
}

export interface RecordHit {
  readonly exerciseName: string;
  readonly targetReps: number;
  readonly weightKg: number;
  /** The mark to beat when the session started; `null` = nothing before it. */
  readonly previousKg: number | null;
}

/**
 * The marks a session set, with the mark they beat. A record is a record of its day:
 * a later session beating it does not erase the day it happened.
 */
export function recordsInSession(
  session: WorkoutSession,
  all: readonly WorkoutSession[],
): readonly RecordHit[] {
  const hits: RecordHit[] = [];

  for (const byTarget of marksPerTarget(all).values()) {
    for (const [targetReps, list] of byTarget) {
      const inSession = list.filter((mark) => mark.sessionId === session.id);
      if (inSession.length === 0) continue;

      const best = inSession.reduce((winner, mark) => {
        if (mark.weightKg !== winner.weightKg) return mark.weightKg > winner.weightKg ? mark : winner;
        return mark.confirmedAt < winner.confirmedAt ? mark : winner;
      });
      const before = list.filter(
        (candidate) => candidate.sessionId !== session.id && candidate.confirmedAt < best.confirmedAt,
      );
      const previousKg =
        before.length === 0 ? null : before.reduce((top, candidate) => Math.max(top, candidate.weightKg), 0);
      if (previousKg !== null && best.weightKg <= previousKg) continue;

      hits.push({
        exerciseName: best.exerciseName,
        targetReps,
        weightKg: best.weightKg,
        previousKg,
      });
    }
  }

  return hits.sort((left, right) => right.weightKg - left.weightKg);
}

/* --------------------------------------------------------- body-weight series */

export type WeightState = 'empty' | 'single' | 'few' | 'trend' | 'gap';

export interface WeighIn {
  readonly id: string;
  readonly dayStart: number;
  readonly measuredAt: number;
  readonly weightKg: number;
  readonly provenance: Provenance;
}

export interface WeightPoint {
  readonly dayStart: number;
  readonly weightKg: number;
}

export interface WeightSeries {
  readonly windowStart: number;
  readonly windowEnd: number;
  /** One point per day with a weigh-in, ascending. Holes are holes, not values. */
  readonly points: readonly WeightPoint[];
  /** The measurement list: newest first, same window as the chart. */
  readonly weighIns: readonly WeighIn[];
  readonly last: WeightPoint | null;
  /** Days between the first and the last point that carry no weigh-in. */
  readonly missingDays: number;
  readonly contiguous: boolean;
  /** Mean of the trailing 7 days ending at the last weigh-in; `null` under 3 samples. */
  readonly meanKg: number | null;
  readonly meanSamples: number;
  readonly samplesNeeded: number;
  /** Whole days between `now` and the last weigh-in; `null` when there is none. */
  readonly daysSinceLast: number | null;
  readonly state: WeightState;
}

/** Days without a weigh-in between the first and the last point. */
export function missingDayCount(points: readonly WeightPoint[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return 0;

  const present = new Set(points.map((point) => point.dayStart));
  let missing = 0;
  for (let day = addDays(first.dayStart, 1); day < last.dayStart; day = addDays(day, 1)) {
    if (!present.has(day)) missing += 1;
  }
  return missing;
}

/**
 * The weight chart's series over the last `days` days, ending at the last weigh-in on
 * record — the window of available data, not of the calendar, so a weigh-in from last
 * month is still shown and dated (`daysSinceLast` says how old it is).
 */
export function weightSeries(
  measurements: readonly BodyMeasurement[],
  now: number,
  days: number = WEIGHT_WINDOW_DAYS,
): WeightSeries {
  const byDay = new Map<number, WeighIn>();

  for (const row of measurements) {
    if (row.weightKg === null) continue;
    const dayStart = startOfDay(row.date);
    const current = byDay.get(dayStart);
    // Two rows on one day: the later reading is the day's value.
    if (current === undefined || row.date >= current.measuredAt) {
      byDay.set(dayStart, {
        id: row.id,
        dayStart,
        measuredAt: row.date,
        weightKg: row.weightKg,
        provenance: row.provenance,
      });
    }
  }

  const all = [...byDay.values()].sort((left, right) => left.dayStart - right.dayStart);
  const newest = all[all.length - 1];

  if (newest === undefined) {
    const day = startOfDay(now);
    return {
      windowStart: addDays(day, -(days - 1)),
      windowEnd: day,
      points: [],
      weighIns: [],
      last: null,
      missingDays: 0,
      contiguous: false,
      meanKg: null,
      meanSamples: 0,
      samplesNeeded: MEAN_MIN_SAMPLES,
      daysSinceLast: null,
      state: 'empty',
    };
  }

  const windowEnd = newest.dayStart;
  const windowStart = Math.max(all[0]?.dayStart ?? windowEnd, addDays(windowEnd, -(days - 1)));
  const inWindow = all.filter((row) => row.dayStart >= windowStart && row.dayStart <= windowEnd);
  const points = inWindow.map((row) => ({ dayStart: row.dayStart, weightKg: row.weightKg }));

  const meanWindowStart = addDays(windowEnd, -(MEAN_WINDOW_DAYS - 1));
  const meanSamples = inWindow.filter(
    (row) => row.dayStart >= meanWindowStart && row.dayStart <= windowEnd,
  );
  const meanKg =
    meanSamples.length >= MEAN_MIN_SAMPLES
      ? meanSamples.reduce((total, row) => total + row.weightKg, 0) / meanSamples.length
      : null;

  const missingDays = missingDayCount(points);
  const contiguous = missingDays === 0 && points.length > 1;

  const state: WeightState =
    points.length <= 1
      ? 'single'
      : points.length < MEAN_MIN_SAMPLES
        ? 'few'
        : contiguous
          ? 'trend'
          : 'gap';

  return {
    windowStart,
    windowEnd,
    points,
    weighIns: [...inWindow].reverse(),
    last: points[points.length - 1] ?? null,
    missingDays,
    contiguous,
    meanKg,
    meanSamples: meanSamples.length,
    samplesNeeded: Math.max(0, MEAN_MIN_SAMPLES - meanSamples.length),
    daysSinceLast: Math.round((startOfDay(now) - windowEnd) / DAY_MS),
    state,
  };
}

/**
 * `LineChart` cannot express a hole: `values` is a `readonly number[]` and a `NaN`
 * would break `extent()`. So the line is drawn only for a contiguous series of at
 * least three points; anything else is drawn as explicit points, which is the honest
 * rendering of a gap (design-system gallery, `LineChart` note).
 */
export function weightLineDecision(series: WeightSeries): 'line' | 'points' {
  return series.state === 'trend' ? 'line' : 'points';
}
