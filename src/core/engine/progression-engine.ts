/**
 * The progression engine: one pure function over plain data
 * (docs/progression-engine.md).
 *
 * Boundaries this file deliberately respects: no I/O, no storage, no DOM, no
 * randomness and no clock. Time is injected (`computedAt`) and copied into the
 * result. Same input, same output, always.
 */

import {
  DEFAULT_BLOCK_ROLE,
  DISCOMFORT,
  EFFORT,
  type Confidence,
  type Effort,
  type ExerciseOutcome,
  type ProgressionAction,
  type ProgressionInput,
  type ProgressionRecommendation,
  type ReasonCode,
  type ReasonContext,
  type SetOutcome,
} from '../domain';
import { assessConfidence } from './confidence';
import { evaluateBlock, MAX_READAPTATION_WEEK } from './readaptation';
import { roundDownToIncrement, stepDown, stepUp } from './rounding';

/** §12: any change to §7 order, §8 gates or §6 rounding bumps this. */
export const ENGINE_VERSION = '1.0.0';

/** Products of an acceptable weight grid; a real weight is never "corrected". */
const LOWERED_EPSILON = 1e-6;

interface RecommendationFields {
  readonly suggestedWeightKg: number | null;
  readonly suggestedSets: number;
  readonly suggestedTargetReps: number;
  readonly action: ProgressionAction;
  readonly reason: ReasonCode;
  readonly confidence: Confidence;
  readonly basedOnSessions: number;
  readonly reasonContext: ReasonContext;
}

/** §7 `belowRangeCount`: consecutive most-recent outcomes at the same weight. */
function countConsecutiveBelowRange(history: readonly ExerciseOutcome[], bottom: number): number {
  const reference = history[0];

  if (!reference) {
    return 0;
  }

  let count = 0;

  for (const outcome of history) {
    if (Math.abs(outcome.weightKg - reference.weightKg) > LOWERED_EPSILON) {
      break;
    }

    if (!outcome.sets.some((set) => set.actualReps < bottom)) {
      break;
    }

    count += 1;
  }

  return count;
}

/** §7 `hardestEffort`: fewest RIR among answered sets, `null` when none answered. */
function hardestEffort(sets: readonly SetOutcome[]): Effort | null {
  let hardest: Effort | null = null;

  for (const set of sets) {
    if (set.effort === null) {
      continue;
    }

    if (hardest === null || set.effort < hardest) {
      hardest = set.effort;
    }
  }

  return hardest;
}

/**
 * `recommend` — §7 decision order, first match wins. `computedAt` is the injected
 * instant; the engine never reads a clock.
 */
