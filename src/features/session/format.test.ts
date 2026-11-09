/**
 * The session screen's formatting: every number the design system refuses to format
 * for us. The components take strings with the Spanish comma already in them, so this
 * is the only place a decimal separator is decided.
 */

import { describe, expect, it } from 'vitest';
import { DISCOMFORT, EFFORT } from '../../core/domain';
import {
  discomfortFromChip,
  effortFromChip,
  formatDiscomfort,
  formatEffort,
  formatRest,
  formatVolume,
  formatWeekdayTime,
  formatWeight,
  parseWeight,
  spanishDecimals,
  targetLine,
} from './format';
import { DEADLIFT_PRESCRIPTION, ROW_PRESCRIPTION } from './fixture';

describe('weights', () => {
  it('writes the Spanish comma and drops trailing zeros', () => {
    expect(formatWeight(92.5)).toBe('92,5');
    expect(formatWeight(90)).toBe('90');
    expect(formatWeight(87.25)).toBe('87,25');
    expect(formatWeight(0)).toBe('0');
  });

  it('rounds to the smallest reachable step, never to a long tail', () => {
    expect(formatWeight(92.499999)).toBe('92,5');
    expect(formatWeight(102.333333)).toBe('102,33');
  });

  it('parses what the keypad typed', () => {
    expect(parseWeight('92,5')).toBe(92.5);
    expect(parseWeight('90')).toBe(90);
    expect(parseWeight('')).toBeNull();
    expect(parseWeight('9,2,5')).toBeNull();
    expect(parseWeight('abc')).toBeNull();
    expect(parseWeight('-5')).toBeNull();
  });

  it('turns the reason template’s decimal point into a comma', () => {
    expect(spanishDecimals('Completaste 3 series. Subimos a 92.5 kg.')).toBe(
      'Completaste 3 series. Subimos a 92,5 kg.',
    );
    expect(spanishDecimals('Sin decimales: 90 kg.')).toBe('Sin decimales: 90 kg.');
  });
});

describe('volume', () => {
  it('groups thousands the Spanish way and keeps whole kilos', () => {
    expect(formatVolume(1845)).toBe('1.845');
    expect(formatVolume(8280)).toBe('8.280');
    expect(formatVolume(0)).toBe('0');
  });
});

describe('the session duration', () => {
  it('shows minutes and seconds', () => {
    expect(formatRest(105_000)).toBe('1:45');
    expect(formatRest(9_000)).toBe('0:09');
    expect(formatRest(0)).toBe('0:00');
    expect(formatRest(-5_000)).toBe('0:00');
  });
});

describe('the top bar', () => {
  it('writes the weekday and the time', () => {
    const wednesday = new Date(2024, 4, 15, 18, 42, 0).getTime();
    expect(formatWeekdayTime(wednesday)).toBe('Miércoles · 18:42');
  });
});

describe('the vocabulary of the set row', () => {
  it('maps the stored effort buckets to the four words', () => {
    expect(formatEffort(EFFORT.easy)).toBe('fácil');
    expect(formatEffort(EFFORT.correct)).toBe('correcto');
    expect(formatEffort(EFFORT.hard)).toBe('duro');
    expect(formatEffort(EFFORT.failure)).toBe('fallo');
    expect(formatEffort(null)).toBeNull();
  });

  it('maps discomfort, keeping unanswered unanswered (I-7)', () => {
    expect(formatDiscomfort(DISCOMFORT.mild)).toBe('molestia');
    expect(formatDiscomfort(DISCOMFORT.pain)).toBe('dolor');
    expect(formatDiscomfort(DISCOMFORT.none)).toBeNull();
    expect(formatDiscomfort(null)).toBeNull();
  });

  it('round-trips the chips back to the stored values', () => {
    expect(effortFromChip('duro')).toBe(EFFORT.hard);
    expect(effortFromChip(null)).toBeNull();
    expect(discomfortFromChip('dolor')).toBe(DISCOMFORT.pain);
    expect(discomfortFromChip(null)).toBeNull();
  });
});

describe('the target line', () => {
  it('writes the prescription the way the card shows it', () => {
    expect(targetLine(DEADLIFT_PRESCRIPTION)).toBe('Objetivo · 3 × 10 a 3–4 RIR · descanso 180 s');
  });

  it('keeps a single-value range a single value', () => {
    expect(targetLine(ROW_PRESCRIPTION)).toBe('Objetivo · 2 × 12 a 4 RIR · descanso 120 s');
  });

  it('writes a real range with an en dash', () => {
    expect(
      targetLine({ sets: 4, repRange: { lowerBound: 8, upperBound: 12 }, targetRIR: { lowerBound: 2, upperBound: 2 }, restSeconds: 90 }),
    ).toBe('Objetivo · 4 × 8–12 a 2 RIR · descanso 90 s');
  });
});
