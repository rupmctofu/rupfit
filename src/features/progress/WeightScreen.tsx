/**
 * Peso corporal — the daily series, the 7-day mean, the goal and the measurement list.
 *
 * A view of the Progreso tab (`#/progreso/peso`), with an on-screen `‹ Progreso`
 * control. The series and the mean are computed in `aggregates.ts` from stored
 * measurements; this file only decides what the approved renders say:
 *
 * - the last weigh-in is the headline number, and its chip says whether the mean can
 *   be drawn at all (`media incompleta` under three samples in seven days, `peso-gaps`);
 * - a gap in the series is drawn as explicit points, never as a line between two
 *   distant measurements — `LineChart` cannot express a hole, so it is asked for
 *   points only (`weightLineDecision`);
 * - the list under the chart is the same window: date, provenance and kilograms.
 *
 * States: no weigh-in, one sample, fewer than three samples, a series with gaps, and a
 * contiguous series that can carry a line.
 *
 * Since the app tier gained the write path, the screen also carries the one input that
 * grows the series (`WeightEntryForm`): above the chart when there is something to draw,
 * and next to the empty state when there is not, so a fresh install is not a dead end.
 * Companion modules: `weightEntry.ts` for the rules, `weightSave.ts` for the write — the
 * screen itself owns neither.
 *
 * `LastWeighInTile` and `MeanAndGoalRows` are exported because the `Peso` segment of
 * the tab shows the same two blocks: one implementation, so the tab and the drill-down
 * cannot disagree about a number.
 */

import { Card, ChartFrame, Chip, DataRow, EmptyState, LineChart, MetricTile } from '../../design-system';
import type { WeightSeries } from './aggregates';
import { MEAN_MIN_SAMPLES, weightLineDecision } from './aggregates';
import { formatDayMonth, formatProvenance, formatWeight } from './format';
import { DrilldownHeader } from './parts';
import { WeightEntryForm } from './WeightEntryForm';
import type { WeightDraft, WeightSaveOutcome } from './weightEntry';
import './progress.css';

export interface WeightViewProps {
  readonly series: WeightSeries;
  /** The stored goal direction, already worded; `null` when none is set. */
  readonly goal: string | null;
}

/** `Último pesaje` with its kilograms and the state of the 7-day mean. */
export function LastWeighInTile({ series }: WeightViewProps): React.ReactElement | null {
  const last = series.last;
  if (last === null) return null;

  return (
    <MetricTile
      label="Último pesaje"
      value={formatWeight(last.weightKg)}
      unit="kg"
      caption={
        series.meanKg === null
          ? `${formatDayMonth(last.dayStart)} · la media de 7 días necesita ${String(MEAN_MIN_SAMPLES)} pesajes`
          : `${formatDayMonth(last.dayStart)} · media de 7 días con ${String(series.meanSamples)} pesajes`
      }
      aside={
        series.meanKg === null ? (
          <Chip tone="warning" dot>
            media incompleta
          </Chip>
        ) : undefined
      }
    />
  );
}

/** The mean and the goal, as rows: the two numbers the trend is read against. */
export function MeanAndGoalRows({ series, goal }: WeightViewProps): React.ReactElement {
  const mean = series.meanKg;

  return (
    <>
      <DataRow
        title="Media de 7 días"
        subtitle={
          mean === null
            ? `Necesita ${String(MEAN_MIN_SAMPLES)} pesajes en la ventana`
            : `${String(series.meanSamples)} pesajes en los últimos 7 días`
        }
        value={mean === null ? '—' : formatWeight(mean)}
        valueUnit="kg"
      />
      <DataRow
        title="Objetivo"
        subtitle={goal === null ? 'Sin objetivo definido · se elige en Perfil' : goal}
      />
    </>
  );
}

