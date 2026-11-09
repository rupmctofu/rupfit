/**
 * Domain entities — Rupfit (docs/data-model.md §3).
 *
 * Only the entities the progression engine reads are declared here. Persistence
 * entities and IndexedDB mappers live outside the domain (T5).
 */

import type { Equipment, MovementPattern, MuscleGroup, RepRange } from './values';
import type { BlockRole } from './progression';

export interface Exercise {
  readonly id: string;
  readonly name: string;
  readonly primaryMuscle: MuscleGroup;
  readonly pattern: MovementPattern;
  readonly equipment: Equipment;
  /**
   * Smallest reachable step on this implement, in kg. `0` means bodyweight:
   * no weight arithmetic is ever performed and progression is repetitions only
   * (docs/progression-engine.md §6).
   */
  readonly loadIncrementKg: number;
  readonly isCustom: boolean;
  readonly isArchived: boolean;
  /**
   * Library detail (odd/tasks/training-program.md S4–S5, T3). The four members below are
   * optional and purely additive: a row written before they existed omits them, so an old
   * database, an old backup and a custom exercise keep working with no migration and no
   * required field (ADR-011, data-model §9).
   */
  /** Muscles the movement also works, besides `primaryMuscle` (S4). */
  readonly secondaryMuscles?: readonly MuscleGroup[];
  /** How to execute it, in Spanish, naming the machine or the implement (S4). */
  readonly description?: string;
  /** The generic movement this row is a variant of, by `Exercise.id` (S4, S5). */
  readonly variantOf?: string;
  /** Ids that can replace this row when its machine is busy (S5). */
  readonly alternatives?: readonly string[];
}

export interface ExercisePrescription {
  readonly sets: number;
  readonly repRange: RepRange;
  /** Target reps in reserve for the prescription (docs/data-model.md §3). */
  readonly targetRIR: RepRange;
  readonly restSeconds: number;
  /**
   * Which column of the readaptation block table prescribes this exercise
   * (`docs/progression-engine.md §8`). Optional and additive: a prescription written
   * before profiles existed falls back to the phase role and then to hypertrophy, so old
   * stored sessions and old backups keep working untouched.
   */
  readonly role?: BlockRole;
}
