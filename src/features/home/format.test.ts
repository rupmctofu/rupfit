/**
 * The app tier's Spanish vocabulary for dates, durations and counts.
 *
 * `Inicio`, `Entrenar` and `Resumen` all say the same words about the same week, so
 * the words are decided once here and pinned, instead of each screen inventing its own
 * date format. Every case names a real instant: `Date` built from parts, never "now",
 * so the suite is the same on every machine and in every time zone it runs in.
 */

import { describe, expect, it } from 'vitest';
import {
  dayFocus,
  formatDayName,
  formatDuration,
  formatEstimate,
  formatExerciseCount,
  formatEyebrowDate,
  formatLongDate,
  formatSetProgress,
  formatShortDate,
  formatWeekdayInitial,
  formatWeekdayName,
  formatWeekOf,
  greeting,
} from './format';

/** Wednesday 8 November 2023, 09:00 local — the instant the artboards draw. */
const WEDNESDAY = new Date(2023, 10, 8, 9, 0, 0).getTime();
/** Monday of the same week. */
const MONDAY = new Date(2023, 10, 6, 9, 0, 0).getTime();

describe('greeting', () => {
  it('names the owner when the profile carries a name', () => {
    expect(greeting('Rup')).toBe('Hola, Rup');
  });

  it('stays a greeting when there is no name, or a blank one', () => {
    expect(greeting(null)).toBe('Hola');
    expect(greeting('   ')).toBe('Hola');
  });

  it('trims what the profile stored', () => {
    expect(greeting('  Rup  ')).toBe('Hola, Rup');
  });
});

describe('dates', () => {
  it('writes the long date under the greeting, capitalised', () => {
    expect(formatLongDate(WEDNESDAY)).toBe('Miércoles, 8 de noviembre');
  });

  it('writes the shorthand eyebrow of the summary', () => {
    expect(formatEyebrowDate(WEDNESDAY)).toBe('MIÉRCOLES, 8 NOV');
  });

  it('writes a short date in Spanish, for a sentence rather than a column', () => {
    expect(formatShortDate(WEDNESDAY)).toBe('8 nov');
    expect(formatShortDate(MONDAY)).toBe('6 nov');
  });

  it('writes the weekday of the week strip as three letters', () => {
    expect(formatWeekdayInitial(MONDAY)).toBe('LUN');
    expect(formatWeekdayInitial(WEDNESDAY)).toBe('MIÉ');
  });

  it('writes the weekday of a session in title case', () => {
    expect(formatWeekdayName(MONDAY)).toBe('Lunes');
    expect(formatWeekdayName(WEDNESDAY)).toBe('Miércoles');
  });

  it('names the week by its Monday', () => {
    expect(formatWeekOf(WEDNESDAY)).toBe('Semana del 6 de noviembre');
  });
});

describe('day names', () => {
  it('says the snapshotted name the way the artboard does', () => {
    expect(formatDayName('SENTADILLA / PIERNA')).toBe('Sentadilla / Pierna');
    expect(formatDayName('PESO MUERTO / TRACCIÓN')).toBe('Peso muerto / Tracción');
    expect(formatDayName('MOVILIDAD')).toBe('Movilidad');
  });

  it('reads the focus out of the snapshot instead of storing a second field', () => {
    expect(dayFocus('SENTADILLA / PIERNA')).toBe('Pierna');
    expect(dayFocus('PRESS BANCA / EMPUJE')).toBe('Empuje');
    expect(dayFocus('MOVILIDAD')).toBeNull();
  });
});

describe('durations', () => {
  it('writes a duration the store can prove in whole minutes', () => {
    expect(formatDuration(52 * 60_000)).toBe('52 min');
    expect(formatDuration(23 * 60_000)).toBe('23 min');
  });

  it('rounds a part minute, never up past the truth by more than half', () => {
    expect(formatDuration(52 * 60_000 + 20_000)).toBe('52 min');
    expect(formatDuration(52 * 60_000 + 40_000)).toBe('53 min');
  });

  it('never writes a negative duration', () => {
    expect(formatDuration(-5_000)).toBe('0 min');
  });

  it('marks an estimate as one', () => {
    expect(formatEstimate(55)).toBe('55 min aprox.');
  });
});

describe('counts', () => {
  it('agrees with its noun', () => {
    expect(formatExerciseCount(6)).toBe('6 ejercicios');
    expect(formatExerciseCount(1)).toBe('1 ejercicio');
    expect(formatExerciseCount(0)).toBe('sin ejercicios');
  });

  it('says what was done out of what was prescribed', () => {
    expect(formatSetProgress(14, 15)).toBe('14 de 15 series');
    expect(formatSetProgress(2, 2)).toBe('2 de 2 series');
    expect(formatSetProgress(1, 3)).toBe('1 de 3 series');
  });
});
