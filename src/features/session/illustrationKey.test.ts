/**
 * The illustration key (S3, T3–T4): a picture per concrete variant, and no picture at all
 * when the row does not name one.
 *
 * Two failures would be invisible in a screenshot and are therefore pinned here: an
 * exercise the plan prescribes without art (the session's visual core would fall back to a
 * generic equipment icon for the owner's main lift), and two different variants sharing
 * one drawing — which is exactly the "generic image that could be another exercise" S3
 * forbids.
 */

import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES, seedPlanDays } from '../../core/seed';
import type { Exercise } from '../../core/domain';
import { illustrationKeyOf, ILLUSTRATION_KEYS, isIllustrationKey } from './illustrationKey';
import { PICTOGRAMS } from './pictograms';

function libraryRow(id: string): Exercise {
  const row = SEED_EXERCISES.find((exercise) => exercise.id === id);
  if (row === undefined) throw new Error(`the library has no ${id}`);
  return row;
}

describe('the key a library row carries', () => {
  it('answers with the row’s own key when this build can draw it', () => {
    const squat = libraryRow('seed-ex-sentadilla-trasera');
    expect(illustrationKeyOf(squat)).toBe('squat-back');
    expect(isIllustrationKey(squat.illustration)).toBe(true);
  });

  it('falls back to nothing for a row without a key', () => {
    // A custom exercise, or a row written before the field existed: the key is absent.
    const { illustration: _dropped, ...withoutKey } = libraryRow('seed-ex-sentadilla-trasera');
    expect(illustrationKeyOf(withoutKey)).toBeNull();
    expect(illustrationKeyOf(undefined)).toBeNull();
  });

  it('falls back to nothing for a key this build does not know', () => {
    // A future row must not borrow the first drawing of the table.
    const future: Exercise = { ...libraryRow('seed-ex-sentadilla-trasera'), illustration: 'squat-martian' };
    expect(illustrationKeyOf(future)).toBeNull();
    expect(isIllustrationKey('squat-martian')).toBe(false);
    expect(isIllustrationKey('')).toBe(false);
  });
});

describe('the artwork of the programme', () => {
  it('draws every exercise the plan prescribes', () => {
    for (const day of seedPlanDays()) {
      for (const item of day.items) {
        const row = libraryRow(item.exerciseId ?? '');
        expect(illustrationKeyOf(row), item.exerciseNameSnapshot).not.toBeNull();
      }
    }
  });

  it('draws the fourth day, and draws each of its exercises differently', () => {
    // L11: the conditioning day is four new pictures in the same line style — the belt,
    // the low step, the held heel raise and the floor under the forearms.
    const day = seedPlanDays().find((candidate) => candidate.name === 'FÍSICO');
    if (day === undefined) throw new Error('the fourth day is missing');

    const keys = day.items.map((item) => {
      const key = illustrationKeyOf(libraryRow(item.exerciseId ?? ''));
      expect(key, item.exerciseNameSnapshot).not.toBeNull();
      return key;
    });

    expect(keys).toEqual([
      'treadmill-intervals',
      'copenhagen-short',
      'calf-raise-isometric',
      'plank-front',
    ]);
    // One drawing per variant: no two items of the day share a picture.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives the interval family one drawing per implement', () => {
    // S3: the treadmill, the bike and the track are three exercises and three pictures;
    // reusing one of them would be the wrong-variant image the rule forbids.
    const keys = [
      'seed-ex-intervalos-cinta',
      'seed-ex-intervalos-bici',
      'seed-ex-intervalos-pista',
    ].map((id) => libraryRow(id).illustration);

    expect(keys.filter((key) => key === undefined)).toHaveLength(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(isIllustrationKey(key)).toBe(true);
  });

  it('draws every library row that names a key, so no row points at nothing', () => {
    for (const row of SEED_EXERCISES) {
      if (row.illustration === undefined) continue;
      expect(isIllustrationKey(row.illustration), row.id).toBe(true);
    }
  });

  it('gives a different drawing to two different variants of one movement', () => {
    // S3: the image must be the concrete variant, not a generic picture of the family.
    const pairs: readonly (readonly [string, string])[] = [
      ['seed-ex-sentadilla-trasera', 'seed-ex-sentadilla-frontal'],
      ['seed-ex-curl-femoral', 'seed-ex-curl-femoral-sentado'],
      ['seed-ex-gemelos', 'seed-ex-soleo-sentado'],
      ['seed-ex-copenhagen-adaptado', 'seed-ex-copenhagen-corto'],
      ['seed-ex-press-hombro', 'seed-ex-press-hombro-maquina'],
      ['seed-ex-dominadas', 'seed-ex-dominadas-asistidas'],
    ];
    for (const [left, right] of pairs) {
      const leftRow = SEED_EXERCISES.find((exercise) => exercise.id === left);
      const rightRow = SEED_EXERCISES.find((exercise) => exercise.id === right);
      if (leftRow === undefined || rightRow === undefined) continue;
      expect(leftRow.illustration, left).not.toBe(rightRow.illustration);
    }
  });

  it('keeps every key addressable and every drawing inside its grid', () => {
    expect(ILLUSTRATION_KEYS.length).toBeGreaterThanOrEqual(26);
    for (const key of ILLUSTRATION_KEYS) {
      const pictogram = PICTOGRAMS[key];
      expect(pictogram.body.length, key).toBeGreaterThan(0);
      const points = [pictogram.head, ...pictogram.body.flat()];
      for (const [x, y] of points) {
        expect(Number.isFinite(x) && Number.isFinite(y), key).toBe(true);
        expect(x, key).toBeGreaterThanOrEqual(0);
        expect(x, key).toBeLessThanOrEqual(120);
        expect(y, key).toBeGreaterThanOrEqual(0);
        expect(y, key).toBeLessThanOrEqual(120);
      }
    }
  });
});
