/**
 * §9 Worked examples from the brief, reproduced literally.
 */

import { describe, expect, it } from 'vitest';
import { recommend } from '../src/core/engine';
import { EFFORT, makeInput, makeOutcome, makePrescription, NOW } from './fixtures';

describe('§9 accepting an increase', () => {
  it('§9 deadlift 4 × 6 at 100 kg with 6/6/6/6 and 1 RIR increases to 102.5 kg', () => {
    const recommendation = recommend(
      makeInput({
        prescription: makePrescription({ sets: 4, bottom: 6, top: 6 }),
        history: [makeOutcome({ weightKg: 100, reps: [6, 6, 6, 6], effort: EFFORT.hard })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.suggestedSets).toBe(4);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('topOfRangeReached');
  });
});

describe('§9 repeat after a miss', () => {
  it('§9 6/6/6/4 at 100 kg holds 100 kg for the bottom target', () => {
    const recommendation = recommend(
      makeInput({
        prescription: makePrescription({ sets: 4, bottom: 6, top: 6 }),
        history: [makeOutcome({ weightKg: 100, reps: [6, 6, 6, 4] })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });

  it('§9 the next 5/5/5/5 at 100 kg decreases to 97.5 kg', () => {
    const recommendation = recommend(
      makeInput({
        prescription: makePrescription({ sets: 4, bottom: 6, top: 6 }),
        history: [
          makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 4] }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('decrease');
    expect(recommendation.suggestedWeightKg).toBe(97.5);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('belowRangeRepeated');
  });
});

describe('§9 user overrides downward', () => {
  it('§9 a lowered weight is consolidated instead of increased', () => {
    const recommendation = recommend(
      makeInput({
        prescription: makePrescription({ sets: 4, bottom: 6, top: 6 }),
        history: [
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 6], effort: EFFORT.hard, recommendedWeightKg: 102.5 }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.reason).toBe('userLoweredLastTime');
  });

  it('§9 the next session progresses from the consolidated weight, not the suggestion', () => {
    const recommendation = recommend(
      makeInput({
        prescription: makePrescription({ sets: 4, bottom: 6, top: 6 }),
        history: [
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 6], effort: EFFORT.hard, recommendedWeightKg: 100 }),
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 6], effort: EFFORT.hard, recommendedWeightKg: 102.5 }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
  });

  it('§9 nothing records the lowered weight as a failure', () => {
    // The lowered session is at the top of the range, not below it, so the engine
    // never treats it as a missed session.
    const recommendation = recommend(
      makeInput({
        prescription: makePrescription({ sets: 4, bottom: 6, top: 6 }),
        history: [
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 6], effort: EFFORT.hard, recommendedWeightKg: 102.5 }),
        ],
      }),
      NOW,
    );

    expect(recommendation.reason).not.toBe('belowRangeFirstTime');
    expect(recommendation.reason).not.toBe('belowRangeRepeated');
  });
});
