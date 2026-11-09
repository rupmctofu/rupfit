/**
 * The segmented ring of the session (odd/tasks/training-flow.md S2, T3).
 *
 * A circle cut into one arc per exercise; the arc of the current exercise is the thick
 * one, the answered ones are drawn in the muted ink and the ones still to come in the
 * hairline colour. Colour is the third cue, never the only one: thickness, the visible
 * line `Ejercicio 3 de 8 · actual` next to it and the spoken list below all say the same
 * thing.
 *
 * The centre is a slot: the session puts the illustration of the current variant there.
 * The SVG itself is `aria-hidden` — the ring is a shape, and the sentence that carries its
 * meaning is the one the screen writes.
 */

import { RING_CENTER, RING_RADIUS, RING_VIEWBOX, ringDashes, type RingSegment } from './ring';

const STATE_WORD: Readonly<Record<RingSegment['state'], string>> = {
  completed: 'completado',
  current: 'actual',
  pending: 'pendiente',
};

export interface SessionRingProps {
  readonly segments: readonly RingSegment[];
  /** The current variant's illustration, drawn inside the circle. */
  readonly children?: React.ReactNode;
}

export function SessionRing(props: SessionRingProps): React.ReactElement {
  const dashes = ringDashes(props.segments);
  const circumference = 2 * Math.PI * RING_RADIUS;

  return (
    <div className="session-ring">
      <svg
        className="session-ring__svg"
        viewBox={`0 0 ${String(RING_VIEWBOX)} ${String(RING_VIEWBOX)}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* The arcs start at twelve o'clock, the way every progress ring is read. */}
        <g transform={`rotate(-90 ${String(RING_CENTER)} ${String(RING_CENTER)})`}>
          {dashes.map((dash) => (
            <circle
              key={dash.segment.exerciseSessionId}
              className={`session-ring__segment session-ring__segment--${dash.segment.state}`}
              cx={RING_CENTER}
              cy={RING_CENTER}
              r={RING_RADIUS}
              fill="none"
              strokeLinecap="butt"
              strokeDasharray={`${String(dash.length)} ${String(circumference - dash.length)}`}
              strokeDashoffset={dash.offset}
              style={{ strokeWidth: dash.strokeWidth }}
            />
          ))}
        </g>
      </svg>

      <div className="session-ring__center">{props.children}</div>

      <p className="ds-visually-hidden">
        {`${String(props.segments.length)} ejercicios. ${props.segments
          .map((segment) => `${String(segment.index + 1)}: ${segment.name}, ${STATE_WORD[segment.state]}`)
          .join('. ')}.`}
      </p>
    </div>
  );
}
