/*
 * The data blocks of the artboard: one metric with its label (§7.7), the three-cell
 * strip of Resumen, and the "última vez / peso de hoy" pair of the decision screen.
 *
 * One metric per block, no card inside a card, and the number is a `Numeral` so the
 * tabular-figures rule of §5.2 is not re-implemented per screen.
 */

import { Fragment } from 'react';
import type { NumeralSize, NumeralTone } from './Numeral';
import { Numeral } from './Numeral';
import '../foundation.css';
import './metrics.css';

export type DeltaTone = 'accent' | 'success' | 'danger';

export interface MetricTileProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | undefined;
  /** One line under the number: provenance, window, count. */
  readonly caption?: string | undefined;
  /** A delta is a word with its sign (`+7,5 kg`), never colour alone (§7.7). */
  readonly delta?: string | undefined;
  readonly deltaTone?: DeltaTone | undefined;
  readonly size?: NumeralSize | undefined;
  /** Trailing slot: a sparkline, a chip. */
  readonly aside?: React.ReactNode | undefined;
  readonly className?: string | undefined;
}

export function MetricTile({
  label,
  value,
  unit,
  caption,
  delta,
  deltaTone = 'accent',
  size = 'metric-small',
  aside,
  className,
}: MetricTileProps): React.ReactElement {
  const classes = ['ds-metric', className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <div className={classes}>
      <div className="ds-metric__head">
        <span className="ds-section-label">{label}</span>
        {delta === undefined ? null : (
          <span className={`ds-chip ds-chip--${deltaTone} ds-metric__delta`}>
            <span className="ds-chip__text">{delta}</span>
          </span>
        )}
      </div>
      <div className="ds-metric__body">
        <Numeral value={value} unit={unit} size={size} />
        {aside === undefined ? null : <div className="ds-metric__aside">{aside}</div>}
      </div>
      {caption === undefined ? null : <p className="ds-caption">{caption}</p>}
    </div>
  );
}

export interface DataStripItem {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | undefined;
  readonly tone?: NumeralTone | undefined;
}

export interface DataStripProps {
  readonly items: readonly DataStripItem[];
  /** Accessible name of the group, e.g. `Totales de la sesión`. */
  readonly label: string;
  readonly className?: string | undefined;
}

/** Three cells, two hairlines, no chart (§8 Resumen). Reflows as a column when narrow. */
export function DataStrip({ items, label, className }: DataStripProps): React.ReactElement {
  const classes = ['ds-data-strip', className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <div className={classes} role="group" aria-label={label}>
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index === 0 ? null : <span className="ds-data-strip__separator" aria-hidden="true" />}
          <span className="ds-data-strip__cell">
            <span className="ds-data-strip__label">{item.label}</span>
            <Numeral
              value={item.value}
              unit={item.unit}
              size="metric-small"
              tone={item.tone ?? 'default'}
            />
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export interface CompareTileProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | undefined;
  readonly caption?: string | undefined;
  /** The decided weight of today: accent-muted surface and accent hairline. */
  readonly today?: boolean | undefined;
}

export function CompareTile({
  label,
  value,
  unit,
  caption,
  today = false,
}: CompareTileProps): React.ReactElement {
  return (
    <div className={today ? 'ds-compare ds-compare--today' : 'ds-compare'}>
      <span className="ds-section-label ds-compare__label">{label}</span>
      <Numeral value={value} unit={unit} size="metric-small" tone={today ? 'accent' : 'default'} />
      {caption === undefined ? null : <span className="ds-caption">{caption}</span>}
    </div>
  );
}
