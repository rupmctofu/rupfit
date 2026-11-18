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
 * - **It writes seeded days, and only in four cases.** A day whose id is absent from the
 *   store is added; a day the store still holds in a shape an earlier release shipped
 *   (`REPLACED_SEED_DAYS`) is rewritten in place; a day the seed later gained a row for
 *   gets that row appended (`APPENDED_SEED_ITEMS`); and a row the store still holds with
 *   the prescription an earlier release wrote (`REPLACED_SEED_PRESCRIPTIONS`) gets the
 *   prescription of today's seed row with the same id. All four keep their ids, so nothing
 *   that points at a day — a session's `planDayId`, its `dayNameSnapshot` — is detached by
 *   the change. Every other stored day, including a seeded one the owner edited, is never
 *   passed to `plan.save`.
 * - **Rewriting in place needs the seed's own fingerprint.** Id, name and exercise order
 *   are what says "this row is mine": a rename, an added, removed or swapped exercise
 *   breaks the fingerprint, and the day stays the owner's. This is why a release that
 *   changes a seeded day must record the shape it is replacing here before shipping.
 *   A day can have more than one historical shape (the fourth day has two: `FÍSICO` and
 *   then `PREPARACIÓN FÚTBOL`), and any of them is enough to recognise it.
 * - **It adds a row the seed appended to a day it already shipped.** `APPENDED_SEED_ITEMS`
 *   is the record of that kind of release (odd/tasks/incline-walk.md S1, S5: the closing
 *   twenty-minute walk). The day has to be exactly the shape the seed wrote before the
 *   append, and only the appended row is written: the owner's own items keep their ids,
 *   their order and their numbers, because the day is saved from the rows the store holds
 *   plus the seed's new ones. It fires only while the day lacks them, which is what makes
 *   this a one-time catch-up rather than a rule that re-adds a row the owner deletes.
 * - **It never deletes anything.** A day the seed no longer ships stays where it is.
 * - **It updates a prescription, never a row.** A day is written because one of its rows
 *   carries an old prescription verbatim; that row keeps its id, its day, its order and its
 *   exercise name snapshot, and only its numbers change. A row that differs in any field
 *   from the recorded shape, a row whose id is not the seed's, and every row of a day the
 *   owner renamed are left alone.
 * - **It writes the exercises a written day prescribes, and nothing else.** The mobility
 *   day names rows an old library does not have, and a plan row whose library row does not
 *   exist builds a session with `exerciseId: null` and no recommendation. Those missing
 *   rows are seeded first, in the same order the first-run flow uses (library before plan),
 *   and the library refresh's rule is untouched: it still only repairs rows that already
 *   exist, so an archived row stays exactly as the owner left it.
 * - **It is idempotent and cheap.** The steady state is one read (`plan.all`) and no write:
 *   a store that already has every seeded day, in the shape this release writes, returns
 *   immediately. Only the launch that catches up reads the library as well and writes.
 *
 * Failure is never fatal: the caller runs it once per launch, and a store that could not be
 * refreshed opens with the days it has.
 */
