/**
 * Historial — the session list and the read-out of one session.
 *
 * It is a view of the Progreso tab, not a fifth tab: `#/progreso/historial` (see
 * `navigation.ts`) and an on-screen `‹ Progreso` control, because standalone iOS has
 * no browser back button (§8).
 *
 * The read-out is the Resumen screen's read-out: the same `summarise` of
 * `src/core/session/model.ts`, reached through `summary.ts`, so a session cannot say
 * one volume here and another there. What this file adds is only what the list needs:
 * the weekday and the month group, which come from the stored `scheduledDate`.
 *
 * Two ways out of a list row lead further in: the session read-out (`‹ Historial`) and
 * the exercise detail (`#/progreso/ejercicio/<key>`, the `Por ejercicio` card and the
 * per-exercise rows of a session). The exercise key is the one the aggregations use —
 * the id, or the snapshot name when the library row is gone (I-4).
 *
 * States: the list (`historial`), the empty list (`historial-empty`) and one open
 * session. A row opens only from stored data: no number on this screen is invented.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Card,
  Chip,
  DataRow,
  DataStrip,
  EmptyState,
  ErrorBanner,
  SectionLabel,
  TextButton,
} from '../../design-system';
import type { WorkoutSession } from '../../storage';
import { exerciseKey, recordsInSession } from './aggregates';
import {
  DELETE_FLOW_IDLE,
  isAsking,
  isFailed,
  reduceDeleteFlow,
  runDelete,
  type DeleteFlow,
} from './deleteFlow';
import { exerciseUsages, type ExerciseUsage } from './exerciseDetail';
import {
  durationMinutes,
  formatDayMonth,
  formatDurationMinutes,
  formatHoursMinutes,
  formatLongDayMonth,
  formatMonthTitle,
  formatVolume,
  formatWeekdayDay,
  formatWeight,
} from './format';
import { DrilldownHeader, TrashGlyph } from './parts';
import { historySessions, isHistorySession, sessionSummary } from './summary';
import './progress.css';

export interface HistorialScreenProps {
  /** The sessions the tab read, newest first. */
  readonly sessions: readonly WorkoutSession[];
  readonly onBack: () => void;
  /** `#/progreso/ejercicio/<key>`: the drill-down of one exercise. */
  readonly onOpenExercise: (key: string) => void;
  /** `#/entrenar`: the one action that fills an empty history. */
  readonly onStartTraining: () => void;
  /**
   * Removes a stored session for good (odd/tasks/delete-session.md). `undefined` keeps the
   * screen read-only, which is what the demo and the tests use.
   */
  readonly onDeleteSession?: ((session: WorkoutSession) => Promise<void>) | undefined;
}

interface MonthGroup {
  readonly title: string;
  readonly sessions: readonly WorkoutSession[];
}

function groupByMonth(sessions: readonly WorkoutSession[]): readonly MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const session of sessions) {
    const title = formatMonthTitle(session.scheduledDate);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.title === title) {
      groups[groups.length - 1] = { title, sessions: [...last.sessions, session] };
    } else {
      groups.push({ title, sessions: [session] });
    }
  }
  return groups;
}

function setsLabel(setsConfirmed: number): string {
  return `${setsConfirmed} ${setsConfirmed === 1 ? 'serie' : 'series'}`;
}

/**
 * `Últimos pesos por ejercicio` — the last load of each exercise with recorded sets,
 * newest first. The rows are the same derived values the exercise detail shows; the
 * card only makes the drill-down reachable from the history it belongs to.
 */
function LastWeightsCard({
  usages,
  onOpenExercise,
}: {
  readonly usages: readonly ExerciseUsage[];
  readonly onOpenExercise: (key: string) => void;
}): React.ReactElement | null {
  if (usages.length === 0) return null;

  return (
    <div className="progress__group">
      <SectionLabel>Últimos pesos por ejercicio</SectionLabel>
      <Card padding="list">
        {usages.map((usage) => (
          <DataRow
            key={usage.key}
            title={usage.name}
            subtitle={`Última vez · ${formatDayMonth(usage.lastAt)}`}
            {...(usage.topSetKg === null
              ? { status: { word: 'sin peso', tone: 'muted' as const } }
              : { value: formatWeight(usage.topSetKg), valueUnit: 'kg' })}
            onSelect={() => onOpenExercise(usage.key)}
            selectLabel={`Abrir el detalle de ${usage.name}`}
          />
        ))}
      </Card>
    </div>
  );
}

