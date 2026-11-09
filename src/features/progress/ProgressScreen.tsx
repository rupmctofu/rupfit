/**
 * Progreso — the tab, and the two views inside it.
 *
 * Three decisions hold this screen together:
 *
 * 1. **Every number is derived.** The charts, the records and the weekly volume are
 *    computed in `aggregates.ts` from the sessions and measurements the storage port
 *    returned; nothing is stored, cached or made up (`docs/data-model.md` §8, I-6). The
 *    four reads of the tab are the only I/O it performs.
 * 2. **The clock is the provider's.** `now` arrives once, from `clock.now()`, and is
 *    handed to the pure functions with every row. No component below reads
 *    `Date.now()`; the tab is a static image of the data, so it has no ticking state.
 * 3. **A gap is a gap.** A week without training gets no bar value it did not earn and
 *    no line; a day without a weigh-in is a missing point, not an interpolated one.
 *    Where `LineChart` cannot express the hole (its `values` is a `readonly number[]`),
 *    the honest rendering is chosen — no line, explicit points — and the caption says
 *    why. See the report for the component limitation this does not fix.
 *
 * The segmented control is the explicit metric choice FR-11.1 asks for: `Fuerza` shows
 * the strength chart with its estimate, then the weekly volume and the records (the
 * approved render `progreso-12w`); `Volumen` leads with the bars; `Peso` shows the
 * body-weight blocks of `peso-gaps`.
 *
 * ## The one boundary this file crosses, and why
 *
 * `src/app/App.tsx` renders `<ProgressScreen />` with no props, and this task may not
 * edit `src/app`. The composition root's container (`src/app/providers.tsx`) is
 * therefore read here, in one place, by `ConnectedProgressTab`. The moment the shell
 * passes `storage` and `clock` the way it already does for the session sheet
 * (`<ProgressScreen storage={storage} clock={clock} />`), that component and the import
 * go away; the props path below is already the real one.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Card,
  ChartFrame,
  Chip,
  DataRow,
  EmptyState,
  ErrorBanner,
  LineChart,
  MetricTile,
} from '../../design-system';
import { useAppServices } from '../../app/providers';
import type { BodyMeasurement, StoragePort, UserProfile, WorkoutSession } from '../../storage';
import {
  isRecordedSession,
  personalRecords,
  strengthLineDecision,
  strengthSeries,
  strengthState,
  topRecord,
  weeklyVolume,
  weightSeries,
  type PersonalRecord,
  type StrengthSeries,
  type WeeklyVolume,
  type WeightSeries,
} from './aggregates';
import {
  formatDayMonth,
  formatGoal,
  formatSignedWeight,
  formatVolume,
  formatWeight,
  monthAbbreviation,
} from './format';
import { HistorialScreen } from './HistorialScreen';
import { useProgressView } from './navigation';
import { LastWeighInTile, MeanAndGoalRows, WeightScreen } from './WeightScreen';
import type { WeightDraft, WeightSaveOutcome } from './weightEntry';
import { createMeasurementId, saveWeightEntry } from './weightSave';
import { Segmented } from './parts';
import './progress.css';

/** The one clock the tab is allowed to read: the provider's. */
export interface ProgressClock {
  now(): number;
}

/** A cap, not a window: twelve weeks and the all-time records need far fewer rows. */
const HISTORY_LIMIT = 500;

type Metric = 'fuerza' | 'volumen' | 'peso';

const METRICS: readonly { readonly value: Metric; readonly label: string }[] = [
  { value: 'fuerza', label: 'Fuerza' },
  { value: 'volumen', label: 'Volumen' },
  { value: 'peso', label: 'Peso' },
];

/* ------------------------------------------------------------------ the port */

export interface ProgressScreenProps {
  readonly storage?: StoragePort | undefined;
  readonly clock?: ProgressClock | undefined;
}

export function ProgressScreen(props: ProgressScreenProps): React.ReactElement {
  if (props.storage !== undefined && props.clock !== undefined) {
    return <ProgressTab storage={props.storage} clock={props.clock} />;
  }
  return <ConnectedProgressTab />;
}

/** Reads the composition root's one storage instance. See the header. */
function ConnectedProgressTab(): React.ReactElement {
  const services = useAppServices();
  return <ProgressTab storage={services.storage} clock={services.clock} />;
}

/* ------------------------------------------------------------------ the reads */

interface ProgressFacts {
  readonly sessions: readonly WorkoutSession[];
  readonly measurements: readonly BodyMeasurement[];
  readonly profile: UserProfile | null;
  readonly now: number;
}

