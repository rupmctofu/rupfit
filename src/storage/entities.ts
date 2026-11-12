/**
 * Persistence-facing domain entities — docs/data-model.md §2, §3.
 *
 * `src/core/domain` declares only what the progression engine reads (its header says
 * so, and data-model §1 keeps the domain free of storage). The entities the app tier
 * stores therefore live here, in the storage module, and are plain readonly data:
 * same shapes as §3, expressed with the value types `src/core` already owns
 * (`RepRange`, `Effort`, `Discomfort`, `TrainingPhase`, `PhaseState`,
 * `ProgressionRecommendation`).
 *
 * Two deliberate choices, both recorded in the task report:
 *
 * - `Uuid` and `EpochMs` are aliases, not branded types. `src/core` types its ids as
 *   `string`; branding here would force a cast at every boundary for a compile-time
 *   distinction the document already states in prose (§2, §5.1).
 * - Absence is `null` everywhere (§1 rule 6). A field is never `undefined` in a
 *   stored or exported value, because `JSON.stringify` drops those keys.
 */

import type {
  Discomfort,
  Effort,
  Equipment,
  Exercise,
  ExercisePrescription,
  PhaseState,
  ProgressionRecommendation,
  RepRange,
  TrainingPhase,
} from '../core/domain';
import type { MatchKind, WeekSwap } from '../core/engine/week-plan';

/** Milliseconds since the epoch, orderable as an IndexedDB key (§2). */
export type EpochMs = number;

/** A string UUID produced by `crypto.randomUUID()` (§2). */
export type Uuid = string;

/** Display only; storage is always kilograms (ADR-009, I-3). */
export type MassUnit = 'kilograms' | 'pounds';

export type WeightGoal = 'maintain' | 'lose' | 'gain';

export type ActivityKind = 'strength' | 'cardio' | 'other';

/** §2: `imported` replaces the old `healthKit` case; HealthKit stays out (S7). */
export type Provenance = 'imported' | 'manual' | 'estimated';

export type SessionStatus = 'scheduled' | 'inProgress' | 'completed' | 'partial' | 'abandoned';

export type ExerciseStatus = 'pending' | 'active' | 'done' | 'skipped';

export type LoadDecision =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'repeated' }
  | { readonly kind: 'manual'; readonly kg: number };

/** §3 `SetRecord`. The parent references live in the stored record, not in the domain. */
export interface SetRecord {
  readonly id: Uuid;
  /** 1-based, matches the card label "SERIE n". */
  readonly index: number;
  /** Canonical kilograms, always (I-3). */
  readonly weightKg: number;
  readonly targetReps: number;
  readonly actualReps: number;
  /** `null` = unanswered (I-7). Never defaulted, here or anywhere downstream. */
  readonly effort: Effort | null;
  /** `null` = unanswered (I-7). */
  readonly discomfort: Discomfort | null;
  /** The confirmation instant, never "now". */
  readonly confirmedAt: EpochMs;
}

/**
 * What an exercise session replaced, when the owner swapped the exercise for this session
 * only (odd/tasks/training-flow.md S4, T5). The substituted row keeps its own `id` and
 * takes the substitute's `exerciseId`, so the two histories never mix (S6): this record
 * is the evidence of what the slot originally prescribed, not a second exercise.
 */
export interface SubstitutedFrom {
  /** The library row of the original exercise, `null` once it is deleted (I-4). */
  readonly exerciseId: Uuid | null;
  /** Snapshot of the original name: history survives its deletion too. */
  readonly exerciseNameSnapshot: string;
  /** The instant of the swap, never "now" when it is read back. */
  readonly at: EpochMs;
}

