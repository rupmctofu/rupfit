/**
 * §8 Readaptation policy and rows T-26..T-29 of the §11.1 scenario table.
 *
 * The block table, the four-part gate, "no increase within a block", "exactly one
 * increment between blocks and only after .pass", the 8-week cap and the exit to
 * normal rules all come from the document. The table has one column per exercise
 * profile — strength, hypertrophy, accessory and preventive — and the maths behind
 * them is identical for all four, so the gate and decision tests below declare the
 * profile their fixtures are built from.
 */

import { describe, expect, it } from 'vitest';
import { blockPrescription, evaluateBlock, recommend } from '../src/core/engine';
import { DEFAULT_BLOCK_ROLE } from '../src/core/domain';
import type {
  BlockDecision,
  BlockRole,
  Discomfort,
  Effort,
  ExerciseOutcome,
  SetOutcome,
} from '../src/core/domain';
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

/** The profile an exercise that declares nothing gets (docs/progression-engine.md §8). */
const DEFAULT_ROLE: BlockRole = 'hypertrophy';

/**
 * A session that satisfies `block`'s prescription for `role`: every prescribed set,
 * at the bottom of the rep range, at an effort that is not failure. The numbers come
 * from the table on purpose — the tests below are about the gate, and a table change
 * must never be able to make them assert the wrong thing.
 */
function prescribedSession(
  block: number,
  daysAgo: number,
  options: { weightKg?: number; role?: BlockRole } = {},
): ExerciseOutcome {
  const prescription = blockPrescription(block, options.role ?? DEFAULT_ROLE);

  return blockSession({
    daysAgo,
    ...(options.weightKg === undefined ? {} : { weightKg: options.weightKg }),
    sets: prescription.sets,
    reps: prescription.repRange.lowerBound,
    effort: EFFORT.easy,
  });
}

/** Two consecutive weeks of prescribed sessions: the gate's pass. */
function passingHistory(
  block: number,
  options: { weightKg?: number; role?: BlockRole } = {},
): ExerciseOutcome[] {
  return TWO_WEEKS.map((daysAgo) => prescribedSession(block, daysAgo, options));
}

function blockOnePassingHistory(weightKg = 100): ExerciseOutcome[] {
  return passingHistory(1, { weightKg });
}

/** The prescribed sets of a block, with the last one reported at failure. */
function setsEndingAtFailure(block: number, role: BlockRole = DEFAULT_ROLE): SetOutcome[] {
  const prescription = blockPrescription(block, role);

  return Array.from({ length: prescription.sets }, (_, index) =>
    makeSet(prescription.repRange.lowerBound, {
      effort: index === prescription.sets - 1 ? EFFORT.failure : EFFORT.easy,
    }),
  );
}

/** The prescribed sets of a block, with the last one reporting mild discomfort. */
function setsEndingWithDiscomfort(block: number, role: BlockRole = DEFAULT_ROLE): SetOutcome[] {
  const prescription = blockPrescription(block, role);

  return Array.from({ length: prescription.sets }, (_, index) =>
    makeSet(prescription.repRange.lowerBound, {
      effort: EFFORT.easy,
      discomfort: index === prescription.sets - 1 ? DISCOMFORT.mild : null,
    }),
  );
}

