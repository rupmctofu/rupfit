/**
 * Progreso — the tab, and the two views inside it.
 *
 * Three decisions hold this screen together:
 *
 * 1. **Every number is derived.** The charts, the records and the weekly volume are
 *    computed in `aggregates.ts` from the sessions and measurements the storage port
 *    returned; nothing is stored, cached or made up (`docs/data-model.md` §8, I-6). The
 *    four reads of the tab are the only I/O it performs: the recent sessions, the
 *    measurements, the profile and the exercise library — the last one only to name the
 *    muscle group and the equipment of an exercise that still exists.
 * 2. **The clock is the provider's.** `now` arrives once, from `clock.now()`, and is
 *    handed to the pure functions with every row. No component below reads
 *    `Date.now()`; the tab is a static image of the data, so it has no ticking state.
 * 3. **A gap is a gap.** A week without training gets no bar value it did not earn and
 *    no line; a day without a weigh-in is a missing point, not an interpolated one.
 *    Where `LineChart` cannot express the hole (its `values` is a `readonly number[]`),
 *    the honest rendering is chosen — no line, explicit points — and the caption says
 *    why. See the report for the component limitation this does not fix.
 *
 * T7 of the redesign gives the tab its reading order and the three-way segmented control
 * under the title — `Evolución`, `Sesiones`, `PRs` — each panel a question the aggregates
 * already answer:
 *
 * - **Evolución** leads with the current week's volume (`weeklyVolume.lastVolumeKg`) over
 *   the twelve buckets of the same aggregate, then the body weight: the latest weigh-in,
 *   the chart of `#/progreso/peso` (one implementation, `WeightChart`) and the way into the
 *   existing entry form.
 * - **Sesiones** is a screenful of compact rows — date, workout, sets, volume — read out
 *   with the same `sessionSummary` the Historial drill-down uses, and the way into
 *   `#/progreso/historial`, which keeps the month groups, the totals and the deletion.
 * - **PRs** gives `personalRecords` a treatment of its own: the heaviest mark as the
 *   protagonist, then one row per record, each opening the exercise detail.
 *
 * No panel invents a figure: a week without volume is the 0 kg the aggregate wrote, a
 * missing weigh-in is a sentence and never a curve, and a single point is said in words
 * instead of being drawn as a trend.
 *
 * ## The drill-downs
 *
 * Three views live inside the tab and are read from the hash (`navigation.ts`):
 * `#/progreso/historial`, `#/progreso/peso` and `#/progreso/ejercicio/<exerciseKey>`.
 * The last one is the reference artboard's exercise detail (`ExerciseDetailScreen`);
 * it is reached from the `Por ejercicio` list, the Récords row and the Historial rows,
 * so a stored name that is trained is never a dead end.
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
  Card,
  ChartFrame,
  Chip,
  DataRow,
  DataStrip,
  EmptyState,
  ErrorBanner,
  Icon,
  LineChart,
  MetricTile,
  Numeral,
  SectionLabel,
  TextButton,
} from '../../design-system';
import { useAppServices } from '../../app/providers';
import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  StoragePort,
  UserProfile,
  WorkoutSession,
} from '../../storage';
import {
  ACTIVITY_DELETE_COPY,
  useActivityDeletion,
  type ActivityDeletionState,
} from '../home/deletion';
import { FOOTBALL_DURATION_MINUTES, useFootballCapture } from '../home/football';
import {
  activityViewOf,
  type ActivityEntryView,
  type ActivityView,
} from '../home/selectors';
import {
  isRecordedSession,
  personalRecords,
  topRecord,
  weeklyVolume,
  weightSeries,
  type WeeklyVolume,
  type WeightSeries,
} from './aggregates';
import {
  formatDayMonth,
  formatDayMonthYear,
  formatGoal,
  formatLongDayMonth,
  formatVolume,
  formatWeight,
} from './format';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
import { HistorialScreen, SessionReadOut, SessionRow } from './HistorialScreen';
import { deleteStoredSession } from './deleteFlow';
import { useProgressView } from './navigation';
import { historySessions, sessionSummary } from './summary';
import { LastWeighInTile, WeightChart, WeightScreen } from './WeightScreen';
import type { WeightDraft, WeightSaveOutcome } from './weightEntry';
import { createMeasurementId, saveWeightEntry } from './weightSave';
import { Segmented, TrashGlyph } from './parts';
import './progress.css';

/** The one clock the tab is allowed to read: the provider's. */
export interface ProgressClock {
  now(): number;
}

