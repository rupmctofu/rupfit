/**
 * §7 Decision order (first match wins), including the §11.1 scenario rows that do
 * not belong to cold start, rounding or readaptation.
 *
 * Each test name states the rule it asserts. Expectations are read from the
 * specification's table, not from the implementation.
 */

import { describe, expect, it } from 'vitest';
import { recommend } from '../src/core/engine';
import {
  bodyweightExercise,
  DISCOMFORT,
  EFFORT,
  daysBefore,
  makeInput,
  makeOutcome,
  makePrescription,
  makeSets,
  NOW,
  NORMAL_PHASE,
} from './fixtures';

const topOfRange = [10, 10, 10, 10];
const inRangeButNotTop = [6, 6, 6, 6];

describe('§7 rules 2 and 3: discomfort outranks progress', () => {
  it('T-16 rule 2: a reported pain decreases one increment with discomfortReduce', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({
            weightKg: 100,
            reps: topOfRange,
            effort: EFFORT.hard,
            sets: [
              ...makeSets([10, 10, 10], { effort: EFFORT.hard }),
              { targetReps: 6, actualReps: 10, effort: EFFORT.hard, discomfort: DISCOMFORT.pain },
            ],
          }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('decrease');
    expect(recommendation.suggestedWeightKg).toBe(97.5);
    expect(recommendation.reason).toBe('discomfortReduce');
    expect(recommendation.suggestedTargetReps).toBe(6);
  });

  it('T-15 rule 3: a mild discomfort holds the weight even at the top of the range', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({
            weightKg: 100,
            reps: topOfRange,
            effort: EFFORT.hard,
            sets: [
              ...makeSets([10, 10, 10], { effort: EFFORT.hard }),
              { targetReps: 6, actualReps: 10, effort: EFFORT.hard, discomfort: DISCOMFORT.mild },
            ],
          }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.reason).toBe('discomfortHold');
    expect(recommendation.suggestedTargetReps).toBe(6);
  });

  it('§7 rule 2 outranks rule 3: pain wins when a session reports both', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({
            weightKg: 100,
            reps: topOfRange,
            effort: EFFORT.hard,
            sets: [
              { targetReps: 6, actualReps: 10, effort: EFFORT.hard, discomfort: DISCOMFORT.pain },
              { targetReps: 6, actualReps: 10, effort: EFFORT.hard, discomfort: DISCOMFORT.mild },
            ],
          }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('decrease');
    expect(recommendation.reason).toBe('discomfortReduce');
  });

  it('§7 discomfort outranks a readaptation block decision', () => {
    const recommendation = recommend(
      makeInput({
        phase: { kind: 'readaptation', week: 3 },
        phaseState: { block: 1, passedBlocks: 0 },
        history: [
          makeOutcome({
            weightKg: 100,
            reps: topOfRange,
            effort: EFFORT.correct,
            sets: [
              { targetReps: 6, actualReps: 10, effort: EFFORT.correct, discomfort: DISCOMFORT.pain },
            ],
          }),
        ],
      }),
      NOW,
    );

    expect(recommendation.reason).toBe('discomfortReduce');
  });

  it('T-17 rule 2: pain at the floor weight cannot go lower than one increment', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({
            weightKg: 2.5,
            reps: topOfRange,
            effort: EFFORT.hard,
            sets: [{ targetReps: 6, actualReps: 10, effort: EFFORT.hard, discomfort: DISCOMFORT.pain }],
          }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('decrease');
    expect(recommendation.suggestedWeightKg).toBe(2.5);
    expect(recommendation.reason).toBe('discomfortReduce');
  });
});

