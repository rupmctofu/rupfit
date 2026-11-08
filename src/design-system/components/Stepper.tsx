/*
 * The stepper (§7.3, §7.4). Reps are incremented, never typed: `<input type=number>`
 * is forbidden because it exposes platform spinners we cannot size and calls the OS
 * keyboard over the session.
 *
 * The value lives between two 48 × 48 buttons. It is not a text field, has no
 * cursor and cannot be edited by accident; its changes are announced politely so a
 * VoiceOver user hears the new count without the whole row being re-read.
 */

import { Icon } from './Icon';
import '../foundation.css';
import './stepper.css';

export type StepperShape = 'square' | 'round';

export interface StepperProps {
  readonly value: number;
  readonly onChange: (next: number) => void;
  /** Accessible name of the group, e.g. `Repeticiones` or `Peso de hoy`. */
  readonly label: string;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly decrementLabel?: string | undefined;
  readonly incrementLabel?: string | undefined;
  readonly shape?: StepperShape | undefined;
  /** Rendered after the number, never part of it: `kg`, `reps`. */
  readonly unit?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 999,
  step = 1,
  decrementLabel = 'Menos',
  incrementLabel = 'Más',
  shape = 'square',
  unit,
  disabled = false,
  className,
}: StepperProps): React.ReactElement {
  const classes = ['ds-stepper', `ds-stepper--${shape}`, className ?? ''].filter((p) => p !== '').join(' ');
  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;

  return (
    <div className={classes} role="group" aria-label={label}>
      <button
        type="button"
        className="ds-action ds-stepper__key"
        aria-label={decrementLabel}
        disabled={!canDecrement}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Icon name="minus" size={22} />
      </button>
      <span className="ds-numeral ds-stepper__value" aria-live="polite" aria-atomic="true">
        {value}
        {unit === undefined ? null : <span className="ds-numeral__unit">{unit}</span>}
      </span>
      <button
        type="button"
        className="ds-action ds-stepper__key"
        aria-label={incrementLabel}
        disabled={!canIncrement}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <Icon name="plus" size={22} />
      </button>
    </div>
  );
}
