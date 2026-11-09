/**
 * Detalle de ejercicio — the drill-down of `#/progreso/ejercicio/<exerciseKey>`.
 *
 * It is the sixth surface of the reference artboard, inside the Progreso tab and inside
 * the tab shell: same four tabs, same hash navigation, an on-screen `‹ Progreso` because
 * standalone iOS has no browser back button (§8).
 *
 * What it may show is decided by what is stored:
 *
 * - **History** — every recorded session that contains this exercise, from the sessions
 *   the tab already read. The heaviest confirmed set of each session is the point; the
 *   line joins recorded sessions, never calendar weeks, so nothing is invented to fill
 *   a gap. One point is drawn as a point.
 * - **Prescription** — the frozen `prescription` of the last recorded session of this
 *   exercise (`sets`, `repRange`, `restSeconds`), labelled with that session's date.
 * - **Recommended load** — `recommendedWeightKg` of that session, and of the session
 *   that is still open, when the stored row carries one. When it does not, the line says
 *   so instead of guessing.
 * - **Records** — the marks of `personalRecords` for this key.
 * - **Muscle group and equipment** — only when the library row still exists. A deleted
 *   exercise keeps its history by snapshot name (I-4) and shows neither.
 * - **Library detail** — the execution description, the secondary muscles and the
 *   alternatives of that row (S4–S5, T3). All three are optional fields of `Exercise`, so
 *   a custom exercise, a row seeded before they existed or a row whose alternative has
 *   since been deleted renders without them instead of rendering a hole.
 *
 * There are no calories, no level or rank, no percentage and no invented trend: those
 * values do not exist in Rupfit (`design/system.md`, product-data guardrails).
 */

import { useMemo } from 'react';
import {
  Card,
  Chip,
  CompareTile,
  DataRow,
  DataStrip,
  EmptyState,
  LineChart,
  ChartFrame,
  SectionLabel,
} from '../../design-system';
import type { Equipment, Exercise, WorkoutSession } from '../../storage';
import type { MuscleGroup } from '../../core/domain';
import { personalRecords, type PersonalRecord } from './aggregates';
import {
  alternativesOf,
  exerciseFor,
  exerciseHistory,
  isSquatExercise,
  openSessionOf,
  secondaryMusclesOf,
  type ExerciseHistory,
  type ExerciseSessionPoint,
} from './exerciseDetail';
import {
  formatDayMonth,
  formatDayMonthYear,
  formatRepRange,
  formatRest,
  formatWeight,
} from './format';
import { DrilldownHeader } from './parts';
import './progress.css';

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  quadriceps: 'Cuádriceps',
  hamstrings: 'Cadena posterior',
  glutes: 'Glúteos',
  adductors: 'Aductores',
  calves: 'Gemelos',
  lowerBack: 'Lumbar',
  chest: 'Pecho',
  shoulders: 'Hombros',
  triceps: 'Tríceps',
  lats: 'Dorsales',
  upperBack: 'Espalda alta',
  biceps: 'Bíceps',
  forearms: 'Antebrazos',
  core: 'Core',
};

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  machine: 'Máquina',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  band: 'Banda',
};

export interface ExerciseDetailScreenProps {
  /** The sessions the tab read, newest first. */
  readonly sessions: readonly WorkoutSession[];
  /** The exercise library, for the muscle group and the equipment. */
  readonly exercises: readonly Exercise[];
  /** Decoded `exerciseKey`: the id, or `name:<snapshot>` for a deleted exercise. */
  readonly exerciseKey: string;
  readonly onBack: () => void;
  /** `#/entrenar`: the one action that fills an empty history. */
  readonly onStartTraining: () => void;
}

/** A name key still carries the snapshot; an id key does not until the library answers. */
function nameFromKey(key: string): string {
  return key.startsWith('name:') ? key.slice('name:'.length) : 'Ejercicio';
}

