/**
 * §8 Readaptation policy and rows T-26..T-29 of the §11.1 scenario table.
 *
 * The block table, the four-part gate, "no increase within a block", "exactly one
 * increment between blocks and only after .pass", the 8-week cap and the exit to
 * normal rules all come from the document.
 */

import { describe, expect, it } from 'vitest';
import { blockPrescription, evaluateBlock, recommend } from '../src/core/engine';
import type { BlockDecision, BlockRole, ExerciseOutcome, Effort, Discomfort } from '../src/core/domain';
import {
  DISCOMFORT,
  EFFORT,
  daysBefore,
  makeInput,
  makeOutcome,
  makeSet,
  NOW,
  readaptationPhase,
} from './fixtures';

interface BlockSessionOptions {
  daysAgo: number;
  weightKg?: number;
  sets: number;
  reps: number;
  effort?: Effort | null;
  discomfort?: Discomfort | null;
}

function blockSession(options: BlockSessionOptions): ExerciseOutcome {
  return makeOutcome({
    weightKg: options.weightKg ?? 100,
    date: daysBefore(options.daysAgo),
    sets: Array.from({ length: options.sets }, () =>
      makeSet(options.reps, { effort: options.effort ?? null, discomfort: options.discomfort ?? null }),
    ),
  });
}

/** Two sessions in the previous rolling week and two in the current one. */
const TWO_WEEKS = [2, 5, 8, 11] as const;

function blockOnePassingHistory(weightKg = 100): ExerciseOutcome[] {
  // Block 1 primary prescription: 2 × 10 @ 4–5 RIR.
  return TWO_WEEKS.map((daysAgo) =>
    blockSession({ daysAgo, weightKg, sets: 2, reps: 10, effort: EFFORT.easy }),
  );
}

