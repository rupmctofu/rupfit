import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../storage';
import { SEED_EXERCISES } from '../../core/seed';
import { libraryRefreshRows } from './library-refresh';

/**
 * odd/tasks/training-program.md S4/S5: a store seeded before descriptions and
 * alternatives existed must gain them, and the owner's own decisions must survive.
 */
const seed = SEED_EXERCISES;
const squat = seed.find((row) => row.id === 'seed-ex-sentadilla-trasera');
if (squat === undefined) throw new Error('the seed lost the squat');

/** A row as an older release wrote it: no detail fields, possibly an older name. */
function legacy(row: Exercise, overrides: Partial<Exercise> = {}): Exercise {
  const { secondaryMuscles, description, variantOf, alternatives, ...rest } = row;
  void secondaryMuscles;
  void description;
  void variantOf;
  void alternatives;
  return { ...rest, ...overrides };
}

describe('refreshing the seeded library', () => {
  it('gives an old row the description and alternatives it is missing', () => {
    const rows = libraryRefreshRows([legacy(squat)], seed);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(squat.id);
    expect(rows[0]?.description).toBe(squat.description);
    expect(rows[0]?.alternatives).toEqual(squat.alternatives);
    expect(rows[0]?.secondaryMuscles).toEqual(squat.secondaryMuscles);
  });

  it('keeps the owner archived decision and never touches a custom row', () => {
    const press = seed.find((row) => row.id === 'seed-ex-prensa');
    if (press === undefined) throw new Error('the seed lost the press');

    const archived = legacy(squat, { isArchived: true });
    // A seeded row the owner converted into their own: the refresh must not rewrite it.
    const custom: Exercise = { ...legacy(press), isCustom: true, name: 'Mi prensa' };

    const rows = libraryRefreshRows([archived, custom], seed);
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(archived.id)?.isArchived).toBe(true);
    expect(byId.get(archived.id)?.description).toBe(squat.description);
    expect(byId.has(custom.id)).toBe(false);
  });

  it('writes nothing when the store already carries the seed content', () => {
    expect(libraryRefreshRows(seed, seed)).toEqual([]);
  });

  it('leaves a row the seed does not know and a missing row alone', () => {
    const mine: Exercise = { ...legacy(squat), id: 'mine-1', name: 'Remo propio', isCustom: true };
    const rows = libraryRefreshRows([mine, legacy(squat)], seed);

    expect(rows.map((row) => row.id)).toEqual([squat.id]);
  });

  it('never changes an id, so history stays attached to its exercise', () => {
    const rows = libraryRefreshRows([legacy(squat, { name: 'Gemelos' })], seed);
    expect(rows[0]?.id).toBe(squat.id);
  });
});
