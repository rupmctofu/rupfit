/**
 * Recording a body weight, pinned (FR-12.1, FR-12.2, I-3, I-10, data-model §8).
 *
 * Three rules decide this file, and each one is a way the app could lie:
 *
 * 1. **Kilograms only, to the increment the app stores** — a weight is a number, never a
 *    unit, and a typo of one decimal place is refused instead of rounded.
 * 2. **One row per day.** Recording a second weigh-in on the same day corrects the day;
 *    it never adds a sample the 7-day mean could count twice.
 * 3. **The mean keeps its honest gap.** Below three samples in the window there is no
 *    mean and no line, no matter who typed what.
 */

import { describe, expect, it } from 'vitest';
import type { BodyMeasurement } from '../../storage';
import { addDays, MEAN_MIN_SAMPLES, startOfDay, weightSeries } from './aggregates';
import {
  checkWeightDraft,
  dayStartOfIso,
  hasWeighInOn,
  isoDayOf,
  parseWeightKg,
  planWeightWrite,
  WEIGHT_KG_BOUNDS,
  WEIGHT_KG_INCREMENT,
  weightNotice,
  withPlannedWrite,
} from './weightEntry';

/** Wednesday 6 November 2024, 18:40 local. */
const NOW = new Date(2024, 10, 6, 18, 40, 0, 0).getTime();
const TODAY = startOfDay(NOW);

let ids = 0;
function newId(): string {
  ids += 1;
  return `measurement-${String(ids)}`;
}

function measurement(date: number, weightKg: number | null, overrides: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return {
    id: `stored-${String(date)}-${String(weightKg)}`,
    date,
    weightKg,
    waistCm: null,
    chestCm: null,
    armCm: null,
    thighCm: null,
    hipCm: null,
    bodyFatPercent: null,
    provenance: 'manual',
    ...overrides,
  };
}

describe('the weight the domain stores', () => {
  it('is kilograms, in steps of a tenth', () => {
    expect(WEIGHT_KG_INCREMENT).toBe(0.1);
    expect(WEIGHT_KG_BOUNDS).toEqual({ min: 20, max: 300 });
  });

  it('reads the Spanish comma and a bare number', () => {
    expect(parseWeightKg('78,4')).toEqual({ ok: true, value: 78.4 });
    expect(parseWeightKg('78.4')).toEqual({ ok: true, value: 78.4 });
    expect(parseWeightKg(' 78 ')).toEqual({ ok: true, value: 78 });
    expect(parseWeightKg('78,')).toEqual({ ok: true, value: 78 });
  });

  it('refuses what is not a weight, by name', () => {
    const refusals = (text: string): string | null => {
      const parsed = parseWeightKg(text);
      return parsed.ok ? null : parsed.refusal;
    };

    expect(refusals('')).toBe('weightEmpty');
    expect(refusals('   ')).toBe('weightEmpty');
    expect(refusals('setenta')).toBe('weightUnreadable');
    expect(refusals('78,4,1')).toBe('weightUnreadable');
    expect(refusals('-78')).toBe('weightUnreadable');
    // Two decimals are finer than the app stores, so the value is refused, not rounded.
    expect(refusals('78,45')).toBe('weightPrecision');
    expect(refusals('0')).toBe('weightOutOfRange');
    expect(refusals('12')).toBe('weightOutOfRange');
    expect(refusals('784')).toBe('weightOutOfRange');
  });
});