describe('§8 block prescriptions', () => {
  it('§8 reproduces the primary block table', () => {
    expect(blockPrescription(1, 'primary')).toEqual({
      sets: 2,
      repRange: { lowerBound: 10, upperBound: 10 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
    expect(blockPrescription(2, 'primary')).toEqual({
      sets: 3,
      repRange: { lowerBound: 10, upperBound: 10 },
      targetRIR: { lowerBound: 3, upperBound: 4 },
    });
    expect(blockPrescription(3, 'primary')).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
    });
    expect(blockPrescription(4, 'primary')).toEqual({
      sets: 4,
      repRange: { lowerBound: 8, upperBound: 8 },
      targetRIR: { lowerBound: 2, upperBound: 2 },
    });
  });

  it('§8 reproduces the accessory block table', () => {
    const accessory = (block: number) => blockPrescription(block, 'accessory');

    expect(accessory(1)).toEqual({
      sets: 2,
      repRange: { lowerBound: 12, upperBound: 12 },
      targetRIR: { lowerBound: 4, upperBound: 4 },
    });
    expect(accessory(2)).toEqual({
      sets: 2,
      repRange: { lowerBound: 12, upperBound: 12 },
      targetRIR: { lowerBound: 3, upperBound: 3 },
    });
    expect(accessory(3)).toEqual({
      sets: 3,
      repRange: { lowerBound: 10, upperBound: 12 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
    });
    expect(accessory(4)).toEqual({
      sets: 3,
      repRange: { lowerBound: 10, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 2 },
    });
  });

  it('§8 the primary prescription is the default role', () => {
    expect(blockPrescription(1)).toEqual(blockPrescription(1, 'primary'));
  });
});

describe('§8 gate: all four criteria across two consecutive weeks', () => {
  it('§8 a week with only one of three scheduled sessions does not pass', () => {
    // Current week: one session instead of two.
    const history = [
      blockSession({ daysAgo: 3, sets: 2, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 9, sets: 2, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 12, sets: 2, reps: 10, effort: EFFORT.easy }),
    ];

    const decision = evaluateBlock(readaptationPhase(3), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['missedSessions']);
  });

  it('§8 a prescribed set below the block bottom fails criterion 1', () => {
    // Block 1 prescribes 2 sets of 10; each session has a single completed set.
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({ daysAgo, sets: 1, reps: 10, effort: EFFORT.easy }),
    );

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['incompleteSets']);
  });

  it('§8 a set at failure fails criterion 2', () => {
    const history = blockOnePassingHistory().map((outcome, index) =>
      index === 0
        ? makeOutcome({
            weightKg: 100,
            date: outcome.date,
            sets: [makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.failure })],
          })
        : outcome,
    );

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['setAtFailure']);
  });

  it('§8 discomfort anywhere in the block fails criterion 3', () => {
    const history = blockOnePassingHistory().map((outcome, index) =>
      index === 2
        ? makeOutcome({
            weightKg: 100,
            date: outcome.date,
            sets: [makeSet(10, { effort: EFFORT.easy }), makeSet(10, { effort: EFFORT.easy, discomfort: DISCOMFORT.mild })],
          })
        : outcome,
    );

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['discomfort']);
  });

  it('§8 one week of evidence cannot pass: two consecutive weeks are required', () => {
    const history = [
      blockSession({ daysAgo: 2, sets: 2, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 5, sets: 2, reps: 10, effort: EFFORT.easy }),
    ];

    const decision = evaluateBlock(readaptationPhase(1), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['insufficientWeeks']);
  });

  it('§8 criteria are reported in the gate order and deduplicated', () => {
    // Two weeks with a missed session in each and a failure set in the newest one.
    const history = [
      blockSession({ daysAgo: 3, sets: 2, reps: 10, effort: EFFORT.failure }),
      blockSession({ daysAgo: 9, sets: 2, reps: 10, effort: EFFORT.easy }),
    ];

    const decision = evaluateBlock(readaptationPhase(4), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['setAtFailure', 'missedSessions']);
  });

  it('§8 evaluateBlock is readaptation-only', () => {
    expect(() =>
      evaluateBlock({ kind: 'normal' }, { block: 1, passedBlocks: 0 }, blockOnePassingHistory(), NOW),
    ).toThrow();
  });
});

