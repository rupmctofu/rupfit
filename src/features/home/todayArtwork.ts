/**
 * T5 (odd/tasks/dark-premium-redesign.md) — the artwork of today's card.
 *
 * The picture is not drawn, generated or recoloured for the landing card: it is the
 * illustration the app already maps to the day's first exercise. `SEED_EXERCISES` carries
 * the named key of every seeded library row (`Exercise.illustration`), and
 * `ExerciseIllustration` already knows how to paint that key — the approved cut-out WebP
 * where one exists, the original line pictogram everywhere else. So a leg day opens on the
 * squat, an upper-body day on its bench press, and the fourth day on its mobility, which
 * is exactly what the day is about.
 *
 * Three rules:
 *
 * 1. **No picture is invented.** A day whose exercises are all custom, imported or unknown
 *    to this build answers `null`, and the card draws the owner's mark instead of a
 *    drawing that would be about a different movement (the same refusal
 *    `features/session/illustrationKey.ts` makes).
 * 2. **The first exercise that can be drawn wins.** The plan's first item is the day's
 *    primary lift; if it is a custom row the next one answers, so a hand-edited day still
 *    gets its own picture instead of none.
 * 3. **Names are compared the way the app writes them.** The stored snapshot is
 *    capitalised by `data-model §3` and the library spells it the same, but an owner may
 *    have edited the case, so the comparison is trimmed, whitespace-collapsed and
 *    lower-cased instead of exact.
 *
 * Pure: a table lookup over data that already ships. No store, no network, no React.
 */

import { SEED_EXERCISES } from '../../core/seed';
import type { PlanDay } from '../../storage';
import { isIllustrationKey } from '../session/illustrationKey';
import type { IllustrationKey } from '../session/pictograms';

export interface DayArtwork {
  /** The key `ExerciseIllustration` paints. */
  readonly illustration: IllustrationKey;
  /** The exercise it belongs to, for the accessible name of the picture. */
  readonly label: string;
}

/** `  Sentadilla   TRASERA ` → `sentadilla trasera`. */
function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The illustration of the day's first drawable exercise, or `null` when it has none. */
export function dayArtworkOf(planDay: PlanDay | null): DayArtwork | null {
  if (planDay === null) return null;

  for (const item of planDay.items) {
    const name = normalise(item.exerciseNameSnapshot);
    const seed = SEED_EXERCISES.find((exercise) => normalise(exercise.name) === name);
    if (seed === undefined) continue;
    if (!isIllustrationKey(seed.illustration)) continue;
    return { illustration: seed.illustration, label: item.exerciseNameSnapshot };
  }

  return null;
}
