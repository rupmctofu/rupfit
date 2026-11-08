/*
 * Numerals: the tabular-figures treatment of §5.2 and the metric sizes of §5.1.
 *
 * `font-variant-numeric: tabular-nums` is the replacement for the native
 * monospaced-digit behaviour, so 100 → 102,5 never moves the layout by a pixel.
 * Digits are never letter-spaced and the value arrives already formatted by the
 * caller: the decimal separator is part of the string (comma in Spanish), never a
 * number this component re-parses.
 */

import '../foundation.css';
import './numerals.css';

export type NumeralSize = 'metric' | 'metric-small' | 'inline';
export type NumeralTone = 'default' | 'muted' | 'accent';

export interface NumeralProps {
  /** Already formatted ("92,5", "1:45", "8.280"). Never a number. */
  readonly value: string;
  /** Unit ("kg", "min", "reps"). Rendered smaller, never tabular. */
  readonly unit?: string | undefined;
  readonly size?: NumeralSize | undefined;
  readonly tone?: NumeralTone | undefined;
  readonly className?: string | undefined;
}

export function Numeral({
  value,
  unit,
  size = 'inline',
  tone = 'default',
  className,
}: NumeralProps): React.ReactElement {
  const classes = ['ds-numeral', `ds-numeral--${size}`, `ds-numeral--${tone}`, className ?? '']
    .filter((part) => part !== '')
    .join(' ');

  return (
    <span className={classes}>
      {value}
      {unit === undefined ? null : <span className="ds-numeral__unit">{unit}</span>}
    </span>
  );
}
