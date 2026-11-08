/**
 * The arithmetic of the Progreso tab, pinned (docs/data-model.md §8).
 *
 * Every formula here is a derived value: computed from stored sets and stored
 * measurements, never persisted, never invented. The tests follow the approved
 * renders — `progreso-12w` for the weekly buckets, `progreso-single` for the single
 * point, `peso-gaps` for the trailing 7-day mean that needs three weigh-ins.
 */

import { describe, expect, it } from 'vitest';
import { EFFORT } from '../../core/domain';
import type { BodyMeasurement, WorkoutSession } from '../../storage';
import {
  addDays,
  DAY_MS,
  E1RM_FORMULA_VERSION,
  estimateOneRepMax,
  hardSetCount,
  missingDayCount,
  personalRecords,
  recordsInSession,
  sessionVolume,
  startOfDay,
  startOfWeek,
  strengthSeries,
  strengthState,
  topRecord,
  weekBuckets,
  weeklyVolume,
  weightLineDecision,
  weightSeries,
} from './aggregates';
import {
  at,
  BENCH,
  exerciseSession,
  measurement,
  session,
  set,
  SQUAT,
} from './fixtures';

/** Wednesday 6 November 2024, 09:00 local — the week every fixture is drawn in. */
const NOW = at(2024, 10, 6, 9);

function squatSession(options: {
  readonly day: number;
  readonly month?: number;
  readonly weightKg: number;
  readonly reps?: number;
  readonly effort?: typeof EFFORT.correct | null;
  readonly status?: WorkoutSession['status'];
  readonly id?: string;
  readonly name?: string;
  readonly exerciseId?: string | null;
}): WorkoutSession {
  const confirmedAt = at(2024, options.month ?? 10, options.day, 18);
  return session({
    ...(options.id === undefined ? {} : { id: options.id }),
    scheduledDate: confirmedAt,
    startedAt: confirmedAt,
    endedAt: confirmedAt + 52 * 60_000,
    ...(options.status === undefined ? {} : { status: options.status }),
    exercises: [
      exerciseSession({
        exerciseId: options.exerciseId === undefined ? SQUAT.id : options.exerciseId,
        name: options.name ?? SQUAT.name,
        sets: [
          set({
            weightKg: options.weightKg,
            actualReps: options.reps ?? 6,
            effort: options.effort === undefined ? EFFORT.correct : options.effort,
            confirmedAt,
          }),
        ],
      }),
    ],
  });
}

describe('calendar windows', () => {
  it('starts the week on Monday, whatever day it is asked about', () => {
    // 6 Nov 2024 is a Wednesday; 10 Nov is a Sunday; 4 Nov is the Monday itself.
    expect(startOfWeek(NOW)).toBe(at(2024, 10, 4, 0));
    expect(startOfWeek(at(2024, 10, 10, 23))).toBe(at(2024, 10, 4, 0));
    expect(startOfWeek(at(2024, 10, 4, 0))).toBe(at(2024, 10, 4, 0));
  });

  it('returns twelve contiguous weeks, oldest first, ending with the current one', () => {
    const weeks = weekBuckets(NOW);
    expect(weeks).toHaveLength(12);
    expect(weeks[0]?.start).toBe(addDays(at(2024, 10, 4, 0), -77));
    expect(weeks[11]?.start).toBe(at(2024, 10, 4, 0));
    expect(weeks[11]?.end).toBe(addDays(at(2024, 10, 4, 0), 7));
    for (let index = 1; index < weeks.length; index += 1) {
      expect(weeks[index]?.start).toBe(weeks[index - 1]?.end);
    }
  });

  it('counts days, not milliseconds, so a daylight-saving week stays a week', () => {
    // The spring change lands inside this window: a bucket built with 7 × 86 400 000
    // ms would start at 23:00 the day before instead of local midnight.
    const spring = weekBuckets(at(2025, 3, 15, 12));
    for (const bucket of spring) {
      expect(new Date(bucket.start).getHours()).toBe(0);
      expect(new Date(bucket.start).getDay()).toBe(1);
    }
    expect(startOfDay(addDays(at(2025, 2, 30, 12), 1))).toBe(at(2025, 2, 31, 0));
  });
});

