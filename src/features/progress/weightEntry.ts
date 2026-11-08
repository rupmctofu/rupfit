/**
 * Recording a body weight — the write path the body-weight series was missing
 * (FR-12.1, FR-12.2, S4 S5 S6).
 *
 * `#/progreso/peso` could draw the series, the trail of weigh-ins and the 7-day mean,
 * and nothing in the app could add a weigh-in: the series only grew through an import
 * (`docs/roadmap.md` §"Open work recorded at this state", item 2). This module is the
 * whole of that decision, pure and React-free, so the form holds no rule worth testing.
 *
 * ## The four rules, and why each one exists
 *
 * 1. **Kilograms only, to a tenth.** `BodyMeasurement` has no unit field (I-3) and the
 *    app stores kilograms; `0.1` is the increment it keeps, so `78,45` is refused rather
 *    than silently rounded to a number the owner did not type.
 * 2. **The day defaults to today and can be backfilled.** A weigh-in typed today carries
 *    the instant it was typed; a backfilled day carries the day itself, because the app
 *    does not know what hour the owner stood on the scale. Nothing in the future is
 *    accepted — the mean cannot be fed with a day that has not happened.
 * 3. **One row per day, corrected in place.** A second weigh-in on the same day replaces
 *    the day's value in the row already there, keeping its id and every other measure it
 *    carried (I-10). Replacing is one `put` in one transaction, so a correction can never
 *    half-succeed into a day with no weigh-in at all. Where two rows for one day exist
 *    anyway — an import can always write a second one — the storage layer's own rule
 *    decides the day: the later reading wins (`aggregates.weightSeries`), and this
 *    planner corrects that one.
 * 4. **The mean keeps its honest gap.** Nothing here relaxes the three-sample floor
 *    (`aggregates.MEAN_MIN_SAMPLES`): the notice says how many are missing instead of
 *    drawing a mean out of one weigh-in.
 *
 * No clock is read here, nothing is stored here, and ids arrive as `newId`.
 */

import type { BodyMeasurement, EpochMs } from '../../storage';
import type { WeightSeries } from './aggregates';
import { MEAN_MIN_SAMPLES, startOfDay } from './aggregates';
import { formatDayMonth, formatWeight } from './format';

/** `crypto.randomUUID()` in the form, a counter in a test. */
export type IdFactory = () => string;

/**
 * The increment the app stores a body weight in, in kilograms. A tenth: a scale's
 * precision, and the finest step the stored number is ever read back at.
 */
export const WEIGHT_KG_INCREMENT = 0.1;

/** The decimals that increment allows: one, for 0,1 kg. Derived, never written twice. */
const WEIGHT_DECIMALS = Math.max(0, Math.round(-Math.log10(WEIGHT_KG_INCREMENT)));

/**
 * The range a body weight can plausibly fall in, in kilograms. Loud enough to catch a
 * mistyped decimal (`784`) and quiet enough not to argue with an unusual body.
 */
export const WEIGHT_KG_BOUNDS = { min: 20, max: 300 } as const;

/* ------------------------------------------------------------------ the draft */

/** What the form holds: the chosen day as `YYYY-MM-DD`, and the typed number. */
export interface WeightDraft {
  readonly day: string;
  readonly weightText: string;
}

export type WeightField = 'weight' | 'day';

export type WeightRefusal =
  | 'weightEmpty'
  | 'weightUnreadable'
  | 'weightPrecision'
  | 'weightOutOfRange'
  | 'dayMalformed'
  | 'dayFuture';

export type WeightCheck =
  | {
      readonly ok: true;
      /** Local midnight of the chosen day. */
      readonly day: EpochMs;
      readonly dayIso: string;
      readonly weightKg: number;
    }
  /** The form shows the sentence under the field named here, and writes nothing. */
  | {
      readonly ok: false;
      readonly field: WeightField;
      readonly refusal: WeightRefusal;
      readonly message: string;
    };

export type ParsedWeight =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly refusal: WeightRefusal; readonly message: string };

