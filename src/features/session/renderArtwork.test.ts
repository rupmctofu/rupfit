/**
 * The approved illustrations are bounded and accountable.
 *
 * Four rules keep the upgrade honest: every key is one the build can draw, the map covers
 * exactly the variants the owner approved, each one names a file that really ships, and
 * everything else keeps its line drawing. A typo here would show a broken image instead of
 * an exercise, and a stray key would quietly hide the pictogram of a variant nobody checked.
 */

import { describe, expect, it } from 'vitest';
import { ILLUSTRATION_KEYS } from './illustrationKey';
import { RENDERED_ARTWORK, renderedArtworkOf } from './renderArtwork';

/** Every `.webp` that really sits in `public/art/`, by file name. */
const SHIPPED = new Set(
  Object.keys(import.meta.glob('../../../public/art/*.webp')).map(
    (path) => path.slice(path.lastIndexOf('/') + 1) ?? '',
  ),
);

describe('the approved illustrations', () => {
  it('only names keys this build can draw', () => {
    for (const key of Object.keys(RENDERED_ARTWORK)) {
      expect(ILLUSTRATION_KEYS).toContain(key);
    }
  });

  it('covers exactly the variants approved so far', () => {
    expect(Object.keys(RENDERED_ARTWORK).sort()).toEqual([
      'bench-press',
      'deadlift-barbell',
      'squat-back',
    ]);
  });

  it('names a file that ships in public/art', () => {
    for (const asset of Object.values(RENDERED_ARTWORK)) {
      const name = asset.slice(asset.lastIndexOf('/') + 1);
      expect(SHIPPED, asset).toContain(name);
    }
  });

  it('leaves every other variant on its line drawing', () => {
    const rendered = new Set(Object.keys(RENDERED_ARTWORK));
    for (const key of ILLUSTRATION_KEYS) {
      expect(renderedArtworkOf(key) === null).toBe(!rendered.has(key));
    }
  });
});