describe('§7 rules 4 and 5: missed reps', () => {
  it('T-10 rule 5: one rep below the bottom the first time holds at the bottom target', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: [6, 6, 6, 4] })] }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });

  it('T-11 rule 4: a second consecutive miss at the same weight decreases one increment', () => {
    const recommendation = recommend(
      makeInput({
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

  it('§7 anyMild and anyPain read the newest session only: an older discomfort does not freeze progress', () => {
    // A symptom from a previous session is history, not a current symptom; freezing
    // the load forever would punish a user who recovered.
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 100, reps: inRangeButNotTop, discomfort: DISCOMFORT.pain }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.reason).toBe('topOfRangeReached');
  });

  it('§7 and §2 an answered "no discomfort" is not a symptom', () => {
    const recommendation = recommend(
      makeInput({
        history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard, discomfort: DISCOMFORT.none })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
  });

  it('§7 rule 4 counts only consecutive most-recent outcomes at the same weight', () => {
    // Three misses in a row, but the middle one is at another weight: the counter
    // stops at the weight change, so rule 4 does not fire.
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 97.5, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });

  it('T-12 rule 4 counter resets on a weight change: hold at 97.5 kg', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 97.5, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 4] }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(97.5);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });

  it('T-13 a third consecutive miss moves exactly one further increment (95.0)', () => {
    // History after T-11's decrease: two misses at 97.5 kg, preceded by the two at 100 kg.
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 97.5, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 97.5, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 4] }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('decrease');
    expect(recommendation.suggestedWeightKg).toBe(95);
    expect(recommendation.reason).toBe('belowRangeRepeated');
  });

  it('§7 rule 4 needs two misses in a row: an in-range session resets the counter', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 6] }),
          makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5] }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });

  it('§7 rule 5 outranks rule 6: a missed rep in readaptation is a missed-rep hold', () => {
    const recommendation = recommend(
      makeInput({
        phase: { kind: 'readaptation', week: 4 },
        phaseState: { block: 1, passedBlocks: 0 },
        history: [makeOutcome({ weightKg: 100, reps: [6, 6, 6, 4], effort: EFFORT.easy, date: daysBefore(2) })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });

  it('T-30 rule 5 fires before effort matters: unanswered effort below range holds', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: [5, 5, 5, 5], effort: null })] }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });

  it('§7 rule 5 outranks rule 7: missed reps beat a lowered weight', () => {
    // The user lowered the weight and still missed reps: it is a missed-reps case,
    // and the lowered weight is already the baseline.
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: [6, 6, 6, 3], recommendedWeightKg: 102.5 }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });
});

describe('§7 rule 7: a lowered weight is consolidated', () => {
  it('T-18 rule 7: a user-lowered weight holds before any increase', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard, recommendedWeightKg: 102.5 }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.reason).toBe('userLoweredLastTime');
    expect(recommendation.suggestedTargetReps).toBe(6);
  });

  it('T-19 the session after a consolidated weight progresses from that weight', () => {
    // The newest session is at 100 kg with no lower-than-recommended evidence, so the
    // top-of-range rule applies and 100 kg becomes the baseline for +2.5 kg.
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard, recommendedWeightKg: 100 }),
          makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard, recommendedWeightKg: 102.5 }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
  });

  it('§7 lastWasLowered needs a recorded recommendation to compare against', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.reason).toBe('topOfRangeReached');
  });
});

describe('§7 rules 8 and 9: top of the rep range', () => {
  it('T-04 rule 8: all sets at the top with hard effort increases one increment', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.suggestedSets).toBe(4);
    expect(recommendation.reason).toBe('topOfRangeReached');
  });

  it('§7 rule 8 accepts failure effort (effort at or harder than hard)', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.failure })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.reason).toBe('topOfRangeReached');
  });

  it('T-06 rule 9: all sets at the top with easy effort increases with the uncertain reason', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.easy })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('topOfRangeReachedEffortUnknown');
  });

  it('T-07 rule 9: unanswered effort at the top still increases, with reduced confidence', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: null })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.reason).toBe('topOfRangeReachedEffortUnknown');
    expect(recommendation.confidence.level).toBe('low');
  });

  it('T-05 rule 9: correct effort fills neither rule 8 nor an easy answer, and still increases', () => {
    // Rule 8 needs hardestEffort <= hard (1 RIR); `correct` is 2 RIR. Rule 9's literal
    // condition is `allAtTop`, so the increase stands with the unresolved-effort reason.
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.correct })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('topOfRangeReachedEffortUnknown');
  });

  it('§7 allAtTop requires every confirmed set at or above the top', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: [10, 10, 10, 9], effort: EFFORT.hard })] }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.reason).toBe('addRepetition');
  });

  it('§7 hardestEffort uses the fewest RIR among answered sets, ignoring unanswered ones', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({
            weightKg: 100,
            sets: [
              { targetReps: 6, actualReps: 10, effort: null, discomfort: null },
              { targetReps: 6, actualReps: 10, effort: EFFORT.hard, discomfort: null },
              { targetReps: 6, actualReps: 10, effort: EFFORT.easy, discomfort: null },
            ],
          }),
        ],
      }),
      NOW,
    );

    expect(recommendation.reason).toBe('topOfRangeReached');
  });
});

