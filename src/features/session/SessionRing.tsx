/**
 * The segmented ring of the session (odd/tasks/training-flow.md S2, T3).
 *
 * A circle cut into one arc per exercise, every arc the same width: the segments already
 * reached — the answered ones and the one on screen — are lit in the light lilac accent,
 * and the ones still to come stay in the hairline colour. Colour is the sighted cue; the
 * spoken list below is the other one, and it names the exercise on screen and the state
 * of every segment, so the ring never depends on seeing a shade.
 *
 * The centre is a slot: the session puts the icon of the material there.
 * The SVG itself is `aria-hidden` — the ring is a shape, and the sentence that carries its
 * meaning is the one the screen writes.
 *
 * One thing moves: the arc of the current exercise breathes between full and a quarter
 * opacity over three and a half seconds (`session.css`, `session-ring-breathe`). Width never
 * changes, and the breath is decoration — the spoken list and the label already say which
 * exercise is on screen, so `prefers-reduced-motion` can take it away without losing
 * information.
 */

import { useId } from 'react';

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
  // `useId` hands back brackets or colons (`«r0»`), which are not a legal fragment
  // identifier, so they are stripped and `url(#…)` resolves.
  const gradientId = `session-ring-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // The one accent, spread across the circle: deeper violet at the dim start and the light
  // lilac fully lit at the end, both from the theme tokens, so no colour is invented here.
  // The opacity ramp is what makes the gradient readable at all — the two lilacs are a few
  // steps apart, and a single arc only ever shows a slice of the range. The second paint of
  // `url(…)` is the fallback a browser uses when the gradient is missing.
  const reachedStroke = `url(#${gradientId}) var(--color-accent-text)`;

  return (
    <div className="session-ring">
      <svg
        className="session-ring__svg"
        viewBox={`0 0 ${String(RING_VIEWBOX)} ${String(RING_VIEWBOX)}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* `userSpaceOnUse` in the ring's own 120 × 120 box, so every arc is painted by the
            same gradient and the colour continues across the gaps instead of restarting at
            each segment. `rotate(-90)` turns this local diagonal into the screen's one. */}
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={RING_VIEWBOX}
            y2={RING_VIEWBOX}
          >
            <stop offset="0%" style={{ stopColor: 'var(--color-accent)', stopOpacity: 0.35 }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-accent-text)', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
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
              // Round, not butt: the owner asked for soft ends, and the gap in `ring.ts` is
              // sized knowing that each cap spends half a stroke inside it.
              strokeLinecap="round"
              strokeDasharray={`${String(dash.length)} ${String(circumference - dash.length)}`}
              strokeDashoffset={dash.offset}
              // Inline, not in the stylesheet: the paint carries an id only this instance
              // knows, and inline style wins over the class the stylesheet still uses for
              // the segments that have not been reached.
              style={{
                strokeWidth: dash.strokeWidth,
                ...(dash.segment.reached ? { stroke: reachedStroke } : {}),
              }}
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