const WEIGHT_MESSAGES: Readonly<Record<Exclude<WeightRefusal, 'dayMalformed' | 'dayFuture'>, string>> = {
  weightEmpty: 'Escribe el peso en kilos, por ejemplo 78,4.',
  weightUnreadable: 'Ese peso no se entiende. Escribe sólo el número en kilos, por ejemplo 78,4.',
  weightPrecision: 'Un decimal como mucho: la báscula da décimas y la app guarda kilos.',
  weightOutOfRange: `El peso tiene que estar entre ${String(WEIGHT_KG_BOUNDS.min)} y ${String(
    WEIGHT_KG_BOUNDS.max,
  )} kg.`,
};

/**
 * `78,4` → `78.4`, the Spanish comma honoured and the dot accepted. A trailing comma is
 * a whole number (`78,` → `78`); two decimals are refused, not rounded.
 */
export function parseWeightKg(text: string): ParsedWeight {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, refusal: 'weightEmpty', message: WEIGHT_MESSAGES.weightEmpty };

  if (!/^\d+([.,]\d*)?$/.test(trimmed)) {
    return { ok: false, refusal: 'weightUnreadable', message: WEIGHT_MESSAGES.weightUnreadable };
  }

  const [whole, fraction = ''] = trimmed.split(/[.,]/);
  if (fraction.length > WEIGHT_DECIMALS) {
    return { ok: false, refusal: 'weightPrecision', message: WEIGHT_MESSAGES.weightPrecision };
  }

  const value = Number(fraction === '' ? (whole ?? '') : `${String(whole)}.${fraction}`);
  if (!Number.isFinite(value) || value < WEIGHT_KG_BOUNDS.min || value > WEIGHT_KG_BOUNDS.max) {
    return { ok: false, refusal: 'weightOutOfRange', message: WEIGHT_MESSAGES.weightOutOfRange };
  }

  return { ok: true, value };
}

/* ---------------------------------------------------------------- the calendar */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local `YYYY-MM-DD` of an instant. `toISOString` is not used: it would answer in UTC. */
export function isoDayOf(at: EpochMs): string {
  const date = new Date(at);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of `YYYY-MM-DD`, or `null` when the string is not a real day. */
export function dayStartOfIso(iso: string): EpochMs | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (match === null) return null;

  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return null;

  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // A date the calendar does not have rolls over; the round trip is what catches it.
  if (isoDayOf(date.getTime()) !== `${year}-${month}-${day}`) return null;
  return date.getTime();
}

/* --------------------------------------------------------------- validation */

/** The whole draft, checked: the day first, then the number. */
export function checkWeightDraft(draft: WeightDraft, now: EpochMs): WeightCheck {
  const day = dayStartOfIso(draft.day);
  if (day === null) {
    return {
      ok: false,
      field: 'day',
      refusal: 'dayMalformed',
      message: 'Elige un día del calendario: hoy o uno anterior.',
    };
  }

  if (day > startOfDay(now)) {
    return {
      ok: false,
      field: 'day',
      refusal: 'dayFuture',
      message: 'Todavía no se puede apuntar el pesaje de un día que no ha llegado.',
    };
  }

  const weight = parseWeightKg(draft.weightText);
  if (!weight.ok) return { ok: false, field: 'weight', refusal: weight.refusal, message: weight.message };

  return { ok: true, day, dayIso: isoDayOf(day), weightKg: weight.value };
}

/* ------------------------------------------------------------------ the write */

export interface WeightWriteInput {
  readonly now: EpochMs;
  /** Local midnight of the chosen day, from `checkWeightDraft`. */
  readonly day: EpochMs;
  readonly weightKg: number;
  /** The rows already stored on that day, read through `by_date` right before writing. */
  readonly sameDay: readonly BodyMeasurement[];
  readonly newId: IdFactory;
}

export interface PlannedWeightWrite {
  readonly measurement: BodyMeasurement;
  /** `true` when the day already had a weigh-in and this corrects it. */
  readonly replaces: boolean;
}

