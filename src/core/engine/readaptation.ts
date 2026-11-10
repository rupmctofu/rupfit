/**
 * §8 Readaptation policy (docs/progression-engine.md).
 *
 * Two rules shape every decision:
 * - The gate needs all four criteria to hold across two consecutive weeks.
 * - The load never moves inside a block; exactly one increment separates blocks,
 *   and only after `.pass`.
 */

import {
  DISCOMFORT,
  EFFORT,
  isReadaptation,
  repRange,
  type BlockCriterion,
  type BlockDecision,
  type BlockPrescription,
  type BlockRole,
  type ExerciseOutcome,
  DEFAULT_BLOCK_ROLE,
  type PhaseState,
  type TrainingPhase,
} from '../domain';

/** training-science §6: three sessions are scheduled per week. */
export const SCHEDULED_SESSIONS_PER_WEEK = 3;

/** §8 criterion 4: at least two of the three scheduled sessions performed. */
const REQUIRED_SESSIONS_PER_WEEK = 2;

/** §8: the readaptation cap is eight weeks. */
export const MAX_READAPTATION_WEEK = 8;

/** §8: block 5+ is impossible. */
const LAST_BLOCK = 4;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Block prescriptions of §8 / training-science §6. Index 0 is block 1. The `Hold`
 * row of the document is not a block: it means "repeat the last passed block",
 * which the decision resolves.
 */
const BLOCK_TABLE: Record<BlockRole, readonly BlockPrescription[]> = {
  // The main lift of the day. Lower reps than the rest, and still conservative: block 1
  // starts at 6–8 rather than the 5 the normal phase allows, because readaptation is the
  // phase where a tendon meets the load again.
  strength: [
    { sets: 3, repRange: repRange(6, 8), targetRIR: repRange(4, 5) },
    { sets: 3, repRange: repRange(6, 8), targetRIR: repRange(3, 4) },
    { sets: 4, repRange: repRange(5, 8), targetRIR: repRange(2, 3) },
    { sets: 4, repRange: repRange(5, 6), targetRIR: repRange(2, 2) },
  ],
  // Compound volume: the column every undeclared exercise gets.
  hypertrophy: [
    { sets: 3, repRange: repRange(8, 10), targetRIR: repRange(4, 5) },
    { sets: 3, repRange: repRange(8, 10), targetRIR: repRange(3, 4) },
    { sets: 4, repRange: repRange(8, 12), targetRIR: repRange(2, 3) },
    { sets: 4, repRange: repRange(8, 10), targetRIR: repRange(2, 2) },
  ],
  // Isolation: calves, arms, femoral curls.
  accessory: [
    { sets: 2, repRange: repRange(10, 12), targetRIR: repRange(4, 4) },
    { sets: 3, repRange: repRange(10, 12), targetRIR: repRange(3, 3) },
    { sets: 3, repRange: repRange(10, 15), targetRIR: repRange(2, 3) },
    { sets: 3, repRange: repRange(10, 12), targetRIR: repRange(2, 2) },
  ],
  // Hamstrings and adductors worked for tissue tolerance: two sets, far from failure, and
  // deliberately without a rep target that invites load chasing (Nordic, Copenhagen).
  preventive: [
    { sets: 2, repRange: repRange(6, 8), targetRIR: repRange(5, 6) },
    { sets: 2, repRange: repRange(6, 8), targetRIR: repRange(5, 5) },
    { sets: 3, repRange: repRange(6, 10), targetRIR: repRange(4, 5) },
    { sets: 3, repRange: repRange(8, 10), targetRIR: repRange(3, 4) },
  ],
  // The fourth day's engine work (odd/tasks/training-program.md L11): intervals for
  // lasting the match. This column is the one that is not measured in repetitions —
  // `durationSeconds` carries the work of one set and it is the only number that grows
  // across the blocks (2 → 3 min of work, 2 → 4 sets). The load never moves: the engine
  // reads the profile and refuses an increment for it.
  //
  // `repRange` stays `1–1` because three things still read it and none of them may be
  // lied to: the gate compares `actualReps` against its bottom, the backup schema
  // requires an integer range, and the session's set rows have no minutes field. One
  // effort is one repetition, and one is the smallest bottom that cannot fail a set the
  // owner actually performed. RIR stays 4–5 in every block, so an interval never becomes
  // a test and never races the football.
  conditioning: [
    { sets: 2, repRange: repRange(1, 1), targetRIR: repRange(4, 5), durationSeconds: 120 },
    { sets: 3, repRange: repRange(1, 1), targetRIR: repRange(4, 5), durationSeconds: 120 },
    { sets: 3, repRange: repRange(1, 1), targetRIR: repRange(4, 5), durationSeconds: 180 },
    { sets: 4, repRange: repRange(1, 1), targetRIR: repRange(4, 5), durationSeconds: 240 },
  ],
};

