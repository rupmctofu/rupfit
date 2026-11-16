/**
 * T9 (S12) — the activity section, at its new home.
 *
 * The owner's activities and their bin moved from Inicio to Progreso: same rows, same
 * copy, same mark-then-delete order (`features/home/deletion.ts`). The project has no DOM
 * environment, so what is pinned here is the markup the section draws in each state of the
 * question — the idle row with its bin, the row mid-question, and the result line.
 *
 * The order itself is pinned where it lives: `deletion.test.ts` proves that the bin only
 * asks and that only the yes reaches the port.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivitySection } from './ProgressScreen';
import { ACTIVITY_DELETE_COPY, NO_DELETION, type ActivityDeletionState } from '../home/deletion';
import type { ActivityView } from '../home/selectors';

/** Two recorded rows, as the home view shapes them (`activityViewOf`). */
const VIEW: ActivityView = {
  recorded: [
    {
      id: 'football-1',
      label: 'Fútbol registrado',
      detail: '8 nov · 50 min',
      removeLabel: 'Eliminar fútbol del 8 de noviembre',
    },
  ],
  imported: 0,
  empty: false,
};

const EMPTY: ActivityView = { recorded: [], imported: 0, empty: true };

/** The bin's seam, idle and mid-question: the app always hands the row one. */
const IDLE: ActivityDeletionState = {
  ...NO_DELETION,
  ask: () => undefined,
  cancel: () => undefined,
  confirm: () => undefined,
};

describe('the activities of Progreso (T9, S12)', () => {
  it('draws one row per recorded activity, with the bin that names what it deletes', () => {
    const markup = renderToStaticMarkup(
      <ActivitySection view={VIEW} deletion={IDLE} onRecordFootball={() => undefined} />,
    );

    expect(markup).toContain('Actividad');
    expect(markup).toContain('Fútbol registrado');
    expect(markup).toContain('8 nov · 50 min');
    // The bin shows a glyph and no word, so its accessible name has to do the talking.
    expect(markup).toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
    // The manual capture moved with the section: football is still recorded from here.
    expect(markup).toContain('Fútbol');
    expect(markup).toContain('50');
    expect(markup).toContain('Registrar');
    // Nothing was imported, so the wording of the other bucket does not appear.
    expect(markup).not.toContain('importada');
  });

  it('asks in place, and only after the yes does anything get removed', () => {
    const marked = renderToStaticMarkup(
      <ActivitySection view={VIEW} deletion={{ ...IDLE, pendingId: 'football-1' }} />,
    );

    // The question replaces the bin in the same row: nothing covers the screen.
    expect(marked).toContain(ACTIVITY_DELETE_COPY.ask);
    expect(marked).toContain(ACTIVITY_DELETE_COPY.confirm);
    expect(marked).toContain(ACTIVITY_DELETE_COPY.cancel);
    expect(marked).not.toContain('aria-label="Eliminar fútbol del 8 de noviembre"');

    // A question for another row leaves this row's bin alone.
    const elsewhere = renderToStaticMarkup(
      <ActivitySection view={VIEW} deletion={{ ...IDLE, pendingId: 'another' }} />,
    );
    expect(elsewhere).toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
  });

  it('says the result of the removal in one line, and says nothing with no rows', () => {
    const settled = renderToStaticMarkup(
      <ActivitySection view={VIEW} deletion={{ ...IDLE, notice: ACTIVITY_DELETE_COPY.deleted }} />,
    );
    expect(settled).toContain(ACTIVITY_DELETE_COPY.deleted);

    const empty = renderToStaticMarkup(<ActivitySection view={EMPTY} deletion={IDLE} />);
    expect(empty).toContain('Todavía no hay actividad registrada. Esto no impide entrenar.');
    // No rows, no bin: the empty state is a sentence, not a list of nothing.
    expect(empty).not.toContain('aria-label="Eliminar');
  });
});
