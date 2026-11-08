/**
 * The app tier's Spanish vocabulary: dates, durations and counts.
 *
 * `Inicio`, `Entrenar` and `Resumen` say the same words about the same week, so the
 * words live in one module instead of three. Weights and volumes are *not* here: they
 * already have an owner in `src/features/session/format.ts`, and the design system
 * takes strings with the Spanish comma already in them (design-system §5.2).
 *
 * Two rules the functions below keep:
 *
 * 1. **Never read a clock.** Every instant arrives as a parameter. A formatter that
 *    called `Date.now()` could not be tested, and §8's "no `Date.now()` in a
 *    component" would be true only by accident.
 * 2. **Say when a number is an estimate.** `formatEstimate` writes `aprox.` because
 *    the only duration the app can prove is the one between `startedAt` and `endedAt`.
 *
 * `train` and `summary` import from here: the T5 edit surface is three feature
 * folders, so the calendar words have no shared module tier to live in yet.
 */

import type { EpochMs } from '../../storage';

/** A month name is always lowercase in Spanish; only the first word is capitalised. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `Hola, Rup` when the profile knows the name, `Hola` when it does not. */
export function greeting(displayName: string | null): string {
  const name = displayName?.trim() ?? '';
  return name === '' ? 'Hola' : `Hola, ${name}`;
}

/** `Miércoles, 8 de noviembre` — the line under the greeting (design-system §8 Inicio). */
export function formatLongDate(at: EpochMs): string {
  const text = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(at));
  return capitalise(text);
}

/** `MIÉRCOLES, 8 NOV` — the eyebrow above the summary's title. */
export function formatEyebrowDate(at: EpochMs): string {
  const text = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date(at));
  return text.toUpperCase();
}

/** `6 nov` — a date written inside a sentence ("la última copia es del 6 nov"). */
export function formatShortDate(at: EpochMs): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(at));
}

/** `LUN`, `MIÉ`, `VIE` — the three letters of the week strip. */
export function formatWeekdayInitial(at: EpochMs): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(new Date(at)).toUpperCase();
}

/** `Lunes` — the weekday a session was scheduled on. */
export function formatWeekdayName(at: EpochMs): string {
  return capitalise(new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(new Date(at)));
}

/** `Semana del 6 de noviembre` — the Entrenar subtitle, named by its Monday. */
export function formatWeekOf(at: EpochMs): string {
  const date = new Date(at);
  const weekday = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday);
  const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(monday);
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(monday);
  return `Semana del ${day} de ${month}`;
}

/** `52 min` — a duration the store can prove. Negative input is a clock anomaly: `0`. */
export function formatDuration(ms: number): string {
  const minutes = ms <= 0 ? 0 : Math.round(ms / 60_000);
  return `${minutes} min`;
}

/** `55 min aprox.` — the estimate of the today card, and it says it is one. */
export function formatEstimate(minutes: number): string {
  return `${Math.max(0, Math.round(minutes))} min aprox.`;
}

/**
 * `SENTADILLA / PIERNA` → `Sentadilla / Pierna`, the way every artboard writes a day.
 * The snapshot is stored in capitals (data-model §3), so the title case is a display
 * decision, and it belongs here rather than in three screens.
 */
export function formatDayName(name: string): string {
  return name
    .split('/')
    .map((part) => {
      const trimmed = part.trim().toLowerCase();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    })
    .join(' / ');
}

/** `PESO MUERTO / TRACCIÓN` → `Tracción`: the focus is the half after the slash. */
export function dayFocus(name: string): string | null {
  const parts = name.split('/');
  if (parts.length < 2) return null;
  const focus = (parts[1] ?? '').trim().toLowerCase();
  return focus === '' ? null : focus.charAt(0).toUpperCase() + focus.slice(1);
}

/** `6 ejercicios` · `1 ejercicio` · `sin ejercicios`. */
export function formatExerciseCount(count: number): string {
  if (count <= 0) return 'sin ejercicios';
  return count === 1 ? '1 ejercicio' : `${count} ejercicios`;
}

/** `14 de 15 series` — done out of prescribed, never a bare percentage. */
export function formatSetProgress(done: number, prescribed: number): string {
  return `${done} de ${prescribed} series`;
}