/** A cap, not a window: twelve weeks and the all-time records need far fewer rows. */
const HISTORY_LIMIT = 500;

/** The three panels of the tab, in the order the segment control draws them. */
type Panel = 'evolucion' | 'sesiones' | 'prs';

const PANELS: readonly { readonly value: Panel; readonly label: string }[] = [
  { value: 'evolucion', label: 'Evolución' },
  { value: 'sesiones', label: 'Sesiones' },
  { value: 'prs', label: 'PRs' },
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
  readonly exercises: readonly Exercise[];
  /**
   * T9 (S12) — the owner's recorded activities. They live here now: Inicio is the week,
   * and the rows the football capture writes are history, not the day.
   */
  readonly activities: readonly ActivityRecord[];
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
  const [panel, setPanel] = useState<Panel>('evolucion');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const [sessions, measurements, profile, exercises, activities] = await Promise.all([
          storage.sessions.recent(HISTORY_LIMIT),
          storage.measurements.all(),
          storage.profile.read(),
          storage.exercises.all(),
          storage.activities.all(),
        ]);
        if (cancelled) return;
        setState({
          status: 'ready',
          sessions,
          measurements,
          profile: profile ?? null,
          exercises,
          activities,
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

  /**
   * Deleting a stored session (odd/tasks/home-hierarchy.md T4; odd/tasks/delete-session.md).
   * The two port calls and their order live in `deleteFlow.ts`, where they are tested; this
   * callback adds the one thing the feature needs on top: re-reading the tab from the
   * store afterwards, so the recommendation the engine computes sees the deletion too.
   */
  const deleteSession = useCallback(
    async (session: WorkoutSession): Promise<void> => {
      await deleteStoredSession(storage.sessions, session);
      setAttempt((current) => current + 1);
    },
    [storage],
  );
  const startTraining = useCallback(() => {
    window.location.hash = '#/entrenar';
  }, []);

  /**
   * T9 (S12) — the activity section's two seams, moved here from Inicio.
   *
   * The clock is handed to the capture as a stable object: `useFootballCapture` keeps its
   * `save` in a `useCallback`, and a fresh clock on every render would rebuild it on every
   * render for no reason. Both writes re-read the tab afterwards, which is the only way
   * the rows and their bins can catch up with the store.
   */
  const writeClock = useMemo<ProgressClock>(() => ({ now: () => clock.now() }), [clock]);
  const capture = useFootballCapture({ storage, clock: writeClock, onSaved: retry });
  const deletion = useActivityDeletion({ storage, onDeleted: retry });
  const activity = useMemo(
    () => activityViewOf(state.status === 'ready' ? state.activities : []),
    [state],
  );

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
        <h1 className="ds-screen-title">Historial</h1>
        <ErrorBanner message={state.message} onRetry={retry} />
      </div>
    );
  }

  if (state.status === 'loading' || weight === null) {
    // Local data: no spinner, no skeleton, no empty chart (§3 of the task brief).
    return (
      <div className="progress">
        <h1 className="ds-screen-title">Historial</h1>
      </div>
    );
  }

  if (navigation.view === 'exercise' && navigation.exerciseKey !== null) {
    return (
      <ExerciseDetailScreen
        sessions={state.sessions}
        exercises={state.exercises}
        exerciseKey={navigation.exerciseKey}
        onBack={navigation.back}
        onStartTraining={startTraining}
      />
    );
  }

  if (navigation.view === 'historial') {
    return (
      <HistorialScreen
        sessions={state.sessions}
        onBack={navigation.back}
        onOpenExercise={navigation.openExercise}
        onStartTraining={startTraining}
        onDeleteSession={deleteSession}
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

  // Nothing trained and nothing weighed: the screen says what is missing and offers the
  // one action that fills it, instead of three panels of zeros under a segment control.
  const nothingYet = !state.sessions.some(isRecordedSession) && weight.last === null;

  return (
    <div className="progress">
      <header className="progress__top">
        <h1 className="ds-screen-title">Historial</h1>
        <Segmented
          label="Vista del historial"
          options={PANELS}
          value={panel}
          onChange={setPanel}
        />
      </header>

      {nothingYet ? (
        <>
          <EmptyState
            tone="primary"
            action={{ label: 'Empezar entrenamiento', onClick: startTraining }}
          >
            Sin datos todavía. Registra una sesión y aquí aparecerán la evolución del volumen,
            los récords y el peso corporal.
          </EmptyState>
          {/* One way in that the empty state cannot offer: the first weigh-in, which is not
              a workout. */}
          <Card padding="list">
            <DataRow
              icon="scale"
              title="Peso corporal"
              subtitle="Añadir el primer pesaje"
              onSelect={() => navigation.navigate('peso')}
              selectLabel="Abrir el peso corporal"
            />
          </Card>
        </>
      ) : (
        <>
          {panel === 'evolucion' ? (
            <Evolution
              sessions={state.sessions}
              weight={weight}
              goal={goal}
              now={state.now}
              onOpenWeight={() => navigation.navigate('peso')}
            />
          ) : null}
          {panel === 'sesiones' ? (
            <SessionsPanel
              sessions={state.sessions}
              onOpenExercise={navigation.openExercise}
              onOpenHistorial={() => navigation.navigate('historial')}
            />
          ) : null}
          {panel === 'prs' ? (
            <RecordsPanel sessions={state.sessions} onOpenExercise={navigation.openExercise} />
          ) : null}
        </>
      )}

      {/* T9 (S12): the activities and their bin, moved — not deleted — from Inicio. */}
      <ActivitySection
        view={activity}
        onRecordFootball={capture.save}
        recording={capture.busy}
        footballNotice={capture.notice}
        deletion={deletion}
      />
    </div>
  );
}

/* --------------------------------------------------------------- the panels */

interface EvolutionProps {
  readonly sessions: readonly WorkoutSession[];
  readonly weight: WeightSeries;
  readonly goal: string | null;
  readonly now: number;
  /** `#/progreso/peso`: the series, its mean and the weigh-in entry. */
  readonly onOpenWeight: () => void;
}

/**
 * `Evolución` — the two series the tab exists to read: volume and body weight.
 *
 * Both are computed here from the rows the tab already read, with the same functions the
 * drill-downs use (`weeklyVolume`, `weightSeries`), so the tab and the detail screens cannot
 * disagree about a number.
 */
function Evolution({
  sessions,
  weight,
  goal,
  now,
  onOpenWeight,
}: EvolutionProps): React.ReactElement {
  const volume = useMemo(() => weeklyVolume(sessions, { now }), [sessions, now]);
  const recordedCount = useMemo(() => sessions.filter(isRecordedSession).length, [sessions]);

  return (
    <div className="progress__panel">
      <VolumeCard volume={volume} recordedCount={recordedCount} />
      <WeightCard series={weight} goal={goal} onOpenWeight={onOpenWeight} />
    </div>
  );
}

interface VolumeCardProps {
  readonly volume: WeeklyVolume;
  /** Sessions that happened, all-time: the count the rows hold, not a window's. */
  readonly recordedCount: number;
}

/**
 * `Volumen semanal` — the one chart this screen is built around.
 *
 * The figure above the line is the current week's volume, `weeklyVolume.lastVolumeKg`; the
 * line is the twelve buckets of the same aggregate, holes included (a week without a session
 * is the 0 kg the aggregate wrote, and the note says so). The three cells underneath are the
 * numbers that aggregate exposes: sessions recorded, weeks with data in the window, and the
 * hard sets of this week.
 *
 * Nothing is compared that the data cannot compare: a single week with volume gets a
 * sentence instead of a line, and a window with no volume at all draws no axis.
 */
function VolumeCard({ volume, recordedCount }: VolumeCardProps): React.ReactElement {
  const thisWeek = volume.weeks[volume.weeks.length - 1];

  if (volume.weeksWithVolume === 0) {
    return (
      <Card className="progress-hero" label="Volumen semanal">
        <div className="ds-row">
          <SectionLabel>Volumen semanal</SectionLabel>
          <Chip>sin datos</Chip>
        </div>
        <p className="ds-caption">
          El volumen aparece con la primera sesión registrada. No se dibuja una línea plana.
        </p>
      </Card>
    );
  }

  const first = volume.weeks.find((week) => week.volumeKg > 0);
  const values = volume.weeks.map((week) => week.volumeKg);
  const labels = volume.weeks.map((week) => formatDayMonth(week.start));

  return (
    <Card className="progress-hero" label="Volumen semanal">
      <MetricTile
        label="Volumen semanal"
        value={formatVolume(volume.lastVolumeKg)}
        unit="kg"
        size="metric"
        caption={
          thisWeek === undefined
            ? undefined
            : `Semana del ${formatDayMonth(thisWeek.start)} · ${String(
                thisWeek.sessions,
              )} ${thisWeek.sessions === 1 ? 'sesión' : 'sesiones'}`
        }
      />

      {volume.enoughToCompare ? (
        <ChartFrame
          metric="Evolución del volumen"
          window="últimas 12 semanas"
          summary={`De ${formatVolume(first?.volumeKg ?? 0)} a ${formatVolume(
            volume.lastVolumeKg,
          )} kg de volumen semanal.`}
          columns={['volumen (kg)']}
          rows={volume.weeks.map((week) => ({
            label: formatDayMonth(week.start),
            values: [formatVolume(week.volumeKg)],
          }))}
          note="Una semana sin sesión vale 0 kg: es ausencia de volumen, no un hueco."
        >
          <LineChart
            values={values}
            xLabels={labels}
            lastLabel={`${formatVolume(volume.lastVolumeKg)} kg`}
          />
        </ChartFrame>
      ) : (
        <p className="ds-caption">
          {`Una sola semana con volumen: ${formatVolume(
            volume.lastVolumeKg,
          )} kg. Con un punto no se dibuja una tendencia: la línea empieza con la segunda.`}
        </p>
      )}

      <div className="ds-hairline" />
      <DataStrip
        className="progress__strip"
        label="Lo que suma el historial"
        items={[
          { label: 'Sesiones', value: String(recordedCount) },
          {
            label: 'Semanas con datos',
            value: `${String(volume.weeksWithVolume)}/${String(volume.weeks.length)}`,
          },
          { label: 'Series duras', value: String(volume.lastHardSets) },
        ]}
      />
      <p className="ds-caption">
        Series duras: las de esta semana a 1 RIR o menos, con el esfuerzo anotado.
      </p>
    </Card>
  );
}

interface WeightCardProps {
  readonly series: WeightSeries;
  readonly goal: string | null;
  readonly onOpenWeight: () => void;
}

/**
 * `Peso corporal` — the latest weigh-in, the chart of the drill-down, and the way in.
 *
 * The block is the tab's; the chart is `WeightChart`'s, shared with `#/progreso/peso`, so the
 * two screens cannot disagree about a point. With no measurement the block says so and draws
 * nothing — a fake curve is exactly what the brief forbids. `Añadir un pesaje` opens the peso
 * screen, where `WeightEntryForm` — the one writer of a measurement — already lives.
 */
function WeightCard({ series, goal, onOpenWeight }: WeightCardProps): React.ReactElement {
  const count = series.points.length;

  return (
    <Card label="Peso corporal">
      <div className="ds-row">
        <SectionLabel>Peso corporal</SectionLabel>
        <span className="ds-caption">
          {series.last === null
            ? 'sin pesajes'
            : `${String(count)} ${count === 1 ? 'pesaje' : 'pesajes'}`}
        </span>
      </div>

      {series.last === null ? (
        <p className="ds-caption">
          Todavía no hay pesajes. Cuando guardes el primero, aquí aparecerán la serie y la media de
          7 días.
        </p>
      ) : (
        <>
          <LastWeighInTile series={series} goal={goal} />
          <WeightChart series={series} />
        </>
      )}

      <div className="ds-hairline" />
      <DataRow
        icon="plus"
        title="Añadir un pesaje"
        subtitle="Kilogramos y día · media de 7 días"
        onSelect={onOpenWeight}
        selectLabel="Añadir un pesaje en el peso corporal"
      />
    </Card>
  );
}

/* --------------------------------------------------------------- the sessions */

/** A screenful of compact session rows; the complete list keeps its own drill-down. */
const RECENT_SESSIONS = 8;

interface SessionsPanelProps {
  readonly sessions: readonly WorkoutSession[];
  readonly onOpenExercise: (key: string) => void;
  /** `#/progreso/historial`: the complete list, its totals and the bin. */
  readonly onOpenHistorial: () => void;
}

/**
 * `Sesiones` — date, workout, sets and volume of the sessions that happened.
 *
 * The rows are a screenful of the same `historySessions` the complete list uses, read out
 * with the same `sessionSummary`, so a row here and the same row there cannot disagree. A tap
 * opens the session read-out in place (`SessionReadOut`, the component behind the Historial
 * drill-down); the card under the rows is the way into `#/progreso/historial`, where the month
 * groups, the totals, the per-exercise loads and the deletion live.
 */
function SessionsPanel({
  sessions,
  onOpenExercise,
  onOpenHistorial,
}: SessionsPanelProps): React.ReactElement {
  const rows = useMemo(() => historySessions(sessions), [sessions]);
  const summaries = useMemo(
    () => new Map(rows.map((row) => [row.id, sessionSummary(row)] as const)),
    [rows],
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const open = openId === null ? undefined : rows.find((row) => row.id === openId);
  if (open !== undefined) {
    return (
      <SessionReadOut
        session={open}
        all={rows}
        onBack={() => setOpenId(null)}
        backLabel="Sesiones"
        onOpenExercise={onOpenExercise}
      />
    );
  }

  const recent = rows.slice(0, RECENT_SESSIONS);

  return (
    <div className="progress__panel">
      <div className="progress__group">
        <div className="progress__group-head">
          <SectionLabel>Sesiones</SectionLabel>
          <span className="ds-caption">
            {rows.length === 0
              ? 'sin datos'
              : `${String(rows.length)} ${rows.length === 1 ? 'registrada' : 'registradas'}`}
          </span>
        </div>
        {rows.length === 0 ? (
          <Card padding="dense">
            <p className="ds-caption">
              Todavía no hay sesiones registradas. La primera aparecerá aquí con su volumen y sus
              series.
            </p>
          </Card>
        ) : (
          <Card padding="list">
            {recent.map((session) => {
              const summary = summaries.get(session.id);
              if (summary === undefined) return null;
              return (
                <SessionRow
                  key={session.id}
                  session={session}
                  summary={summary}
                  onSelect={() => setOpenId(session.id)}
                  selectLabel={`Abrir la sesión del ${formatLongDayMonth(session.scheduledDate)}`}
                />
              );
            })}
          </Card>
        )}
        {rows.length <= RECENT_SESSIONS ? null : (
          <p className="ds-caption">
            {`Se muestran las ${String(RECENT_SESSIONS)} más recientes de ${String(rows.length)}.`}
          </p>
        )}
      </div>

      <Card padding="list">
        <DataRow
          icon="calendar"
          title="Historial completo"
          subtitle="Por meses, con los totales y el borrado de una sesión"
          onSelect={onOpenHistorial}
          selectLabel="Abrir el historial completo"
        />
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- the PRs */

interface RecordsPanelProps {
  readonly sessions: readonly WorkoutSession[];
  readonly onOpenExercise: (key: string) => void;
}

/**
 * `PRs` — the marks `personalRecords` derives, with a treatment of their own.
 *
 * The heaviest mark (`topRecord`) is the panel's protagonist: the lift, the weight at the
 * metric size, and the day it was first reached. Under it, one row per record — the lift on
 * the left, the target reps and the date behind it, the weight as the figure the eye lands on
 * — and every row opens the exercise detail, where that lift's marks live. Nothing is stored:
 * a record is recomputed from the sets every time the tab renders.
 */
function RecordsPanel({ sessions, onOpenExercise }: RecordsPanelProps): React.ReactElement {
  const records = useMemo(() => personalRecords(sessions), [sessions]);
  const top = topRecord(records);

  if (top === null) {
    return (
      <Card padding="dense">
        <div className="ds-row">
          <SectionLabel>Récords personales</SectionLabel>
          <Chip>sin marcas</Chip>
        </div>
        <p className="ds-caption">
          Un récord es el peso máximo con un objetivo de repeticiones. Aparece en cuanto
          registres una serie con carga.
        </p>
      </Card>
    );
  }

  return (
    <div className="progress__panel">
      <Card className="progress-hero progress-pr" label="Mejor marca">
        <div className="ds-row">
          <SectionLabel>Mejor marca</SectionLabel>
          <Chip tone="success" dot>
            Récord
          </Chip>
        </div>
        <p className="progress-pr__lift">{top.exerciseName}</p>
        <p className="progress-pr__figure">
          <Numeral value={formatWeight(top.weightKg)} unit="kg" size="metric" />
          <span className="ds-meta">{`× ${String(top.targetReps)} reps`}</span>
        </p>
        <p className="ds-caption">
          {`El peso máximo con un objetivo de ${String(
            top.targetReps,
          )} repeticiones, del ${formatDayMonthYear(top.achievedAt)}.`}
        </p>
      </Card>

      <div className="progress__group">
        <div className="progress__group-head">
          <SectionLabel>Récords</SectionLabel>
          <span className="ds-caption">
            {`${String(records.length)} ${records.length === 1 ? 'marca' : 'marcas'}`}
          </span>
        </div>
        <Card padding="list">
          {records.map((record) => (
            <button
              key={`${record.exerciseKey}-${String(record.targetReps)}`}
              type="button"
              className="ds-action progress-record"
              onClick={() => onOpenExercise(record.exerciseKey)}
              aria-label={`Abrir el detalle de ${record.exerciseName}: ${formatWeight(
                record.weightKg,
              )} kg × ${String(record.targetReps)} reps, ${formatDayMonthYear(record.achievedAt)}`}
            >
              <span className="progress-record__main">
                <span className="progress-record__lift">{record.exerciseName}</span>
                <span className="progress-record__meta">
                  {`× ${String(record.targetReps)} reps · ${formatDayMonthYear(record.achievedAt)}`}
                </span>
              </span>
              <Numeral value={formatWeight(record.weightKg)} unit="kg" size="metric-small" />
              <span className="progress-record__chevron" aria-hidden="true">
                <Icon name="chevronRight" size={20} />
              </span>
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the activity */

export interface ActivitySectionProps {
  /** The rows, as `activityViewOf` shapes them: one per manual row, and the counts. */
  readonly view: ActivityView;
  /** Writes the manual football activity. Absent: the capture is not offered. */
  readonly onRecordFootball?: (() => void) | undefined;
  readonly recording?: boolean | undefined;
  readonly footballNotice?: string | null | undefined;
  /** The bin and its inline question. Absent: the recorded rows are read-only. */
  readonly deletion?: ActivityDeletionState | undefined;
}

/**
 * T9 (S12) — the activity section, at the home it was moved to.
 *
 * Inicio stopped drawing it — the owner asked for the week and little else — but nothing
 * about it changed: the manual football capture still writes an `ActivityRecord`, the rows
 * are still named for what they are (`Fútbol registrado`, its date and duration), and the
 * bin still asks before it removes, in place, with `deletion.ts`'s own copy. Progreso is
 * where the history lives, so it is where the history is edited.
 *
 * Only the class names are new: the geometry is `progress.css`, in tokens, so the accent
 * fill of this screen stays `EmptyState`'s one action (§7.1).
 */
export function ActivitySection({
  view,
  onRecordFootball,
  recording = false,
  footballNotice = null,
  deletion,
}: ActivitySectionProps): React.ReactElement {
  return (
    <section className="progress__section">
      <SectionLabel icon={<Icon name="heart" size={14} />}>Actividad</SectionLabel>

      <Card padding="dense" label="Fútbol">
        <div className="progress__football">
          <Icon name="clock" size={20} className="progress__icon" />
          <span className="ds-card-title">Fútbol</span>
          <span className="progress__football-min">
            <span className="ds-numeral ds-numeral--metric-small">
              {String(FOOTBALL_DURATION_MINUTES)}
            </span>
            <span className="ds-numeral__unit">min</span>
          </span>
          {onRecordFootball === undefined ? null : (
            <TextButton
              icon="plus"
              align="start"
              className="progress__football-action"
              disabled={recording}
              onClick={onRecordFootball}
            >
              {recording ? 'Guardando…' : 'Registrar'}
            </TextButton>
          )}
        </div>
        {/* A plain result line: no modal, no timer, and no claim about a screen that has
            not re-read yet. */}
        {footballNotice === null ? null : <p className="ds-body">{footballNotice}</p>}
      </Card>

      {view.recorded.length === 0 ? null : (
        <Card padding="dense" label="Actividad registrada">
          <div className="progress__activity" role="list">
            {view.recorded.map((row) => (
              <ActivityRow key={row.id} row={row} {...(deletion === undefined ? {} : { deletion })} />
            ))}
          </div>
        </Card>
      )}

      {/* What the removal did, in one line: the row disappears on its own when the tab
          re-reads, so there is no toast to dismiss. */}
      {deletion === undefined || deletion.notice === null ? null : (
        <p className="ds-body">{deletion.notice}</p>
      )}

      {view.empty ? (
        <p className="ds-meta">Todavía no hay actividad registrada. Esto no impide entrenar.</p>
      ) : null}
    </section>
  );
}

/**
 * One recorded activity: what it is, its date and duration, and its bin.
 *
 * The bin never deletes on its own (S5): the first tap only asks, and the question
 * replaces the bin in place — «¿Eliminar? Sí / Cancelar». A row mid-question keeps its
 * own two 48 px buttons rather than a dialog, so nothing covers the screen and nothing
 * has to be dismissed before the owner can change his mind.
 */
function ActivityRow({
  row,
  deletion,
}: {
  readonly row: ActivityEntryView;
  readonly deletion?: ActivityDeletionState | undefined;
}): React.ReactElement {
  const asking = deletion !== undefined && deletion.pendingId === row.id;
  return (
    <div className="progress__activity-row" role="listitem">
      <span className="progress__activity-main">
        <span className="ds-body">{row.label}</span>
        <span className="ds-meta">{row.detail}</span>
      </span>
      {deletion === undefined ? null : asking ? (
        <span className="progress__confirm">
          <span className="progress__confirm-ask">{ACTIVITY_DELETE_COPY.ask}</span>
          <TextButton
            tone="danger"
            disabled={deletion.busy}
            onClick={() => deletion.confirm(row.id)}
          >
            {ACTIVITY_DELETE_COPY.confirm}
          </TextButton>
          <TextButton disabled={deletion.busy} onClick={deletion.cancel}>
            {ACTIVITY_DELETE_COPY.cancel}
          </TextButton>
        </span>
      ) : (
        <button
          type="button"
          className="ds-action progress__bin"
          aria-label={row.removeLabel}
          onClick={() => deletion.ask(row.id)}
        >
          <TrashGlyph />
        </button>
      )}
    </div>
  );
}
