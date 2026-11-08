/**
 * §6 Increments, rounding and floors.
 *
 * The engine's produced weights must be reachable on the implement: multiples of
 * the per-exercise increment, increases rounded down, decreases rounded up, holds
 * echoing the weight the user actually used.
 */

import { describe, expect, it } from 'vitest';
import {
  isMultipleOfIncrement,
  recommend,
  roundDownToIncrement,
  roundUpToIncrement,
} from '../src/core/engine';
import {
  barbellExercise,
  dumbbellExercise,
  EFFORT,
  machineExercise,
  makeInput,
  makeOutcome,
  NOW,
} from './fixtures';

describe('§6 roundDownToIncrement', () => {
  it('§6 rounds a value down to the nearest increment, never above it', () => {
    expect(roundDownToIncrement(102.6, 2.5)).toBe(102.5);
    expect(roundDownToIncrement(100, 2.5)).toBe(100);
    expect(roundDownToIncrement(22, 2)).toBe(22);
    expect(roundDownToIncrement(61, 5)).toBe(60);
  });

  it('§6 tolerates floating-point noise inside the 1e-6 multiple tolerance', () => {
    // 100 × 0.7 is 70.00000000000001 in IEEE 754; it is 70 for our purposes.
    expect(roundDownToIncrement(100 * 0.7, 2.5)).toBe(70);
    expect(roundDownToIncrement(22.500000000000004, 2.5)).toBe(22.5);
  });

  it('§6 increment 0 is bodyweight: no weight arithmetic is performed', () => {
    expect(roundDownToIncrement(73.4, 0)).toBe(73.4);
    expect(roundUpToIncrement(73.4, 0)).toBe(73.4);
  });
});

describe('§6 roundUpToIncrement', () => {
  it('§6 rounds a value up to the nearest increment, never below it', () => {
    expect(roundUpToIncrement(98.4, 2.5)).toBe(100);
    expect(roundUpToIncrement(97.5, 2.5)).toBe(97.5);
    expect(roundUpToIncrement(9, 0.5)).toBe(9);
    expect(roundUpToIncrement(9.2, 0.5)).toBe(9.5);
  });

  it('§6 tolerates floating-point noise when rounding up', () => {
    expect(roundUpToIncrement(22.500000000000004, 2.5)).toBe(22.5);
  });
});

describe('§6 isMultipleOfIncrement', () => {
  it('§6 treats a weight as a multiple within 1e-6', () => {
    expect(isMultipleOfIncrement(102.5, 2.5)).toBe(true);
    expect(isMultipleOfIncrement(102.5000000004, 2.5)).toBe(true);
    expect(isMultipleOfIncrement(103, 2.5)).toBe(false);
    expect(isMultipleOfIncrement(101, 2.5)).toBe(false);
  });

  it('§6 bodyweight (increment 0) has no multiple to satisfy', () => {
    expect(isMultipleOfIncrement(0, 0)).toBe(true);
  });
});

describe('§6 rounding inside a recommendation', () => {
  it('§6 an increase rounds down so it never overshoots the user capability', () => {
    // Last session used a 101 kg reference (not on the 2.5 kg grid): 101 + 2.5 = 103.5,
    // rounded down to 102.5.
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 101, reps: [10, 10, 10, 10], effort: EFFORT.hard })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
  });

  it('§6 a decrease rounds up so it never cuts more than one increment', () => {
    // 101 - 2.5 = 98.5, rounded up to 100: at most one increment is removed.
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 101, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 101, reps: [5, 5, 5, 5] }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('decrease');
    expect(recommendation.suggestedWeightKg).toBe(100);
  });

  it('§6 a hold returns the weight actually used, unchanged (never "corrected")', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 101, reps: [7, 7, 7, 7] })] }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(101);
  });

  it('T-14 a decrease never goes below one increment', () => {
    // Two consecutive misses at 2.5 kg with a 2.5 kg increment: the floor is one increment.
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 2.5, reps: [4, 4, 4, 4] }),
          makeOutcome({ weightKg: 2.5, reps: [4, 4, 4, 4] }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('decrease');
    expect(recommendation.suggestedWeightKg).toBe(2.5);
    expect(recommendation.suggestedWeightKg).toBeGreaterThan(0);
  });

  it('T-31 a dumbbell rack step of 2 kg moves from 20 kg to 22 kg', () => {
    const recommendation = recommend(
      makeInput({
        exercise: dumbbellExercise(),
        history: [makeOutcome({ weightKg: 20, reps: [10, 10, 10, 10], effort: EFFORT.hard })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(22);
  });

  it('T-32 a machine stack step of 5 kg moves from 60 kg to 65 kg', () => {
    const recommendation = recommend(
      makeInput({
        exercise: machineExercise(),
        history: [makeOutcome({ weightKg: 60, reps: [10, 10, 10, 10], effort: EFFORT.hard })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(65);
  });

  it('§6 every produced weight is on the exercise increment grid, never a global 2.5 kg', () => {
    const cases = [
      { exercise: barbellExercise({ loadIncrementKg: 2.5 }), weightKg: 100 },
      { exercise: barbellExercise({ loadIncrementKg: 1.25 }), weightKg: 50 },
      { exercise: dumbbellExercise({ loadIncrementKg: 2 }), weightKg: 20 },
      { exercise: machineExercise({ loadIncrementKg: 5 }), weightKg: 60 },
    ];

    for (const { exercise, weightKg } of cases) {
      const recommendation = recommend(
        makeInput({
          exercise,
          history: [makeOutcome({ weightKg, reps: [10, 10, 10, 10], effort: EFFORT.hard })],
        }),
        NOW,
      );

      expect(recommendation.suggestedWeightKg).not.toBeNull();
      expect(isMultipleOfIncrement(recommendation.suggestedWeightKg as number, exercise.loadIncrementKg)).toBe(true);
      expect(recommendation.suggestedWeightKg).toBe(weightKg + exercise.loadIncrementKg);
    }
  });
});