describe('§8 block prescriptions', () => {
  it('§8 reproduces the strength block table', () => {
    expect(blockPrescription(1, 'strength')).toEqual({
      sets: 3,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
    expect(blockPrescription(2, 'strength')).toEqual({
      sets: 3,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 3, upperBound: 4 },
    });
    expect(blockPrescription(3, 'strength')).toEqual({
      sets: 4,
      repRange: { lowerBound: 5, upperBound: 8 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
    });
    expect(blockPrescription(4, 'strength')).toEqual({
      sets: 4,
      repRange: { lowerBound: 5, upperBound: 6 },
      targetRIR: { lowerBound: 2, upperBound: 2 },
    });
  });

  it('§8 reproduces the hypertrophy block table', () => {
    expect(blockPrescription(1, 'hypertrophy')).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
    expect(blockPrescription(2, 'hypertrophy')).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 3, upperBound: 4 },
    });
    expect(blockPrescription(3, 'hypertrophy')).toEqual({
      sets: 4,
      repRange: { lowerBound: 8, upperBound: 12 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
    });
    expect(blockPrescription(4, 'hypertrophy')).toEqual({
      sets: 4,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 2 },
    });
  });

  it('§8 reproduces the accessory block table', () => {
    expect(blockPrescription(1, 'accessory')).toEqual({
      sets: 2,
      repRange: { lowerBound: 10, upperBound: 12 },
      targetRIR: { lowerBound: 4, upperBound: 4 },
    });
    expect(blockPrescription(2, 'accessory')).toEqual({
      sets: 3,
      repRange: { lowerBound: 10, upperBound: 12 },
      targetRIR: { lowerBound: 3, upperBound: 3 },
    });
    expect(blockPrescription(3, 'accessory')).toEqual({
      sets: 3,
      repRange: { lowerBound: 10, upperBound: 15 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
    });
    expect(blockPrescription(4, 'accessory')).toEqual({
      sets: 3,
      repRange: { lowerBound: 10, upperBound: 12 },
      targetRIR: { lowerBound: 2, upperBound: 2 },
    });
  });

  it('§8 reproduces the preventive block table', () => {
    expect(blockPrescription(1, 'preventive')).toEqual({
      sets: 2,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 5, upperBound: 6 },
    });
    expect(blockPrescription(2, 'preventive')).toEqual({
      sets: 2,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 5, upperBound: 5 },
    });
    expect(blockPrescription(3, 'preventive')).toEqual({
      sets: 3,
      repRange: { lowerBound: 6, upperBound: 10 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
    expect(blockPrescription(4, 'preventive')).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 3, upperBound: 4 },
    });
  });

  it('§8 the hypertrophy prescription is the default role', () => {
    expect(DEFAULT_BLOCK_ROLE).toBe('hypertrophy');
    expect(blockPrescription(1)).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
    expect(blockPrescription(4)).toEqual({
      sets: 4,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 2 },
    });
  });
});