import type {
  Exercise,
  ExercisePrescription,
  PlanDay,
  RepRange,
  StoragePort,
} from '../../storage';
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
    // odd/tasks/five-day-plan.md S1: the fourth day stops being football preparation and
    // becomes mobility and core. Its L7 shape was the track interval, the assisted Nordic,
    // the short Copenhagen, the held soleus and the front plank.
    id: 'seed-day-fisico',
    name: 'PREPARACIÓN FÚTBOL',
    items: [
      { exerciseId: 'seed-ex-intervalos-pista' },
      { exerciseId: 'seed-ex-nordic-asistido' },
      { exerciseId: 'seed-ex-copenhagen-corto' },
      { exerciseId: 'seed-ex-soleo-isometrico' },
      { exerciseId: 'seed-ex-plancha' },
    ],
  },
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
  {
    // odd/tasks/three-lift-plan.md S2: the three strength days take the name of the lift each
    // one opens with, and the weight moves. Day one loses the Romanian deadlift, day two
    // gains the incline bench, day three becomes the conventional deadlift and the pulling
    // work. These are the shapes the release before this one wrote for each day.
    id: 'seed-day-leg',
    name: 'PIERNA',
    items: [
      { exerciseId: 'seed-ex-sentadilla-trasera' },
      { exerciseId: 'seed-ex-peso-muerto-rumano' },
      { exerciseId: 'seed-ex-prensa' },
      { exerciseId: 'seed-ex-curl-femoral-sentado' },
      { exerciseId: 'seed-ex-nordic-asistido' },
      { exerciseId: 'seed-ex-copenhagen-adaptado' },
      { exerciseId: 'seed-ex-gemelos' },
      { exerciseId: 'seed-ex-soleo-sentado' },
      { exerciseId: 'seed-ex-caminata-inclinada' },
    ],
  },
  {
    id: 'seed-day-torso-a',
    name: 'TORSO A',
    items: [
      { exerciseId: 'seed-ex-press-banca' },
      { exerciseId: 'seed-ex-remo-barra' },
      { exerciseId: 'seed-ex-jalon-pecho' },
      { exerciseId: 'seed-ex-press-hombro' },
      { exerciseId: 'seed-ex-elevaciones-laterales' },
      { exerciseId: 'seed-ex-curl-barra' },
      { exerciseId: 'seed-ex-extensiones-triceps' },
      { exerciseId: 'seed-ex-caminata-inclinada' },
    ],
  },
  {
    id: 'seed-day-torso-b',
    name: 'TORSO B',
    items: [
      { exerciseId: 'seed-ex-press-banca-inclinado' },
      { exerciseId: 'seed-ex-remo-maquina' },
      { exerciseId: 'seed-ex-dominadas-asistidas' },
      { exerciseId: 'seed-ex-press-hombro-maquina' },
      { exerciseId: 'seed-ex-face-pull' },
      { exerciseId: 'seed-ex-curl-polea' },
      { exerciseId: 'seed-ex-extension-triceps-mancuerna' },
      { exerciseId: 'seed-ex-caminata-inclinada' },
    ],
  },
  // The same three days one release earlier, before odd/tasks/incline-walk.md appended the
  // closing walk to every day. A store that skipped that release is rewritten by this one,
  // instead of keeping the bare names forever.
  {
    id: 'seed-day-leg',
    name: 'PIERNA',
    items: [
      { exerciseId: 'seed-ex-sentadilla-trasera' },
      { exerciseId: 'seed-ex-peso-muerto-rumano' },
      { exerciseId: 'seed-ex-prensa' },
      { exerciseId: 'seed-ex-curl-femoral-sentado' },
      { exerciseId: 'seed-ex-nordic-asistido' },
      { exerciseId: 'seed-ex-copenhagen-adaptado' },
      { exerciseId: 'seed-ex-gemelos' },
      { exerciseId: 'seed-ex-soleo-sentado' },
    ],
  },
  {
    id: 'seed-day-torso-a',
    name: 'TORSO A',
    items: [
      { exerciseId: 'seed-ex-press-banca' },
      { exerciseId: 'seed-ex-remo-barra' },
      { exerciseId: 'seed-ex-jalon-pecho' },
      { exerciseId: 'seed-ex-press-hombro' },
      { exerciseId: 'seed-ex-elevaciones-laterales' },
      { exerciseId: 'seed-ex-curl-barra' },
      { exerciseId: 'seed-ex-extensiones-triceps' },
    ],
  },
  {
    id: 'seed-day-torso-b',
    name: 'TORSO B',
    items: [
      { exerciseId: 'seed-ex-press-banca-inclinado' },
      { exerciseId: 'seed-ex-remo-maquina' },
      { exerciseId: 'seed-ex-dominadas-asistidas' },
      { exerciseId: 'seed-ex-press-hombro-maquina' },
      { exerciseId: 'seed-ex-face-pull' },
      { exerciseId: 'seed-ex-curl-polea' },
      { exerciseId: 'seed-ex-extension-triceps-mancuerna' },
    ],
  },
];