describe('the day a weigh-in belongs to', () => {
  it('defaults to today and can be backfilled', () => {
    expect(isoDayOf(NOW)).toBe('2024-11-06');
    expect(dayStartOfIso('2024-11-06')).toBe(TODAY);
    expect(dayStartOfIso('2024-10-27')).toBe(addDays(TODAY, -10));
  });

  it('refuses a day that has not happened and a date that does not exist', () => {
    const future = checkWeightDraft({ day: '2024-11-07', weightText: '78,4' }, NOW);
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.refusal).toBe('dayFuture');

    for (const day of ['', '2024-2-3', '2024-02-31', 'ayer', '2024-13-01']) {
      const malformed = checkWeightDraft({ day, weightText: '78,4' }, NOW);
      expect(malformed.ok).toBe(false);
      if (!malformed.ok) expect(malformed.refusal).toBe('dayMalformed');
    }
  });

  it('accepts today and any past day with a weight in range', () => {
    const today = checkWeightDraft({ day: '2024-11-06', weightText: '78,4' }, NOW);
    expect(today).toEqual({ ok: true, day: TODAY, dayIso: '2024-11-06', weightKg: 78.4 });

    const backfilled = checkWeightDraft({ day: '2024-10-30', weightText: '79' }, NOW);
    expect(backfilled.ok).toBe(true);
    if (backfilled.ok) expect(backfilled.day).toBe(addDays(TODAY, -7));
  });

  it('reports which field the owner has to fix', () => {
    const weight = checkWeightDraft({ day: '2024-11-06', weightText: '78,45' }, NOW);
    expect(weight.ok).toBe(false);
    if (!weight.ok) expect(weight.field).toBe('weight');

    const day = checkWeightDraft({ day: '2024-11-07', weightText: '78,4' }, NOW);
    expect(day.ok).toBe(false);
    if (!day.ok) expect(day.field).toBe('day');
  });
});

describe('the row a weigh-in writes', () => {
  it('writes one manual row on today, at the instant it was recorded', () => {
    const planned = planWeightWrite({ now: NOW, day: TODAY, weightKg: 78.4, sameDay: [], newId });

    expect(planned.replaces).toBe(false);
    expect(planned.measurement).toEqual({
      id: planned.measurement.id,
      date: NOW,
      weightKg: 78.4,
      waistCm: null,
      chestCm: null,
      armCm: null,
      thighCm: null,
      hipCm: null,
      bodyFatPercent: null,
      provenance: 'manual',
    });
  });

  it('dates a backfilled day at the day itself, because the hour is unknowable', () => {
    const day = addDays(TODAY, -7);
    const planned = planWeightWrite({ now: NOW, day, weightKg: 79, sameDay: [], newId });

    expect(planned.measurement.date).toBe(day);
    expect(planned.measurement.provenance).toBe('manual');
  });

  it('corrects the day instead of adding a second row for it', () => {
    const existing = measurement(TODAY, 78.9, {
      id: 'stored-today',
      date: new Date(2024, 10, 6, 7, 30).getTime(),
      waistCm: 84,
      provenance: 'imported',
    });

    const planned = planWeightWrite({
      now: NOW,
      day: TODAY,
      weightKg: 78.4,
      sameDay: [existing],
      newId,
    });

    expect(planned.replaces).toBe(true);
    expect(planned.measurement.id).toBe(existing.id);
    expect(planned.measurement.weightKg).toBe(78.4);
    // The row is the owner's typing now, and the measures it already carried stay (I-10).
    expect(planned.measurement.provenance).toBe('manual');
    expect(planned.measurement.waistCm).toBe(84);
    // One weigh-in for the day, and the series agrees.
    const series = weightSeries([planned.measurement], NOW);
    expect(series.weighIns).toHaveLength(1);
    expect(series.points.map((point) => point.weightKg)).toEqual([78.4]);
  });

  it('never moves a corrected weigh-in back in time', () => {
    // A backfilled day is dated at midnight, so a row already stored that day at 08:00
    // would otherwise win `weightSeries`, which keeps the later reading of the day.
    const backfillDay = addDays(TODAY, -3);
    const existing = measurement(backfillDay, 79.2, {
      id: 'stored-backfill',
      date: backfillDay + 8 * 60 * 60 * 1000,
    });

    const planned = planWeightWrite({
      now: NOW,
      day: backfillDay,
      weightKg: 78.7,
      sameDay: [existing],
      newId,
    });

    expect(planned.measurement.date).toBe(existing.date);
    const series = weightSeries([planned.measurement], NOW);
    expect(series.points.map((point) => point.weightKg)).toEqual([78.7]);
  });

  it('picks the later of two rows already stored for the same day', () => {
    const early = measurement(TODAY, 79.1, { id: 'early', date: new Date(2024, 10, 6, 7, 0).getTime() });
    const late = measurement(TODAY, 78.8, { id: 'late', date: new Date(2024, 10, 6, 9, 0).getTime() });

    const planned = planWeightWrite({
      now: NOW,
      day: TODAY,
      weightKg: 78.4,
      sameDay: [late, early],
      newId,
    });

    expect(planned.measurement.id).toBe('late');
  });
});