describe('§8 gate: all four criteria across two consecutive weeks', () => {
  it('§8 a week with only one of three scheduled sessions does not pass', () => {
    // Current week: one session instead of two.
    const history = [
      prescribedSession(1, 3),
      prescribedSession(1, 9),
      prescribedSession(1, 12),
    ];

    const decision = evaluateBlock(readaptationPhase(3), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['missedSessions']);
  });

  it('§8 a prescribed set below the block bottom fails criterion 1', () => {
    // Block 1 prescribes three sets; each session has one set fewer.
    const prescription = blockPrescription(1);
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({
        daysAgo,
        sets: prescription.sets - 1,
        reps: prescription.repRange.lowerBound,
        effort: EFFORT.easy,
      }),
    );

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['incompleteSets']);
  });

  it('§8 a set at failure fails criterion 2', () => {
    const [newest, ...rest] = TWO_WEEKS;
    const history = [
      makeOutcome({
        weightKg: 100,
        date: daysBefore(newest),
        sets: setsEndingAtFailure(1),
      }),
      ...rest.map((daysAgo) => prescribedSession(1, daysAgo)),
    ];

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['setAtFailure']);
  });

  it('§8 discomfort anywhere in the block fails criterion 3', () => {
    const [newest, second, third, fourth] = TWO_WEEKS;
    const history = [
      prescribedSession(1, newest),
      prescribedSession(1, second),
      makeOutcome({
        weightKg: 100,
        date: daysBefore(third),
        sets: setsEndingWithDiscomfort(1),
      }),
      prescribedSession(1, fourth),
    ];

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['discomfort']);
  });

  it('§8 one week of evidence cannot pass: two consecutive weeks are required', () => {
    const history = [prescribedSession(1, 2), prescribedSession(1, 5)];

    const decision = evaluateBlock(readaptationPhase(1), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['insufficientWeeks']);
  });

  it('§8 criteria are reported in the gate order and deduplicated', () => {
    // Two weeks with a missed session in each and a failure set in the newest one.
    const history = [
      makeOutcome({ weightKg: 100, date: daysBefore(3), sets: setsEndingAtFailure(1) }),
      prescribedSession(1, 9),
    ];

    const decision = evaluateBlock(readaptationPhase(4), { block: 1, passedBlocks: 0 }, history, NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['setAtFailure', 'missedSessions']);
  });

  it('§8 two empty weeks report both empty-week criteria once each, in the gate order', () => {
    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0 }, [], NOW);

    expect(decision.kind).toBe('repeat');
    expect(decision.failedCriteria).toEqual(['missedSessions', 'insufficientWeeks']);
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
    // Block 2 of the default (hypertrophy) column: 3 × 8–10 @ 3–4 RIR.
    expect(decision.prescription).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 3, upperBound: 4 },
    });
    expect(decision.failedCriteria).toEqual([]);
  });

  it('§8 a repeated block keeps the prescription of the last passed block (Hold row)', () => {
    const decision = evaluateBlock(
      readaptationPhase(4),
      { block: 2, passedBlocks: 1 },
      [prescribedSession(2, 3), prescribedSession(2, 9), prescribedSession(2, 12)],
      NOW,
    );

    expect(decision.kind).toBe('repeat');
    expect(decision.prescriptionBlock).toBe(1);
    // Block 1 of the default column: 3 × 8–10 @ 4–5 RIR.
    expect(decision.prescription).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
  });

  it('T-29 block 4 passed ends readaptation with .advanceToNormal', () => {
    const decision = evaluateBlock(
      readaptationPhase(6),
      { block: 4, passedBlocks: 3 },
      passingHistory(4),
      NOW,
    );

    expect(decision.kind).toBe('advanceToNormal');
    expect(decision.prescription).toBeNull();
    expect(decision.prescriptionBlock).toBeNull();
  });

  it('§8 block 5+ is impossible: block 4 never passes to block 5', () => {
    const decision = evaluateBlock(
      readaptationPhase(8),
      { block: 4, passedBlocks: 3 },
      passingHistory(4),
      NOW,
    );

    expect(decision.prescriptionBlock).toBeNull();
    expect(decision.kind).toBe('advanceToNormal');
  });

  it('T-28 the 8-week cap freezes the prescription without advancing', () => {
    const history = [prescribedSession(2, 3), prescribedSession(2, 9), prescribedSession(2, 12)];

    const decision = evaluateBlock(readaptationPhase(8), { block: 2, passedBlocks: 1 }, history, NOW);

    expect(decision.kind).toBe('capReached');
    expect(decision.prescriptionBlock).toBe(1);
    expect(decision.prescription).toEqual({
      sets: 3,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
  });

  it('§8 passing the gate on week 8 still advances (the cap needs an unmet gate)', () => {
    const decision = evaluateBlock(readaptationPhase(8), { block: 1, passedBlocks: 0 }, blockOnePassingHistory(), NOW);

    expect(decision.kind).toBe('pass');
  });

  it('§8 a week counter beyond the cap still reports the cap, not a later block', () => {
    const history = [prescribedSession(2, 3), prescribedSession(2, 9), prescribedSession(2, 12)];

    const decision = evaluateBlock(readaptationPhase(9), { block: 2, passedBlocks: 1 }, history, NOW);
    const recommendation = recommend(
      makeInput({ phase: readaptationPhase(9), phaseState: { block: 2, passedBlocks: 1 }, history }),
      NOW,
    );

    expect(decision.kind).toBe('capReached');
    expect(recommendation.reason).toBe('readaptationCapReached');
    expect(recommendation.suggestedSets).toBe(3);
    expect(recommendation.suggestedTargetReps).toBe(8);
    expect(recommendation.reasonContext.weeks).toBe(8);
  });

  it('§8 block 5+ is impossible: an out-of-range block clamps to the end of readaptation', () => {
    const decision = evaluateBlock(
      readaptationPhase(7),
      { block: 5, passedBlocks: 4 },
      passingHistory(4),
      NOW,
    );

    expect(decision.block).toBe(4);
    expect(decision.kind).toBe('advanceToNormal');
    expect(decision.prescription).toBeNull();
  });

  it('§8 the accessory role gets its own block prescription', () => {
    const role: BlockRole = 'accessory';
    const history = TWO_WEEKS.map((daysAgo) => prescribedSession(1, daysAgo, { role }));

    const decision = evaluateBlock(readaptationPhase(2), { block: 1, passedBlocks: 0, role }, history, NOW);

    expect(decision.kind).toBe('pass');
    // Block 2 of the accessory column: 3 × 10–12 @ 3 RIR.
    expect(decision.prescription).toEqual({
      sets: 3,
      repRange: { lowerBound: 10, upperBound: 12 },
      targetRIR: { lowerBound: 3, upperBound: 3 },
    });
  });
});

