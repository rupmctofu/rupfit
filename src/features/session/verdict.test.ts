/**
 * The one-answer verdict of an exercise (S4, S8, T6).
 *
 * A verdict is not a new kind of record: it is the set list of the prescription, filled
 * in with the numbers the answer implies, so the engine and the history keep reading
 * exactly what they read after five manual confirmations (S2, S4). These tests pin the
 * numbers of the three answers, the load the sets carry, the timed slot's narrower set
 * of answers, and the refusal when there is no load to write (S3).
 */

import { describe, expect, it } from 'vitest';
import { EFFORT, repRange, type ExercisePrescription } from '../../core/domain';
import { availableVerdicts, verdictRefusal, verdictSets, type VerdictResult } from './verdict';

/** `3 × 6–8` at 2–3 RIR: a strength slot with a suggested load of 40 kg. */
const STRENGTH: ExercisePrescription = {
  sets: 3,
  repRange: repRange(6, 8),
  targetRIR: repRange(2, 3),
  restSeconds: 180,
};

/** `3 × 2 min`: the fourth day's intervals, prescribed by time instead of by load. */
const TIMED: ExercisePrescription = {
  sets: 3,
  repRange: repRange(1, 1),
  targetRIR: repRange(4, 5),
  restSeconds: 60,
  durationSeconds: 120,
};

function accepted(result: VerdictResult): readonly {
  readonly slot: number;
  readonly weightKg: number;
  readonly actualReps: number;
  readonly effort: number;
}[] {
  if (!result.ok) throw new Error(`the verdict was refused: ${result.message}`);
  return result.sets;
}

describe('lo hice', () => {
  it('writes every prescribed set at the bottom of the range, at the suggested load', () => {
    const sets = accepted(verdictSets(STRENGTH, 40, 'done'));

    expect(sets.map((set) => set.slot)).toEqual([1, 2, 3]);
    expect(sets.map((set) => set.weightKg)).toEqual([40, 40, 40]);
    expect(sets.map((set) => set.actualReps)).toEqual([6, 6, 6]);
    expect(sets.map((set) => set.effort)).toEqual([EFFORT.correct, EFFORT.correct, EFFORT.correct]);
  });
});

describe('fallé', () => {
  it('writes the prescribed sets with the last one short of the bottom, marked as failure', () => {
    const sets = accepted(verdictSets(STRENGTH, 40, 'failed'));

    expect(sets).toHaveLength(STRENGTH.sets);
    expect(sets.map((set) => set.actualReps)).toEqual([6, 6, 5]);
    // §7 reads a set below `bottom` as a miss, so the last set is the one that fails.
    expect(sets[2]?.actualReps).toBeLessThan(STRENGTH.repRange.lowerBound);
    expect(sets[2]?.effort).toBe(EFFORT.failure);
    expect(sets.slice(0, 2).map((set) => set.effort)).toEqual([EFFORT.correct, EFFORT.correct]);
    expect(sets.map((set) => set.weightKg)).toEqual([40, 40, 40]);
  });
});

describe('fui sobrado', () => {
  it('writes every set at the top of the range and marks it easy', () => {
    const sets = accepted(verdictSets(STRENGTH, 40, 'easy'));

    expect(sets.map((set) => set.actualReps)).toEqual([8, 8, 8]);
    expect(sets.every((set) => set.effort === EFFORT.easy)).toBe(true);
    expect(sets.map((set) => set.weightKg)).toEqual([40, 40, 40]);
  });
});

describe('a conditioning slot', () => {
  it('accepts only lo hice and fallé', () => {
    expect(availableVerdicts(TIMED)).toEqual(['done', 'failed']);
    expect(availableVerdicts(STRENGTH)).toEqual(['done', 'failed', 'easy']);

    const refused = verdictSets(TIMED, null, 'easy');
    expect(refused.ok).toBe(false);
  });

  it('writes the sets it prescribes when the answer is lo hice, and invents no load', () => {
    const sets = accepted(verdictSets(TIMED, null, 'done'));

    expect(sets.map((set) => set.slot)).toEqual([1, 2, 3]);
    // A timed slot has no kilos to put on the bar: the record says zero, not a guess.
    expect(sets.map((set) => set.weightKg)).toEqual([0, 0, 0]);
    expect(sets.map((set) => set.actualReps)).toEqual([1, 1, 1]);
    expect(sets.every((set) => set.effort === EFFORT.correct)).toBe(true);
  });
});

describe('without a load', () => {
  it('refuses a strength verdict instead of inventing kilos', () => {
    const refused = verdictSets(STRENGTH, null, 'done');

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.message).toContain('peso');

    expect(verdictRefusal(STRENGTH, null)).toBe(refused.message);
    expect(verdictRefusal(STRENGTH, 40)).toBeNull();
  });

  it('lifts the refusal as soon as there is a load', () => {
    expect(accepted(verdictSets(STRENGTH, 42.5, 'done')).map((set) => set.weightKg)).toEqual([
      42.5, 42.5, 42.5,
    ]);
  });
});