/** `6 nov 2024` for one session; a repeated day grows `(2)` so a table key stays unique. */
function sessionLabels(points: readonly ExerciseSessionPoint[]): readonly string[] {
  const seen = new Map<string, number>();
  return points.map((point) => {
    const base = formatDayMonthYear(point.at);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/**
 * The one illustration this feature owns: an original, inline squat with a bar. It is
 * drawn in `currentColor` and two tokens, so it follows the theme instead of pinning
 * the artboard's skin tone, and it is described in words because it is not decoration
 * of a number — it is the only picture of the screen.
 */
function SquatIllustration(): React.ReactElement {
  return (
    <figure
      className="progress__art"
      role="img"
      aria-label="Ilustración vectorial de una persona en sentadilla con una barra sobre la espalda"
    >
      <svg viewBox="0 0 360 184" aria-hidden="true" focusable="false">
        <path className="progress__art-floor" d="M30 145h300" fill="none" />
        {/* The rack: two uprights and the bar across them. */}
        <g fill="currentColor">
          <rect x="70" y="36" width="9" height="73" rx="3" />
          <rect x="280" y="36" width="9" height="73" rx="3" />
          <rect x="57" y="45" width="36" height="13" rx="5" />
          <rect x="266" y="45" width="36" height="13" rx="5" />
          <rect x="76" y="49" width="208" height="5" rx="2" />
        </g>
        {/* The athlete: head, back, arms on the bar, hips below the bar, feet on the floor. */}
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="179" cy="59" r="12" />
          <path d="M167 57q2-18 23-10l4 12-8-5-14 4z" fill="currentColor" stroke="none" />
          <path d="M168 74q12-8 23 1l16 35-18 16-28-14z" fill="currentColor" stroke="none" />
          <path d="M168 79 145 51 123 51M190 79l23-27 21 0" strokeWidth="9" />
          <path d="M171 118 145 139 122 139M189 120l23 19 25 1" strokeWidth="12" />
          <path d="M122 139h-25M237 140h25" strokeWidth="9" />
        </g>
        <path className="progress__art-mark" d="M30 153h300" fill="none" />
      </svg>
    </figure>
  );
}

function setsWord(count: number): string {
  return `${String(count)} ${count === 1 ? 'serie' : 'series'}`;
}

interface LibraryCardProps {
  readonly detail: Exercise | undefined;
  readonly exercises: readonly Exercise[];
}

/**
 * What the library knows about the movement besides its name (S4–S5, T3): how to execute
 * it, which muscles it also works, and what can replace it when the machine is busy.
 *
 * Nothing is drawn when the row has none of the three, so the screen of a custom exercise
 * is exactly the screen it was before the fields existed. The alternatives keep their own
 * history — they are other `Exercise.id`s — and the note says so, because replacing an
 * exercise must not read as moving its progression across.
 */
function LibraryCard({ detail, exercises }: LibraryCardProps): React.ReactElement | null {
  const secondary = secondaryMusclesOf(detail);
  const alternatives = alternativesOf(detail, exercises);
  const description = detail?.description;
  const hasDescription = description !== undefined;

  if (!hasDescription && secondary.length === 0 && alternatives.length === 0) return null;

  return (
    <Card>
      {hasDescription ? (
        <div className="progress__detail">
          <SectionLabel>Ejecución</SectionLabel>
          <p className="ds-body">{description}</p>
        </div>
      ) : null}

      {secondary.length === 0 ? null : (
        <div className="progress__detail">
          <span className="ds-meta">También trabaja</span>
          <div className="progress__chips">
            {secondary.map((muscle) => (
              <Chip key={muscle} tone="neutral">
                {MUSCLE_LABEL[muscle]}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {alternatives.length === 0 ? null : (
        <div className="progress__detail">
          <SectionLabel>Alternativas</SectionLabel>
          {alternatives.map((alternative) => (
            <DataRow
              key={alternative.id}
              title={alternative.name}
              subtitle={EQUIPMENT_LABEL[alternative.equipment]}
            />
          ))}
          <p className="ds-caption">
            Para cuando la máquina está ocupada. Cada alternativa es un ejercicio con su
            propio historial: lo que progreses en una no cambia el peso de otra.
          </p>
        </div>
      )}
    </Card>
  );
}

/** `3 series · 8 reps` — the session's confirmed sets and the reps of its top set. */
function pointCaption(point: ExerciseSessionPoint): string {
  const reps = point.topSetReps === null ? null : `${String(point.topSetReps)} reps`;
  return reps === null ? setsWord(point.setsConfirmed) : `${setsWord(point.setsConfirmed)} · ${reps}`;
}

interface HistoryChartProps {
  readonly name: string;
  readonly history: ExerciseHistory;
}

function HistoryChart({ name, history }: HistoryChartProps): React.ReactElement {
  const weighted = history.points.filter((point) => point.topSetKg !== null);
  const labels = sessionLabels(weighted);
  const values = weighted.map((point) => point.topSetKg ?? 0);
  const first = weighted[0];
  const last = weighted[weighted.length - 1];
  const unweighted = history.points.length - weighted.length;
  const drawsLine = weighted.length >= 2;

  if (weighted.length === 0) {
    return (
      <Card>
        <div className="ds-row">
          <SectionLabel>Tu historial</SectionLabel>
          <Chip>sin peso registrado</Chip>
        </div>
        <p className="ds-caption">
          {`${setsWord(history.setCount)} en ${String(history.sessionCount)} ${
            history.sessionCount === 1 ? 'sesión' : 'sesiones'
          }, ninguna con carga. Un ejercicio sin peso no tiene línea de fuerza.`}
        </p>
      </Card>
    );
  }

  const summary =
    weighted.length === 1
      ? `Un solo dato: ${formatWeight(last?.topSetKg ?? 0)} kg. Todavía no hay tendencia.`
      : `De ${formatWeight(first?.topSetKg ?? 0)} a ${formatWeight(
          last?.topSetKg ?? 0,
        )} kg en ${String(weighted.length)} sesiones registradas.`;

  return (
    <Card>
      <ChartFrame
        metric={`${name} · serie top`}
        window={`${String(weighted.length)} ${weighted.length === 1 ? 'sesión' : 'sesiones'}`}
        summary={summary}
        columns={['serie top (kg)']}
        rows={weighted.map((point, index) => ({
          label: labels[index] ?? formatDayMonth(point.at),
          values: [formatWeight(point.topSetKg ?? 0)],
        }))}
        legend={[{ label: 'serie top de cada sesión', series: 1 }]}
        note={
          drawsLine
            ? 'Cada punto es una sesión registrada. La línea une sesiones, no semanas: no se interpola ningún hueco.'
            : 'Un punto no es una tendencia: la línea empieza con la segunda sesión.'
        }
      >
        <LineChart
          values={values}
          xLabels={labels}
          lastLabel={`${formatWeight(last?.topSetKg ?? 0)} kg`}
          showLine={drawsLine}
        />
      </ChartFrame>
      {unweighted === 0 ? null : (
        <p className="ds-caption">
          {`${String(unweighted)} ${
            unweighted === 1 ? 'sesión sin peso' : 'sesiones sin peso'
          } no se dibujan: no hay carga que situar en la línea.`}
        </p>
      )}
    </Card>
  );
}

interface PrescriptionCardProps {
  readonly history: ExerciseHistory;
}

function PrescriptionCard({ history }: PrescriptionCardProps): React.ReactElement {
  const last = history.lastSession;
  if (last === null) return <></>;

  const { prescription, recommendedWeightKg, usedWeightKg } = last.exercise;

  return (
    <Card>
      <div className="ds-row">
        <SectionLabel>Prescripción</SectionLabel>
        <span className="ds-caption">{`Última sesión · ${formatDayMonthYear(last.session.scheduledDate)}`}</span>
      </div>
      <DataStrip
        label="Prescripción de la última sesión"
        items={[
          { label: 'Series', value: String(prescription.sets) },
          { label: 'Repeticiones', value: formatRepRange(prescription.repRange) },
          { label: 'Descanso', value: formatRest(prescription.restSeconds) },
        ]}
      />
      <div className="ds-hairline" />
      <div className="ds-row">
        <span className="ds-meta">Peso recomendado</span>
        {recommendedWeightKg === null ? (
          <span className="ds-caption">sin recomendación guardada</span>
        ) : (
          <span className="ds-body">{`${formatWeight(recommendedWeightKg)} kg`}</span>
        )}
      </div>
      {usedWeightKg === null ? null : (
        <div className="ds-row">
          <span className="ds-meta">Peso usado</span>
          <span className="ds-body">{`${formatWeight(usedWeightKg)} kg`}</span>
        </div>
      )}
    </Card>
  );
}

interface RecordsCardProps {
  readonly records: readonly PersonalRecord[];
}

function RecordsCard({ records }: RecordsCardProps): React.ReactElement {
  return (
    <Card padding={records.length === 0 ? 'dense' : 'list'}>
      <div className="ds-row">
        <SectionLabel>Récords</SectionLabel>
        {records.length === 0 ? <Chip>sin marcas</Chip> : null}
      </div>
      {records.length === 0 ? (
        <p className="ds-caption">
          Todavía no hay marcas de este ejercicio. Un récord es el peso máximo con un objetivo de
          repeticiones.
        </p>
      ) : (
        records.map((record) => (
          <DataRow
            key={record.targetReps}
            title={`${formatWeight(record.weightKg)} kg × ${String(record.targetReps)}`}
            subtitle={`Primera vez · ${formatDayMonthYear(record.achievedAt)}`}
          />
        ))
      )}
    </Card>
  );
}

interface SessionRowsProps {
  readonly history: ExerciseHistory;
}

function SessionRows({ history }: SessionRowsProps): React.ReactElement {
  const newestFirst = history.points.slice().reverse();

  return (
    <Card padding="list">
      <div className="ds-row">
        <SectionLabel>Sesiones</SectionLabel>
        <span className="ds-caption">
          {`${setsWord(history.setCount)} en ${String(history.sessionCount)} ${
            history.sessionCount === 1 ? 'sesión' : 'sesiones'
          }`}
        </span>
      </div>
      {newestFirst.map((point) => (
        <DataRow
          key={point.sessionId}
          title={formatDayMonthYear(point.at)}
          subtitle={pointCaption(point)}
          {...(point.topSetKg === null ? {} : { value: formatWeight(point.topSetKg), valueUnit: 'kg' })}
        />
      ))}
    </Card>
  );
}

export function ExerciseDetailScreen({
  sessions,
  exercises,
  exerciseKey,
  onBack,
  onStartTraining,
}: ExerciseDetailScreenProps): React.ReactElement {
  const history = useMemo(() => exerciseHistory(sessions, exerciseKey), [sessions, exerciseKey]);
  const open = useMemo(() => openSessionOf(sessions, exerciseKey), [sessions, exerciseKey]);
  const records = useMemo(
    () => personalRecords(sessions).filter((record) => record.exerciseKey === exerciseKey),
    [sessions, exerciseKey],
  );

  const known = exerciseFor(exercises, exerciseKey, history?.name ?? nameFromKey(exerciseKey));
  const name = history?.name ?? known?.name ?? nameFromKey(exerciseKey);
  const squat = isSquatExercise(name, known);

  // Only a stored value is shown: the open session's own decided weight, else the one
  // it recommended. Neither is invented and neither is recomputed here.
  const openWeightKg = open?.exercise.usedWeightKg ?? open?.exercise.recommendedWeightKg ?? null;
  const lastPoint = history?.lastPoint ?? null;

  const openTile =
    openWeightKg === null ? null : (
      <CompareTile
        label="En sesión"
        value={formatWeight(openWeightKg)}
        unit="kg"
        caption={`${setsWord(open?.exercise.sets.length ?? 0)} de ${
          open?.exercise.prescription.sets ?? 0
        }`}
        today
      />
    );

  return (
    <div className="progress">
      <DrilldownHeader title={name} backLabel="Progreso" onBack={onBack} />

      {squat ? <SquatIllustration /> : null}

      {known === undefined ? null : (
        <div className="progress__chips">
          <Chip dot>{MUSCLE_LABEL[known.primaryMuscle]}</Chip>
          <Chip tone="neutral">{EQUIPMENT_LABEL[known.equipment]}</Chip>
        </div>
      )}

      <LibraryCard detail={known} exercises={exercises} />

      {history === null ? (
        <>
          <EmptyState tone="primary" action={{ label: 'Empezar entrenamiento', onClick: onStartTraining }}>
            Todavía no hay series registradas de este ejercicio. Aparecerán aquí en cuanto completes una
            sesión que lo incluya.
          </EmptyState>
          {openTile === null ? null : <div className="progress__compare">{openTile}</div>}
        </>
      ) : (
        <>
          <div className="progress__compare">
            <CompareTile
              label="Última vez"
              value={
                lastPoint === null || lastPoint.topSetKg === null
                  ? '—'
                  : formatWeight(lastPoint.topSetKg)
              }
              unit={lastPoint === null || lastPoint.topSetKg === null ? undefined : 'kg'}
              caption={lastPoint === null ? 'sin sesiones' : pointCaption(lastPoint)}
            />
            {openTile}
          </div>
          <p className="ds-caption">
            {lastPoint === null
              ? 'Sin sesiones registradas.'
              : `Sesión del ${formatDayMonth(
                  lastPoint.at,
                )}. El peso es la serie más pesada de ese día.`}
          </p>

          <HistoryChart name={name} history={history} />
          <PrescriptionCard history={history} />
          <RecordsCard records={records} />
          <SessionRows history={history} />
        </>
      )}
    </div>
  );
}
