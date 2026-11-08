/*
 * Hand-written SVG charts (§7.7, ADR-006). No library, no gradient fill, no
 * gridlines beyond the axis, no animation on entry. Props in, `path`/`rect`/`text`
 * out — a chart never reads a store, a clock or storage.
 *
 * Every chart is paired with a text alternative: `ChartFrame` renders the metric, the
 * window and the endpoints in its caption, plus a visually hidden data table. An SVG
 * is opaque to VoiceOver, so the chart is never the only carrier of a number.
 *
 * Sizes are honest CSS pixels: the default `width` is the content width of a card on
 * the reference device (393 px screen, 20 px padding), so 12 user units ≈ 12 px and
 * the 12 px floor of §4 holds.
 */

import '../foundation.css';
import './charts.css';

export interface ChartTableRow {
  /** The x bucket, e.g. `sep`, `6 nov`, `sem 1`. */
  readonly label: string;
  /** One already formatted value per series, in column order. */
  readonly values: readonly string[];
}

export interface ChartLegendItem {
  readonly label: string;
  /** Which series colour the swatch takes. */
  readonly series: 1 | 2 | 3 | 4;
  /** Estimated series are dashed and labelled `estimación` (FR-11.4). */
  readonly dashed?: boolean | undefined;
}

export interface ChartFrameProps {
  /** `Sentadilla · fuerza`. */
  readonly metric: string;
  /** `últimas 12 sem`. */
  readonly window?: string | undefined;
  /** The caption sentence: metric, window and the two endpoints. */
  readonly summary: string;
  /** Series names for the hidden table header. */
  readonly columns: readonly string[];
  readonly rows: readonly ChartTableRow[];
  readonly legend?: readonly ChartLegendItem[] | undefined;
  /** A provenance line, e.g. `e1RM con fórmula v1. No es una prueba de 1RM.` */
  readonly note?: string | undefined;
  /** The chart itself. */
  readonly children: React.ReactNode;
  readonly className?: string | undefined;
}