/**
 * The items a release appended to a day the seed had already shipped, verbatim.
 *
 * Like `REPLACED_SEED_DAYS`, this is data and not a rule: on its own the refresh cannot
 * tell a day seeded before the walk from a day the owner built without it, so the release
 * that appends records here which item ids it is adding, and to which day.
 *
 * The ids are the positions the appended rows hold in the seed of today, because that is
 * what `extendedSeedDays` subtracts from: a release that reorders a day re-points them, or
 * the append silently stops happening for that day. A day that is reshaped wholesale — not
 * extended — belongs in `REPLACED_SEED_DAYS` instead; that is where the three strength days
 * went when odd/tasks/three-lift-plan.md S2 rewrote them.
 */
interface AppendedSeedItem {
  readonly dayId: string;
  /** The seed item ids this release adds to that day, in seed order. */
  readonly itemIds: readonly string[];
}

/**
 * odd/tasks/incline-walk.md S1, S2, S5: every seeded day ends with twenty minutes of
 * inclined walking, so a store seeded before it gains that row — the last item of each of
 * the four days, once.
 */
const APPENDED_SEED_ITEMS: readonly AppendedSeedItem[] = [
  { dayId: 'seed-day-leg', itemIds: ['seed-item-leg-8'] },
  { dayId: 'seed-day-torso-a', itemIds: ['seed-item-torso-a-7'] },
  { dayId: 'seed-day-torso-b', itemIds: ['seed-item-torso-b-8'] },
  { dayId: 'seed-day-fisico', itemIds: ['seed-item-fisico-7'] },
];

/**
 * The prescriptions an earlier release wrote on the seeded lifting rows, verbatim, with
 * every field of the row's `prescription` — `durationSeconds` included, as absent.
 *
 * Like `REPLACED_SEED_DAYS` this is data, not a rule: the refresh cannot tell an outdated
 * prescription from one the owner typed by comparing with today's seed — both differ from it
 * — so the shape the previous release shipped has to be recorded here before a release
 * changes the numbers it prescribes. `preventive` and `conditioning` are absent on purpose:
 * odd/tasks/prescription-3x8.md S6 and S7 leave those columns exactly as they were, so a
 * device that holds them holds today's numbers and needs no write.
 */
const REPLACED_SEED_PRESCRIPTIONS: readonly ExercisePrescription[] = [
  // odd/tasks/five-day-plan.md S6/S7, still the block-1 row of the `strength` column in the
  // release before odd/tasks/prescription-3x8.md: 8–10 repetitions to failure.
  {
    sets: 3,
    repRange: { lowerBound: 8, upperBound: 10 },
    targetRIR: { lowerBound: 0, upperBound: 0 },
    restSeconds: 180,
    role: 'strength',
  },
  // The same release, the same numbers, on the `hypertrophy` column.
  {
    sets: 3,
    repRange: { lowerBound: 8, upperBound: 10 },
    targetRIR: { lowerBound: 0, upperBound: 0 },
    restSeconds: 120,
    role: 'hypertrophy',
  },
  // The same release on the `accessory` column, whose block 1 still started at two sets.
  {
    sets: 2,
    repRange: { lowerBound: 8, upperBound: 10 },
    targetRIR: { lowerBound: 0, upperBound: 0 },
    restSeconds: 90,
    role: 'accessory',
  },
  // The squat's own override of the same release (`src/core/seed/plan.ts`, S6: "En
  // sentadilla dejarme un rir1"): the `strength` column with one repetition in reserve. The
  // seed no longer special-cases it, but a device in the wild still holds this row.
  {
    sets: 3,
    repRange: { lowerBound: 8, upperBound: 10 },
    targetRIR: { lowerBound: 1, upperBound: 1 },
    restSeconds: 180,
    role: 'strength',
  },
];

