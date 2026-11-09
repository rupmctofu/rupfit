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