describe('session volume and hard sets', () => {
  const sets = [
    set({ weightKg: 100, actualReps: 6, effort: EFFORT.correct, confirmedAt: NOW }),
    set({ weightKg: 90, actualReps: 8, effort: EFFORT.hard, confirmedAt: NOW }),
    set({ weightKg: 0, actualReps: 12, effort: EFFORT.failure, confirmedAt: NOW }),
  ];

  it('sums weight × reps over the confirmed sets (§8)', () => {
    expect(sessionVolume(sets)).toBe(100 * 6 + 90 * 8 + 0 * 12);
  });

  it('counts hard sets as effort at 1 RIR or closer, and leaves unanswered out', () => {
    // failure = 0 RIR and hard = 1 RIR are hard sets; correct (2 RIR) is not; null is
    // unanswered (I-7) and can never be claimed as hard.
    expect(hardSetCount(sets)).toBe(2);
    expect(hardSetCount([set({ weightKg: 60, actualReps: 10, effort: EFFORT.correct, confirmedAt: NOW })])).toBe(0);
    expect(hardSetCount([set({ weightKg: 60, actualReps: 10, effort: null, confirmedAt: NOW })])).toBe(0);
  });
});

describe('e1RM', () => {
  it('uses Epley with the RIR bucket as reserved reps, formula v1 (§8)', () => {
    const estimate = estimateOneRepMax({ weightKg: 100, actualReps: 6, effort: EFFORT.correct });
    expect(estimate).toBeCloseTo(100 * (1 + 8 / 30), 6);
    expect(E1RM_FORMULA_VERSION).toBe(1);
  });

  it('is suppressed above twelve effective reps, and never guessed without effort', () => {
    expect(estimateOneRepMax({ weightKg: 100, actualReps: 11, effort: EFFORT.correct })).toBeNull();
    expect(
      estimateOneRepMax({ weightKg: 100, actualReps: 11, effort: EFFORT.hard }),
    ).toBeCloseTo(100 * (1 + 12 / 30), 6);
    expect(estimateOneRepMax({ weightKg: 100, actualReps: 5, effort: null })).toBeNull();
  });
});

describe('the strength series', () => {
  it('picks the most-trained exercise and buckets its top set by week', () => {
    const sessions = [
      squatSession({ day: 28, month: 9, weightKg: 95, reps: 6 }),
      squatSession({ day: 4, weightKg: 100, reps: 6 }),
      session({
        scheduledDate: at(2024, 10, 5),
        exercises: [
          exerciseSession({
            exerciseId: BENCH.id,
            name: BENCH.name,
            sets: [set({ weightKg: 60, actualReps: 8, confirmedAt: at(2024, 10, 5) })],
          }),
        ],
      }),
    ];

    const series = strengthSeries(sessions, { now: NOW });
    expect(series?.exerciseName).toBe(SQUAT.name);
    expect(series?.dataWeeks).toBe(2);
    expect(series?.hasGap).toBe(false);
    expect(series?.firstTopSetKg).toBe(95);
    expect(series?.lastTopSetKg).toBe(100);
    expect(series?.changeKg).toBe(5);
    expect(series?.weeks).toHaveLength(12);
    expect(series?.weeks[10]?.topSetKg).toBe(95);
    expect(series?.weeks[11]?.topSetKg).toBe(100);
    expect(series?.weeks[11]?.e1rmKg).toBeCloseTo(100 * (1 + 8 / 30), 6);
  });

  it('says gap when a week without training sits between two weeks with it', () => {
    const sessions = [
      squatSession({ day: 7, month: 9, weightKg: 87.5 }),
      // The week of 14 October is empty on purpose.
      squatSession({ day: 21, month: 9, weightKg: 92.5 }),
    ];

    const series = strengthSeries(sessions, { now: NOW });
    expect(series?.dataWeeks).toBe(2);
    expect(series?.gapWeeks).toBe(1);
    expect(series?.hasGap).toBe(true);
    expect(strengthState(series)).toBe('gap');
  });

  it('names the three states of the screen, and never draws a line for one point', () => {
    expect(strengthState(null)).toBe('empty');
    expect(strengthState(strengthSeries([], { now: NOW }))).toBe('empty');
    expect(strengthState(strengthSeries([squatSession({ day: 4, weightKg: 92.5 })], { now: NOW }))).toBe('single');
    expect(
      strengthState(
        strengthSeries(
          [squatSession({ day: 28, month: 9, weightKg: 95 }), squatSession({ day: 4, weightKg: 100 })],
          { now: NOW },
        ),
      ),
    ).toBe('trend');
  });

  it('ignores sessions without weight and sessions outside the window', () => {
    const bodyweight = session({
      scheduledDate: at(2024, 10, 5),
      exercises: [exerciseSession({ sets: [set({ weightKg: 0, actualReps: 12, confirmedAt: at(2024, 10, 5) })] })],
    });
    const old = squatSession({ day: 4, month: 1, weightKg: 80 });
    expect(strengthSeries([bodyweight], { now: NOW })).toBeNull();
    expect(strengthSeries([old], { now: NOW })).toBeNull();
  });

  it('leaves a skipped week out of the top-set values instead of bridging it', () => {
    const series = strengthSeries(
      [
        squatSession({ day: 7, month: 9, weightKg: 87.5 }),
        squatSession({ day: 21, month: 9, weightKg: 92.5 }),
        squatSession({ day: 4, weightKg: 100 }),
      ],
      { now: NOW },
    );
    expect(series?.weeks.map((week) => week.topSetKg).filter((value) => value !== null)).toEqual([87.5, 92.5, 100]);
  });
});