describe('§7 rule 10: in range but not at the top', () => {
  it('T-08 rule 10: a session inside the range adds one repetition', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: inRangeButNotTop })] }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.suggestedTargetReps).toBe(7);
    expect(recommendation.reason).toBe('addRepetition');
  });

  it('T-09 rule 10: mixed reps target min(maxActual + 1, top)', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: [8, 8, 7, 6] })] }),
      NOW,
    );

    expect(recommendation.suggestedTargetReps).toBe(9);
    expect(recommendation.reason).toBe('addRepetition');
  });

  it('§7 rule 10 caps the rep target at the top of the range', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: [10, 10, 10, 6] })] }),
      NOW,
    );

    expect(recommendation.suggestedTargetReps).toBe(10);
    expect(recommendation.action).toBe('hold');
  });

  it('T-20 a raise above the suggestion is kept, with the next rep target', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 105, reps: [6, 6, 6, 6], effort: EFFORT.hard, recommendedWeightKg: 100 }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(105);
    expect(recommendation.suggestedTargetReps).toBe(7);
    expect(recommendation.reason).toBe('addRepetition');
  });
});

describe('§6 bodyweight: increments at zero', () => {
  it('T-21 bodyweight at the top of the range holds and proposes a harder variation', () => {
    const recommendation = recommend(
      makeInput({
        exercise: bodyweightExercise(),
        prescription: makePrescription({ bottom: 12, top: 15 }),
        history: [makeOutcome({ weightKg: 0, reps: [15, 15, 15, 15], effort: EFFORT.hard })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(0);
    expect(recommendation.reason).toBe('bodyweightTopOfRange');
  });

  it('T-22 bodyweight inside the range adds a repetition', () => {
    const recommendation = recommend(
      makeInput({
        exercise: bodyweightExercise(),
        prescription: makePrescription({ bottom: 8, top: 12 }),
        history: [makeOutcome({ weightKg: 0, reps: [10, 10, 10] })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(0);
    expect(recommendation.suggestedTargetReps).toBe(11);
    expect(recommendation.reason).toBe('addRepetition');
  });

  it('T-23 bodyweight below the range holds the bottom target with no weight arithmetic', () => {
    const recommendation = recommend(
      makeInput({
        exercise: bodyweightExercise(),
        history: [makeOutcome({ weightKg: 0, reps: [5, 5, 5] })],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(0);
    expect(recommendation.suggestedTargetReps).toBe(6);
    expect(recommendation.reason).toBe('belowRangeFirstTime');
  });
});

describe('§2 and §11.1: what counts as evidence', () => {
  it('T-24 an abandoned session (zero confirmed sets) is ignored', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          { date: NOW, weightKg: 100, recommendedWeightKg: null, sets: [] },
          makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.basedOnSessions).toBe(1);
    expect(recommendation.confidence.sessionsConsidered).toBe(1);
  });

  it('T-25 a partial session with one confirmed set is evaluated on that set', () => {
    const recommendation = recommend(
      makeInput({ history: [makeOutcome({ weightKg: 100, reps: [10], effort: EFFORT.hard })] }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.reason).toBe('topOfRangeReached');
  });

  it('§7 last is history[0], the newest outcome', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 110, reps: inRangeButNotTop }),
          makeOutcome({ weightKg: 100, reps: topOfRange, effort: EFFORT.hard }),
          makeOutcome({ weightKg: 90, reps: topOfRange, effort: EFFORT.hard }),
        ],
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(110);
    expect(recommendation.suggestedTargetReps).toBe(7);
  });

  it('§3 the recommendation reports how many sessions it is based on', () => {
    const recommendation = recommend(
      makeInput({
        history: [
          makeOutcome({ weightKg: 100, reps: inRangeButNotTop }),
          makeOutcome({ weightKg: 100, reps: inRangeButNotTop }),
          makeOutcome({ weightKg: 100, reps: inRangeButNotTop }),
        ],
      }),
      NOW,
    );

    expect(recommendation.basedOnSessions).toBe(3);
    expect(recommendation.confidence.sessionsConsidered).toBe(3);
  });

  it('§7 the normal phase prescribes the plan sets, not a new volume', () => {
    const recommendation = recommend(
      makeInput({
        phase: NORMAL_PHASE,
        prescription: makePrescription({ sets: 5 }),
        history: [makeOutcome({ weightKg: 100, reps: inRangeButNotTop })],
      }),
      NOW,
    );

    expect(recommendation.suggestedSets).toBe(5);
  });
});
