/**
 * Progression contract — Rupfit (docs/progression-engine.md §2, §3, §8).
 *
 * `ProgressionInput` is everything the engine is allowed to see. Heart rate,
 * sleep, steps, cardio load, time of day, calendar, body weight and age are
 * absent on purpose: they cannot be used because they cannot be passed (§2).
 */

import type { Exercise, ExercisePrescription } from './entities';
import type { Confidence, Discomfort, Effort, RepRange } from './values';

export interface SetOutcome {
  readonly targetReps: number;
  readonly actualReps: number;
  /** `null` = the user did not answer (invariant I-7). */
  readonly effort: Effort | null;
  /** `null` = the user did not answer (invariant I-7). */
  readonly discomfort: Discomfort | null;
}

/**
 * One training session for one exercise. Confirmed sets only; the engine ignores
 * outcomes with zero confirmed sets (an abandoned session is not evidence).
 */
export interface ExerciseOutcome {
  readonly date: Date;
  /** The weight actually used. */
  readonly weightKg: number;
  /** What the app suggested that day, frozen at start (invariant I-2). */
  readonly recommendedWeightKg: number | null;
  readonly sets: readonly SetOutcome[];
}

export interface ColdStartInput {
  /** The user's own recent working weight for this lift, or `null` if unknown. */
  readonly knownWorkingWeightKg: number | null;
  /** The rep count that weight was performed for, e.g. 5. */
  readonly knownReps: number | null;
}

export interface ProgressionInput {
  readonly exercise: Exercise;
  readonly prescription: ExercisePrescription;
  readonly phase: TrainingPhase;
  readonly phaseState: PhaseState;
  /** Newest first, same exercise (docs/progression-engine.md §2). */
  readonly history: readonly ExerciseOutcome[];
  /** Only meaningful when `history` is empty; `null` when the user gave no reference. */
  readonly coldStart: ColdStartInput | null;
}

export type ProgressionAction = 'increase' | 'hold' | 'decrease' | 'startFirstTime' | 'insufficientData';

/** Every typed reason the document names (docs/progression-engine.md §4). */
export const REASON_CODES = [
  'insufficientData',
  'coldStartFromCalibration',
  'topOfRangeReached',
  'topOfRangeReachedEffortUnknown',
  'addRepetition',
  'belowRangeFirstTime',
  'belowRangeRepeated',
  'discomfortHold',
  'discomfortReduce',
  'userLoweredLastTime',
  'readaptationBlockPassed',
  'readaptationBlockNotPassed',
  'readaptationCapReached',
  'bodyweightTopOfRange',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * The numbers a Spanish reason template needs. They come from the recommendation's
 * own values, never from free text (§4).
 */
export interface ReasonContext {
  /** `{{sets}}` — sets completed at the top of the range. */
  readonly sets?: number;
  /** `{{reps}}` — the calibrated rep count or the top of the rep range. */
  readonly reps?: number;
  /** `{{kg}}` — the weight the recommendation is based on. */
  readonly kg?: number;
  /** `{{next}}` — the weight being suggested next. */
  readonly next?: number;
  /** `{{nextReps}}` — the rep target being suggested next. */
  readonly nextReps?: number;
  /** `{{bottom}}` — the bottom of the rep range. */
  readonly bottom?: number;
  /** `{{week}}` — the readaptation block being evaluated. */
  readonly week?: number;
  /** `{{weeks}}` — weeks spent in readaptation. */
  readonly weeks?: number;
  /** `{{failedCriteria}}` — unmet readaptation gate criteria. */
  readonly failedCriteria?: readonly BlockCriterion[];
}

export interface ProgressionRecommendation {
  /** `null` = "you choose, we have nothing"; a first-class state, not an error (§3). */
  readonly suggestedWeightKg: number | null;
  readonly suggestedSets: number;
  readonly suggestedTargetReps: number;
  readonly action: ProgressionAction;
  readonly reason: ReasonCode;
  readonly confidence: Confidence;
  readonly basedOnSessions: number;
  /** Copied from the injected instant; the engine never reads a clock. */
  readonly computedAt: Date;
  /** Values for the fixed Spanish template of `reason` (§4). */
  readonly reasonContext: ReasonContext;
}

export type TrainingPhase =
  | { readonly kind: 'normal' }
  | { readonly kind: 'readaptation'; readonly week: number };

export const NORMAL_PHASE: TrainingPhase = { kind: 'normal' };

export function readaptationPhase(week: number): TrainingPhase {
  return { kind: 'readaptation', week };
}

export function isReadaptation(phase: TrainingPhase): phase is { readonly kind: 'readaptation'; readonly week: number } {
  return phase.kind === 'readaptation';
}

/** Role of an exercise inside the block table (docs/progression-engine.md §8). */
export type BlockRole = 'primary' | 'accessory';

/**
 * Readaptation state carried by the app: the block being trained, the blocks
 * already passed (which bound the "hold the last passed block" prescription) and
 * the role the block table prescribes for this exercise.
 */
export interface PhaseState {
  /** Block currently being trained: 1..4. */
  readonly block: number;
  /** Blocks already passed inside readaptation: 0..4. */
  readonly passedBlocks: number;
  /** Defaults to `'primary'` when omitted. */
  readonly role?: BlockRole;
  /** Defaults to three scheduled sessions per week (training-science §6). */
  readonly scheduledSessionsPerWeek?: number;
}

export interface BlockPrescription {
  readonly sets: number;
  readonly repRange: RepRange;
  /** Target reps in reserve for the block (training-science §6). */
  readonly targetRIR: RepRange;
}

/** Gate criteria of docs/progression-engine.md §8, in the gate's own order. */
export type BlockCriterion = 'incompleteSets' | 'setAtFailure' | 'discomfort' | 'missedSessions' | 'insufficientWeeks';

export type BlockDecisionKind = 'pass' | 'repeat' | 'advanceToNormal' | 'capReached';

export interface BlockDecision {
  readonly kind: BlockDecisionKind;
  /** The block this decision is about: 1..4. */
  readonly block: number;
  /** Block whose prescription applies next: `null` when normal rules apply again. */
  readonly prescriptionBlock: number | null;
  /** Prescription of the decision; `null` when normal rules apply again. */
  readonly prescription: BlockPrescription | null;
  /** Empty when the gate passed. */
  readonly failedCriteria: readonly BlockCriterion[];
}