describe('weekly volume', () => {
  it('sums each week and reports whether two weeks exist to compare', () => {
    const oneWeek = weeklyVolume([squatSession({ day: 4, weightKg: 100, reps: 6 })], { now: NOW });
    expect(oneWeek.weeks).toHaveLength(12);
    expect(oneWeek.weeks[11]?.volumeKg).toBe(600);
    expect(oneWeek.weeksWithVolume).toBe(1);
    expect(oneWeek.lastVolumeKg).toBe(600);
    expect(oneWeek.enoughToCompare).toBe(false);

    const twoWeeks = weeklyVolume(
      [squatSession({ day: 28, month: 9, weightKg: 95 }), squatSession({ day: 4, weightKg: 100 })],
      { now: NOW },
    );
    expect(twoWeeks.weeksWithVolume).toBe(2);
    expect(twoWeeks.enoughToCompare).toBe(true);
  });

  it('reports hard sets per week and ignores sessions that never started', () => {
    const scheduled = session({ scheduledDate: at(2024, 10, 4), status: 'scheduled', startedAt: null, endedAt: null });
    const volume = weeklyVolume([scheduled, squatSession({ day: 4, weightKg: 100, reps: 6 })], { now: NOW });
    expect(volume.weeksWithVolume).toBe(1);
    expect(volume.lastHardSets).toBe(0);
  });
});

describe('personal records', () => {
  it('keeps the heaviest set per exercise and target reps, oldest date on a tie', () => {
    const sessions = [
      squatSession({ day: 21, month: 9, weightKg: 90 }),
      squatSession({ day: 28, month: 9, weightKg: 92.5 }),
      squatSession({ day: 4, weightKg: 92.5 }),
    ];
    const records = personalRecords(sessions);
    expect(records).toHaveLength(1);
    expect(records[0]?.weightKg).toBe(92.5);
    expect(records[0]?.achievedAt).toBe(at(2024, 9, 28, 18));
    expect(records[0]?.targetReps).toBe(8);
    expect(topRecord(records)?.exerciseName).toBe(SQUAT.name);
  });

  it('separates two rep targets into two records', () => {
    const eight = squatSession({ day: 4, weightKg: 100 });
    const six = session({
      scheduledDate: at(2024, 10, 4),
      exercises: [
        exerciseSession({
          sets: [set({ weightKg: 110, actualReps: 6, targetReps: 6, confirmedAt: at(2024, 10, 4) })],
        }),
      ],
    });
    const records = personalRecords([eight, six]);
    expect(records.map((record) => record.targetReps).sort()).toEqual([6, 8]);
    // The Récords row shows the heaviest mark, not the newest one.
    expect(topRecord(records)?.weightKg).toBe(110);
    expect(topRecord(records)?.targetReps).toBe(6);
  });

  it('finds the records a session set, with the mark to beat', () => {
    const first = squatSession({ day: 21, month: 9, weightKg: 90, id: 'session-a' });
    const second = squatSession({ day: 4, weightKg: 92.5, id: 'session-b' });

    const hit = recordsInSession(second, [first, second]);
    expect(hit).toHaveLength(1);
    expect(hit[0]?.weightKg).toBe(92.5);
    expect(hit[0]?.previousKg).toBe(90);

    // The first session was also a record on its day: there was nothing to beat.
    expect(recordsInSession(first, [first, second])[0]?.previousKg).toBeNull();

    const repeat = squatSession({ day: 5, weightKg: 92.5, id: 'session-c' });
    expect(recordsInSession(repeat, [first, second, repeat])).toHaveLength(0);
  });
});

