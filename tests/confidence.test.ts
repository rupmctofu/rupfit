/**
 * §10 Confidence: it labels a recommendation and never changes the number.
 */

import { describe, expect, it } from 'vitest';
import { recommend } from '../src/core/engine';
import {
  DISCOMFORT,
  EFFORT,
  makeInput,
  makeOutcome,
  NOW,
} from './fixtures';

const inRange = [7, 7, 7, 7];
const topOfRange = [10, 10, 10, 10];

describe('§10 confidence levels', () => {
  it('§10 zero sessions is low confidence', () => {
    const recommendation = recommend(makeInput(), NOW);

    expect(recommendation.confidence.level).toBe('low');
    expect(recommendation.confidence.sessionsConsidered).toBe(0);
  });

  it('§10 one session is low confidence', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard })] }),
      NOW,
    );

    expect(recommendation.confidence.level).toBe('low');
    expect(recommendation.confidence.sessionsConsidered).toBe(1);
  });

  it('§10 two sessions with reported effort are medium confidence', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.correct }),
        ],
      }),
      NOW,
    );

    expect(recommendation.confidence.level).toBe('medium');
    expect(recommendation.confidence.sessionsConsidered).toBe(2);
  });

  it('§10 three sessions with consistent effort and no discomfort are high confidence', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.correct }),
        ],
      }),
      NOW,
    );

    expect(recommendation.confidence.level).toBe('high');
    expect(recommendation.confidence.sessionsConsidered).toBe(3);
  });

  it('§10 every effort unanswered is low confidence however long the history', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: inRange, effort: null }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: null }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: null }),
        ],
      }),
      NOW,
    );

    expect(recommendation.confidence.level).toBe('low');
  });

  it('§10 a reported discomfort in the newest session is low confidence', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard, discomfort: DISCOMFORT.mild }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
        ],
      }),
      NOW,
    );

    expect(recommendation.confidence.level).toBe('low');
  });

  it('§10 three sessions with an unanswered effort in the previous session are medium', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: null }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
        ],
      }),
      NOW,
    );

    expect(recommendation.confidence.level).toBe('medium');
  });

  it('§10 confidence never changes the recommended number', () => {
    const lowConfidence = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: inRange, effort: null })] }),
      NOW,
    );
    const highConfidence = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRange, effort: EFFORT.hard }),
        ],
      }),
      NOW,
    );

    expect(lowConfidence.confidence.level).toBe('low');
    expect(highConfidence.confidence.level).toBe('high');
    expect(lowConfidence.suggestedWeightKg).toBe(100);
    expect(highConfidence.suggestedWeightKg).toBe(100);
    expect(lowConfidence.suggestedTargetReps).toBe(highConfidence.suggestedTargetReps);
  });

  it('§10 a low-confidence recommendation is still produced, never withheld', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: null })] }),
      NOW,
    );

    expect(recommendation.confidence.level).toBe('low');
    expect(recommendation.suggestedWeightKg).not.toBeNull();
    expect(recommendation.action).toBe('increase');
  });
});