describe('§8 per-exercise profile', () => {
  it('§8 a preventive exercise and a strength exercise at the same block get different prescriptions', () => {
    const strength = blockPrescription(1, 'strength');
    const preventive = blockPrescription(1, 'preventive');

    // Same block, same exercise count: the squat and the Nordic curl are not the same session.
    expect(strength).toEqual({
      sets: 3,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
    });
    expect(preventive).toEqual({
      sets: 2,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 5, upperBound: 6 },
    });

    expect(preventive.sets).not.toBe(strength.sets);
    expect(preventive.targetRIR).not.toEqual(strength.targetRIR);
    // The difference holds at the end of readaptation too, where the volume converges.
    expect(blockPrescription(4, 'preventive')).not.toEqual(blockPrescription(4, 'strength'));
  });

  it('§8 the optional profile overrides the phase role', () => {
    // Two sets of six: enough for the preventive block 1, one set short of the strength block 1.
    const history = TWO_WEEKS.map((daysAgo) => blockSession({ daysAgo, sets: 2, reps: 6, effort: EFFORT.easy }));

    const fromPhaseRole = evaluateBlock(
      readaptationPhase(2),
      { block: 1, passedBlocks: 0, role: 'strength' },
      history,
      NOW,
    );

    expect(fromPhaseRole.kind).toBe('repeat');
    expect(fromPhaseRole.failedCriteria).toEqual(['incompleteSets']);

    const fromProfile = evaluateBlock(
      readaptationPhase(2),
      { block: 1, passedBlocks: 0, role: 'strength' },
      history,
      NOW,
      'preventive',
    );

    expect(fromProfile.kind).toBe('pass');
    expect(fromProfile.prescriptionBlock).toBe(2);
    // Block 2 of the preventive column: 2 × 6–8 @ 5 RIR.
    expect(fromProfile.prescription).toEqual({
      sets: 2,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 5, upperBound: 5 },
    });
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
    // Block 2 of the default column: 3 × 8–10.
    expect(recommendation.suggestedSets).toBe(3);
    expect(recommendation.suggestedTargetReps).toBe(8);
    expect(recommendation.reason).toBe('readaptationBlockPassed');
    expect(recommendation.reasonContext.week).toBe(1);
    expect(recommendation.reasonContext.next).toBe(102.5);
  });

  it('T-27 an unmet block 2 repeats with the last passed block volume and the same weight', () => {
    const history = [prescribedSession(2, 3), prescribedSession(2, 9), prescribedSession(2, 12)];

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
    // The Hold row: block 1's volume, 3 × 8–10.
    expect(recommendation.suggestedSets).toBe(3);
    expect(recommendation.suggestedTargetReps).toBe(8);
    expect(recommendation.reason).toBe('readaptationBlockNotPassed');
    expect(recommendation.reasonContext.failedCriteria).toEqual(['missedSessions']);
    expect(recommendation.reasonContext.week).toBe(3);
  });

  it('§8 no increase inside a block: repeating never moves the weight', () => {
    const history = [prescribedSession(2, 3), prescribedSession(2, 9), prescribedSession(2, 12)];
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
    const history = [prescribedSession(2, 3), prescribedSession(2, 9), prescribedSession(2, 12)];

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
    expect(recommendation.suggestedSets).toBe(3);
    expect(recommendation.suggestedTargetReps).toBe(8);
    expect(recommendation.reason).toBe('readaptationCapReached');
    expect(recommendation.reasonContext.weeks).toBe(8);
  });

  it('T-29 passing block 4 increases once and hands over to normal rules', () => {
    const history = passingHistory(4);

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
    // .advanceToNormal carries no block prescription: the plan's own 4 × 6 applies.
    expect(lastReadaptationRecommendation.suggestedSets).toBe(4);
    expect(lastReadaptationRecommendation.suggestedTargetReps).toBe(6);

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
    const prescription = blockPrescription(1);
    const history = TWO_WEEKS.map((daysAgo) =>
      blockSession({
        daysAgo,
        sets: prescription.sets - 1,
        reps: prescription.repRange.lowerBound,
        effort: EFFORT.easy,
      }),
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
    expect(recommendation.suggestedSets).toBe(3);
    expect(recommendation.suggestedWeightKg).toBe(100);
  });
});
