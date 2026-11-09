/**
 * Presented instants: dates and weekdays in Spanish.
 *
 * Every function takes epoch milliseconds and never reads the clock: a formatter that
 * called `Date.now()` could not be tested and would make "no clock in a component" true
 * only by accident. `new Date(at)` converts the stored instant, nothing more.
 *
 * The rules below are the union of what the app tier wrote three times, checked against
 * `docs/design-system.md` §5.2 (a separator is text, decided once) and §8 (the shape each
 * screen writes).
 */

/** R7 — one locale. Spanish month and weekday names are lowercase. */
const LOCALE = 'es-ES';

/**
 * R7 — one capitaliser.
 *
 * `capitalise` is a presentation decision, applied here and nowhere else: a Spanish
 * month or weekday name is written in lower case, and a title or the first word of a
 * sentence takes one capital. Never `toLocaleUpperCase` of the whole word, except where
 * the design writes the label in capitals (R9).
 */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One instant, one shape. Nothing else in this module builds its own formatter. */
function part(at: number, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, options).format(new Date(at));
}

/**
 * R8 — the short month never carries its abbreviation dot.
 *
 * `nov`, `sept`, `oct`. The shipped ICU writes the abbreviation without a dot today, but
 * the dot is an ICU detail, not a design decision: stripping it here means every short
 * month in the app (`6 nov`, `MIÉRCOLES, 8 NOV`, the chart axis) is the same three or
 * four letters, whatever ICU version the runtime ships.
 */
function shortMonth(at: number): string {
  return part(at, { month: 'short' }).replace(/\./g, '');
}

/**
 * R9 — the weekday names, in the three shapes the design uses.
 *
 * `Lunes` for a row title, `LUN` for the three letters of the week strip, and the same
 * long name inside a date. One long name, capitalised once (R7).
 */
export function formatWeekdayName(at: number): string {
  return capitalise(part(at, { weekday: 'long' }));
}

/** `LUN`, `MIÉ` — R9 in capitals. */
export function formatWeekdayInitial(at: number): string {
  return part(at, { weekday: 'short' }).toUpperCase();
}

/** `nov` — R8 alone, for a chart axis that has no room for a day. */
export function monthAbbreviation(at: number): string {
  return shortMonth(at);
}

/** `Noviembre` — the group label of a list (R7, R8's long counterpart). */
export function formatMonthTitle(at: number): string {
  return capitalise(part(at, { month: 'long' }));
}

/**
 * R10 — the separators between date parts are part of the design, not of the locale.
 *
 * A short date writes a day and an abbreviation with a space: `6 nov`, `12 oct`. It is
 * one rule, so it is one function, whatever the screen calls it (a weigh-in row and a
 * sentence about the last backup write the same three characters).
 */
export function formatDayMonth(at: number): string {
  return `${part(at, { day: 'numeric' })} ${shortMonth(at)}`;
}

/** `Miércoles 6` — R9 and R10: the weekday, a space, the day number. No punctuation. */
export function formatWeekdayDay(at: number): string {
  return `${formatWeekdayName(at)} ${part(at, { day: 'numeric' })}`;
}

/** `Miércoles, 8 de noviembre` — R7 and R10, the line under the greeting. */
export function formatLongDate(at: number): string {
  return capitalise(part(at, { weekday: 'long', day: 'numeric', month: 'long' }));
}

/** `MIÉRCOLES, 8 NOV` — R8, R9 and R10 with the whole label in capitals. */
export function formatEyebrowDate(at: number): string {
  const text = part(at, { weekday: 'long', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return text.toUpperCase();
}

/**
 * `Semana del 6 de noviembre` — a week named by its Monday.
 *
 * R11 — the week starts on Monday. The calendar week of the app is Monday-based
 * (`(getDay() + 6) % 7`), so the subtitle names the Monday the user trains from, not the
 * Sunday a US locale would start with. The label itself is copy; the day and the month
 * are R7 and R10.
 */
export function formatWeekOf(at: number): string {
  const date = new Date(at);
  const weekday = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday).getTime();
  return `Semana del ${part(monday, { day: 'numeric' })} de ${part(monday, { month: 'long' })}`;
}

/** `Miércoles · 18:42` — R9 and R10: the weekday, a middle dot, a 24-hour clock time. */
export function formatWeekdayTime(at: number): string {
  return `${formatWeekdayName(at)} · ${part(at, { hour: '2-digit', minute: '2-digit' })}`;
}
