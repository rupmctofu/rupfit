/**
 * The session ring (S2, T3): segment states and geometry, asserted without a DOM.
 *
 * Everything the ring shows is derived, so these are the two things worth pinning: which
 * exercise is *completed* and which is merely *pending*, and that a segment's arc never
 * spills into its neighbour's slot. Colour is not tested because the ring does not depend
 * on colour; thickness and the visible label are, and those are numbers and words here.
 */

import { describe, expect, it } from 'vitest';
import type { ExerciseState, SessionState } from '../../core/session/model';
import {
  RING_GAP,
  RING_RADIUS,
  RING_STROKE_WIDTH,
  ringCompletedLabel,
  ringDashes,
  ringLabel,
  ringSegments,
} from './ring';

function exercise(id: string, sets: number, answered: number): ExerciseState {
  return {
    id,
    exerciseId: `lib-${id}`,
    exerciseNameSnapshot: `Ejercicio ${id}`,
    prescription: {
      sets,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
      restSeconds: 180,
    },
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    sets: Array.from({ length: answered }, (_, index) => ({
      status: 'skipped' as const,
      slot: index + 1,
      at: 1_700_000_000_000,
    })),
    status: 'pending',
    completedAt: null,
  };
}

function session(exercises: readonly ExerciseState[], activeIndex: number): SessionState {
  return {
    id: 'session-1',
    dayNameSnapshot: 'PIERNA',
    scheduledDate: 1_700_000_000_000,
    startedAt: null,
    endedAt: null,
    phase: { kind: 'normal' },
    status: 'scheduled',
    autoStartRest: false,
    activeIndex,
    rest: {
      exerciseSessionId: null,
      startedAt: null,
      durationSeconds: null,
      extensionSeconds: 0,
      dismissed: false,
    },
    exercises,
  };
}

describe('the segments of the ring', () => {
  it('marks the answered exercises completed, the one on screen current and the rest pending', () => {
    const segments = ringSegments(session([exercise('a', 2, 2), exercise('b', 2, 0), exercise('c', 3, 0)], 1));

    expect(segments.map((segment) => segment.state)).toEqual(['completed', 'current', 'pending']);
    expect(segments[0]?.answeredSets).toBe(2);
    expect(segments[2]?.prescribedSets).toBe(3);
  });

  it('never paints a half-answered exercise behind the current one as completed', () => {
    const segments = ringSegments(session([exercise('a', 3, 1), exercise('b', 2, 0)], 1));
    expect(segments[0]?.state).toBe('pending');
  });

  it('lets the current exercise win over its own completed count', () => {
    // Swiping back to a finished exercise makes it the one being trained again.
    const segments = ringSegments(session([exercise('a', 2, 2), exercise('b', 2, 0)], 0));
    expect(segments[0]?.state).toBe('current');
  });

  it('does not call an exercise with no prescribed sets completed', () => {
    const segments = ringSegments(session([exercise('a', 0, 0), exercise('b', 2, 0)], 1));
    expect(segments[0]?.state).toBe('pending');
  });
});

describe('the geometry of the ring', () => {
  it('draws nothing for an empty session', () => {
    expect(ringDashes([])).toEqual([]);
  });

  it('leaves a gap in every slot, so no two segments touch', () => {
    const segments = ringSegments(
      session([exercise('a', 1, 0), exercise('b', 1, 0), exercise('c', 1, 0), exercise('d', 1, 0)], 0),
    );
    const dashes = ringDashes(segments);
    const circumference = 2 * Math.PI * RING_RADIUS;
    const slot = circumference / segments.length;

    expect(dashes).toHaveLength(4);
    for (const dash of dashes) {
      expect(dash.length).toBeGreaterThan(0);
      expect(dash.length).toBeCloseTo(slot - RING_GAP, 6);
      expect(dash.length).toBeLessThan(slot);
    }
    // One slot apart, and the ring is a full turn: the offsets tile the circumference.
    expect(dashes[1]!.offset - dashes[0]!.offset).toBeCloseTo(-slot, 6);
    expect(Math.abs(dashes[3]!.offset)).toBeLessThan(circumference);
  });

  it('lights every segment up to the one on screen, whatever its sets say', () => {
    // The owner asked for the ring to fill by position: exercise 2 is on screen, so 1 and 2
    // are lit even though neither has an answered set.
    const segments = ringSegments(
      session([exercise('a', 3, 0), exercise('b', 3, 0), exercise('c', 3, 0)], 1),
    );

    expect(segments.map((segment) => segment.reached)).toEqual([true, true, false]);
  });

  it('treats a segment answered ahead of the current one as reached', () => {
    const segments = ringSegments(
      session([exercise('a', 1, 0), exercise('b', 1, 0), exercise('c', 1, 1)], 0),
    );

    expect(segments.map((segment) => segment.reached)).toEqual([true, false, true]);
  });

  it('draws every segment with the same width, so no arc grows', () => {
    const segments = ringSegments(session([exercise('a', 1, 1), exercise('b', 1, 0)], 1));
    const dashes = ringDashes(segments);

    // The owner asked for the current arc to stop being the thick one: reached is shown
    // with the lilac in the stylesheet, never with a stroke that grows.
    for (const dash of dashes) {
      expect(dash.strokeWidth).toBe(RING_STROKE_WIDTH);
    }
  });
});

describe('the words next to the ring', () => {
  it('says which exercise is on screen and how many are done', () => {
    const segments = ringSegments(session([exercise('a', 1, 1), exercise('b', 2, 0), exercise('c', 2, 0)], 1));

    // S2 is not colour alone: the current segment is written, not only painted.
    expect(ringLabel(segments)).toBe('Ejercicio 2 de 3 · actual');
    expect(ringCompletedLabel(segments)).toBe('1 de 3 completados');
  });

  it('has something to say for a session with no exercises', () => {
    expect(ringLabel([])).toBe('Sin ejercicios');
  });
});