type LoadState =
  | { readonly status: 'loading' }
  | ({ readonly status: 'ready' } & ProgressFacts)
  | { readonly status: 'error'; readonly message: string };

const READ_ERROR = 'No se pudo leer lo que hay guardado. Sigue en tu teléfono: reintenta.';

function ProgressTab({
  storage,
  clock,
}: {
  readonly storage: StoragePort;
  readonly clock: ProgressClock;
}): React.ReactElement {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigation = useProgressView();
  const [metric, setMetric] = useState<Metric>('fuerza');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const [sessions, measurements, profile] = await Promise.all([
          storage.sessions.recent(HISTORY_LIMIT),
          storage.measurements.all(),
          storage.profile.read(),
        ]);
        if (cancelled) return;
        setState({
          status: 'ready',
          sessions,
          measurements,
          profile: profile ?? null,
          now: clock.now(),
        });
      } catch {
        if (!cancelled) setState({ status: 'error', message: READ_ERROR });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storage, clock, attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const startTraining = useCallback(() => {
    window.location.hash = '#/entrenar';
  }, []);

  const goal = useMemo(
    () => formatGoal(state.status === 'ready' ? (state.profile?.weightGoal ?? null) : null),
    [state],
  );
  const weight = useMemo(
    () => (state.status === 'ready' ? weightSeries(state.measurements, state.now) : null),
    [state],
  );

  /**
   * The one write of this screen: validate, read the day, `measurements.save` once, and
   * hand back the list the store now holds so the tab and the drill-down redraw from it.
   * Nothing is displayed as saved until the write resolved; a failure keeps the form's
   * draft on screen with a retry.
   */
  const saveWeight = useCallback(
    async (draft: WeightDraft): Promise<WeightSaveOutcome> => {
      const outcome = await saveWeightEntry(
        { storage, now: () => clock.now(), newId: createMeasurementId },
        draft,
      );

      if (outcome.kind === 'saved') {
        const measurements = outcome.measurements;
        setState((current) =>
          current.status === 'ready' ? { ...current, measurements, now: clock.now() } : current,
        );
      }

      return outcome;
    },
    [storage, clock],
  );

  if (state.status === 'error') {
    return (
      <div className="progress">
        <h1 className="ds-screen-title">Progreso</h1>
        <ErrorBanner message={state.message} onRetry={retry} />
      </div>
    );
  }

  if (state.status === 'loading' || weight === null) {
    // Local data: no spinner, no skeleton, no empty chart (§3 of the task brief).
    return (
      <div className="progress">
        <h1 className="ds-screen-title">Progreso</h1>
      </div>
    );
  }

  if (navigation.view === 'historial') {
    return (
      <HistorialScreen
        sessions={state.sessions}
        onBack={navigation.back}
        onStartTraining={startTraining}
      />
    );
  }

  if (navigation.view === 'peso') {
    return (
      <WeightScreen
        series={weight}
        goal={goal}
        onBack={navigation.back}
        now={state.now}
        onSaveWeight={saveWeight}
      />
    );
  }

  return (
    <div className="progress">
      <h1 className="ds-screen-title">Progreso</h1>
      <Summary
        sessions={state.sessions}
        weight={weight}
        goal={goal}
        now={state.now}
        metric={metric}
        onMetric={setMetric}
        onOpenHistorial={() => navigation.navigate('historial')}
        onOpenWeight={() => navigation.navigate('peso')}
        onStartTraining={startTraining}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ the tab */

interface SummaryProps {
  readonly sessions: readonly WorkoutSession[];
  readonly weight: WeightSeries;
  readonly goal: string | null;
  readonly now: number;
  readonly metric: Metric;
  readonly onMetric: (metric: Metric) => void;
  readonly onOpenHistorial: () => void;
  readonly onOpenWeight: () => void;
  readonly onStartTraining: () => void;
}

function Summary({
  sessions,
  weight,
  goal,
  now,
  metric,
  onMetric,
  onOpenHistorial,
  onOpenWeight,
  onStartTraining,
}: SummaryProps): React.ReactElement {
  const derived = useMemo(() => {
    const recorded = sessions.filter(isRecordedSession);
    return {
      recorded,
      strength: strengthSeries(sessions, { now }),
      volume: weeklyVolume(sessions, { now }),
      records: personalRecords(sessions),
    };
  }, [sessions, now]);

  const drilldown = (
    <Card padding="list" label="Ver más">
      <DataRow
        title="Historial"
        subtitle={
          derived.recorded.length === 0
            ? 'Todavía no hay sesiones'
            : `${String(derived.recorded.length)} ${
                derived.recorded.length === 1 ? 'sesión registrada' : 'sesiones registradas'
              }`
        }
        icon="calendar"
        onSelect={onOpenHistorial}
        selectLabel="Abrir el historial de sesiones"
      />
      <DataRow
        title="Peso corporal"
        subtitle={
          weight.last === null
            ? 'Todavía no hay pesajes'
            : `Último pesaje ${formatWeight(weight.last.weightKg)} kg · ${formatDayMonth(weight.last.dayStart)}`
        }
        icon="scale"
        onSelect={onOpenWeight}
        selectLabel="Abrir el peso corporal"
      />
    </Card>
  );

  // `progreso-empty`: no session and no weigh-in. The empty screen says what is
  // missing and offers the one action that fills it; it draws no empty axis.
  if (derived.recorded.length === 0 && weight.last === null) {
    return (
      <>
        <EmptyState tone="primary" action={{ label: 'Empezar entrenamiento', onClick: onStartTraining }}>
          Sin datos todavía. Registra una sesión y aquí aparecerán la fuerza por ejercicio, los
          récords y el volumen semanal.
        </EmptyState>
        {/* Navigation only: the empty state already said there is no data, and three rows
            repeating `sin datos` under it said it three more times. */}
        <Card padding="list">
          <DataRow title="Historial" onSelect={onOpenHistorial} />
          <DataRow title="Peso corporal" onSelect={onOpenWeight} />
        </Card>
      </>
    );
  }

  return (
    <>
      <Segmented label="Métrica" options={METRICS} value={metric} onChange={onMetric} />

      {metric === 'fuerza' ? (
        <>
          <StrengthCard series={derived.strength} />
          <VolumeCard volume={derived.volume} />
          <RecordsCard records={derived.records} />
        </>
      ) : null}

      {metric === 'volumen' ? (
        <>
          <VolumeCard volume={derived.volume} />
          <RecordsCard records={derived.records} />
        </>
      ) : null}

      {metric === 'peso' ? (
        <Card>
          {weight.last === null ? (
            <p className="ds-body ds-body--muted">
              Todavía no hay pesajes. Se guardan en Peso corporal y aquí aparecerán la serie y la
              media de 7 días.
            </p>
          ) : (
            <>
              <LastWeighInTile series={weight} goal={goal} />
              <div className="ds-hairline" />
              <MeanAndGoalRows series={weight} goal={goal} />
            </>
          )}
        </Card>
      ) : null}

      {drilldown}
    </>
  );
}

/* ------------------------------------------------------------ the strength */

function monthAxis(series: StrengthSeries): readonly string[] {
  // One point: its own date, as `progreso-single` writes `6 nov` under the point.
  if (series.dataWeeks === 1) {
    const only = series.weeks[series.lastIndex];
    return only === undefined ? [] : [formatDayMonth(only.start)];
  }

  const weeks = series.weeks;
  const first = weeks[0];
  const middle = weeks[Math.floor((weeks.length - 1) / 2)];
  const last = weeks[weeks.length - 1];
  return [first, middle, last].flatMap((week) =>
    week === undefined ? [] : [monthAbbreviation(week.start)],
  );
}

function StrengthCard({ series }: { readonly series: StrengthSeries | null }): React.ReactElement {
  const state = strengthState(series);

  if (series === null || state === 'empty') {
    return (
      <Card>
        <div className="ds-row">
          <span className="ds-section-label">Fuerza</span>
          <Chip>sin datos suficientes</Chip>
        </div>
        <p className="ds-caption">
          Todavía no hay series con peso registrado. La fuerza se dibuja en cuanto apuntes una.
        </p>
      </Card>
    );
  }

  const topSets: number[] = [];
  const estimates: number[] = [];
  let everyEstimate = true;

  for (const week of series.weeks) {
    if (week.topSetKg === null) continue;
    topSets.push(week.topSetKg);
    if (week.e1rmKg === null) everyEstimate = false;
    else estimates.push(week.e1rmKg);
  }

  const comparison = everyEstimate && estimates.length === topSets.length ? estimates : undefined;
  const line = strengthLineDecision(series);
  const drawsEstimate = line === 'line' && comparison !== undefined;
  const change = series.changeKg;

  return (
    <Card>
      <MetricTile
        label={`${series.exerciseName} · fuerza`}
        value={series.lastTopSetKg === null ? '—' : formatWeight(series.lastTopSetKg)}
        unit="kg"
        caption={
          state === 'single'
            ? '1 sesión'
            : `${String(series.dataWeeks)} de ${String(series.weeks.length)} semanas con datos`
        }
        aside={
          change === null || state === 'single' ? undefined : (
            <Chip tone={change < 0 ? 'danger' : 'accent'}>{formatSignedWeight(change)}</Chip>
          )
        }
      />
      <ChartFrame
        metric="Peso de la serie top y e1RM"
        window={state === 'single' ? '1 sesión' : 'últimas 12 semanas'}
        summary={
          state === 'single'
            ? 'Un solo dato: todavía no hay tendencia. Con la próxima sesión empieza la línea.'
            : `Peso de la serie top: de ${formatWeight(series.firstTopSetKg ?? 0)} a ${formatWeight(
                series.lastTopSetKg ?? 0,
              )} kg${state === 'gap' ? ', con semanas sin sesión en medio' : ' en 12 semanas'}.`
        }
        columns={comparison === undefined ? ['peso de la serie top (kg)'] : ['peso de la serie top (kg)', 'e1RM (kg)']}
        rows={series.weeks.map((week) => ({
          label: formatDayMonth(week.start),
          values:
            comparison === undefined
              ? [week.topSetKg === null ? '—' : formatWeight(week.topSetKg)]
              : [
                  week.topSetKg === null ? '—' : formatWeight(week.topSetKg),
                  week.e1rmKg === null ? '—' : formatWeight(week.e1rmKg),
                ],
        }))}
        legend={
          drawsEstimate
            ? [
                { label: 'peso de la serie top', series: 1 },
                { label: 'e1RM · estimación', series: 3, dashed: true },
              ]
            : [{ label: 'peso de la serie top', series: 1 }]
        }
        note={
          state === 'single'
            ? undefined
            : state === 'gap'
              ? 'Los puntos no se unen: hay semanas sin sesión. La e1RM de cada semana está en la tabla de datos.'
              : 'e1RM con fórmula v1. No es una prueba de 1RM.'
        }
      >
        <LineChart
          values={topSets}
          {...(drawsEstimate && comparison !== undefined ? { comparison } : {})}
          xLabels={monthAxis(series)}
          lastLabel={`${formatWeight(series.lastTopSetKg ?? 0)} kg`}
          showLine={line === 'line'}
        />
      </ChartFrame>
    </Card>
  );
}

/* -------------------------------------------------------------- the volume */

function VolumeCard({ volume }: { readonly volume: WeeklyVolume }): React.ReactElement {
  // `progreso-single`: one week cannot be compared with itself, and no bar is drawn.
  if (!volume.enoughToCompare) {
    return (
      <Card padding="dense">
        <div className="ds-row">
          <span className="ds-section-label">Volumen semanal</span>
          <Chip>sin datos suficientes</Chip>
        </div>
        <p className="ds-caption">Necesita al menos dos semanas para comparar.</p>
      </Card>
    );
  }

  const values = volume.weeks.map((week) => week.volumeKg);
  const first = volume.weeks.find((week) => week.volumeKg > 0);

  return (
    <Card>
      <ChartFrame
        metric="Volumen semanal"
        window="últimas 12 semanas"
        summary={`De ${formatVolume(first?.volumeKg ?? 0)} a ${formatVolume(volume.lastVolumeKg)} kg de volumen semanal.`}
        columns={['volumen (kg)']}
        rows={volume.weeks.map((week) => ({
          label: formatDayMonth(week.start),
          values: [formatVolume(week.volumeKg)],
        }))}
        note={`Series duras esta semana: ${String(volume.lastHardSets)}. Objetivo por grupo: 10–16.`}
      >
        <BarChart
          values={values}
          lastLabel={`${formatVolume(volume.lastVolumeKg)} kg`}
          startLabel="hace 12 sem"
          endLabel="esta sem"
        />
      </ChartFrame>
    </Card>
  );
}

/* ------------------------------------------------------------- the records */

function RecordsCard({ records }: { readonly records: readonly PersonalRecord[] }): React.ReactElement {
  const top = topRecord(records);

  return (
    <Card padding="list">
      <DataRow
        title="Récords"
        subtitle={
          top === null
            ? 'Todavía no hay marcas guardadas'
            : `${top.exerciseName} ${formatWeight(top.weightKg)} kg × ${String(top.targetReps)} · ${formatDayMonth(
                top.achievedAt,
              )}`
        }
        {...(top === null
          ? { status: { word: 'sin datos', tone: 'muted' as const } }
          : { value: String(records.length) })}
      />
    </Card>
  );
}