/** §3 `ExerciseSession`, with the sets it contains. */
export interface ExerciseSession {
  readonly id: Uuid;
  readonly order: number;
  /** `null` once the exercise is deleted from the library (I-4). */
  readonly exerciseId: Uuid | null;
  /** Snapshot at creation: history survives a rename or an archive (I-4). */
  readonly exerciseNameSnapshot: string;
  /** Snapshot at creation: the prescription that was actually prescribed. */
  readonly prescription: ExercisePrescription;
  /** Frozen when the exercise session starts; never recomputed (I-2). */
  readonly recommendation: ProgressionRecommendation | null;
  readonly decision: LoadDecision | null;
  readonly recommendedWeightKg: number | null;
  readonly usedWeightKg: number | null;
  /** Stored evidence: `usedWeightKg − recommendedWeightKg` at decision time (I-8). */
  readonly loadDeltaKg: number | null;
  readonly sets: readonly SetRecord[];
  readonly status: ExerciseStatus;
  readonly completedAt: EpochMs | null;
  /**
   * The swap this row carries (S4, S6). Optional and additive: a row written before the
   * column existed, or one that was never substituted, simply does not have it, and
   * `mappers.ts` reads that as "this is the prescribed exercise". No migration.
   */
  readonly substitutedFrom?: SubstitutedFrom;
}

/** §3 `WorkoutSession`. */
export interface WorkoutSession {
  readonly id: Uuid;
  readonly planDayId: Uuid;
  /** e.g. "SENTADILLA / PIERNA", snapshotted so a plan edit cannot rewrite history. */
  readonly dayNameSnapshot: string;
  readonly scheduledDate: EpochMs;
  readonly startedAt: EpochMs | null;
  readonly endedAt: EpochMs | null;
  readonly phase: TrainingPhase;
  readonly status: SessionStatus;
  readonly exercises: readonly ExerciseSession[];
}

/** §3 `UserProfile`. */
export interface UserProfile {
  readonly id: Uuid;
  readonly displayName: string | null;
  readonly massUnit: MassUnit;
  readonly weightGoal: WeightGoal | null;
  readonly weeklyTrainingDays: number;
  readonly availableEquipment: readonly Equipment[];
  readonly autoStartRestTimer: boolean;
}

/** §3 `BodyMeasurement`. At least one measure is non-null (I-10). */
export interface BodyMeasurement {
  readonly id: Uuid;
  readonly date: EpochMs;
  readonly weightKg: number | null;
  readonly waistCm: number | null;
  readonly chestCm: number | null;
  readonly armCm: number | null;
  readonly thighCm: number | null;
  readonly hipCm: number | null;
  readonly bodyFatPercent: number | null;
  readonly provenance: Provenance;
}

/** §3 `ActivityRecord`. */
export interface ActivityRecord {
  readonly id: Uuid;
  readonly date: EpochMs;
  readonly kind: ActivityKind;
  readonly durationSeconds: number;
  readonly activeEnergyKcal: number | null;
  readonly provenance: Provenance;
  /** Dedupe key for imports (I-11). `null` for manual rows. */
  readonly externalSampleId: string | null;
}

/**
 * A weekday template item. §5.1 stores `planDays` and `planItems` separately, with
 * `by_planDay_order` for rendering; §3 does not declare the entity, so the shape here
 * is the minimal one the two stores imply and nothing more.
 */
export interface PlanItem {
  readonly id: Uuid;
  readonly planDayId: Uuid;
  readonly order: number;
  readonly exerciseId: Uuid | null;
  readonly exerciseNameSnapshot: string;
  readonly prescription: ExercisePrescription;
}

/** A weekday template day with its ordered items. */
export interface PlanDay {
  readonly id: Uuid;
  readonly name: string;
  readonly order: number;
  readonly items: readonly PlanItem[];
}

/** §5.1 single-row record: the answer to `navigator.storage.persist()` (Q-4). */
export interface StorageAnswer {
  readonly persisted: boolean | null;
  readonly checkedAt: EpochMs;
}

/**
 * T3 — the week of the match, as one single-row record: the Monday it belongs to, which
 * fixture it has, and the days the owner swapped inside it (T5, S9).
 *
 * It is the week's whole memory, and it lives on this device only: a restore clears
 * `meta`, so the record dies with the restore and no push has to carry it.
 */
export interface WeekRecord {
  /** Local `YYYY-MM-DD` of the Monday, exactly as `weekPlan` wants it. */
  readonly monday: string;
  /** S11: Thursday in the league, Tuesday in the cup, and the league is the default. */
  readonly match: MatchKind;
  readonly swaps: readonly WeekSwap[];
}

/** Re-exported so features import one module for the shapes they read. */
export type {
  Discomfort,
  Effort,
  Equipment,
  Exercise,
  ExercisePrescription,
  PhaseState,
  ProgressionRecommendation,
  RepRange,
  TrainingPhase,
};
