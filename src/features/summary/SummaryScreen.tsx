/*
 * Resumen — what the session actually was (design-system §8).
 *
 * The eyebrow and the title, the three totals of the artboard (series against the
 * prescription, duration, volume), the records of the day or the sentence that says
 * there were none, the per-exercise read-out with its sets on demand, and one `Hecho`.
 *
 * The screen is presentational: `summaryViewOf` derives every number from the stored
 * aggregate, and `SummaryEntry` owns the reads and the one write (`sessions.finish`,
 * only for a session that is still open). No `Date.now()`, no port here.
 */

import { Fragment, useState } from 'react';
import {
  Card,
  Chip,
  DataRow,
  DataStrip,
  EmptyState,
  ErrorBanner,
  PrimaryAction,
  SectionLabel,
} from '../../design-system';
import { formatDayName } from '../home/format';
import type { SummaryExerciseView, SummaryView } from './selectors';
import './summary.css';

export interface SummaryScreenProps {
  readonly view: SummaryView;
  /** `Hecho`: closes the sheet, and the open session with it. */
  readonly onDone: () => void;
  /** A write that failed, in Spanish, with `Reintentar` as the way out. */
  readonly error?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
  /** `Hecho` is closing the session: a second tap must not open a second write. */
  readonly busy?: boolean | undefined;
  /** The demo strip, when the screen is reviewed with fixtures. */
  readonly topSlot?: React.ReactNode;
}

function ExerciseRow({ row }: { readonly row: SummaryExerciseView }): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Fragment>
      <DataRow
        icon={row.icon}
        title={row.name}
        subtitle={row.subtitle}
        value={row.volume}
        valueUnit="kg"
        onSelect={() => setOpen((value) => !value)}
        selectLabel={`${row.name}. ${row.subtitle}. ${row.volume} kg. ${
          open ? 'Ocultar las series' : `Ver ${String(row.sets.length)} series`
        }`}
      />
      {open ? (
        <ul className="summary__sets" aria-label={`Series de ${row.name}`}>
          {row.sets.length === 0 ? (
            <li className="ds-caption">No se registró ninguna serie.</li>
          ) : (
            row.sets.map((set) => (
              <li key={set.label} className="summary__set">
                <span className="ds-caption">{set.label}</span>
                <span className="ds-body">{set.detail}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </Fragment>
  );
}

export function SummaryScreen({
  view,
  onDone,
  error,
  onRetry,
  busy = false,
  topSlot,
}: SummaryScreenProps): React.ReactElement {
  return (
    <div className="summary">
      {topSlot}

      <header className="summary__head">
        <p className="ds-section-label">{view.eyebrow}</p>
        <h1 className="ds-screen-title">{view.title}</h1>
      </header>

      {error === undefined || error === null ? null : <ErrorBanner message={error} onRetry={onRetry} />}

      <Card label={formatDayName(view.dayName)}>
        <SectionLabel>{formatDayName(view.dayName)}</SectionLabel>
        <DataStrip
          label="Totales de la sesión"
          items={[
            { label: 'Series', value: view.totals.series },
            { label: 'Duración', value: view.totals.duration ?? '—' },
            { label: 'Volumen', value: view.totals.volume, unit: 'kg' },
          ]}
        />
        {view.note === null ? null : (
          <>
            <hr className="ds-hairline" />
            <p className="ds-caption">{view.note}</p>
          </>
        )}
      </Card>

      {view.records.map((record) => (
        <Card key={record.line} label={`Récord · ${record.exerciseName}`}>
          <div className="ds-row">
            <Chip tone="accent" dot>
              RÉCORD
            </Chip>
            <span className="ds-meta">{record.when}</span>
          </div>
          <p className="ds-card-title">{record.line}</p>
          <p className="ds-caption">{record.detail}</p>
        </Card>
      ))}

      {view.noRecords === null ? null : <EmptyState>{view.noRecords}</EmptyState>}

      <Card padding="list" label="Ejercicios de la sesión">
        {view.exercises.map((row) => (
          <ExerciseRow key={row.id} row={row} />
        ))}
      </Card>

      <PrimaryAction onClick={onDone} disabled={busy}>
        Hecho
      </PrimaryAction>
    </div>
  );
}
