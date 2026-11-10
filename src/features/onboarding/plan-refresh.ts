/**
 * Refresh the seeded programme days in an existing store
 * (odd/tasks/training-program.md L11).
 *
 * The first-run flow writes the plan once and then never touches it again: a day the owner
 * renamed, emptied or reordered is theirs, and `plan.save` **replaces** a day's whole item
 * list (`data-model` §5.1), so re-writing a day that already exists would destroy an edited
 * routine. That rule is right for the owner's rows and wrong for a release that adds a day
 * to the programme: the owner's device was seeded before `FÍSICO` existed, and without this
 * refresh it would keep three gym days forever, because the only other writer is a first
 * run that by definition never happens again on that device.
 *
 * So the refresh is deliberately narrow, and it refuses more than it writes:
 *
 * - **It writes only seeded days whose id is absent from the store.** An existing day is
 *   never passed to `plan.save`, so its items, order and name are untouched — not even a
 *   day the owner edited down to one exercise.
 * - **It never deletes anything.** A day the seed no longer ships stays where it is.
 * - **It writes the exercises a missing day prescribes, and nothing else.** `FÍSICO` names
 *   `Intervalos en cinta de correr`, and a plan row whose library row does not exist builds
 *   a session with `exerciseId: null` and no recommendation. Those missing rows are seeded
 *   first, in the same order the first-run flow uses (library before plan), and the library
 *   refresh's rule is untouched: it still only repairs rows that already exist.
 * - **It is idempotent and cheap.** The steady state is one read (`plan.all`) and no write:
 *   a store that already has every seeded day returns immediately. Only the launch that
 *   catches up reads the library as well and writes the day.
 *
 * Failure is never fatal: the caller runs it once per launch, and a store that could not be
 * refreshed opens with the days it has.
 */
import type { Exercise, PlanDay, StoragePort } from '../../storage';
import { SEED_EXERCISES, seedPlanDays, type SeedPlanDay } from '../../core/seed';

/** The seeded days the store does not have yet, in rotation order. */
export function missingSeedDays(
  stored: readonly { readonly id: string }[],
  seed: readonly SeedPlanDay[] = seedPlanDays(),
): readonly SeedPlanDay[] {
  const existing = new Set(stored.map((day) => day.id));
  return seed.filter((day) => !existing.has(day.id));
}

/**
 * The seed rows the days being written prescribe and the store does not hold.
 *
 * Narrower than "every missing seed row" on purpose: the library refresh leaves a missing
 * row to the first-run flow, and this function exists for one reason — a day cannot be
 * written before the exercises it names.
 */
export function missingPrescribedExercises(
  days: readonly SeedPlanDay[],
  stored: readonly { readonly id: string }[],
  seed: readonly Exercise[] = SEED_EXERCISES,
): readonly Exercise[] {
  const known = new Set(stored.map((exercise) => exercise.id));
  const prescribed = new Set(
    days.flatMap((day) => day.items.map((item) => item.exerciseId)),
  );

  return seed.filter((exercise) => prescribed.has(exercise.id) && !known.has(exercise.id));
}

/**
 * Read, decide, write. Returns how many days were added, which is what the caller logs.
 *
 * The library is read only when there is a day to add, so a current store costs one read.
 */
export async function refreshSeededPlanDays(storage: StoragePort): Promise<number> {
  const days = missingSeedDays(await storage.plan.all());
  if (days.length === 0) return 0;

  // Library first: the day's items name these ids, and a session built against a dangling
  // id would have a name and nothing to prescribe.
  const library = await storage.exercises.all();
  for (const exercise of missingPrescribedExercises(days, library)) {
    await storage.exercises.save(exercise);
  }

  for (const day of days) await storage.plan.save(day);
  return days.length;
}
