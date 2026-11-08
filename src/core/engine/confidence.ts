/**
 * §10 Confidence. Confidence labels a recommendation; it never changes the
 * recommended number.
 */

import { DISCOMFORT, type Confidence, type ExerciseOutcome } from '../domain';

function hasDiscomfort(outcome: ExerciseOutcome): boolean {
  return outcome.sets.some(
    (set) => set.discomfort !== null && set.discomfort !== DISCOMFORT.none,
  );
}

function everyEffortUnanswered(outcome: ExerciseOutcome): boolean {
  return outcome.sets.length === 0 || outcome.sets.every((set) => set.effort === null);
}

function reportsEffortEverywhere(outcome: ExerciseOutcome): boolean {
  return outcome.sets.length > 0 && outcome.sets.every((set) => set.effort !== null);
}

/**
 * `usableHistory` is newest first and contains only sessions with at least one
 * confirmed set; `last` is its newest entry.
 */
export function assessConfidence(usableHistory: readonly ExerciseOutcome[], last: ExerciseOutcome): Confidence {
  const sessionsConsidered = usableHistory.length;

  if (sessionsConsidered <= 1) {
    return { level: 'low', sessionsConsidered };
  }

  if (hasDiscomfort(last) || everyEffortUnanswered(last)) {
    return { level: 'low', sessionsConsidered };
  }

  if (sessionsConsidered === 2) {
    return { level: 'medium', sessionsConsidered };
  }

  const lastTwo = usableHistory.slice(0, 2);
  const consistentEffort = lastTwo.every(reportsEffortEverywhere);
  const noDiscomfort = lastTwo.every((outcome) => !hasDiscomfort(outcome));

  return { level: consistentEffort && noDiscomfort ? 'high' : 'medium', sessionsConsidered };
}