/** The three axis labels of the chart: one per point while they fit, else first, middle and last. */
function axisLabels(series: WeightSeries): readonly string[] {
  const points = series.points;
  if (points.length === 0) return [];
  if (points.length <= 3) return points.map((point) => formatDayMonth(point.dayStart));

  const first = points[0];
  const middle = points[Math.floor((points.length - 1) / 2)];
  const last = points[points.length - 1];
  return [first, middle, last].flatMap((point) =>
    point === undefined ? [] : [formatDayMonth(point.dayStart)],
  );
}

/** Why the line is off, in the words of the render. */
function gapNote(series: WeightSeries): string {
  if (series.meanKg === null) {
    return `Necesitamos ${String(MEAN_MIN_SAMPLES)} pesajes en 7 días para dibujar la media. Faltan ${String(
      series.samplesNeeded,
    )}.`;
  }
  if (series.missingDays > 0) {
    return `Hay ${String(series.missingDays)} días sin pesaje entre las muestras: se dibujan los puntos, sin unir los extremos.`;
  }
  return `Media de los últimos 7 días: ${formatWeight(series.meanKg)} kg.`;
}

export interface WeightScreenProps extends WeightViewProps {
  readonly onBack: () => void;
  /** The provider's instant: the entry's default day and its future-day rule. */
  readonly now: number;
  /** The weigh-in write, built by the tab from the port and the clock. */
  readonly onSaveWeight: (draft: WeightDraft) => Promise<WeightSaveOutcome>;
}

export function WeightScreen({ series, goal, onBack, now, onSaveWeight }: WeightScreenProps): React.ReactElement {
  if (series.last === null) {
    return (
      <div className="progress">
        <DrilldownHeader title="Peso corporal" backLabel="Progreso" onBack={onBack} />
        <EmptyState>
          Todavía no hay pesajes. Cuando guardes el primero, aquí aparecerán la serie, la media de 7
          días y el objetivo.
        </EmptyState>
        <WeightEntryForm now={now} series={series} onSave={onSaveWeight} />
      </div>
    );
  }

  const last = series.last;
  const first = series.points[0] ?? last;
  const values = series.points.map((point) => point.weightKg);
  const line = weightLineDecision(series);

  return (
    <div className="progress">
      <DrilldownHeader title="Peso corporal" backLabel="Progreso" onBack={onBack} />

      <WeightEntryForm now={now} series={series} onSave={onSaveWeight} />

      <Card>
        <LastWeighInTile series={series} goal={goal} />
        <div className="ds-hairline" />
        <ChartFrame
          metric="Peso corporal"
          window={
            series.points.length === 1
              ? '1 pesaje'
              : `${formatDayMonth(series.windowStart)} – ${formatDayMonth(series.windowEnd)}`
          }
          summary={
            series.points.length === 1
              ? `Un solo dato: ${formatWeight(last.weightKg)} kg el ${formatDayMonth(last.dayStart)}.`
              : `${String(values.length)} pesajes, de ${formatWeight(first.weightKg)} a ${formatWeight(
                  last.weightKg,
                )} kg, del ${formatDayMonth(first.dayStart)} al ${formatDayMonth(last.dayStart)}.`
          }
          columns={['peso (kg)']}
          rows={series.points.map((point) => ({
            label: formatDayMonth(point.dayStart),
            values: [formatWeight(point.weightKg)],
          }))}
          legend={[{ label: 'pesaje', series: 2 }]}
        >
          <LineChart
            values={values}
            xLabels={axisLabels(series)}
            lastLabel={`${formatWeight(last.weightKg)} kg`}
            dotSeries={2}
            showLine={line === 'line'}
          />
        </ChartFrame>
        <p className="ds-caption">{gapNote(series)}</p>
      </Card>

      <Card padding="list">
        <MeanAndGoalRows series={series} goal={goal} />
      </Card>

      <Card padding="list" label="Pesajes">
        {series.weighIns.map((weighIn) => (
          <DataRow
            key={weighIn.id}
            title={formatDayMonth(weighIn.dayStart)}
            subtitle={formatProvenance(weighIn.provenance)}
            value={formatWeight(weighIn.weightKg)}
            valueUnit="kg"
          />
        ))}
      </Card>
    </div>
  );
}
