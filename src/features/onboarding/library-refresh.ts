/**
 * Refresh the seeded library in an existing store (odd/tasks/training-program.md S4/S5).
 *
 * The first-run flow writes a library once and then never touches it again: a day or an
 * exercise the owner edited stays theirs, which is why `startingPointRows` omits what is
 * already stored. That rule is right for the owner's rows and wrong for the seed's own
 * rows after a release that adds detail to them — an installation seeded before
 * descriptions and alternatives existed would keep showing a bare name until the database
 * was wiped.
 *
 * So the refresh is deliberately narrow:
 * - only rows the seed ships, by id;
 * - never a row flagged `isCustom` (the owner's own exercise);
 * - the owner's `isArchived` decision wins over the seed's;
 * - nothing is deleted, and the id never changes, so history stays attached (I-4).
 *
 * It is idempotent: a row that already carries the seed's content produces no write, so
 * the call can run once per launch without touching the store.
 */
import type { Exercise, StoragePort } from '../../storage';
import { SEED_EXERCISES } from '../../core/seed';

/** A stored row that differs from the seed in a way the refresh is allowed to fix. */
function merged(stored: Exercise, seed: Exercise): Exercise | null {
  if (stored.isCustom) return null;

  const next: Exercise = {
    ...seed,
    // The owner may have archived a seeded exercise; that is a decision, not staleness.
    isArchived: stored.isArchived,
  };

  const unchanged =
    stored.name === next.name &&
    stored.primaryMuscle === next.primaryMuscle &&
    stored.pattern === next.pattern &&
    stored.equipment === next.equipment &&
    stored.loadIncrementKg === next.loadIncrementKg &&
    sameList(stored.secondaryMuscles, next.secondaryMuscles) &&
    stored.description === next.description &&
    stored.variantOf === next.variantOf &&
    sameList(stored.alternatives, next.alternatives);

  return unchanged ? null : next;
}

function sameList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The rows to write, in seed order. Pure: the caller reads and writes, this decides.
 * A stored row the seed does not know is never returned — the owner's library is theirs.
 */
export function libraryRefreshRows(
  stored: readonly Exercise[],
  seed: readonly Exercise[] = SEED_EXERCISES,
): readonly Exercise[] {
  const byId = new Map(stored.map((exercise) => [exercise.id, exercise]));
  const rows: Exercise[] = [];

  for (const seedRow of seed) {
    const current = byId.get(seedRow.id);
    // A missing row is the first-run flow's job, not this one's.
    if (current === undefined) continue;
    const next = merged(current, seedRow);
    if (next !== null) rows.push(next);
  }

  return rows;
}

/** Read, refresh, write. Returns how many rows changed, which is what the caller logs. */
export async function refreshSeededLibrary(storage: StoragePort): Promise<number> {
  const stored = await storage.exercises.all();
  const rows = libraryRefreshRows(stored);
  for (const row of rows) {
    await storage.exercises.save(row);
  }
  return rows.length;
}
