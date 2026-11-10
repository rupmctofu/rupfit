/**
 * Inicio renders — the states the screen must keep working in, checked as markup.
 *
 * The project has no DOM tests and no DOM environment: `renderToStaticMarkup` draws the
 * same tree the browser gets, so what is pinned here is the screen's *output* — the
 * words it still says, the words T3 took away (S2), and the glyphs that replaced them
 * (S3). Interactions are not faked; the football write is exercised through the fake
 * port, which is where it actually happens.
 *
 * Four states, because each one is a different branch of `HomeBody`: an empty store, a
 * session in progress, a recorded activity, and a store that came back empty (the one
 * banner Inicio still announces).
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlanDay, UserProfile, WorkoutSession } from '../../storage';
import { createFakeStorage } from '../session/fake-port';
import { HomeBody } from './HomeScreen';
import { homeViewOf, type HomeInput } from './selectors';
import { recordFootball } from './football';
import { NO_DELETION, type ActivityDeletionState } from './deletion';

/** Wednesday 8 November 2023, 18:00 local. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();
const MONDAY = new Date(2023, 10, 6, 18, 0, 0).getTime();

const PROFILE: UserProfile = {
  id: 'profile-1',
  displayName: 'Rup',
  massUnit: 'kilograms',
  weightGoal: null,
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell'],
  autoStartRestTimer: true,
};

/** Two days that prescribe work: one is the day to start, one is the rotation's next. */
const PLAN: readonly PlanDay[] = [
  {
    id: 'day-lower',
    name: 'SENTADILLA / PIERNA',
    order: 0,
    items: [
      {
        id: 's1',
        planDayId: 'day-lower',
        order: 0,
        exerciseId: 'lib-1',
        exerciseNameSnapshot: 'Sentadilla',
        prescription: {
          sets: 3,
          repRange: { lowerBound: 8, upperBound: 10 },
          targetRIR: { lowerBound: 2, upperBound: 3 },
          restSeconds: 180,
        },
      },
    ],
  },
  {
    id: 'day-pull',
    name: 'PESO MUERTO / TRACCIÓN',
    order: 1,
    items: [
      {
        id: 's2',
        planDayId: 'day-pull',
        order: 0,
        exerciseId: 'lib-2',
        exerciseNameSnapshot: 'Peso muerto',
        prescription: {
          sets: 3,
          repRange: { lowerBound: 6, upperBound: 8 },
          targetRIR: { lowerBound: 2, upperBound: 3 },
          restSeconds: 180,
        },
      },
    ],
  },
];

function session(
  overrides: Partial<WorkoutSession> & Pick<WorkoutSession, 'id' | 'status'>,
): WorkoutSession {
  return {
    id: overrides.id,
    planDayId: overrides.planDayId ?? 'day-lower',
    dayNameSnapshot: overrides.dayNameSnapshot ?? 'SENTADILLA / PIERNA',
    scheduledDate: overrides.scheduledDate ?? NOW,
    startedAt: overrides.startedAt ?? null,
    endedAt: overrides.endedAt ?? null,
    phase: overrides.phase ?? { kind: 'readaptation', week: 2 },
    status: overrides.status,
    exercises: overrides.exercises ?? [],
  };
}

function input(overrides: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW,
    profile: PROFILE,
    phaseState: { block: 2, passedBlocks: 1 },
    plan: PLAN,
    recent: [],
    inProgress: undefined,
    measurements: [],
    activities: [],
    lostData: false,
    lastExportAt: null,
    ...overrides,
  };
}

/** The bin's seam, idle: the app always hands the screen one, so the test does too. */
const DELETION: ActivityDeletionState = {
  ...NO_DELETION,
  ask: () => undefined,
  cancel: () => undefined,
  confirm: () => undefined,
};

/** The screen's markup for a fixture, with the actions a phone would have. */
function render(overrides: Partial<HomeInput> = {}): string {
  return renderToStaticMarkup(
    <HomeBody
      view={homeViewOf(input(overrides))}
      onStart={() => undefined}
      onRecordFootball={() => undefined}
      deletion={DELETION}
    />,
  );
}

