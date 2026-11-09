/**
 * The inline pictogram of one exercise variant (odd/tasks/training-flow.md S2–S3).
 *
 * Original, inline, no remote image and no photograph: the drawing is the data of
 * `pictograms.ts`, one key per concrete variant, rendered here as SVG in `currentColor`
 * plus two surface tokens so it follows the theme. Nothing about the drawing is animated,
 * so `prefers-reduced-motion` has nothing to disable.
 *
 * The SVG is a `role="img"` with a Spanish label because it is not decoration: it is how
 * the session says *which* movement the owner is about to do.
 */

import { PICTOGRAMS, PICTOGRAM_FLOOR, type Gear, type IllustrationKey, type Pictogram } from './pictograms';
import './illustrations.css';

export interface ExerciseIllustrationProps {
  readonly illustration: IllustrationKey;
  /** The exercise's name, as the library or the session snapshot spells it. */
  readonly label: string;
  readonly className?: string;
}

function gearShape(gear: Gear, index: number): React.ReactElement {
  switch (gear.k) {
    case 'bar':
      return (
        <g key={`bar-${String(index)}`}>
          <line
            className="exercise-art__implement"
            x1={gear.x1}
            y1={gear.y}
            x2={gear.x2}
            y2={gear.y}
          />
          {/* The plates: the drawing of a barbell is a line and its two ends. */}
          <circle className="exercise-art__implement--solid" cx={gear.x1 + 4} cy={gear.y} r={5} />
          <circle className="exercise-art__implement--solid" cx={gear.x2 - 4} cy={gear.y} r={5} />
        </g>
      );
    case 'dumbbell':
      return (
        <g key={`dumbbell-${String(index)}`}>
          <line
            className="exercise-art__implement exercise-art__implement--thick"
            x1={gear.x - 7}
            y1={gear.y}
            x2={gear.x + 7}
            y2={gear.y}
          />
          <rect
            className="exercise-art__implement--solid"
            x={gear.x - 11}
            y={gear.y - 4}
            width={4}
            height={8}
            rx={1}
          />
          <rect
            className="exercise-art__implement--solid"
            x={gear.x + 7}
            y={gear.y - 4}
            width={4}
            height={8}
            rx={1}
          />
        </g>
      );
    case 'slab':
      return (
        <rect
          key={`slab-${String(index)}`}
          className="exercise-art__implement"
          x={gear.x}
          y={gear.y}
          width={gear.w}
          height={gear.h}
          rx={2}
          {...(gear.rot === undefined
            ? {}
            : { transform: `rotate(${String(gear.rot)} ${String(gear.x + gear.w / 2)} ${String(gear.y + gear.h / 2)})` })}
        />
      );
    case 'line':
      return (
        <polyline
          key={`line-${String(index)}`}
          className="exercise-art__implement"
          points={gear.points.map(([x, y]) => `${String(x)},${String(y)}`).join(' ')}
          {...(gear.dashed === true ? { strokeDasharray: '4 4' } : {})}
        />
      );
    case 'stack':
      return (
        <g key={`stack-${String(index)}`}>
          <rect
            className="exercise-art__implement"
            x={gear.x}
            y={gear.y}
            width={9}
            height={16}
            rx={1}
          />
          <line className="exercise-art__implement" x1={gear.x + 2} y1={gear.y + 5} x2={gear.x + 7} y2={gear.y + 5} />
          <line className="exercise-art__implement" x1={gear.x + 2} y1={gear.y + 10} x2={gear.x + 7} y2={gear.y + 10} />
        </g>
      );
    case 'disc':
      return (
        <circle
          key={`disc-${String(index)}`}
          className="exercise-art__implement"
          cx={gear.x}
          cy={gear.y}
          r={gear.r ?? 4}
        />
      );
  }
}

function bodyShape(pictogram: Pictogram): readonly React.ReactElement[] {
  const thick = new Set(pictogram.thick ?? []);
  return pictogram.body.map((limb, index) => (
    <polyline
      key={`limb-${String(index)}`}
      className={
        thick.has(index) ? 'exercise-art__figure exercise-art__figure--thick' : 'exercise-art__figure'
      }
      points={limb.map(([x, y]) => `${String(x)},${String(y)}`).join(' ')}
    />
  ));
}

export function ExerciseIllustration(props: ExerciseIllustrationProps): React.ReactElement {
  // Widened to the interface: the table is `as const`, and some poses have no gear.
  const pictogram: Pictogram = PICTOGRAMS[props.illustration];
  return (
    <svg
      className={props.className === undefined ? 'exercise-art' : `exercise-art ${props.className}`}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Ilustración de ${props.label}`}
      focusable="false"
    >
      {/* The floor is the ground every picture shares: it is what makes a squat a squat. */}
      <path className="exercise-art__floor" d={`M14 ${String(PICTOGRAM_FLOOR)} H106`} />
      {(pictogram.gear ?? []).map(gearShape)}
      {bodyShape(pictogram)}
      <circle className="exercise-art__head" cx={pictogram.head[0]} cy={pictogram.head[1]} r={6} />
    </svg>
  );
}
