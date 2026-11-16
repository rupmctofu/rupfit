/*
 * Resumen — what the session actually was (design-system §8).
 *
 * The composition, in reading order (T10): the eyebrow and the display title, the totals of
 * the session as the protagonist (volume as a figure, the prescription against what happened,
 * the duration), the records of the day with a treatment of their own, the per-exercise
 * read-out with its sets on demand, and one `Hecho` pinned at the bottom of the sheet so the
 * read-out can grow without moving it.
 *
 * The screen is presentational: `summaryViewOf` derives every number from the stored
 * aggregate, and `SummaryEntry` owns the reads and the one write (`sessions.finish`,
 * only for a session that is still open). No `Date.now()`, no port here — and T10 added no
 * figure that `summaryViewOf` does not already return (S6): the volume, the series against
 * the prescription, the duration, the records and the `Antes: …` comparison of each record
 * are all fields of `SummaryView`, and the one count beside `Ejercicios` is the length of
 * the list under it.
 */

import { Fragment, useState } from 'react';
import {
  Card,
  Chip,
  DataRow,
  DataStrip,
  EmptyState,
  ErrorBanner,
  MetricTile,
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

/** `1 récord` / `3 récords` — the records of the day, counted, never projected. */
function recordCountLabel(count: number): string {
  return count === 1 ? '1 récord' : `${String(count)} récords`;
}

/** `1 ejercicio` / `4 ejercicios` — the length of the list under the label. */
function exerciseCountLabel(count: number): string {
  return count === 1 ? '1 ejercicio' : `${String(count)} ejercicios`;
}

function ExerciseRow({ row }: { readonly row: SummaryExerciseView }): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Fragment>
      <DataRow
        className="summary__row"
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
                <span className="summary__set-figure">{set.detail}</span>
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
  const dayName = formatDayName(view.dayName);

  return (
    <div className="summary">
      {/* The demo strip lives inside the sheet, not above it, and brings its own
          gutter so the pinned `Hecho` can span the full width. */}
      {topSlot === undefined ? null : <div className="summary__top">{topSlot}</div>}

      <div className="summary__scroll">
        <header className="summary__head">
          <p className="ds-section-label">{view.eyebrow}</p>
          <h1 className="summary__title">{view.title}</h1>
        </header>

        {error === undefined || error === null ? null : <ErrorBanner message={error} onRetry={onRetry} />}

        {/* The protagonist (T10): what the session moved, on the one raised ground of the
            sheet, with the day it happened. The volume leaves the strip below so the figure
            the screen exists to answer is read first and only once. */}
        <Card className="summary__hero" label="Totales de la sesión">
          <div className="summary__hero-head">
            <SectionLabel>{dayName}</SectionLabel>
            {view.records.length === 0 ? null : (
              <Chip tone="accent" dot>
                {recordCountLabel(view.records.length)}
              </Chip>
            )}
          </div>
          <MetricTile label="Volumen" value={view.totals.volume} unit="kg" size="metric" />
          <div className="ds-hairline" />
          <DataStrip
            label="Series y duración"
            items={[
              { label: 'Series', value: view.totals.series },
              { label: 'Duración', value: view.totals.duration ?? '—' },
            ]}
          />
          {view.note === null ? null : (
            <>
              <div className="ds-hairline" />
              <p className="ds-caption">{view.note}</p>
            </>
          )}
        </Card>

        {/* The records of the day, with a treatment of their own: the mark at the title role,
            the day it happened beside the word, and the only comparison the app computes
            (`Antes: 90 kg`, from `previousBest`) as the caption. No percentage, no delta
            against another session, no invented "mejora". */}
        {view.records.length === 0 ? null : (
          <div className="summary__group">
            <SectionLabel>Récords de la sesión</SectionLabel>
            <Card padding="list">
              {view.records.map((record, index) => (
                <Fragment key={record.line}>
                  {index === 0 ? null : <div className="ds-hairline" />}
                  <div
                    className="summary__record"
                    role="group"
                    aria-label={`Récord · ${record.exerciseName}`}
                  >
                    <div className="summary__record-head">
                      <Chip tone="accent" dot>
                        RÉCORD
                      </Chip>
                      <span className="ds-meta">{record.when}</span>
                    </div>
                    <p className="summary__record-line">{record.line}</p>
                    <p className="ds-caption">{record.detail}</p>
                  </div>
                </Fragment>
              ))}
            </Card>
          </div>
        )}

        {/* A session without a mark is normal, so the sentence is reassurance and not a
            missing feature: no box, no action, nothing to fix. */}
        {view.noRecords === null ? null : (
          <EmptyState bare className="summary__no-records">
            {view.noRecords}
          </EmptyState>
        )}

        <div className="summary__group">
          <div className="summary__group-head">
            <SectionLabel>Ejercicios</SectionLabel>
            <span className="ds-caption">{exerciseCountLabel(view.exercises.length)}</span>
          </div>
          <Card padding="list">
            {view.exercises.map((row) => (
              <ExerciseRow key={row.id} row={row} />
            ))}
          </Card>
        </div>
      </div>

      {/* The one action of the sheet stays where the thumb is, whatever the length of
          the read-out above it. */}
      <div className="summary__bar">
        <PrimaryAction onClick={onDone} disabled={busy}>
          Hecho
        </PrimaryAction>
      </div>
    </div>
  );
}
