/**
 * The segmented progress ring of the session (odd/tasks/training-flow.md S2, T3).
 *
 * One segment per exercise of the session, in the session's own order:
 *
 * - **completed** — every prescribed set of that exercise is answered (confirmed or
 *   skipped). Answered, not "done well": the ring reports the sheet's arithmetic.
 * - **current** — the card on screen. It wins over `completed`, because an exercise the
 *   owner swiped back to is the one being trained.
 * - **pending** — everything else, including an exercise left half-answered behind the
 *   current one: a segment that is not finished is not painted as finished.
 *
 * Neither the state nor the geometry relies on colour: the current segment is the thick
 * one and the screen writes `Ejercicio 3 de 8 · actual` next to it, so the ring still
 * reads in a screenshot, in high contrast mode and to a screen reader.
 *
 * Pure: a session in, numbers out. No React, no clock, no I/O.
 */

import type { SessionState } from '../../core/session/model';

export type RingSegmentState = 'completed' | 'current' | 'pending';

export interface RingSegment {
  readonly index: number;
  readonly exerciseSessionId: string;
  readonly name: string;
  readonly state: RingSegmentState;
  readonly answeredSets: number;
  readonly prescribedSets: number;
}

/** The `viewBox` of the ring: 120 × 120, centre 60 and a 52 px radius. */
export const RING_VIEWBOX = 120;
export const RING_CENTER = RING_VIEWBOX / 2;
export const RING_RADIUS = 52;
/** The gap between two segments, in path units. */
export const RING_GAP = 4;
/** Stroke width per state: thickness is the cue colour is not allowed to be alone. */
export const RING_STROKE: Readonly<Record<RingSegmentState, number>> = {
  completed: 7,
  current: 12,
  pending: 4,
};

/** The segments of a session, one per exercise, in prescription order. */
export function ringSegments(session: SessionState): readonly RingSegment[] {
  return session.exercises.map((exercise, index) => {
    const prescribedSets = exercise.prescription.sets;
    const answeredSets = exercise.sets.length;
    const finished = prescribedSets > 0 && answeredSets >= prescribedSets;
    const state: RingSegmentState =
      index === session.activeIndex ? 'current' : finished ? 'completed' : 'pending';
    return {
      index,
      exerciseSessionId: exercise.id,
      name: exercise.exerciseNameSnapshot,
      state,
      answeredSets,
      prescribedSets,
    };
  });
}

export interface RingDash {
  readonly segment: RingSegment;
  /** Length of the drawn arc. */
  readonly length: number;
  /** `stroke-dashoffset`: where the arc starts, measured from the path's own start. */
  readonly offset: number;
  readonly strokeWidth: number;
}

/**
 * The arcs of the ring. Every segment owns the same slot of the circumference and leaves
 * `RING_GAP` units of it empty, so two neighbours never touch and the ring reads as
 * segments rather than as one broken circle. A single-exercise session still draws one
 * arc, slightly short of a full turn, for the same reason.
 */
export function ringDashes(
  segments: readonly RingSegment[],
  radius: number = RING_RADIUS,
  gap: number = RING_GAP,
): readonly RingDash[] {
  const count = segments.length;
  if (count === 0) return [];
  const circumference = 2 * Math.PI * radius;
  const slot = circumference / count;
  const length = Math.max(slot - gap, slot / 2);

  return segments.map((segment) => ({
    segment,
    length,
    offset: -segment.index * slot,
    strokeWidth: RING_STROKE[segment.state],
  }));
}

export interface RingProgress {
  readonly current: number;
  readonly total: number;
  readonly completed: number;
  readonly state: RingSegmentState | null;
}

/** The numbers the visible label and the spoken description are written from. */
export function ringProgress(segments: readonly RingSegment[]): RingProgress {
  const total = segments.length;
  const completed = segments.filter((segment) => segment.state === 'completed').length;
  const currentSegment = segments.find((segment) => segment.state === 'current');
  return {
    current: currentSegment === undefined ? 0 : currentSegment.index + 1,
    total,
    completed,
    state: currentSegment?.state ?? null,
  };
}

/**
 * `Ejercicio 3 de 8 · actual` — the label next to the ring. Text, not colour: the current
 * segment is on screen and a screen without colour still says which one it is.
 */
export function ringLabel(segments: readonly RingSegment[]): string {
  const progress = ringProgress(segments);
  if (progress.total === 0) return 'Sin ejercicios';
  return `Ejercicio ${String(progress.current)} de ${String(progress.total)} · actual`;
}

/** `2 de 8 completados` — the second half of the label. */
export function ringCompletedLabel(segments: readonly RingSegment[]): string {
  const progress = ringProgress(segments);
  return `${String(progress.completed)} de ${String(progress.total)} completados`;
}
