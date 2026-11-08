/**
 * §11.2 Property tests over generated valid inputs.
 *
 * The generator is seeded deterministically; the seed is recorded here and in the
 * test names so a failure is reproducible. Nothing is asserted about training
 * quality: only the documented invariants of the engine and its output shape.
 */

import { describe, expect, it } from 'vitest';
import { isMultipleOfIncrement, recommend } from '../src/core/engine';
import {
  DISCOMFORT,
  EFFORT,
  NORMAL_PHASE,
  repRange,
  type Discomfort,
  type Effort,
  type Exercise,
  type ExerciseOutcome,
  type ProgressionInput,
  type SetOutcome,
} from '../src/core/domain';
import { barbellExercise, daysBefore, makeOutcome, makeSet, NOW, readaptationPhase } from './fixtures';

/** Recorded seed: every run of this suite generates the same cases. */
const SEED = 0x5eed_1a7e;
const CASE_COUNT = 250;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

function intBetween(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

const INCREMENTS = [0, 1, 2, 2.5, 5, 10] as const;
const EFFORTS: readonly (Effort | null)[] = [null, EFFORT.failure, EFFORT.hard, EFFORT.correct, EFFORT.easy];
const DISCOMFORTS: readonly (Discomfort | null)[] = [
  null,
  null,
  null,
  null,
  DISCOMFORT.none,
  DISCOMFORT.mild,
  DISCOMFORT.pain,
];

function makeCase(random: () => number): ProgressionInput {
  const increment = pick(random, INCREMENTS);
  const bottom = intBetween(random, 3, 10);
  const top = bottom + intBetween(random, 0, 3);
  const prescriptionSets = intBetween(random, 1, 5);
  const exercise: Exercise = barbellExercise({ loadIncrementKg: increment });
  // History weights are reachable loads: a produced weight is always a multiple of
  // the increment (§6). The echo of a manually entered non-multiple weight is
  // covered by its own §6 test.
  const weightFor = (): number =>
    increment === 0 ? 0 : Number((intBetween(random, 1, 40) * increment).toFixed(6));
  const historyLength = intBetween(random, 0, 4);
  const history: ExerciseOutcome[] = Array.from({ length: historyLength }, () => {
    const setCount = intBetween(random, 1, prescriptionSets);
    const sets: SetOutcome[] = Array.from({ length: setCount }, () =>
      makeSet(intBetween(random, 0, top + 3), {
        effort: pick(random, EFFORTS),
        discomfort: pick(random, DISCOMFORTS),
      }),
    );

    return makeOutcome({
      weightKg: weightFor(),
      date: daysBefore(intBetween(random, 0, 13)),
      sets,
      recommendedWeightKg: random() < 0.5 ? weightFor() : null,
    });
  });
  const readaptation = random() < 0.15;
  const phase = readaptation ? readaptationPhase(intBetween(random, 1, 8)) : NORMAL_PHASE;
  const phaseState = readaptation
    ? { block: intBetween(random, 1, 4), passedBlocks: intBetween(random, 0, 3) }
    : { block: 1, passedBlocks: 0 };
  const coldStart =
    history.length === 0 && random() < 0.5
      ? { knownWorkingWeightKg: intBetween(random, 1, 200), knownReps: intBetween(random, 1, 12) }
      : null;

  return {
    exercise,
    prescription: {
      sets: prescriptionSets,
      repRange: repRange(bottom, top),
      targetRIR: repRange(2, 3),
      restSeconds: 120,
    },
    phase,
    phaseState,
    history,
    coldStart,
  };
}

function buildCases(): readonly ProgressionInput[] {
  const random = mulberry32(SEED);

  return Array.from({ length: CASE_COUNT }, () => makeCase(random));
}

const CASES = buildCases();

/** §2: outcomes with zero confirmed sets are not evidence. */
function usableLast(input: ProgressionInput): ExerciseOutcome | null {
  const usable = input.history.filter((outcome) => outcome.sets.length > 0);

  return usable[0] ?? null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return value;
}

/** Deep copy that preserves the `Date` instances of the input. */
function clone<T>(value: T): T {
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => clone(entry)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = clone(entry);
    }

    return copy as T;
  }

  return value;
}