describe('§8 decisions', () => {
  it('§8 a passing gate advances exactly one block and one increment', () => {
    const decision: BlockDecision = evaluateBlock(
      readaptationPhase(1),
      { block: 1, passedBlocks: 0 },
      blockOnePassingHistory(),
      NOW,
    );

    expect(decision.kind).toBe('pass');
    expect(decision.block).toBe(1);
    expect(decision.prescriptionBlock).toBe(2);
    expect(decision.prescription).toEqual(blockPrescription(2, 'primary'));
    expect(decision.failedCriteria).toEqual([]);
  });

  it('§8 a repeated block keeps the prescription of the last passed block (Hold row)', () => {
    const decision = evaluateBlock(
      readaptationPhase(4),
      { block: 2, passedBlocks: 1 },
      [
        blockSession({ daysAgo: 3, sets: 3, reps: 10, effort: EFFORT.easy }),
        blockSession({ daysAgo: 9, sets: 3, reps: 10, effort: EFFORT.easy }),
        blockSession({ daysAgo: 12, sets: 3, reps: 10, effort: EFFORT.easy }),
      ],
      NOW,
    );

    expect(decision.kind).toBe('repeat');
    expect(decision.prescriptionBlock).toBe(1);
    expect(decision.prescription).toEqual(blockPrescription(1, 'primary'));
  });

  it('T-29 block 4 passed ends readaptation with .advanceToNormal', () => {
    // Block 4 primary prescription: 4 × 8 @ 2 RIR, two weeks of two sessions.
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({ daysAgo, sets: 4, reps: 9, effort: EFFORT.correct }),
    );

    const decision = evaluateBlock(readaptationPhase(6), { block: 4, passedBlocks: 3 }, history, NOW);

    expect(decision.kind).toBe('advanceToNormal');
    expect(decision.prescription).toBeNull();
    expect(decision.prescriptionBlock).toBeNull();
  });

  it('§8 block 5+ is impossible: block 4 never passes to block 5', () => {
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({ daysAgo, sets: 4, reps: 8, effort: EFFORT.correct }),
    );

    const decision = evaluateBlock(readaptationPhase(8), { block: 4, passedBlocks: 3 }, history, NOW);

    expect(decision.prescriptionBlock).toBeNull();
    expect(decision.kind).toBe('advanceToNormal');
  });

  it('T-28 the 8-week cap freezes the prescription without advancing', () => {
    const history = [
      blockSession({ daysAgo: 3, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 9, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 12, sets: 3, reps: 10, effort: EFFORT.easy }),
    ];

    const decision = evaluateBlock(readaptationPhase(8), { block: 2, passedBlocks: 1 }, history, NOW);

    expect(decision.kind).toBe('capReached');
    expect(decision.prescriptionBlock).toBe(1);
    expect(decision.prescription).toEqual(blockPrescription(1, 'primary'));
  });

  it('§8 passing the gate on week 8 still advances (the cap needs an unmet gate)', () => {
    const decision = evaluateBlock(readaptationPhase(8), { block: 1, passedBlocks: 0 }, blockOnePassingHistory(), NOW);

    expect(decision.kind).toBe('pass');
  });

  it('§8 a week counter beyond the cap still reports the cap, not a later block', () => {
    const history = [
      blockSession({ daysAgo: 3, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 9, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 12, sets: 3, reps: 10, effort: EFFORT.easy }),
    ];

    const decision = evaluateBlock(readaptationPhase(9), { block: 2, passedBlocks: 1 }, history, NOW);
    const recommendation = recommend(
      makeInput({ phase: readaptationPhase(9), phaseState: { block: 2, passedBlocks: 1 }, history }),
      NOW,
    );

    expect(decision.kind).toBe('capReached');
    expect(recommendation.reason).toBe('readaptationCapReached');
    expect(recommendation.reasonContext.weeks).toBe(8);
  });

  it('§8 block 5+ is impossible: an out-of-range block clamps to the end of readaptation', () => {
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({ daysAgo, sets: 4, reps: 9, effort: EFFORT.correct }),
    );

    const decision = evaluateBlock(readaptationPhase(7), { block: 5, passedBlocks: 4 }, history, NOW);

    expect(decision.block).toBe(4);
    expect(decision.kind).toBe('advanceToNormal');
    expect(decision.prescription).toBeNull();
  });

  it('§8 the accessory role gets its own block prescription', () => {
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({ daysAgo, sets: 2, reps: 12, effort: EFFORT.easy }),
    );
    const role: BlockRole = 'accessory';

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0, role }, history, NOW);

    expect(decision.kind).toBe('pass');
    expect(decision.prescription).toEqual(blockPrescription(2, 'accessory'));
  });
});

