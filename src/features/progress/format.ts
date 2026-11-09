/**
 * The numbers and dates of the Progreso tab, written the Spanish way.
 *
 * Two rules hold here, and they are the reason this file exists at all:
 *
 * 1. **Every number is a string.** Design-system components take formatted strings
 *    (design-system README, `Numeral`), so the decimal comma and the thousands dot
 *    are decided once, here. No screen builds a number out of a string.
 * 2. **The clock is never read.** A date arrives as the epoch milliseconds stored in
 *    the database; nothing below calls `Date.now()`.
 *
 * `src/features/session/format.ts` already writes weights and volumes this way, and
 * the boundary rule of `docs/architecture.md` §4 ("a feature folder may not import
 * another feature folder") is why the four functions below exist twice. The formats
 * are pinned by `format.test.ts`; the shared home for them is `src/core`, which is
 * not this task's surface.
 */

import type { Provenance, RepRange, WeightGoal } from '../../storage';

/** `92,5` — two decimals at most, trailing zeros dropped, comma as the separator. */
export function formatWeight(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  return String(rounded).replace('.', ',');
}

/** `8.280` — whole kilograms with the Spanish thousands separator (the renders write `9.120`). */
export function formatVolume(kg: number): string {
  // `useGrouping` is explicit: Spanish drops the separator below five digits by
  // default, and the design writes `8.280`.
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true }).format(
    Math.round(kg),
  );
}

/**
 * `+7,5 kg` / `−1,2 kg` — a delta is a word with its sign, never colour alone (§4).
 * The minus is U+2212, as the artboard and the gallery draw it.
 */
export function formatSignedWeight(kg: number): string {
  if (Math.round(kg * 100) === 0) return '0 kg';
  const sign = kg > 0 ? '+' : '−';
  return `${sign}${formatWeight(Math.abs(kg))} kg`;
}

/** `2 h 15 min` — a summed duration, as the Historial totals write it. */
export function formatHoursMinutes(ms: number): string {
  const minutes = durationMinutes(ms);
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${String(minutes)} min` : `${String(hours)} h ${String(minutes % 60)} min`;
}

/** `52 min` — a duration in whole minutes, as the Historial rows write it. */
export function formatDurationMinutes(ms: number): string {
  return `${durationMinutes(ms)} min`;
}

/** The number alone, for a strip cell that carries `min` as its unit. */
export function durationMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

/** `3:00` — a rest between sets, in whole minutes and seconds. */
export function formatRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes)}:${String(remainder).padStart(2, '0')}`;
}

/** `6–8` — the stored rep range, en dash, as a prescription writes it. */
export function formatRepRange(range: RepRange): string {
  return `${String(range.lowerBound)}–${String(range.upperBound)}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `6 nov` — the weigh-in date and the chart's axis label. */
export function formatDayMonth(at: number): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(at));
}

/** `6 nov 2024` — a session title where two years of history can meet, and the table's row labels. */
export function formatDayMonthYear(at: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(at));
}

/** `nov` — the strength chart's axis, thinned to three labels by `LineChart`. */
export function monthAbbreviation(at: number): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date(at)).replace('.', '');
}

/** `Noviembre` — the group label of the Historial list. */
export function formatMonthTitle(at: number): string {
  return capitalise(new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(at)));
}

/** `Miércoles 6` — the first line of a Historial row. */
export function formatWeekdayDay(at: number): string {
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(new Date(at));
  const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(new Date(at));
  return `${capitalise(weekday)} ${day}`;
}

/** The stored goal as a word; `null` stays `null` so the caller can say "sin objetivo". */
export function formatGoal(goal: WeightGoal | null): string | null {
  if (goal === null) return null;
  switch (goal) {
    case 'lose':
      return 'Perder peso';
    case 'gain':
      return 'Ganar peso';
    case 'maintain':
      return 'Mantener peso';
  }
}

/**
 * `manual` / `importado` / `estimado`. Deliberately not "Apple Health": the stored
 * value is a provenance, and naming a source the app does not have would be a claim
 * (§7, S7).
 */
export function formatProvenance(provenance: Provenance): string {
  switch (provenance) {
    case 'manual':
      return 'manual';
    case 'imported':
      return 'importado';
    case 'estimated':
      return 'estimado';
  }
}