describe(`§11.2 property tests (seed 0x${SEED.toString(16)}, ${CASE_COUNT} generated inputs)`, () => {
  it('P-1 purity: the same input returns an equal output on repeated calls', () => {
    for (const input of CASES) {
      expect(recommend(input, NOW)).toEqual(recommend(input, NOW));
    }
  });

  it('P-1 purity: the engine never mutates the input it is given', () => {
    for (const input of CASES.slice(0, 50)) {
      const frozen = deepFreeze(clone(input));

      expect(() => recommend(frozen, NOW)).not.toThrow();
    }
  });

  it('P-2 granularity: every returned weight is a multiple of the increment within 1e-6', () => {
    for (const input of CASES) {
      const { suggestedWeightKg } = recommend(input, NOW);

      if (input.exercise.loadIncrementKg === 0 || suggestedWeightKg === null) {
        continue;
      }

      expect(isMultipleOfIncrement(suggestedWeightKg, input.exercise.loadIncrementKg)).toBe(true);
    }
  });

  it('P-3 no invention: empty history and no calibration never yields a weight', () => {
    for (const input of CASES) {
      const usable = input.history.filter((outcome) => outcome.sets.length > 0);

      if (usable.length > 0 || input.coldStart !== null) {
        continue;
      }

      const recommendation = recommend(input, NOW);

      expect(recommendation.suggestedWeightKg).toBeNull();
      expect(recommendation.action).toBe('insufficientData');
    }
  });

  it('P-4 symptom safety: reported pain is never answered with an increase', () => {
    let painCases = 0;

    for (const input of CASES) {
      const last = usableLast(input);

      if (!last || !last.sets.some((set) => set.discomfort === DISCOMFORT.pain)) {
        continue;
      }

      painCases += 1;
      const recommendation = recommend(input, NOW);

      expect(['decrease', 'hold']).toContain(recommendation.action);
    }

    expect(painCases).toBeGreaterThan(0);
  });

  it('P-5 bounded step: an increase or decrease moves at most one increment', () => {
    const epsilon = 1e-6;

    for (const input of CASES) {
      const last = usableLast(input);

      if (!last) {
        continue;
      }

      const recommendation = recommend(input, NOW);
      const weight = recommendation.suggestedWeightKg;
      const increment = input.exercise.loadIncrementKg;

      if (weight === null) {
        continue;
      }

      if (recommendation.action === 'increase') {
        expect(weight).toBeLessThanOrEqual(last.weightKg + increment + epsilon);
      }

      if (recommendation.action === 'decrease') {
        expect(weight).toBeGreaterThanOrEqual(last.weightKg - increment - epsilon);
      }

      if (recommendation.action === 'hold') {
        expect(weight).toBe(last.weightKg);
      }
    }
  });

  it('P-6 no negative weight: a decrease never lands below one increment', () => {
    for (const input of CASES) {
      const recommendation = recommend(input, NOW);
      const weight = recommendation.suggestedWeightKg;

      if (weight === null) {
        continue;
      }

      expect(weight).toBeGreaterThanOrEqual(0);

      if (recommendation.action === 'decrease' && input.exercise.loadIncrementKg > 0) {
        expect(weight).toBeGreaterThanOrEqual(input.exercise.loadIncrementKg - 1e-6);
      }
    }
  });

  it('P-7 reps inside the range: the target rep count stays inside the prescription', () => {
    for (const input of CASES) {
      if (input.phase.kind !== 'normal') {
        // Readaptation prescribes from the block table, not from the plan's range.
        continue;
      }

      const { suggestedTargetReps } = recommend(input, NOW);
      const { lowerBound, upperBound } = input.prescription.repRange;

      expect(suggestedTargetReps).toBeGreaterThanOrEqual(lowerBound);
      expect(suggestedTargetReps).toBeLessThanOrEqual(upperBound);
    }
  });

  it('P-8 monotone reason: all-top history never becomes worse than all-below history', () => {
    for (const input of CASES) {
      const last = usableLast(input);

      if (!last) {
        continue;
      }

      const base = {
        exercise: input.exercise,
        prescription: input.prescription,
        phase: input.phase,
        phaseState: input.phaseState,
        coldStart: input.coldStart,
      };
      const bottom = input.prescription.repRange.lowerBound;
      const top = input.prescription.repRange.upperBound;
      const allAtTop: ProgressionInput = {
        ...base,
        history: [
          makeOutcome({
            weightKg: last.weightKg,
            date: last.date,
            sets: Array.from({ length: last.sets.length }, () => makeSet(top, { effort: EFFORT.hard })),
          }),
        ],
      };
      const allBelowBottom: ProgressionInput = {
        ...base,
        history: [
          makeOutcome({
            weightKg: last.weightKg,
            date: last.date,
            sets: Array.from({ length: last.sets.length }, () =>
              makeSet(Math.max(bottom - 1, 0), { effort: EFFORT.hard }),
            ),
          }),
        ],
      };

      expect(recommend(allAtTop, NOW).action).not.toBe('decrease');
      expect(recommend(allBelowBottom, NOW).action).not.toBe('increase');
    }
  });
});