describe('§7 rule 6: readaptation inside the recommendation', () => {
  it('T-26 a passed block 1 increases exactly one increment and adopts block 2 volume', () => {
    // §8: one increment between blocks, only after .pass; see the corrected T-26 row in §11.1.
    const recommendation = recommend(
      makeInput({
        phase: readaptationPhase(1),
        phaseState: { block: 1, passedBlocks: 0 },
        history: blockOnePassingHistory(),
      }),
      NOW,
    );

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.suggestedSets).toBe(3);
    expect(recommendation.suggestedTargetReps).toBe(10);
    expect(recommendation.reason).toBe('readaptationBlockPassed');
    expect(recommendation.reasonContext.week).toBe(1);
    expect(recommendation.reasonContext.next).toBe(102.5);
  });

  it('T-27 an unmet block 2 repeats with the last passed block volume and the same weight', () => {
    const history = [
      blockSession({ daysAgo: 3, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 9, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 12, sets: 3, reps: 10, effort: EFFORT.easy }),
    ];

    const recommendation = recommend(
      makeInput({
        phase: readaptationPhase(3),
        phaseState: { block: 2, passedBlocks: 1 },
        history,
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.suggestedSets).toBe(2);
    expect(recommendation.suggestedTargetReps).toBe(10);
    expect(recommendation.reason).toBe('readaptationBlockNotPassed');
    expect(recommendation.reasonContext.failedCriteria).toEqual(['missedSessions']);
    expect(recommendation.reasonContext.week).toBe(3);
  });

  it('§8 no increase inside a block: repeating never moves the weight', () => {
    const history = [
      blockSession({ daysAgo: 3, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 9, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 12, sets: 3, reps: 10, effort: EFFORT.easy }),
    ];
    const input = makeInput({
      phase: readaptationPhase(3),
      phaseState: { block: 2, passedBlocks: 1 },
      history,
    });
    const first = recommend(input, NOW);
    const second = recommend(input, NOW);

    expect(second.suggestedWeightKg).toBe(first.suggestedWeightKg);
    expect(first.suggestedWeightKg).toBe(100);
  });

  it('T-28 the cap holds the weight and reports readaptationCapReached', () => {
    const history = [
      blockSession({ daysAgo: 3, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 9, sets: 3, reps: 10, effort: EFFORT.easy }),
      blockSession({ daysAgo: 12, sets: 3, reps: 10, effort: EFFORT.easy }),
    ];

    const recommendation = recommend(
      makeInput({
        phase: readaptationPhase(8),
        phaseState: { block: 2, passedBlocks: 1 },
        history,
      }),
      NOW,
    );

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.suggestedSets).toBe(2);
    expect(recommendation.reason).toBe('readaptationCapReached');
    expect(recommendation.reasonContext.weeks).toBe(8);
  });

  it('T-29 passing block 4 increases once and hands over to normal rules', () => {
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({ daysAgo, sets: 4, reps: 9, effort: EFFORT.correct }),
    );

    const lastReadaptationRecommendation = recommend(
      makeInput({
        phase: readaptationPhase(6),
        phaseState: { block: 4, passedBlocks: 3 },
        history,
      }),
      NOW,
    );

    expect(lastReadaptationRecommendation.action).toBe('increase');
    expect(lastReadaptationRecommendation.suggestedWeightKg).toBe(102.5);
    expect(lastReadaptationRecommendation.reason).toBe('readaptationBlockPassed');
    expect(lastReadaptationRecommendation.suggestedSets).toBe(4);

    const firstNormalRecommendation = recommend(
      makeInput({
        phase: { kind: 'normal' },
        phaseState: { block: 4, passedBlocks: 4 },
        history: [makeOutcome({ weightKg: 100, reps: [10, 10, 10, 10], effort: EFFORT.hard })],
      }),
      NOW,
    );

    expect(firstNormalRecommendation.action).toBe('increase');
    expect(firstNormalRecommendation.suggestedWeightKg).toBe(102.5);
    expect(firstNormalRecommendation.reason).toBe('topOfRangeReached');
  });

  it('§8 a readaptation miss reports the unmet criterion in the reason line', () => {
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({ daysAgo, sets: 1, reps: 10, effort: EFFORT.easy }),
    );

    const recommendation = recommend(
      makeInput({
        phase: readaptationPhase(2),
        phaseState: { block: 1, passedBlocks: 0 },
        history,
      }),
      NOW,
    );

    expect(recommendation.reason).toBe('readaptationBlockNotPassed');
    expect(recommendation.reasonContext.failedCriteria).toEqual(['incompleteSets']);
    expect(recommendation.suggestedSets).toBe(2);
    expect(recommendation.suggestedWeightKg).toBe(100);
  });
});