describe('the effect on the 7-day mean', () => {
  it('counts the new weigh-in and moves the mean once there are three samples', () => {
    const stored = [measurement(addDays(TODAY, -2), 79), measurement(addDays(TODAY, -1), 78.6)];
    const planned = planWeightWrite({ now: NOW, day: TODAY, weightKg: 78.4, sameDay: [], newId });

    const series = weightSeries([...stored, planned.measurement], NOW);
    expect(series.meanSamples).toBe(MEAN_MIN_SAMPLES);
    expect(series.meanKg).toBeCloseTo((79 + 78.6 + 78.4) / 3, 10);
    expect(series.samplesNeeded).toBe(0);
  });

  it('keeps the honest gap: fewer than three samples is no mean and no line', () => {
    const planned = planWeightWrite({ now: NOW, day: TODAY, weightKg: 78.4, sameDay: [], newId });
    const series = weightSeries([planned.measurement], NOW);

    expect(series.meanKg).toBeNull();
    expect(series.meanSamples).toBe(1);
    expect(series.samplesNeeded).toBe(MEAN_MIN_SAMPLES - 1);
    expect(weightNotice(series, TODAY, 78.4)).toBe(
      '78,4 kg el 6 nov. La media de 7 días necesita 3 pesajes en la ventana: faltan 2.',
    );
  });

  it('says the new mean in the confirmation, and finds the day it just wrote', () => {
    const stored = [measurement(addDays(TODAY, -2), 79), measurement(addDays(TODAY, -1), 78.6)];
    const planned = planWeightWrite({ now: NOW, day: TODAY, weightKg: 78.4, sameDay: [], newId });
    const series = weightSeries([...stored, planned.measurement], NOW);

    expect(weightNotice(series, TODAY, 78.4)).toBe(
      '78,4 kg el 6 nov. Media de 7 días: 78,67 kg con 3 pesajes.',
    );
    expect(hasWeighInOn(series, TODAY)).toBe(true);
    expect(hasWeighInOn(series, addDays(TODAY, -5))).toBe(false);
  });
});

describe('what the screen shows after the write', () => {
  it('merges the row into the stored list, so the day holds one weigh-in', () => {
    const stored = [
      measurement(addDays(TODAY, -1), 78.6),
      measurement(TODAY, 78.9, { id: 'stored-today', date: new Date(2024, 10, 6, 7, 30).getTime() }),
      measurement(addDays(TODAY, -1), null, { waistCm: 84 }),
    ];
    const planned = planWeightWrite({
      now: NOW,
      day: TODAY,
      weightKg: 78.4,
      sameDay: [stored[1] as BodyMeasurement],
      newId,
    });

    const after = withPlannedWrite(stored, planned);
    expect(after.filter((row) => row.id === 'stored-today')).toHaveLength(1);
    expect(after.find((row) => row.id === 'stored-today')?.weightKg).toBe(78.4);
    // Rows of another day stay: this replaces the day it was asked about.
    expect(after).toHaveLength(stored.length);
    expect(weightSeries(after, NOW).points.map((point) => point.weightKg)).toEqual([78.6, 78.4]);
  });

  it('adds the new row to the list it was given, without dropping anything', () => {
    const stored = [measurement(addDays(TODAY, -1), 78.6)];
    const planned = planWeightWrite({ now: NOW, day: TODAY, weightKg: 78.4, sameDay: [], newId });

    const after = withPlannedWrite(stored, planned);
    expect(after).toHaveLength(2);
    expect(after.at(-1)?.weightKg).toBe(78.4);
    expect(weightSeries(after, NOW).meanKg).toBeNull();
  });
});
