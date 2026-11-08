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
 * States: the list (`historial`), the empty list (`historial-empty`) and one open
 * session. A row opens only from stored data: no number on this screen is invented.
 */

import { useMemo, useState } from 'react';
import {
  Card,
  Chip,
  DataRow,
  DataStrip,
  EmptyState,
  SectionLabel,
} from '../../design-system';
import type { WorkoutSession } from '../../storage';
import { recordsInSession } from './aggregates';
import {
  durationMinutes,
  formatDurationMinutes,
  formatMonthTitle,
  formatVolume,
  formatWeekdayDay,
  formatWeight,
} from './format';
import { DrilldownHeader } from './parts';
import { historySessions, sessionSummary } from './summary';
import './progress.css';

export interface HistorialScreenProps {
  /** The sessions the tab read, newest first. */
  readonly sessions: readonly WorkoutSession[];
  readonly onBack: () => void;
  /** `#/entrenar`: the one action that fills an empty history. */
  readonly onStartTraining: () => void;
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

export function HistorialScreen({
  sessions,
  onBack,
  onStartTraining,
}: HistorialScreenProps): React.ReactElement {
  const rows = useMemo(() => historySessions(sessions), [sessions]);
  const [openId, setOpenId] = useState<string | null>(null);

  const open = openId === null ? undefined : rows.find((row) => row.id === openId);

  if (open !== undefined) {
    return (
      <SessionReadOut session={open} all={rows} onBack={() => setOpenId(null)} backLabel="Historial" />
    );
  }

  if (rows.length === 0) {
    return (
      <div className="progress">
        <DrilldownHeader title="Historial" backLabel="Progreso" onBack={onBack} />
        <EmptyState action={{ label: 'Empezar entrenamiento', onClick: onStartTraining }}>
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
      {groupByMonth(rows).map((group) => (
        <div className="progress__group" key={group.title}>
          <SectionLabel>{group.title}</SectionLabel>
          <Card padding="list">
            {group.sessions.map((session) => {
              const summary = sessionSummary(session);
              const day = formatWeekdayDay(session.scheduledDate);
              return (
                <DataRow
                  key={session.id}
                  icon="barbell"
                  title={`${day} · ${session.dayNameSnapshot}`}
                  subtitle={`${
                    summary.durationMs === null ? 'sin duración' : formatDurationMinutes(summary.durationMs)
                  } · ${summary.setsConfirmed} de ${summary.setsPrescribed} series`}
                  value={formatVolume(summary.volumeKg)}
                  valueUnit="kg"
                  onSelect={() => setOpenId(session.id)}
                />
              );
            })}
          </Card>
        </div>
      ))}
    </div>
  );
}

interface SessionReadOutProps {
  readonly session: WorkoutSession;
  readonly all: readonly WorkoutSession[];
  readonly onBack: () => void;
  /** The label of the back control: what it returns to. */
  readonly backLabel: string;
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
}: SessionReadOutProps): React.ReactElement {
  const summary = sessionSummary(session);
  const hits = recordsInSession(session, all);
  const day = formatWeekdayDay(session.scheduledDate);

  return (
    <div className="progress">
      <DrilldownHeader title={`Sesión del ${day}`} backLabel={backLabel} onBack={onBack} />

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
        {summary.exercises.map((exercise) => (
          <DataRow
            key={exercise.exerciseSessionId}
            title={exercise.name}
            subtitle={
              exercise.setsConfirmed === 0
                ? 'Sin series registradas'
                : `${setsLabel(exercise.setsConfirmed)}${
                    exercise.bestWeightKg === null ? '' : ` · ${formatWeight(exercise.bestWeightKg)} kg`
                  }`
            }
            value={formatVolume(exercise.volumeKg)}
            valueUnit="kg"
          />
        ))}
      </Card>
    </div>
  );
}
