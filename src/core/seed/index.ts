/**
 * `src/core/seed` — the built-in library and the starter plan (FR-2.1, FR-3.1, FR-3.2,
 * FR-4.1), as plain data plus one pure function.
 *
 * The empty-store path is `seedRows()`: it returns the library and the plan in the order
 * they must be written, with stable ids (`seed-ex-…`, `seed-day-…`, `seed-item-…`) so the
 * write can be repeated without duplicating a row.
 *
 * Nothing here reads a clock, opens a store or generates a random id: the same input
 * always produces the same rows, which is what makes a half-finished first run resumable.
 */

export { EQUIPMENT_INCREMENT_KG, SEED_EXERCISES, seedExerciseById } from './exercises';
export {
  START_BLOCK,
  START_PHASE_STATE,
  seedPlanDays,
  seedRows,
  type SeedPlanDay,
  type SeedPlanItem,
  type SeedRows,
} from './plan';
