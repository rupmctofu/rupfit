/**
 * §9 Worked examples from the brief, reproduced literally.
 */

import { describe, expect, it } from 'vitest';
import { recommend } from '../src/core/engine';
import type { ExerciseOutcome, PhaseState, ProgressionRecommendation } from '../src/core/domain';
import { verdictSets, type ExerciseVerdict } from '../src/features/session/verdict';
import {
  daysBefore,
  EFFORT,
  makeInput,
  makeOutcome,
  makePrescription,
  NOW,
  readaptationPhase,
} from './fixtures';

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

/**
 * S4 as the owner's loop: *"que yo, después de entreno ponga si lo he hecho, si he fallado o
 * si he ido sobrado y que a partir de ahí para la semana siguiente considere si tengo que
 * subir peso o bajar o lo que sea, o más repeticiones, menos repeticiones"*.
 *
 * The verdict is already a set list (T6) and the rules that read it are §7's, unchanged:
 * these tests add no rule, they drive the same `recommend` with the three answers. No phase
 * state is in play here — this is the per-exercise ladder, not the readaptation block.
 */
describe('S4 the verdict after training moves the next week', () => {
  /** The plan's own shape for a strength slot: 3 × 8–10 at 0 RIR (five-day-plan S6). */
  const PLAN = makePrescription({ sets: 3, bottom: 8, top: 10, targetRIR: [0, 0] });

  /** One session exactly as the verdict writes it, as the engine's history reads it. */
  function sessionOf(verdict: ExerciseVerdict, weightKg: number, daysAgo: number): ExerciseOutcome {
    const result = verdictSets(PLAN, weightKg, verdict);
    if (!result.ok) throw new Error(`the verdict was refused: ${result.message}`);

    return {
      date: daysBefore(daysAgo),
      weightKg,
      recommendedWeightKg: weightKg,
      sets: result.sets.map((set) => ({
        targetReps: PLAN.repRange.lowerBound,
        actualReps: set.actualReps,
        effort: set.effort,
        discomfort: null,
      })),
    };
  }

  function nextWeek(history: readonly ExerciseOutcome[]): ProgressionRecommendation {
    return recommend(makeInput({ prescription: PLAN, history }), NOW);
  }

  it('S4 «fui sobrado» twice ends heavier, one increment at a time', () => {
    const first = nextWeek([sessionOf('easy', 100, 7)]);
    expect(first.action).toBe('increase');
    expect(first.suggestedWeightKg).toBe(102.5);

    // The owner trains the suggestion and answers the same way again.
    const second = nextWeek([sessionOf('easy', 102.5, 7), sessionOf('easy', 100, 14)]);
    expect(second.action).toBe('increase');
    expect(second.suggestedWeightKg).toBe(105);
  });

  it('S4 «fallé» twice ends lower', () => {
    // §7 rule 5: the first miss at this weight repeats it instead of cutting it.
    const first = nextWeek([sessionOf('failed', 100, 7)]);
    expect(first.action).toBe('hold');
    expect(first.suggestedWeightKg).toBe(100);

    const second = nextWeek([sessionOf('failed', 100, 7), sessionOf('failed', 100, 14)]);
    expect(second.action).toBe('decrease');
    expect(second.suggestedWeightKg).toBe(97.5);
  });

  it('S4 «lo hice» holds the weight and asks for one more repetition', () => {
    const recommendation = nextWeek([sessionOf('done', 100, 7)]);

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.suggestedTargetReps).toBe(9);
    expect(recommendation.reason).toBe('addRepetition');
  });
});

/**
 * S4 against the calendar (T7). Once the block advance is persisted, the weeks that earned
 * it are still in the lift's history — and they must stop paying: §8 measures a block over
 * *its own* two weeks, so a block that already moved cannot report itself passed again on
 * evidence it already spent. Otherwise every `Lo hice` adds 2,5 kg a week, which is exactly
 * the "subir peso por calendario" that S4 replaces with the verdict.
 *
 * `blockHistory` is the same outcomes narrowed to the block the phase state is on: the
 * stored session carries the phase it was built in, and that is what the caller filters by.
 */
describe('S4 the load follows the verdict, not the calendar', () => {
  /** The plan's own shape for a strength slot: 3 × 8–10 at 0 RIR (five-day-plan S6). */
  const SLOT = makePrescription({ sets: 3, bottom: 8, top: 10, targetRIR: [0, 0] });
  const BLOCK_TWO: PhaseState = { block: 2, passedBlocks: 1 };

  function answerOf(verdict: ExerciseVerdict, weightKg: number, daysAgo: number): ExerciseOutcome {
    const result = verdictSets(SLOT, weightKg, verdict);
    if (!result.ok) throw new Error(`the verdict was refused: ${result.message}`);

    return {
      date: daysBefore(daysAgo),
      weightKg,
      recommendedWeightKg: weightKg,
      sets: result.sets.map((set) => ({
        targetReps: SLOT.repRange.lowerBound,
        actualReps: set.actualReps,
        effort: set.effort,
        discomfort: null,
      })),
    };
  }

  /**
   * The two weeks that earned block 2, ending at the instant the block moved: they sit
   * inside the gate's own two rolling windows, which is what made the defect fire.
   */
  const EARNED_BLOCK_TWO = [answerOf('done', 100, 2), answerOf('done', 100, 9)];

  function inBlockTwo(
    blockHistory: readonly ExerciseOutcome[],
    before: readonly ExerciseOutcome[] = EARNED_BLOCK_TWO,
  ): ProgressionRecommendation {
    return recommend(
      {
        ...makeInput({
          prescription: SLOT,
          history: [...blockHistory, ...before],
          phase: readaptationPhase(2),
          phaseState: BLOCK_TWO,
        }),
        blockHistory,
      },
      NOW,
    );
  }

  it('S4 «lo hice» just after the advance does not pay the increment again', () => {
    // The block moved on the close of the last session; this is the next one, and the lift
    // has not trained a single session of block 2 yet.
    const recommendation = inBlockTwo([]);

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
    expect(recommendation.reason).toBe('readaptationBlockNotPassed');
    // And block 2's own volume is what it prescribes while the block is being trained.
    expect(recommendation.suggestedSets).toBe(3);
    expect(recommendation.suggestedTargetReps).toBe(8);
  });

  it('S4 two «fui sobrado» in the new block do move the load', () => {
    // Block 2's own two weeks, one session in each; the weeks before them are older.
    const older = [answerOf('done', 100, 17), answerOf('done', 100, 24)];
    const recommendation = inBlockTwo([answerOf('easy', 100, 10), answerOf('easy', 100, 3)], older);

    expect(recommendation.action).toBe('increase');
    expect(recommendation.suggestedWeightKg).toBe(102.5);
    expect(recommendation.reason).toBe('readaptationBlockPassed');
  });

  it('S4 one week of the new block is not enough: the increment needs its two weeks', () => {
    const older = [answerOf('done', 100, 17), answerOf('done', 100, 24)];
    const recommendation = inBlockTwo([answerOf('easy', 100, 3)], older);

    expect(recommendation.action).toBe('hold');
    expect(recommendation.suggestedWeightKg).toBe(100);
  });
});
