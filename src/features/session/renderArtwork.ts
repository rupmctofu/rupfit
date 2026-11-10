/**
 * Approved illustrations, drawn by the owner and shipped as cut-out WebP.
 *
 * `pictograms.ts` stays the fallback: a line drawing for every variant the app knows, 408
 * bytes each. This module is the upgrade path — a variant listed here is painted with the
 * real illustration the owner approved, cut out of its backdrop by `tools/art/cutout.py`
 * (flat backdrop removed, trimmed, squared, 512 px, WebP). Nothing is regenerated at
 * runtime and nothing is traced, so the picture that ships is the picture that was approved.
 *
 * The budget that makes this affordable: each file is ~30-50 KB with alpha, so the whole
 * 45-variant set would be under 2 MB. For comparison, the same art traced to SVG was 468-879
 * KB *each* and failed `tests/vector-budget.ts` by three orders of magnitude.
 *
 * Keys are pictogram keys, so an illustration can never answer for a variant the table does
 * not have. Delete this module and the files in `public/art/` and the app falls back to the
 * line drawings, with no other change.
 */

import type { IllustrationKey } from './pictograms';

/** Key to asset path, relative to the deployed base URL, without a leading slash. */
export const RENDERED_ARTWORK: Partial<Record<IllustrationKey, string>> = {
  'bench-press': 'art/bench-press.webp',
  'squat-back': 'art/squat-back.webp',
  'deadlift-barbell': 'art/deadlift-barbell.webp',
};

/** The approved illustration for this key, or `null` when the line drawing is still it. */
export function renderedArtworkOf(illustration: IllustrationKey): string | null {
  return RENDERED_ARTWORK[illustration] ?? null;
}