/** §8's gate, in the document's order; the reason line keeps this order. */
const CRITERION_ORDER: readonly BlockCriterion[] = [
  'incompleteSets',
  'setAtFailure',
  'discomfort',
  'missedSessions',
  'insufficientWeeks',
];

function clampBlock(block: number): number {
  return Math.min(Math.max(Math.trunc(block), 1), LAST_BLOCK);
}

export function blockPrescription(
  block: number,
  role: BlockRole = DEFAULT_BLOCK_ROLE,
): BlockPrescription {
  return BLOCK_TABLE[role][clampBlock(block) - 1] as BlockPrescription;
}

function sessionsBetween(
  history: readonly ExerciseOutcome[],
  fromExclusive: number,
  toInclusive: number,
): readonly ExerciseOutcome[] {
  return history.filter((outcome) => {
    if (outcome.sets.length === 0) {
      // §2: an abandoned session is not evidence.
      return false;
    }

    const at = outcome.date.getTime();

    return at > fromExclusive && at <= toInclusive;
  });
}

function evaluateWeek(
  outcomes: readonly ExerciseOutcome[],
  prescription: BlockPrescription,
  scheduledSessions: number,
  isPreviousWeek: boolean,
  failed: Set<BlockCriterion>,
): void {
  const requiredSessions = Math.min(REQUIRED_SESSIONS_PER_WEEK, Math.max(scheduledSessions, 1));

  if (outcomes.length === 0) {
    // An empty previous week means the two-week window is not covered yet; an empty
    // current week means the scheduled sessions were not performed.
    failed.add(isPreviousWeek ? 'insufficientWeeks' : 'missedSessions');
    return;
  }

  if (outcomes.length < requiredSessions) {
    failed.add('missedSessions');
  }

  let everyPrescribedSetCompleted = true;

  for (const outcome of outcomes) {
    if (outcome.sets.length < prescription.sets) {
      everyPrescribedSetCompleted = false;
    }

    for (const set of outcome.sets) {
      if (set.actualReps < prescription.repRange.lowerBound) {
        everyPrescribedSetCompleted = false;
      }

      // Criterion 2: no set at failure. The effort buckets cap at 3 RIR while the
      // block targets are 4–5 RIR, so "effort <= target RIR" cannot be compared
      // literally; a reported failure bucket is the only set the domain can call
      // "at failure".
      if (set.effort === EFFORT.failure) {
        failed.add('setAtFailure');
      }

      if (set.discomfort === DISCOMFORT.mild || set.discomfort === DISCOMFORT.pain) {
        failed.add('discomfort');
      }
    }
  }

  if (!everyPrescribedSetCompleted) {
    failed.add('incompleteSets');
  }
}

/**
 * §8 `evaluateBlock`. Pure: `now` is injected so the two weekly windows are
 * deterministic and the engine owns no clock.
 */
export function evaluateBlock(
  phase: TrainingPhase,
  state: PhaseState,
  history: readonly ExerciseOutcome[],
  now: Date,
  profile?: BlockRole,
): BlockDecision {
  if (!isReadaptation(phase)) {
    throw new Error('evaluateBlock requires a readaptation phase');
  }

  const block = clampBlock(state.block);
  // The exercise's own profile wins over the phase-wide one: the gate compares this
  // exercise's sets against the prescription this exercise actually has.
  const role: BlockRole = profile ?? state.role ?? DEFAULT_BLOCK_ROLE;
  const scheduledSessions = state.scheduledSessionsPerWeek ?? SCHEDULED_SESSIONS_PER_WEEK;
  const currentWeek = phase.week;
  const failed = new Set<BlockCriterion>();

  evaluateWeek(
    sessionsBetween(history, now.getTime() - WEEK_MS, now.getTime()),
    blockPrescription(block, role),
    scheduledSessions,
    false,
    failed,
  );
  evaluateWeek(
    sessionsBetween(history, now.getTime() - 2 * WEEK_MS, now.getTime() - WEEK_MS),
    blockPrescription(block, role),
    scheduledSessions,
    true,
    failed,
  );

  const failedCriteria = CRITERION_ORDER.filter((criterion) => failed.has(criterion));

  if (failedCriteria.length === 0) {
    if (block >= LAST_BLOCK) {
      return { kind: 'advanceToNormal', block, prescriptionBlock: null, prescription: null, failedCriteria: [] };
    }

    return {
      kind: 'pass',
      block,
      prescriptionBlock: block + 1,
      prescription: blockPrescription(block + 1, role),
      failedCriteria: [],
    };
  }

  // "Hold: last passed block". With no passed block yet, block 1 is the volume
  // that is repeated; the cap freezes exactly this prescription.
  const heldBlock = clampBlock(Math.max(state.passedBlocks, 1));

  return {
    kind: currentWeek >= MAX_READAPTATION_WEEK ? 'capReached' : 'repeat',
    block,
    prescriptionBlock: heldBlock,
    prescription: blockPrescription(heldBlock, role),
    failedCriteria,
  };
}