/** The prefix a row the seed wrote carries; the owner's own rows never match it. */
const SEED_ITEM_PREFIX = 'seed-item-';

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
  days: readonly { readonly items: readonly { readonly exerciseId: string | null }[] }[],
  stored: readonly { readonly id: string }[],
  seed: readonly Exercise[] = SEED_EXERCISES,
): readonly Exercise[] {
  const known = new Set(stored.map((exercise) => exercise.id));
  const prescribed = new Set(
    days.flatMap((day) =>
      day.items.flatMap((item) => (item.exerciseId === null ? [] : [item.exerciseId])),
    ),
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
    const previous = replaced.filter((row) => row.id === day.id);
    const storedDay = stored.find((row) => row.id === day.id);

    return (
      previous.length > 0 &&
      storedDay !== undefined &&
      previous.some((row) => stillTheShape(storedDay, row))
    );
  });
}

/**
 * The seeded days that gained a row since the release that wrote them, as they must be
 * stored: the rows the store already holds, then the seed's new items in seed order.
 *
 * The test is the one `outdatedSeedDays` makes, applied to the day as it was before the
 * append: name, item count and exercise order have to be the seed's own. A day that
 * differs in any way is a day the owner touched, and a row added to it would be a row added
 * to their routine.
 */
export function extendedSeedDays(
  stored: readonly PlanDay[],
  seed: readonly SeedPlanDay[] = seedPlanDays(),
  appended: readonly AppendedSeedItem[] = APPENDED_SEED_ITEMS,
): readonly PlanDay[] {
  const extensions: PlanDay[] = [];

  for (const day of seed) {
    const storedDay = stored.find((row) => row.id === day.id);
    if (storedDay === undefined) continue;

    const ids = appended.filter((row) => row.dayId === day.id).flatMap((row) => row.itemIds);
    if (ids.length === 0) continue;

    const present = new Set(storedDay.items.map((item) => item.id));
    const added = day.items.filter((item) => ids.includes(item.id) && !present.has(item.id));
    if (added.length === 0) continue;

    const before: ReplacedSeedDay = {
      id: day.id,
      name: day.name,
      items: day.items
        .filter((item) => !added.includes(item))
        .map((item) => ({ exerciseId: item.exerciseId })),
    };
    if (!stillTheShape(storedDay, before)) continue;

    extensions.push({
      id: storedDay.id,
      name: storedDay.name,
      order: storedDay.order,
      // The owner's rows are copied, never rebuilt: an edited prescription on a seeded day
      // survives the append, and history keeps pointing at the same item ids.
      items: [
        ...storedDay.items,
        ...added.map((item, index) => ({ ...item, order: storedDay.items.length + index })),
      ],
    });
  }

  return extensions;
}

/**
 * Do two rep ranges say the same thing? The stored row is compared field by field against
 * the recorded shape, never by reference.
 */
function sameRange(stored: RepRange, previous: RepRange): boolean {
  return stored.lowerBound === previous.lowerBound && stored.upperBound === previous.upperBound;
}

/** Is this stored row still carrying exactly one of the recorded old prescriptions? */
function stillThePrescription(
  stored: { readonly prescription: ExercisePrescription },
  previous: ExercisePrescription,
): boolean {
  const prescription = stored.prescription;
  return (
    prescription.sets === previous.sets &&
    sameRange(prescription.repRange, previous.repRange) &&
    sameRange(prescription.targetRIR, previous.targetRIR) &&
    prescription.restSeconds === previous.restSeconds &&
    prescription.role === previous.role &&
    prescription.durationSeconds === previous.durationSeconds
  );
}