export function ChartFrame({
  metric,
  window,
  summary,
  columns,
  rows,
  legend,
  note,
  children,
  className,
}: ChartFrameProps): React.ReactElement {
  const classes = ['ds-chart-frame', className ?? ''].filter((p) => p !== '').join(' ');

  return (
    <figure className={classes}>
      <div className="ds-row">
        <span className="ds-section-label">{metric}</span>
        {window === undefined ? null : <span className="ds-caption">{window}</span>}
      </div>
      <div className="ds-chart-frame__plot" aria-hidden="true">
        {children}
      </div>
      <figcaption className="ds-caption">{summary}</figcaption>
      {legend === undefined || legend.length === 0 ? null : (
        <ul className="ds-chart-frame__legend">
          {legend.map((item) => (
            <li key={item.label} className="ds-chart-frame__legend-item">
              <span
                className={`ds-chart-frame__swatch ds-chart-frame__swatch--${item.series}${
                  item.dashed === true ? ' ds-chart-frame__swatch--dashed' : ''
                }`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
      {note === undefined ? null : <p className="ds-caption">{note}</p>}
      <table className="ds-visually-hidden">
        <caption>{`${metric}${window === undefined ? '' : `, ${window}`}, datos de la serie`}</caption>
        <thead>
          <tr>
            <th scope="col">Punto</th>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, index) => (
                <td key={`${row.label}-${String(index)}`}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const PADDING = { top: 18, right: 8, bottom: 22, left: 8 } as const;

function extent(series: readonly (readonly number[])[]): { min: number; max: number } {
  const flat = series.flat();
  if (flat.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  if (min === max) {
    // A single value, or a flat series: give it a band so the point is not on the axis.
    const pad = Math.abs(min) * 0.1 === 0 ? 1 : Math.abs(min) * 0.1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.12;
  return { min: min - pad, max: max + pad };
}

export interface LineChartProps {
  readonly values: readonly number[];
  /** A second series drawn dashed: the estimate, the comparison (§7.7). */
  readonly comparison?: readonly number[] | undefined;
  /** Axis labels, thinned to the first, middle and last. */
  readonly xLabels?: readonly string[] | undefined;
  /** Direct label at the last point, e.g. `100 kg`. */
  readonly lastLabel?: string | undefined;
  /** Colour of the point markers: series 1 (accent) or series 2. */
  readonly dotSeries?: 1 | 2 | undefined;
  /** `false` draws the measurements without a line: gaps are not a trend (§8). */
  readonly showLine?: boolean | undefined;
  readonly showMarkers?: boolean | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

export function LineChart({
  values,
  comparison,
  xLabels,
  lastLabel,
  dotSeries = 1,
  showLine = true,
  showMarkers = true,
  width = 320,
  height = 150,
}: LineChartProps): React.ReactElement {
  const plotLeft = PADDING.left;
  const plotRight = width - PADDING.right;
  const plotTop = PADDING.top;
  const plotBottom = height - PADDING.bottom;
  const allSeries = comparison === undefined ? [values] : [values, comparison];
  const { min, max } = extent(allSeries);
  const span = max - min;

  const pointFor = (series: readonly number[], index: number, length: number): string => {
    const value = series[index];
    if (value === undefined) return '';
    const x = length <= 1 ? plotRight : plotLeft + ((plotRight - plotLeft) * index) / (length - 1);
    const y = plotBottom - ((value - min) / span) * (plotBottom - plotTop);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const pathFor = (series: readonly number[]): string =>
    series.map((_, index) => pointFor(series, index, series.length)).filter((p) => p !== '').join(' ');

  const lastIndex = values.length - 1;
  const lastPoint = lastIndex < 0 ? undefined : pointFor(values, lastIndex, values.length);
  const lastCoords =
    lastPoint === undefined ? undefined : { x: lastPoint.split(',')[0], y: lastPoint.split(',')[1] };

  const labels = xLabels ?? [];

  const labelIndexes =
    labels.length === 0
      ? []
      : labels.length <= 3
        ? labels.map((_, index) => index)
        : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];

  return (
    <svg
      className="ds-chart"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <line
        className="ds-chart__axis"
        x1={plotLeft}
        y1={plotBottom}
        x2={plotRight}
        y2={plotBottom}
      />
      {comparison === undefined || !showLine ? null : (
        <polyline className="ds-chart__line ds-chart__line--comparison" points={pathFor(comparison)} />
      )}
      {!showLine ? null : <polyline className="ds-chart__line" points={pathFor(values)} />}
      {!showMarkers
        ? null
        : values.map((_, index) => {
            const point = pointFor(values, index, values.length);
            const [x, y] = point.split(',');
            return (
              <circle
                key={`dot-${String(index)}`}
                className={`ds-chart__dot ds-chart__dot--${dotSeries}`}
                cx={x}
                cy={y}
                r={lastIndex === index ? 4 : 3}
              />
            );
          })}
      {lastCoords === undefined || lastLabel === undefined ? null : (
        <text
          className="ds-chart__value"
          x={Number(lastCoords.x)}
          y={Number(lastCoords.y) - 10}
          textAnchor="end"
        >
          {lastLabel}
        </text>
      )}
      {labelIndexes.map((index) => {
        const label = labels[index];
        if (label === undefined) return null;
        const x =
          labels.length <= 1
            ? plotRight
            : plotLeft + ((plotRight - plotLeft) * index) / (labels.length - 1);
        const anchor = index === 0 && labels.length > 1 ? 'start' : index === labels.length - 1 ? 'end' : 'middle';
        return (
          <text key={`label-${label}`} className="ds-chart__label" x={x} y={height - 6} textAnchor={anchor}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export interface BarChartProps {
  readonly values: readonly number[];
  /** The last bar is the one that answers "how am I doing now" (§7.7). */
  readonly highlightLast?: boolean | undefined;
  /** Value label above the last bar, e.g. `9.120 kg`. */
  readonly lastLabel?: string | undefined;
  readonly startLabel?: string | undefined;
  readonly endLabel?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

export function BarChart({
  values,
  highlightLast = true,
  lastLabel,
  startLabel,
  endLabel,
  width = 320,
  height = 110,
}: BarChartProps): React.ReactElement {
  const plotBottom = height - 18;
  const plotTop = PADDING.top;
  const max = values.length === 0 ? 1 : Math.max(...values, 1);
  const slot = values.length === 0 ? 0 : (width - PADDING.left - PADDING.right) / values.length;
  const barWidth = Math.max(6, Math.min(14, slot * 0.55));

  return (
    <svg
      className="ds-chart"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <line className="ds-chart__axis" x1={PADDING.left} y1={plotBottom} x2={width - PADDING.right} y2={plotBottom} />
      {values.map((value, index) => {
        const barHeight = Math.max(2, ((value / max) * (plotBottom - plotTop)));
        const x = PADDING.left + slot * index + (slot - barWidth) / 2;
        const isLast = highlightLast && index === values.length - 1;
        return (
          <rect
            key={`bar-${String(index)}`}
            className={isLast ? 'ds-chart__bar ds-chart__bar--last' : 'ds-chart__bar'}
            x={x}
            y={plotBottom - barHeight}
            width={barWidth}
            height={barHeight}
            rx={3}
          />
        );
      })}
      {lastLabel === undefined ? null : (
        <text className="ds-chart__value" x={width - PADDING.right} y={PADDING.top - 6} textAnchor="end">
          {lastLabel}
        </text>
      )}
      {startLabel === undefined ? null : (
        <text className="ds-chart__label" x={PADDING.left} y={height - 4} textAnchor="start">
          {startLabel}
        </text>
      )}
      {endLabel === undefined ? null : (
        <text className="ds-chart__label" x={width - PADDING.right} y={height - 4} textAnchor="end">
          {endLabel}
        </text>
      )}
    </svg>
  );
}

export interface SparklineProps {
  readonly values: readonly number[];
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/** The 110 × 44 trend inside a metric tile. Decoration: the number is in the tile. */
export function Sparkline({ values, width = 110, height = 44 }: SparklineProps): React.ReactElement {
  const { min, max } = extent([values]);
  const span = max - min;
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width : (width * index) / (values.length - 1);
    const y = height - 6 - ((value - min) / span) * (height - 12);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const last = points[points.length - 1];
  const [lastX, lastY] = (last ?? '').split(',');

  return (
    <svg
      className="ds-chart ds-chart--spark"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <polyline className="ds-chart__line ds-chart__line--spark" points={points.join(' ')} />
      {last === undefined ? null : (
        <circle className="ds-chart__dot ds-chart__dot--1" cx={lastX} cy={lastY} r={3} />
      )}
    </svg>
  );
}