export function recommend(input: ProgressionInput, computedAt: Date): ProgressionRecommendation {
  const { exercise, prescription, phase, phaseState } = input;
  // The profile travels with the prescription. The phase state's role is the older,
  // phase-wide fallback; when neither says anything the exercise is hypertrophy volume.
  const role = input.role ?? prescription.role ?? phaseState.role ?? DEFAULT_BLOCK_ROLE;
  const increment = exercise.loadIncrementKg;
  const bottom = prescription.repRange.lowerBound;
  const top = prescription.repRange.upperBound;
  const planSets = prescription.sets;

  // §2: an abandoned session (zero confirmed sets) is not evidence.
  const usable = input.history.filter((outcome) => outcome.sets.length > 0);

  const build = (fields: RecommendationFields): ProgressionRecommendation => ({ ...fields, computedAt });

  if (usable.length === 0) {
    // §7 rule 1 → §5 cold start.
    const knownWorkingWeightKg = input.coldStart?.knownWorkingWeightKg ?? null;
    const knownReps = input.coldStart?.knownReps ?? null;
    const confidence: Confidence = { level: 'low', sessionsConsidered: 0 };

    if (knownWorkingWeightKg !== null && knownReps !== null) {
      // §5 case 1: estimate = knownWorkingWeightKg × 0.70, rounded down. A design
      // decision, labelled as an estimate in the UI. Bodyweight has no weight
      // arithmetic to perform (§6), so the suggestion is 0.
      const estimate = knownWorkingWeightKg * 0.7;
      const suggestedWeightKg = increment > 0 ? roundDownToIncrement(estimate, increment) : 0;

      return build({
        suggestedWeightKg,
        suggestedSets: planSets,
        suggestedTargetReps: bottom,
        action: 'startFirstTime',
        reason: 'coldStartFromCalibration',
        confidence,
        basedOnSessions: 0,
        reasonContext: { reps: knownReps, kg: suggestedWeightKg },
      });
    }

    // §5 case 2: "you choose". A nil suggestion is a first-class state, not an error.
    return build({
      suggestedWeightKg: null,
      suggestedSets: planSets,
      suggestedTargetReps: bottom,
      action: 'insufficientData',
      reason: 'insufficientData',
      confidence,
      basedOnSessions: 0,
      reasonContext: {},
    });
  }

  const last = usable[0] as ExerciseOutcome;
  const sets = last.sets;
  const confidence = assessConfidence(usable, last);
  const basedOnSessions = usable.length;

  const allAtTop = sets.every((set) => set.actualReps >= top);
  const allInRange = sets.every((set) => set.actualReps >= bottom);
  const belowRangeCount = countConsecutiveBelowRange(usable, bottom);
  const hardest = hardestEffort(sets);
  const anyMild = sets.some((set) => set.discomfort === DISCOMFORT.mild);
  const anyPain = sets.some((set) => set.discomfort === DISCOMFORT.pain);
  const allEffortUnknown = sets.every((set) => set.effort === null);
  const lastWasLowered =
    last.recommendedWeightKg !== null && last.weightKg < last.recommendedWeightKg - LOWERED_EPSILON;

  const hold = (
    reason: ReasonCode,
    reasonContext: ReasonContext,
    suggestedTargetReps: number = bottom,
  ): ProgressionRecommendation =>
    build({
      suggestedWeightKg: last.weightKg,
      suggestedSets: planSets,
      suggestedTargetReps,
      action: 'hold',
      reason,
      confidence,
      basedOnSessions,
      reasonContext,
    });

  const decreaseWith = (reason: ReasonCode): ProgressionRecommendation => {
    const suggestedWeightKg = stepDown(last.weightKg, increment);

    return build({
      suggestedWeightKg,
      suggestedSets: planSets,
      suggestedTargetReps: bottom,
      action: 'decrease',
      reason,
      confidence,
      basedOnSessions,
      reasonContext: { next: suggestedWeightKg },
    });
  };

  const increase = (
    reason: ReasonCode,
    reasonContext: ReasonContext,
    suggestedSets: number = planSets,
    suggestedTargetReps: number = bottom,
  ): ProgressionRecommendation => {
    const suggestedWeightKg = increment > 0 ? stepUp(last.weightKg, increment) : last.weightKg;

    return build({
      suggestedWeightKg,
      suggestedSets,
      suggestedTargetReps,
      action: 'increase',
      reason,
      confidence,
      basedOnSessions,
      reasonContext: { ...reasonContext, next: suggestedWeightKg },
    });
  };

  // Rule 2: pain outranks everything except missing data. Nothing later overrides a symptom.
  if (anyPain) {
    return decreaseWith('discomfortReduce');
  }

  // Rule 3: a mild discomfort holds the weight.
  if (anyMild) {
    return hold('discomfortHold', { kg: last.weightKg });
  }

  // Rule 4: a second consecutive miss at the same weight decreases one increment.
  if (belowRangeCount >= 2) {
    return decreaseWith('belowRangeRepeated');
  }

  // Rule 5: a first miss at this weight holds, and fires before the lowered weight.
  if (!allInRange) {
    return hold('belowRangeFirstTime', { bottom, kg: last.weightKg });
  }

  // Rule 6: the readaptation block table governs load and volume.
  if (phase.kind === 'readaptation') {
    const decision = evaluateBlock(phase, phaseState, usable, computedAt, role);
    const prescriptionForRepeat = decision.prescription;
    const week = Math.min(Math.max(Math.trunc(phase.week), 1), MAX_READAPTATION_WEEK);

    if (decision.kind === 'capReached') {
      return build({
        suggestedWeightKg: last.weightKg,
        suggestedSets: prescriptionForRepeat?.sets ?? planSets,
        suggestedTargetReps: prescriptionForRepeat?.repRange.lowerBound ?? bottom,
        action: 'hold',
        reason: 'readaptationCapReached',
        confidence,
        basedOnSessions,
        reasonContext: { weeks: week },
      });
    }

    if (decision.kind === 'repeat') {
      return build({
        suggestedWeightKg: last.weightKg,
        suggestedSets: prescriptionForRepeat?.sets ?? planSets,
        suggestedTargetReps: prescriptionForRepeat?.repRange.lowerBound ?? bottom,
        action: 'hold',
        reason: 'readaptationBlockNotPassed',
        confidence,
        basedOnSessions,
        reasonContext: { week, kg: last.weightKg, failedCriteria: decision.failedCriteria },
      });
    }

    // `.pass` and `.advanceToNormal`: one increment between blocks, and only after a pass.
    return increase(
      'readaptationBlockPassed',
      { week },
      decision.prescription?.sets ?? planSets,
      decision.prescription?.repRange.lowerBound ?? bottom,
    );
  }

  // Rule 7: a weight the user lowered on purpose is consolidated before any increase.
  if (lastWasLowered) {
    return hold('userLoweredLastTime', { kg: last.weightKg });
  }

  // §6 bodyweight: at the top of the range there is no load to add, only a harder
  // variation. This replaces rules 8 and 9 when the increment is zero.
  if (allAtTop && increment === 0) {
    return hold('bodyweightTopOfRange', {});
  }

  // Rule 8: the top of the range with a reported hard effort.
  if (allAtTop && !allEffortUnknown && hardest !== null && hardest <= EFFORT.hard) {
    return increase('topOfRangeReached', { sets: sets.length, reps: top, kg: last.weightKg });
  }

  // Rule 9: the top of the range with unresolved effort. The literal condition is
  // `allAtTop`: at the top there is nowhere to add reps, so the load must move.
  if (allAtTop) {
    return increase('topOfRangeReachedEffortUnknown', { reps: top });
  }

  // Rule 10: inside the range, add one rep without touching the weight.
  if (allInRange && !allAtTop) {
    const maxActual = Math.max(...sets.map((set) => set.actualReps));
    const suggestedTargetReps = Math.min(maxActual + 1, top);

    return hold('addRepetition', { kg: last.weightKg, nextReps: suggestedTargetReps }, suggestedTargetReps);
  }

  // Rule 11: defensive and unreachable for a non-empty history — rule 5 catches
  // "not all in range", rules 8/9 catch the top and rule 10 catches the rest.
  return hold('addRepetition', { kg: last.weightKg });
}
