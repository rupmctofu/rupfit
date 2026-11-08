/**
 * Formatting for the session screen — the numbers the design system refuses to format.
 *
 * Every component takes strings with the Spanish comma already in them (design-system
 * README, `Numeral`), so the decimal separator is decided here and nowhere else. The
 * screen never builds a number out of a string and never hands a raw `number` to a
 * component.
 */

import { DISCOMFORT, EFFORT, type Discomfort, type Effort } from '../../core/domain';
import type { ExercisePrescription } from '../../storage';

/** `92,5` — two decimals at most, trailing zeros dropped, comma as the separator. */
export function formatWeight(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  return String(rounded).replace('.', ',');
}

/** The inverse of `formatWeight`; `null` when the keypad entry is not a weight. */
export function parseWeight(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (normalised === '' || !/^\d+(\.\d+)?$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** `1.845` — session volume in whole kilograms, Spanish thousands separator. */
export function formatVolume(kg: number): string {
  // `useGrouping` is explicit: Spanish drops the separator below five digits by
  // default, and the design writes `8.280`.
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true }).format(
    Math.round(kg),
  );
}

/**
 * The reason templates of `src/core/engine/reasons.ts` interpolate a number with
 * `String(value)`, so they carry a decimal point. Spanish copy uses a comma, and the
 * screen is the layer that decides how a number is written.
 */
export function spanishDecimals(text: string): string {
  return text.replace(/(\d)\.(\d)/g, '$1,$2');
}

function pad(value: number): string {
  return String(Math.floor(value)).padStart(2, '0');
}

/** `1:45` — the rest bar's remaining time. */
export function formatRest(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/** `hace 1:12` — how long ago the rest ended. */
export function formatOverrun(ms: number): string {
  return `hace ${formatRest(ms)}`;
}

/** `Descanso, quedan 1 minuto 45 segundos` — the bar's static accessible label (§7.5). */
export function formatRestSpoken(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  const parts: string[] = [];
  if (minutes === 1) parts.push('1 minuto');
  else if (minutes > 1) parts.push(`${minutes} minutos`);
  if (seconds === 1) parts.push('1 segundo');
  else if (seconds > 1 || minutes === 0) parts.push(`${seconds} segundos`);

  return `Descanso, quedan ${parts.join(' ')}`;
}

/** `Miércoles · 18:42` — the sheet's top bar. */
export function formatWeekdayTime(now: number): string {
  const date = new Date(now);
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(date);
  const capitalised = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${capitalised} · ${time}`;
}

/* ------------------------------------------------------- effort and discomfort */

const EFFORT_WORD: Record<Effort, 'fácil' | 'correcto' | 'duro' | 'fallo'> = {
  [EFFORT.easy]: 'fácil',
  [EFFORT.correct]: 'correcto',
  [EFFORT.hard]: 'duro',
  [EFFORT.failure]: 'fallo',
};

const DISCOMFORT_WORD: Record<Discomfort, 'molestia' | 'dolor' | null> = {
  [DISCOMFORT.none]: null,
  [DISCOMFORT.mild]: 'molestia',
  [DISCOMFORT.pain]: 'dolor',
};

export type EffortChip = keyof typeof EFFORT_CHIP_BACK;
export type DiscomfortChip = 'molestia' | 'dolor';

const EFFORT_CHIP_BACK = {
  fácil: EFFORT.easy,
  correcto: EFFORT.correct,
  duro: EFFORT.hard,
  fallo: EFFORT.failure,
} as const satisfies Record<string, Effort>;

/** Stored bucket → the word the set row shows. `null` stays unanswered (I-7). */
export function formatEffort(effort: Effort | null): EffortChip | null {
  return effort === null ? null : EFFORT_WORD[effort];
}

/**
 * Stored discomfort → the word. `ninguna` is not offered as a chip (design-system §7.3
 * draws `molestia · dolor` only), so an explicit `none` renders like an unanswered set
 * and the stored value stays untouched.
 */
export function formatDiscomfort(discomfort: Discomfort | null): DiscomfortChip | null {
  return discomfort === null ? null : DISCOMFORT_WORD[discomfort];
}

export function effortFromChip(chip: EffortChip | null): Effort | null {
  return chip === null ? null : EFFORT_CHIP_BACK[chip];
}

export function discomfortFromChip(chip: DiscomfortChip | null): Discomfort | null {
  if (chip === null) return null;
  return chip === 'molestia' ? DISCOMFORT.mild : DISCOMFORT.pain;
}

/* ------------------------------------------------------------- the target line */

function formatRange(lower: number, upper: number): string {
  return lower === upper ? `${lower}` : `${lower}–${upper}`;
}

/** `Objetivo · 3 × 10 a 3–4 RIR · descanso 180 s` (the card's muted line). */
export function targetLine(prescription: ExercisePrescription): string {
  const reps = formatRange(prescription.repRange.lowerBound, prescription.repRange.upperBound);
  const rir = formatRange(prescription.targetRIR.lowerBound, prescription.targetRIR.upperBound);
  return `Objetivo · ${prescription.sets} × ${reps} a ${rir} RIR · descanso ${prescription.restSeconds} s`;
}
