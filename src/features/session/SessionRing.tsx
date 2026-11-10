/**
 * The segmented ring of the session (odd/tasks/training-flow.md S2, T3).
 *
 * A circle cut into one arc per exercise, every arc the same width: the segments already
 * reached — the answered ones and the one on screen — are lit in the light lilac accent,
 * and the ones still to come stay in the hairline colour. Colour is the sighted cue; the
 * spoken list below is the other one, and it names the exercise on screen and the state
 * of every segment, so the ring never depends on seeing a shade.
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
              className={`session-ring__segment session-ring__segment--${dash.segment.state}${
                dash.segment.reached ? ' session-ring__segment--reached' : ''
              }`}
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