/**
 * The seeded days the store still holds with a prescription an earlier release wrote, as
 * they must be stored: the rows the store holds, with today's prescription on the rows that
 * are verbatim old ones.
 *
 * The test is exact, twice over, for the reason `outdatedSeedDays` is. The day has to carry
 * the seed's own name: a seeded day the owner renamed is theirs, and nothing about its rows
 * says otherwise. The row has to carry a recorded old prescription in every field — sets,
 * reps, RIR, rest and profile — because a row that differs in any of them is a row the
 * owner edited, and rewriting it back would overwrite a decision they made. A row whose id
 * is not the seed's (`seed-item-…`) is never touched either, whatever it prescribes.
 *
 * The item id is the identity, not the position: a day may have been reordered, and a row
 * the seed no longer ships keeps whatever it says, because this rule brings a row up to
 * date and never removes one.
 */
export function represcribedSeedDays(
  stored: readonly PlanDay[],
  seed: readonly SeedPlanDay[] = seedPlanDays(),
  replaced: readonly ExercisePrescription[] = REPLACED_SEED_PRESCRIPTIONS,
): readonly PlanDay[] {
  const updated: PlanDay[] = [];

  for (const day of seed) {
    const storedDay = stored.find((row) => row.id === day.id);
    if (storedDay === undefined || storedDay.name !== day.name) continue;

    const today = new Map(day.items.map((item) => [item.id, item.prescription]));
    let changed = false;
    const items = storedDay.items.map((item) => {
      if (!item.id.startsWith(SEED_ITEM_PREFIX)) return item;
      if (!replaced.some((shape) => stillThePrescription(item, shape))) return item;
      const prescription = today.get(item.id);
      if (prescription === undefined) return item;
      changed = true;
      // Only the numbers change: the id, the day it belongs to, its order and the exercise
      // name the row was trained under are copied from the store.
      return { ...item, prescription: { ...prescription } };
    });

    if (changed) updated.push({ ...storedDay, items });
  }

  return updated;
}

/**
 * Read, decide, write. Returns how many days were written, which is what the caller logs.
 *
 * The library is read only when there is a day to write, so a current store costs one read.
 */
export async function refreshSeededPlanDays(storage: StoragePort): Promise<number> {
  const stored = await storage.plan.all();
  // Four kinds of work, one writer: a day the store lacks is added, a day it still holds in
  // an earlier release's shape is rewritten in place under the same id, a day that gained a
  // row since it was written gets that row appended, and a row still carrying an earlier
  // release's prescription gets today's. A day is written once, by the narrowest rule that
  // claims it.
  const added = missingSeedDays(stored);
  const rewritten = outdatedSeedDays(stored);
  const claimed = (day: { readonly id: string }): boolean =>
    added.some((row) => row.id === day.id) || rewritten.some((row) => row.id === day.id);
  const extended = extendedSeedDays(stored).filter((day) => !claimed(day));

  // The prescription pass reads the store, plus the rows the append rule is about to write,
  // so a day that gains its closing walk in this launch also gets today's numbers in the
  // same write instead of on the next one.
  const pending = new Map<string, PlanDay>(stored.map((day) => [day.id, day]));
  for (const day of extended) pending.set(day.id, day);

  const days = new Map<string, PlanDay>();
  for (const day of [...added, ...rewritten, ...extended]) days.set(day.id, day);
  for (const day of represcribedSeedDays([...pending.values()])) {
    // An added or a rewritten day is already the seed's own row, numbers included.
    if (!claimed(day)) days.set(day.id, day);
  }

  const writes = [...days.values()];
  if (writes.length === 0) return 0;

  // Library first: the day's items name these ids, and a session built against a dangling
  // id would have a name and nothing to prescribe.
  const library = await storage.exercises.all();
  for (const exercise of missingPrescribedExercises(writes, library)) {
    await storage.exercises.save(exercise);
  }

  for (const day of writes) await storage.plan.save(day);
  return writes.length;
}
