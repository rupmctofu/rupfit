/**
 * Which artwork belongs to an exercise (odd/tasks/training-flow.md S2–S3, T3–T4).
 *
 * The library row carries a small named key (`Exercise.illustration`); this module is the
 * only place that answers whether the key exists. Two refusals, both on purpose:
 *
 * - **No key, no picture.** A custom exercise, a row seeded before the field existed and
 *   an imported row all have none, and the caller draws the equipment icon instead.
 * - **An unknown key is the same as no key.** A row from a future build that names a
 *   drawing this build does not have must not fall back to "the first picture", because
 *   that is exactly the wrong-variant drawing S3 forbids.
 *
 * Pure: a table lookup, no React, no I/O.
 */

import type { Exercise } from '../../core/domain';
import { PICTOGRAMS, type IllustrationKey } from './pictograms';

/** The keys this build can draw. Derived from the table, so the two cannot drift. */
export const ILLUSTRATION_KEYS = Object.keys(PICTOGRAMS) as readonly IllustrationKey[];

const KNOWN = new Set<string>(ILLUSTRATION_KEYS);

/** S3: an unknown, empty or missing key is not an illustration. */
export function isIllustrationKey(value: string | undefined): value is IllustrationKey {
  return value !== undefined && KNOWN.has(value);
}

/**
 * The key to draw for this library row, or `null` when it must fall back to the
 * equipment icon. Never returns the key of a different exercise: the row either names a
 * variant that exists or it names nothing.
 */
export function illustrationKeyOf(detail: Exercise | undefined): IllustrationKey | null {
  if (detail === undefined) return null;
  return isIllustrationKey(detail.illustration) ? detail.illustration : null;
}