describe('the body-weight series', () => {
  function weighIns(rows: readonly (readonly [number, number, number])[]): readonly BodyMeasurement[] {
    return rows.map(([month, day, weightKg]) => measurement({ date: at(2024, month, day, 7), weightKg }));
  }

  it('is empty without a single weigh-in', () => {
    const series = weightSeries([], NOW);
    expect(series.state).toBe('empty');
    expect(series.last).toBeNull();
    expect(series.points).toHaveLength(0);
    expect(weightLineDecision(series)).toBe('points');
  });

  it('draws no line for one sample, and none for two', () => {
    const single = weightSeries(weighIns([[10, 6, 78.4]]), NOW);
    expect(single.state).toBe('single');
    expect(weightLineDecision(single)).toBe('points');
    expect(single.meanSamples).toBe(1);
    expect(single.samplesNeeded).toBe(2);

    const pair = weightSeries(weighIns([[10, 5, 78.6], [10, 6, 78.4]]), NOW);
    expect(pair.state).toBe('few');
    expect(weightLineDecision(pair)).toBe('points');
  });

  it('measures the render: three samples over eight days keep the mean incomplete', () => {
    // `peso-gaps`: 30 oct, 2 nov, 6 nov. The trailing seven days hold two of them,
    // so the mean is not drawn and the card says how many are missing.
    const series = weightSeries(weighIns([[9, 30, 78.9], [10, 2, 78.9], [10, 6, 78.4]]), NOW);
    expect(series.points).toHaveLength(3);
    expect(series.state).toBe('gap');
    expect(series.contiguous).toBe(false);
    expect(series.missingDays).toBe(5);
    expect(series.meanSamples).toBe(2);
    expect(series.meanKg).toBeNull();
    expect(series.samplesNeeded).toBe(1);
    expect(series.last?.weightKg).toBe(78.4);
    expect(weightLineDecision(series)).toBe('points');
  });

  it('draws the line only when every day between the samples has one', () => {
    const series = weightSeries(weighIns([[10, 4, 79], [10, 5, 78.8], [10, 6, 78.4]]), NOW);
    expect(series.state).toBe('trend');
    expect(series.contiguous).toBe(true);
    expect(series.missingDays).toBe(0);
    expect(series.meanKg).toBeCloseTo((79 + 78.8 + 78.4) / 3, 6);
    expect(series.meanSamples).toBe(3);
    expect(series.samplesNeeded).toBe(0);
    expect(weightLineDecision(series)).toBe('line');
    expect(missingDayCount(series.points)).toBe(0);
  });

  it('keeps the last row of a day and ignores rows without a weight', () => {
    const rows = [
      measurement({ date: at(2024, 10, 6, 7), weightKg: 78.4 }),
      measurement({ date: at(2024, 10, 6, 21), weightKg: 78.2 }),
      measurement({ date: at(2024, 10, 5, 7), weightKg: null }),
    ];
    const series = weightSeries(rows, NOW);
    expect(series.points).toHaveLength(1);
    expect(series.points[0]?.weightKg).toBe(78.2);
    expect(series.weighIns[0]?.weightKg).toBe(78.2);
  });

  it('windows the chart on the last thirty days and says how stale it is', () => {
    const series = weightSeries(
      weighIns([[7, 1, 81], [10, 3, 79], [10, 4, 78.9], [10, 5, 78.8], [10, 6, 78.4]]),
      NOW,
    );
    expect(series.points).toHaveLength(4);
    expect(series.points[0]?.dayStart).toBe(at(2024, 10, 3, 0));
    expect(series.windowStart).toBe(addDays(at(2024, 10, 6, 0), -29));
    expect(series.daysSinceLast).toBe(0);

    const stale = weightSeries(weighIns([[10, 6, 78.4]]), NOW + 10 * DAY_MS);
    expect(stale.daysSinceLast).toBe(10);
  });
});
