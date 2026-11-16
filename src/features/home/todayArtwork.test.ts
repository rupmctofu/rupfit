/**
 * T5 (odd/tasks/dark-premium-redesign.md) — the picture on today's card is never invented.
 *
 * The card shows the illustration the app already maps to the day's first exercise: the
 * approved cut-out WebP where the library has one, the line pictogram everywhere else. Three
 * refusals matter here and each has its own case: a day that names no exercise this build
 * knows, a day whose first item is a custom row (the next one answers), and a store with no
 * plan day at all. A wrong picture would be worse than no picture — it would say the owner
 * is about to train a movement he is not.
 */

import { describe, expect, it } from 'vitest';
import type { PlanDay } from '../../storage';
import { dayArtworkOf } from './todayArtwork';

function day(name: string, ...exercises: readonly string[]): PlanDay {
  return {
    id: 'day-1',
    name,
    order: 0,
    items: exercises.map((exerciseNameSnapshot, order) => ({
      id: `item-${String(order)}`,
      planDayId: 'day-1',
      order,
      exerciseId: `lib-${String(order)}`,
      exerciseNameSnapshot,
      prescription: {
        sets: 3,
        repRange: { lowerBound: 8, upperBound: 10 },
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: 180,
      },
    })),
  };
}

describe('dayArtworkOf', () => {
  it('draws the library illustration of the day’s primary lift', () => {
    // The seed's leg day opens on the back squat, which is one of the approved cut-outs.
    expect(dayArtworkOf(day('PIERNA', 'Sentadilla trasera'))).toEqual({
      illustration: 'squat-back',
      label: 'Sentadilla trasera',
    });
    // And the upper day on its bench press: the mapping is the library's, not the day's.
    expect(dayArtworkOf(day('TORSO A', 'Press banca'))?.illustration).toBe('bench-press');
  });

  it('never answers with a picture of a different movement', () => {
    // A custom or imported exercise has no key in this build's library: no picture.
    expect(dayArtworkOf(day('PIERNA', 'Máquina del vecino'))).toBeNull();
    // A variant the library holds without an approved illustration keeps its own key, so
    // the card draws that pictogram instead of borrowing the squat.
    expect(dayArtworkOf(day('TORSO B', 'Press banca inclinado'))?.illustration).toBe(
      'incline-press-barbell',
    );
  });

  it('skips a row it cannot draw and uses the next one that it can', () => {
    expect(dayArtworkOf(day('PIERNA', 'Máquina del vecino', 'Prensa'))).toEqual({
      illustration: 'leg-press',
      label: 'Prensa',
    });
  });

  it('compares names the way the store writes them', () => {
    // The snapshot is capitalised on write and an owner may edit the case: the same day.
    expect(dayArtworkOf(day('PIERNA', '  sentadilla   TRASERA '))?.illustration).toBe('squat-back');
  });

  it('has nothing to draw for a day with no items, or with no day at all', () => {
    expect(dayArtworkOf(day('PIERNA'))).toBeNull();
    expect(dayArtworkOf(null)).toBeNull();
  });
});
