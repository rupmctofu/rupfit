/**
 * Refresh the seeded programme days in an existing store
 * (odd/tasks/training-program.md L11, odd/tasks/match-aware-week.md L7).
 *
 * The first-run flow writes the plan once and then never touches it again: a day the owner
 * renamed, emptied or reordered is theirs, and `plan.save` **replaces** a day's whole item
 * list (`data-model` §5.1), so re-writing a day that already exists would destroy an edited
 * routine. That rule is right for the owner's rows and wrong for the seed's own: a device
 * seeded before `FÍSICO` existed would keep three gym days forever, and a device seeded
 * before L7 renamed that day would keep generic conditioning while the programme says the
 * fourth day is football preparation. The only other writer is a first run that by
 * definition never happens again on that device.
 *
 * So the refresh is deliberately narrow, and it refuses more than it writes:
 *
 * - **It writes seeded days, and only in two cases.** A day whose id is absent from the
 *   store is added; a day the store still holds in a shape an earlier release shipped
 *   (`REPLACED_SEED_DAYS`) is rewritten in place. Both keep their ids, so nothing that
 *   points at a day — a session's `planDayId`, its `dayNameSnapshot` — is detached by the
 *   change. Every other stored day, including a seeded one the owner edited, is never
 *   passed to `plan.save`.
 * - **Rewriting in place needs the seed's own fingerprint.** Id, name and exercise order
 *   are what says "this row is mine": a rename, an added, removed or swapped exercise
 *   breaks the fingerprint, and the day stays the owner's. This is why a release that
 *   changes a seeded day must record the shape it is replacing here before shipping.
 * - **It never deletes anything.** A day the seed no longer ships stays where it is.
 * - **It writes the exercises a written day prescribes, and nothing else.** The preparation
 *   day names `Intervalos en pista`, which an old library has under the treadmill id only,
 *   and a plan row whose library row does not exist builds a session with
 *   `exerciseId: null` and no recommendation. Those missing rows are seeded first, in the
 *   same order the first-run flow uses (library before plan), and the library refresh's
 *   rule is untouched: it still only repairs rows that already exist.
 * - **It is idempotent and cheap.** The steady state is one read (`plan.all`) and no write:
 *   a store that already has every seeded day, in the shape this release writes, returns
 *   immediately. Only the launch that catches up reads the library as well and writes.
 *
 * Failure is never fatal: the caller runs it once per launch, and a store that could not be
 * refreshed opens with the days it has.
 */
import type { Exercise, PlanDay, StoragePort } from '../../storage';
import { SEED_EXERCISES, seedPlanDays, type SeedPlanDay } from '../../core/seed';

/** The part of a stored day the refresh reads to recognise its own earlier row. */
interface StoredDayShape {
  readonly id: string;
  readonly name: string;
  readonly items: readonly { readonly exerciseId: string | null }[];
}

/** A shape the seed shipped for a day and has since changed in place. */
interface ReplacedSeedDay extends StoredDayShape {
  readonly items: readonly { readonly exerciseId: string }[];
}

/**
 * The seeded days an earlier release wrote differently, verbatim.
 *
 * One entry per day that a release changed in place, with the id, the name and the exercise
 * order it used to write. It is data, not a rule: the refresh cannot tell an outdated day
 * from an edited one by comparing with today's seed — both differ from it — so the old shape
 * has to be recorded.
 */
const REPLACED_SEED_DAYS: readonly ReplacedSeedDay[] = [
  {
    // Until odd/tasks/match-aware-week.md L7 the fourth day was `FÍSICO`: generic
    // conditioning on a treadmill, four slots, no Nordic curl.
    id: 'seed-day-fisico',
    name: 'FÍSICO',
    items: [
      { exerciseId: 'seed-ex-intervalos-cinta' },
      { exerciseId: 'seed-ex-copenhagen-corto' },
      { exerciseId: 'seed-ex-soleo-isometrico' },
      { exerciseId: 'seed-ex-plancha' },
    ],
  },
];

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

/** Is this stored day still exactly the row an earlier release wrote? */
function stillTheShape(stored: StoredDayShape, previous: ReplacedSeedDay): boolean {
  return (
    previous.name === stored.name &&
    previous.items.length === stored.items.length &&
    previous.items.every((item, index) => item.exerciseId === stored.items[index]?.exerciseId)
  );
}

/**
 * The `seedPlanDays()` days the store still holds in a shape an earlier release wrote, in
 * seed order — the days this refresh may rewrite in place.
 *
 * The test is exact on purpose. A stored day that differs from the old shape in any way is
 * a day the owner touched, and touching it back would be the one destructive thing this
 * module could do.
 */
export function outdatedSeedDays(
  stored: readonly StoredDayShape[],
  seed: readonly SeedPlanDay[] = seedPlanDays(),
  replaced: readonly ReplacedSeedDay[] = REPLACED_SEED_DAYS,
): readonly SeedPlanDay[] {
  return seed.filter((day) => {
    const previous = replaced.find((row) => row.id === day.id);
    const storedDay = stored.find((row) => row.id === day.id);

    return previous !== undefined && storedDay !== undefined && stillTheShape(storedDay, previous);
  });
}

/**
 * Read, decide, write. Returns how many days were written, which is what the caller logs.
 *
 * The library is read only when there is a day to write, so a current store costs one read.
 */
export async function refreshSeededPlanDays(storage: StoragePort): Promise<number> {
  const stored = await storage.plan.all();
  // Two kinds of work, one writer: a day the store lacks is added, and a day it still holds
  // in an earlier release's shape is rewritten in place under the same id.
  const days = [...missingSeedDays(stored), ...outdatedSeedDays(stored)];
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
