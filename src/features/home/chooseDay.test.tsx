/**
 * Elegir el entreno de hoy — the list the card opens (`odd/tasks/choose-today-workout.md`).
 *
 * Two halves, on purpose: the options are derived without React (`chooseOptionsOf`), so the
 * list cannot name a day the plan does not hold, and the sheet is drawn from those options,
 * so it cannot say a second vocabulary for the same day (S6).
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlanDay } from '../../storage';
import { weekAgendaOf } from '../week/agenda';
import { CHOOSE_SHEET_TITLE, ChooseDaySheet, chooseOptionsOf } from './agenda';

/* ------------------------------------------------------------------ fixtures */

/** Wednesday 8 November 2023, 18:00 local: the prep day of a league week. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();

function planDay(id: string, name: string, order: number, exercises: number): PlanDay {
  return {
    id,
    name,
    order,
    items: Array.from({ length: exercises }, (_, index) => ({
      id: `${id}-item-${String(index)}`,
      planDayId: id,
      order: index,
      exerciseId: `lib-${String(index)}`,
      exerciseNameSnapshot: 'Sentadilla',
      prescription: {
        sets: 3,
        repRange: { lowerBound: 8, upperBound: 10 },
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: 180,
      },
    })),
  };
}

const PLAN: readonly PlanDay[] = [
  planDay('seed-day-leg', 'SENTADILLA / PIERNA', 0, 6),
  planDay('seed-day-torso-a', 'PRESS BANCA / EMPUJE', 1, 3),
  planDay('seed-day-torso-b', 'PESO MUERTO / TRACCIÓN', 2, 2),
  planDay('seed-day-fisico', 'MOVILIDAD Y CORE', 3, 4),
];

function optionsOf(plan: readonly PlanDay[] = PLAN): ReturnType<typeof chooseOptionsOf> {
  return chooseOptionsOf(
    weekAgendaOf({ now: NOW, matchKind: 'league', plan, sessions: [] }),
  );
}

/* -------------------------------------------------------------------- the list */

describe('chooseOptionsOf', () => {
  it('lists the plan’s days in order, with the words the app already writes (S6)', () => {
    const options = optionsOf();

    expect(options.map((option) => option.planDayId)).toEqual([
      'seed-day-leg',
      'seed-day-torso-a',
      'seed-day-torso-b',
      'seed-day-fisico',
    ]);
    // The same words the card and the row use: the formatted name, the muscle group the
    // name compacts, and the day's own counts.
    expect(options[0]?.title).toBe('Sentadilla / Pierna');
    expect(options[0]?.chips).toEqual(['Pierna']);
    expect(options[0]?.meta).toBe('6 ejercicios · 18 series');
    expect(options[3]?.title).toBe('Movilidad y core');
    expect(options[3]?.chips).toEqual([]);
  });

  it('leaves out a day with no exercises: there is nothing to start (S1)', () => {
    const options = optionsOf([planDay('seed-day-leg', 'PIERNA', 0, 0), ...PLAN.slice(1)]);

    expect(options.map((option) => option.planDayId)).not.toContain('seed-day-leg');
    expect(options).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------- the sheet */

describe('ChooseDaySheet', () => {
  it('draws a dialog with one button per day, each naming its plan day (S1)', () => {
    const markup = renderToStaticMarkup(
      <ChooseDaySheet days={optionsOf()} onChoose={() => undefined} onClose={() => undefined} />,
    );

    expect(markup).toContain(`aria-label="${CHOOSE_SHEET_TITLE}"`);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('data-plan-day-id="seed-day-leg"');
    expect(markup).toContain('data-plan-day-id="seed-day-torso-a"');
    expect(markup).toContain('Press banca / Empuje');
    // The counts line is the row's own, so the sheet and the week count the same way.
    expect(markup).toContain('3 ejercicios · 9 series');
    expect(markup).toContain('Cerrar');
  });

  it('draws nothing to choose from when every day is empty', () => {
    const markup = renderToStaticMarkup(
      <ChooseDaySheet
        days={optionsOf([planDay('seed-day-leg', 'PIERNA', 0, 0)])}
        onChoose={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).not.toContain('data-plan-day-id');
    expect(markup).toContain('No hay ningún entreno con ejercicios todavía.');
  });
});
