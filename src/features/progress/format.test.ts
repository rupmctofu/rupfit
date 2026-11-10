/**
 * The numbers and dates of the Progreso tab, written the Spanish way.
 *
 * The decimal separator and the thousands separator are decided here and nowhere
 * else in this folder: every design-system component takes an already formatted
 * string (`Numeral`).
 */

import { describe, expect, it } from 'vitest';
import { at } from './fixtures';
import {
  formatDayMonth,
  formatDurationMinutes,
  formatGoal,
  formatLongDayMonth,
  formatMonthTitle,
  formatProvenance,
  formatSignedWeight,
  formatVolume,
  formatWeekdayDay,
  formatWeight,
  monthAbbreviation,
} from './format';

describe('weights and volumes', () => {
  it('writes 92,5 with a comma and drops a trailing ,0', () => {
    expect(formatWeight(92.5)).toBe('92,5');
    expect(formatWeight(100)).toBe('100');
    expect(formatWeight(78.45)).toBe('78,45');
  });

  it('groups thousands even below five digits, as the renders write 6.900', () => {
    expect(formatVolume(8280)).toBe('8.280');
    expect(formatVolume(6900)).toBe('6.900');
    expect(formatVolume(900)).toBe('900');
  });

  it('writes the delta as a word with its sign', () => {
    expect(formatSignedWeight(7.5)).toBe('+7,5 kg');
    expect(formatSignedWeight(-1.2)).toBe('−1,2 kg');
    expect(formatSignedWeight(0)).toBe('0 kg');
  });
});

describe('dates', () => {
  it('writes 6 nov, 12 oct and Noviembre', () => {
    expect(formatDayMonth(at(2024, 10, 6))).toBe('6 nov');
    expect(formatDayMonth(at(2024, 9, 12))).toBe('12 oct');
    expect(formatMonthTitle(at(2024, 10, 6))).toBe('Noviembre');
    expect(monthAbbreviation(at(2024, 8, 19))).toBe('sept');
  });

  it('writes the weekday with a capital letter, as the Historial rows do', () => {
    expect(formatWeekdayDay(at(2024, 10, 6))).toBe('Miércoles 6');
    expect(formatWeekdayDay(at(2024, 10, 4))).toBe('Lunes 4');
  });

  it('writes the day out in full, to name a session in a spoken sentence', () => {
    // «Eliminar la sesión del 9 de noviembre»: a small-cased month, no abbreviation.
    expect(formatLongDayMonth(at(2024, 10, 9))).toBe('9 de noviembre');
    expect(formatLongDayMonth(at(2024, 0, 1))).toBe('1 de enero');
  });
});

describe('the small words', () => {
  it('writes a duration in whole minutes, never 0:52:00', () => {
    expect(formatDurationMinutes(52 * 60_000)).toBe('52 min');
    expect(formatDurationMinutes(49 * 60_000)).toBe('49 min');
    expect(formatDurationMinutes(0)).toBe('0 min');
  });

  it('names the stored goal, and says nothing when there is none', () => {
    expect(formatGoal('lose')).toBe('Perder peso');
    expect(formatGoal('maintain')).toBe('Mantener peso');
    expect(formatGoal('gain')).toBe('Ganar peso');
    expect(formatGoal(null)).toBeNull();
  });

  it('names the provenance of a weigh-in without borrowing another app', () => {
    expect(formatProvenance('manual')).toBe('manual');
    expect(formatProvenance('imported')).toBe('importado');
    expect(formatProvenance('estimated')).toBe('estimado');
  });
});