function laterOf(left: BodyMeasurement, right: BodyMeasurement): BodyMeasurement {
  // The storage layer's own rule for two rows on one day: the later reading wins.
  return right.date >= left.date ? right : left;
}

/**
 * The single row this weigh-in writes. A day that already has a weigh-in is corrected in
 * that row — same id, same other measures, new kilograms — so nothing is duplicated and
 * the mean cannot count the day twice.
 */
export function planWeightWrite(input: WeightWriteInput): PlannedWeightWrite {
  const existing = input.sameDay
    .filter((row) => row.weightKg !== null && startOfDay(row.date) === input.day)
    .reduce<BodyMeasurement | null>((best, row) => (best === null ? row : laterOf(best, row)), null);

  // Today carries the instant it was typed; a backfilled day carries the day, because
  // the hour is not something the owner told the app.
  const measuredAt = startOfDay(input.now) === input.day ? input.now : input.day;

  if (existing !== null) {
    return {
      replaces: true,
      measurement: {
        ...existing,
        // Never earlier than what the day already says: `weightSeries` keeps the later
        // reading of a day, so a corrected row must not hand the day back to a stale one.
        date: Math.max(measuredAt, existing.date),
        weightKg: input.weightKg,
        provenance: 'manual',
      },
    };
  }

  return {
    replaces: false,
    measurement: {
      id: input.newId(),
      date: measuredAt,
      weightKg: input.weightKg,
      waistCm: null,
      chestCm: null,
      armCm: null,
      thighCm: null,
      hipCm: null,
      bodyFatPercent: null,
      provenance: 'manual',
    },
  };
}

/* ------------------------------------------------------------------ the notice */
/**
 * The stored list as the screen should show it after the write: the row this weigh-in
 * wrote replaces the row with the same id, and everything else — including rows of other
 * measures on the same day — stays. No second read and no duplicate row.
 */
export function withPlannedWrite(
  measurements: readonly BodyMeasurement[],
  planned: PlannedWeightWrite,
): readonly BodyMeasurement[] {
  return [...measurements.filter((row) => row.id !== planned.measurement.id), planned.measurement];
}

/** The outcome of a save attempt, as the form renders it. */
export type WeightSaveOutcome =
  /** The draft is not a weigh-in: the sentence goes under the field named here. */
  | { readonly kind: 'invalid'; readonly field: WeightField; readonly message: string }
  /** Written. `measurements` is the list the screen should display, and `notice` is the line. */
  | {
      readonly kind: 'saved';
      readonly measurements: readonly BodyMeasurement[];
      readonly notice: string;
    }
  /** The read or the write failed; nothing was written and the draft can be retried. */
  | { readonly kind: 'failed'; readonly message: string };

/** `true` when the window already shows a weigh-in for that day: the entry corrects it. */
export function hasWeighInOn(series: WeightSeries, day: EpochMs): boolean {
  return series.weighIns.some((weighIn) => weighIn.dayStart === day);
}

/**
 * What the owner reads after the write: the value, the day, and the mean the app now
 * shows — or the honest count of what the mean still needs. The banner's title says
 * `Pesaje guardado`; this is the sentence under it.
 */
export function weightNotice(series: WeightSeries, day: EpochMs, weightKg: number): string {
  const saved = `${formatWeight(weightKg)} kg el ${formatDayMonth(day)}.`;

  if (series.meanKg === null) {
    return `${saved} La media de 7 días necesita ${String(MEAN_MIN_SAMPLES)} pesajes en la ventana: faltan ${String(
      series.samplesNeeded,
    )}.`;
  }

  return `${saved} Media de 7 días: ${formatWeight(series.meanKg)} kg con ${String(series.meanSamples)} pesajes.`;
}

/** The hint under the keypad when the day already has a weigh-in: saving corrects it. */
export function correctionHint(series: WeightSeries, day: EpochMs): string | null {
  if (!hasWeighInOn(series, day)) return null;
  return 'Ese día ya tiene un pesaje: al guardar se sustituye por el nuevo.';
}
