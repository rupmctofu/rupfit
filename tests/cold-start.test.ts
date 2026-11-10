/**
 * §5 Cold start (no usable history) and rows T-01..T-03 of the §11.1 scenario table.
 *
 * Every expectation below is copied from docs/progression-engine.md, not from the
 * current implementation.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, recommend } from '../src/core/engine';
import { barbellExercise, bodyweightExercise, calibration, makeInput, NOW } from './fixtures';

describe('§5 cold start: no usable history', () => {
  it('T-01 no history and no calibration suggests no weight and asks for a 15-rep weight', () => {
    // §7 rule 1 → §5 case 2, with the 15-rep instruction carried by the reason line.
    const recommendation = recommend(makeInput(), NOW);

    expect(recommendation.action).toBe('insufficientData');
    expect(recommendation.reason).toBe('insufficientData');
    expect(recommendation.suggestedWeightKg).toBeNull();
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.confidence.level).toBe('low');
  });

  it('T-02 calibration 100 kg × 5 estimates 70 % and starts there', () => {
    // §5 case 1: estimate = knownWorkingWeightKg × 0.70, rounded down to the increment.
    const recommendation = recommend(makeInput({ coldStart: calibration(100, 5) }), NOW);

    expect(recommendation.suggestedWeightKg).toBe(70);
    expect(recommendation.action).toBe('startFirstTime');
    expect(recommendation.reason).toBe('coldStartFromCalibration');
    expect(recommendation.suggestedTargetReps).toBe(6);
  });

  it('T-03 calibration 101 kg × 5 rounds the estimate down to the increment (70.0)', () => {
    // 101 × 0.7 = 70.7 → roundDownToIncrement(70.7, 2.5) = 70.
    const recommendation = recommend(makeInput({ coldStart: calibration(101, 5) }), NOW);

    expect(recommendation.suggestedWeightKg).toBe(70);
  });

  it('§5 the 30 % discount is applied before rounding at other increments', () => {
    // 80 kg × 0.7 = 56 → roundDownToIncrement(56, 5) = 55.
    const recommendation = recommend(
      makeInput({
        exercise: barbellExercise({ loadIncrementKg: 5 }),
        coldStart: calibration(80, 8),
      }),
      NOW,
    );

    expect(recommendation.suggestedWeightKg).toBe(55);
  });

  it('§5 confidence is always low with basedOnSessions 0 in the cold-start branch', () => {
    const withoutCalibration = recommend(makeInput(), NOW);
    const withCalibration = recommend(makeInput({ coldStart: calibration(100, 5) }), NOW);

    for (const recommendation of [withoutCalibration, withCalibration]) {
      expect(recommendation.confidence.level).toBe('low');
      expect(recommendation.confidence.sessionsConsidered).toBe(0);
      expect(recommendation.basedOnSessions).toBe(0);
    }
  });

  it('§5 the cold-start target rep count is the bottom of the prescription range', () => {
    const recommendation = recommend(
      makeInput({
        prescription: makeInput().prescription,
        coldStart: calibration(100, 5),
      }),
      NOW,
    );

    expect(recommendation.suggestedTargetReps).toBe(6);
  });

  it('§5 an empty history with zero confirmed sets only counts as no history', () => {
    // §2: outcomes with no confirmed sets are not evidence, so this is still a cold start.
    const recommendation = recommend(
      makeInput({ history: [{ date: NOW, weightKg: 100, recommendedWeightKg: null, sets: [] }] }),
      NOW,
    );

    expect(recommendation.action).toBe('insufficientData');
    expect(recommendation.suggestedWeightKg).toBeNull();
  });

  it('§5 a half calibration (weight without reps) cannot produce an estimate', () => {
    // §5 requires both the reference weight and its rep count; a lone weight is not
    // enough evidence, so the honest answer is the no-calibration branch.
    const recommendation = recommend(
      makeInput({ coldStart: { knownWorkingWeightKg: 100, knownReps: null } }),
      NOW,
    );

    expect(recommendation.suggestedWeightKg).toBeNull();
    expect(recommendation.action).toBe('insufficientData');
    expect(recommendation.reason).toBe('insufficientData');
  });

  it('§6 cold start on bodyweight performs no weight arithmetic', () => {
    // increment 0 means bodyweight: progression is repetitions only, so there is
    // nothing to discount to.
    const recommendation = recommend(
      makeInput({
        exercise: bodyweightExercise(),
        coldStart: calibration(0, 10),
      }),
      NOW,
    );

    expect(recommendation.suggestedWeightKg).toBe(0);
    expect(recommendation.action).toBe('startFirstTime');
    expect(recommendation.reason).toBe('coldStartFromCalibration');
  });

  it('§3 the engine copies the injected instant and never reads a clock', () => {
    const injected = new Date('2026-01-02T03:04:05.000Z');
    const recommendation = recommend(makeInput(), injected);

    expect(recommendation.computedAt.getTime()).toBe(injected.getTime());
  });

  it('§5 the 70 % estimate rounds down literally, even when that lands on zero', () => {
    // 2 kg × 0.7 = 1.4 → the nearest reachable step at or below 1.4 is 0. The
    // document states the formula without a cold-start floor; the caller is the one
    // who supplies a meaningful reference weight.
    const recommendation = recommend(makeInput({ coldStart: calibration(2, 5) }), NOW);

    expect(recommendation.suggestedWeightKg).toBe(0);
    expect(recommendation.action).toBe('startFirstTime');
  });

  it('§12 the engine reports its rules version', () => {
    expect(ENGINE_VERSION).toBe('1.2.0');
  });
});