export function HistorialScreen({
  sessions,
  onBack,
  onOpenExercise,
  onStartTraining,
  onDeleteSession,
}: HistorialScreenProps): React.ReactElement {
  const rows = useMemo(() => historySessions(sessions), [sessions]);
  const usages = useMemo(() => exerciseUsages(sessions), [sessions]);
  // The read-out of each session is computed once, from the same `summarise` the
  // Resumen screen uses: the list row and the totals cannot disagree.
  const summaries = useMemo(
    () => new Map(rows.map((row) => [row.id, sessionSummary(row)] as const)),
    [rows],
  );
  const totals = useMemo(() => {
    let durationMs = 0;
    let withDuration = 0;
    for (const summary of summaries.values()) {
      if (summary.durationMs === null) continue;
      durationMs += summary.durationMs;
      withDuration += 1;
    }
    return { durationMs, withDuration };
  }, [summaries]);
  /**
   * Sessions that exist but were never really trained: `scheduled`, `inProgress`, or a
   * partial with zero sets. Historial hides them on purpose (they did not happen), but
   * they still take space in the store and the owner cannot remove them from anywhere
   * else, so they get their own honest section: visible, and deletable.
   */
  const ghosts = useMemo(
    () => sessions.filter((session) => !isHistorySession(session)),
    [sessions],
  );
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * The delete, in two taps (odd/tasks/home-hierarchy.md T4, S5). The flow lives here,
   * one per list, so opening the question on one row closes it on any other, and the
   * write below is the only thing that reaches the store.
   */
  const [flow, dispatch] = useReducer(reduceDeleteFlow, DELETE_FLOW_IDLE);

  const confirmDelete = useCallback(
    (session: WorkoutSession): void => {
      // A question is only ever open when the screen can delete, so this is a guard for
      // the type, not a second decision.
      if (onDeleteSession === undefined) return;
      const remove = onDeleteSession;
      // The second tap is the state change; the flow handed to the write is this row's,
      // and only this row's.
      dispatch({ type: 'confirm' });
      void (async () => {
        const next = await runDelete({
          flow: { step: 'confirming', sessionId: session.id },
          session,
          remove,
        });
        if (next.step === 'failed') {
          dispatch({ type: 'failed' });
          return;
        }
        if (next.step === 'idle') {
          setOpenId(null);
          dispatch({ type: 'deleted' });
        }
      })();
    },
    [onDeleteSession],
  );

  /** The bin and its question, or nothing when the screen is read-only. */
  const deleteControl = useCallback(
    (
      session: WorkoutSession,
      variant: 'row' | 'readout',
      row?: React.ReactNode,
    ): React.ReactElement | null => {
      // Read-only (the demo and the tests): the row is rendered exactly as it was, in the
      // same keyed wrapper, so the card keeps its separators.
      if (onDeleteSession === undefined) {
        return row === undefined ? null : (
          <div className="progress__session-item" key={session.id}>
            {row}
          </div>
        );
      }
      return (
        <SessionDelete
          key={session.id}
          session={session}
          flow={flow}
          variant={variant}
          onAsk={(sessionId) => dispatch({ type: 'ask', sessionId })}
          onConfirm={confirmDelete}
          onCancel={() => dispatch({ type: 'cancel' })}
        >
          {row}
        </SessionDelete>
      );
    },
    [flow, confirmDelete, onDeleteSession],
  );

  const open =
    openId === null
      ? undefined
      : ([...rows, ...ghosts].find((row) => row.id === openId) ?? undefined);

  if (open !== undefined) {
    return (
      <SessionReadOut
        session={open}
        all={rows}
        onBack={() => setOpenId(null)}
        backLabel="Historial"
        onOpenExercise={onOpenExercise}
        deleteControl={deleteControl(open, 'readout')}
      />
    );
  }

  if (rows.length === 0 && ghosts.length === 0) {
    return (
      <div className="progress">
        <DrilldownHeader title="Historial" backLabel="Progreso" onBack={onBack} />
        <EmptyState tone="primary" action={{ label: 'Empezar entrenamiento', onClick: onStartTraining }}>
          Todavía no hay sesiones. Cuando termines la primera, aparecerá aquí con su recomendación y
          sus series.
        </EmptyState>
        <Card padding="dense">
          <div className="ds-row">
            <span className="ds-section-label">Resumen semanal</span>
            <Chip>sin datos</Chip>
          </div>
          <div className="ds-hairline" />
          <p className="ds-caption">
            Sin sesiones no hay volumen ni adherencia que mostrar. No se dibuja una línea plana.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="progress">
      <DrilldownHeader title="Historial" backLabel="Progreso" onBack={onBack} />
      {ghosts.length === 0 ? null : (
        <div className="progress__group">
          <SectionLabel>Sin series registradas</SectionLabel>
          <Card padding="list">
            {ghosts.map((session) =>
              deleteControl(
                session,
                'row',
                <DataRow
                  icon="calendar"
                  title={`${formatWeekdayDay(session.scheduledDate)} · ${session.dayNameSnapshot}`}
                  subtitle="Empezada sin series · se puede borrar"
                  status={{
                    word:
                      session.status === 'completed' || session.status === 'partial' ||
                      session.status === 'abandoned'
                        ? 'sin series'
                        : session.status === 'inProgress'
                          ? 'en curso'
                          : 'programada',
                  }}
                  onSelect={() => setOpenId(session.id)}
                />,
              ),
            )}
          </Card>
        </div>
      )}
      {groupByMonth(rows).map((group) => (
        <div className="progress__group" key={group.title}>
          <SectionLabel>{group.title}</SectionLabel>
          <Card padding="list">
            {group.sessions.map((session) => {
              const summary = summaries.get(session.id);
              if (summary === undefined) return null;
              const day = formatWeekdayDay(session.scheduledDate);
              return deleteControl(
                session,
                'row',
                <DataRow
                  icon="barbell"
                  title={`${day} · ${session.dayNameSnapshot}`}
                  subtitle={`${
                    summary.durationMs === null ? 'sin duración' : formatDurationMinutes(summary.durationMs)
                  } · ${summary.setsConfirmed} de ${summary.setsPrescribed} series`}
                  value={formatVolume(summary.volumeKg)}
                  valueUnit="kg"
                  onSelect={() => setOpenId(session.id)}
                />,
              );
            })}
          </Card>
        </div>
      ))}
      {/* The artboard's session totals, from the stored rows only: a session without
          `startedAt`/`endedAt` adds nothing instead of a guessed duration. */}
      <Card padding="dense">
        <div className="ds-row">
          <span className="ds-meta">Sesiones registradas</span>
          <span className="ds-body">{String(rows.length)}</span>
        </div>
        <div className="ds-hairline" />
        <div className="ds-row">
          <span className="ds-meta">Duración acumulada</span>
          {totals.withDuration === 0 ? (
            <span className="ds-caption">sin duración registrada</span>
          ) : (
            <span className="ds-body">{formatHoursMinutes(totals.durationMs)}</span>
          )}
        </div>
        {totals.withDuration === 0 || totals.withDuration === rows.length ? null : (
          <p className="ds-caption">
            {`${String(rows.length - totals.withDuration)} ${
              rows.length - totals.withDuration === 1 ? 'sesión sin duración' : 'sesiones sin duración'
            } no suman.`}
          </p>
        )}
      </Card>
      <LastWeightsCard usages={usages} onOpenExercise={onOpenExercise} />
    </div>
  );
}

interface SessionReadOutProps {
  readonly session: WorkoutSession;
  readonly all: readonly WorkoutSession[];
  readonly onBack: () => void;
  /** The label of the back control: what it returns to. */
  readonly backLabel: string;
  readonly onOpenExercise: (key: string) => void;
  /** The bin and its question, or `null` when the screen must stay read-only. */
  readonly deleteControl?: React.ReactNode;
}

/**
 * One session, read out. The same five things as `resumen`: sets against prescribed,
 * duration, volume, the records it set and the per-exercise lines.
 */
function SessionReadOut({
  session,
  all,
  onBack,
  backLabel,
  onOpenExercise,
  deleteControl,
}: SessionReadOutProps): React.ReactElement {
  const summary = sessionSummary(session);
  const hits = recordsInSession(session, all);
  const day = formatWeekdayDay(session.scheduledDate);

  return (
    <div className="progress">
      <DrilldownHeader title={`Sesión del ${day}`} backLabel={backLabel} onBack={onBack} />

      {deleteControl}

      <Card>
        <div className="ds-row">
          <SectionLabel>{session.dayNameSnapshot}</SectionLabel>
          {session.status === 'completed' ? null : (
            <Chip tone="warning">{session.status === 'partial' ? 'parcial' : 'abandonada'}</Chip>
          )}
        </div>
        <DataStrip
          label="Totales de la sesión"
          items={[
            { label: 'Series', value: `${summary.setsConfirmed}/${summary.setsPrescribed}` },
            {
              label: 'Duración',
              value: summary.durationMs === null ? '—' : String(durationMinutes(summary.durationMs)),
              ...(summary.durationMs === null ? {} : { unit: 'min' }),
            },
            { label: 'Volumen', value: formatVolume(summary.volumeKg), unit: 'kg' },
          ]}
        />
      </Card>

      {hits.length === 0 ? (
        <p className="ds-caption">Sin récords en esta sesión. No hace falta que cada sesión los tenga.</p>
      ) : (
        <Card>
          {hits.map((hit) => (
            <div className="progress__detail" key={`${hit.exerciseName}-${String(hit.targetReps)}`}>
              <div className="ds-row">
                <Chip tone="success" dot>
                  RÉCORD
                </Chip>
                <span className="ds-caption">{day}</span>
              </div>
              <p className="ds-body">
                {`${hit.exerciseName} · ${formatWeight(hit.weightKg)} kg × ${String(hit.targetReps)}`}
              </p>
              <p className="ds-caption">
                {hit.previousKg === null
                  ? `Primera marca con objetivo de ${String(hit.targetReps)} repeticiones.`
                  : `Mejor marca con objetivo de ${String(hit.targetReps)} repeticiones. Antes: ${formatWeight(
                      hit.previousKg,
                    )} kg.`}
              </p>
            </div>
          ))}
        </Card>
      )}

      <Card padding="list">
        {summary.exercises.map((exercise) => {
          // The key lives on the stored exercise session, not on the core summary: the
          // summary names the exercise, the row needs the identity the detail route uses.
          const stored = session.exercises.find((entry) => entry.id === exercise.exerciseSessionId);
          const key = stored === undefined ? null : exerciseKey(stored);

          return (
            <DataRow
              key={exercise.exerciseSessionId}
              title={exercise.name}
              subtitle={
                exercise.setsConfirmed === 0
                  ? 'Sin series registradas'
                  : `${setsLabel(exercise.setsConfirmed)}${
                      exercise.bestWeightKg === null
                        ? ''
                        : ` · ${formatWeight(exercise.bestWeightKg)} kg`
                    }`
              }
              value={formatVolume(exercise.volumeKg)}
              valueUnit="kg"
              {...(key === null
                ? {}
                : {
                    onSelect: () => onOpenExercise(key),
                    selectLabel: `Abrir el detalle de ${exercise.name}`,
                  })}
            />
          );
        })}
      </Card>
    </div>
  );
}

/**
 * The bin of one session and the question it asks (odd/tasks/home-hierarchy.md T4, S5;
 * log L3).
 *
 * One tap never deletes: the bin opens «¿Eliminar esta sesión?» and the write waits for
 * `Sí, eliminar`. The flow is `deleteFlow.ts` — a reducer with its own tests, because
 * this project has no DOM to mount a screen in — and this component only renders its
 * result and moves the focus: to the question when it opens, and back to the bin when the
 * owner cancels or presses Escape.
 *
 * `variant` decides where the bin sits, not what it does: `row` places it beside a list
 * row (a sibling button, never a button nested in the row's button), `readout` places it
 * alone at the top right of an open session.
 */
interface SessionDeleteProps {
  readonly session: WorkoutSession;
  readonly flow: DeleteFlow;
  readonly variant: 'row' | 'readout';
  readonly onAsk: (sessionId: string) => void;
  readonly onConfirm: (session: WorkoutSession) => void;
  readonly onCancel: () => void;
  /** The list row, when the bin belongs to one. */
  readonly children?: React.ReactNode;
}

function SessionDelete({
  session,
  flow,
  variant,
  onAsk,
  onConfirm,
  onCancel,
  children,
}: SessionDeleteProps): React.ReactElement {
  const bin = useRef<HTMLButtonElement | null>(null);
  const question = useRef<HTMLDivElement | null>(null);
  const asking = isAsking(flow, session.id);
  const failed = isFailed(flow, session.id);
  const open = asking || failed;
  const busy = flow.step === 'deleting' && flow.sessionId === session.id;

  // The question takes the focus when it opens, so it is read out and Tab reaches its two
  // buttons. It borrows the focus with `tabIndex` and gives it back to the bin on cancel.
  useEffect(() => {
    if (open) question.current?.focus();
  }, [open]);

  const cancel = (): void => {
    onCancel();
    bin.current?.focus();
  };

  return (
    <div className={variant === 'row' ? 'progress__session-item' : 'progress__delete'}>
      <div className={variant === 'row' ? 'progress__session' : 'progress__delete-row'}>
        {children}
        <button
          ref={bin}
          type="button"
          className="ds-action progress__bin"
          aria-label={`Eliminar la sesión del ${formatLongDayMonth(session.scheduledDate)}`}
          onClick={() => onAsk(session.id)}
          disabled={busy}
        >
          <TrashGlyph />
        </button>
      </div>

      {open ? (
        <div
          ref={question}
          className="progress__question"
          role="group"
          aria-label="Confirmar el borrado"
          tabIndex={-1}
          onKeyDown={(press) => {
            if (press.key === 'Escape' && !busy) {
              press.stopPropagation();
              cancel();
            }
          }}
        >
          <p className="ds-body">
            ¿Eliminar esta sesión? Se borrará del historial y no se puede deshacer.
          </p>
          {failed ? (
            <ErrorBanner message="No se pudo borrar la sesión. Sigue guardada; inténtalo otra vez." />
          ) : null}
          <div className="progress__question-actions">
            <TextButton tone="danger" disabled={busy} onClick={() => onConfirm(session)}>
              {busy ? 'Eliminando…' : 'Sí, eliminar'}
            </TextButton>
            <TextButton disabled={busy} onClick={cancel}>
              Cancelar
            </TextButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