describe('Inicio renders', () => {
  it('draws an empty store with its honest empty states, and no zero dressed as data', () => {
    const markup = render({ recent: [], plan: [], profile: undefined });

    expect(markup).toContain('Todavía no hay rutina ni sesiones programadas');
    expect(markup).toContain('Todavía no hay sesiones. La primera aparecerá aquí cuando la termines.');
    expect(markup).toContain('Todavía no hay actividad registrada. Esto no impide entrenar.');
    // The football capture is offered even when nothing has ever been recorded.
    expect(markup).toContain('Fútbol');
    expect(markup).toContain('Registrar');
  });

  it('draws the session in progress with the action that returns to its sets', () => {
    const open = session({ id: 'open', status: 'inProgress', startedAt: MONDAY });
    const markup = render({ recent: [open], inProgress: open });

    expect(markup).toContain('Continuar entrenamiento');
    // The card title is the day name, formatted for reading (`formatDayName`).
    expect(markup).toContain('Sentadilla / Pierna');
    expect(markup).not.toContain('Vista previa');
  });

  it('draws a recorded activity as a row, with the bin that names what it deletes', () => {
    const markup = render({
      recent: [session({ id: 'closed', status: 'completed', startedAt: MONDAY, endedAt: NOW })],
      activities: [
        {
          id: 'football-1',
          date: NOW,
          kind: 'other',
          durationSeconds: 50 * 60,
          activeEnergyKcal: null,
          provenance: 'manual',
          externalSampleId: null,
        },
      ],
    });

    expect(markup).toContain('Fútbol registrado');
    expect(markup).toContain('8 nov · 50 min');
    // The bin shows a glyph and no word, so its accessible name has to do the talking.
    expect(markup).toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
  });

  it('keeps the banner that reports a real loss, and only that one', () => {
    const markup = render({
      recent: [session({ id: 'closed', status: 'completed', startedAt: MONDAY, endedAt: NOW })],
      lostData: true,
      lastExportAt: MONDAY,
    });

    expect(markup).toContain('Los datos guardados ya no están. Importa tu copia si la tienes.');
    expect(markup).toContain('La última copia que se exportó es del 6 nov.');
    expect(markup).toContain('Importar copia');
  });
});

describe('Inicio after the purge (S2, S3)', () => {
  it('no longer explains the platform: the install advisory left the screen', () => {
    const markup = render({
      recent: [session({ id: 'closed', status: 'completed', startedAt: MONDAY, endedAt: NOW })],
    });

    expect(markup).not.toContain('Guarda Rupfit en la pantalla de inicio');
    expect(markup).not.toContain('Añadir a pantalla de inicio');
  });

  it('drops the football prose and keeps the numbers in one compact row', () => {
    const markup = render();

    expect(markup).not.toContain('dos partes de 25');
    expect(markup).not.toContain('no cuenta como sesión ni cambia el orden de tus días de fuerza');
    // Glyph, word, duration as a figure, action: the row is all that is left.
    expect(markup).toContain('home__football');
    expect(markup).toContain('Fútbol');
    expect(markup).toContain('50');
    expect(markup).toContain('min');
    expect(markup).toContain('Registrar');
  });

  it('says a day is a preview in one chip instead of a sentence', () => {
    const markup = render();

    expect(markup).toContain('Vista previa');
    expect(markup).not.toContain('La sesión se crea al empezar.');
  });
});

describe('the football row writes through the port', () => {
  it('reaches the screen as a recorded activity, without touching sessions', async () => {
    const storage = createFakeStorage();
    const outcome = await recordFootball({
      storage,
      clock: { now: () => NOW },
      newId: () => 'football-1',
    });
    const activities = await storage.activities.all();

    expect(outcome).toBe('saved');
    expect(storage.calls.filter((call) => call.startsWith('sessions.'))).toEqual([]);

    const markup = renderToStaticMarkup(
      <HomeBody
        view={homeViewOf(input({ activities }))}
        onStart={() => undefined}
        onRecordFootball={() => undefined}
        deletion={DELETION}
      />,
    );

    // `Fútbol registrado` is what the row says a manual match is: the capture still
    // ends up somewhere the owner can see and delete (S5).
    expect(markup).toContain('Fútbol registrado');
    expect(markup).toContain('8 nov · 50 min');
    expect(markup).toContain('aria-label="Eliminar fútbol del 8 de noviembre"');
  });
});
