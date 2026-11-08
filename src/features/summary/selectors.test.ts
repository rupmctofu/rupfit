/**
 * Resumen's decisions and its one route, without React.
 *
 * The summary is the only screen that is reached by an id, so the hash parser sits next
 * to the selectors: `#/resumen/<id>` is the session the flow finished, `#/resumen/demo`
 * is the fixture the design was drawn with, and anything else is not this screen.
 */

import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSession, SetRecord, WorkoutSession } from '../../storage';
import { EFFORT } from '../../core/domain';
import { summaryOutcome, summaryViewOf, type SummaryInput } from './selectors';
import { summaryTargetOf } from './route';

/* ------------------------------------------------------------------ fixtures */

const NOW = new Date(2023, 10, 8, 19, 0, 0).getTime();
const STARTED = new Date(2023, 10, 8, 18, 0, 0).getTime();
const ENDED = new Date(2023, 10, 8, 18, 52, 0).getTime();
const LAST_WEEK = new Date(2023, 10, 1, 18, 0, 0).getTime();

function set(index: number, weightKg: number, actualReps: number, confirmedAt = ENDED): SetRecord {
  return {
    id: `set-${String(index)}`,
    index,
    weightKg,
    targetReps: 10,
    actualReps,
    effort: EFFORT.correct,
    discomfort: null,
    confirmedAt,
  };
}

function exercise(
  id: string,
  name: string,
  sets: readonly SetRecord[],
  prescribed: number,
  libraryId: string | null = `lib-${id}`,
): ExerciseSession {
  return {
    id,
    order: 0,
    exerciseId: libraryId,
    exerciseNameSnapshot: name,
    prescription: {
      sets: prescribed,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
      restSeconds: 180,
    },
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    sets,
    status: sets.length === 0 ? 'skipped' : 'done',
    completedAt: ENDED,
  };
}

function session(
  id: string,
  status: WorkoutSession['status'],
  exercises: readonly ExerciseSession[],
  scheduledDate = NOW,
): WorkoutSession {
  return {
    id,
    planDayId: 'day-wednesday',
    dayNameSnapshot: 'PESO MUERTO / TRACCIÓN',
    scheduledDate,
    startedAt: STARTED,
    endedAt: ENDED,
    phase: { kind: 'readaptation', week: 2 },
    status,
    exercises,
  };
}

const DEADLIFT = exercise('es-1', 'Peso muerto', [set(1, 92.5, 10), set(2, 92.5, 10), set(3, 92.5, 10)], 3);
const ROW = exercise('es-2', 'Remo con barra', [set(1, 60, 10), set(2, 60, 10), set(3, 60, 10)], 3);
const FACE_PULL = exercise('es-3', 'Face pull', [set(1, 45, 15), set(2, 45, 15), set(3, 45, 15)], 3);
/** Two of three sets on the row: the partial session the artboard draws. */
const ROW_SHORT = exercise('es-2b', 'Remo con barra', [set(1, 60, 10), set(2, 60, 10)], 3);

const COMPLETE = session('sessions-1', 'completed', [DEADLIFT, ROW, FACE_PULL]);
const PARTIAL = session('sessions-2', 'partial', [DEADLIFT, ROW_SHORT]);

const LIBRARY: readonly Exercise[] = [
  { id: 'lib-es-1', name: 'Peso muerto', primaryMuscle: 'hamstrings', pattern: 'hinge', equipment: 'barbell', loadIncrementKg: 2.5, isCustom: false, isArchived: false },
  { id: 'lib-es-2', name: 'Remo con barra', primaryMuscle: 'upperBack', pattern: 'horizontalPull', equipment: 'barbell', loadIncrementKg: 2.5, isCustom: false, isArchived: false },
  { id: 'lib-es-3', name: 'Face pull', primaryMuscle: 'shoulders', pattern: 'horizontalPull', equipment: 'cable', loadIncrementKg: 2.5, isCustom: false, isArchived: false },
];

const LAST_WEEK_SESSION = session('sessions-0', 'completed', [
  exercise(
    'es-old',
    'Peso muerto',
    [set(1, 90, 10, LAST_WEEK), set(2, 90, 10, LAST_WEEK), set(3, 90, 10, LAST_WEEK)],
    3,
    'lib-es-1',
  ),
], LAST_WEEK);

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    session: COMPLETE,
    history: [LAST_WEEK_SESSION],
    library: LIBRARY,
    now: NOW,
    ...overrides,
  };
}

/* -------------------------------------------------------------------- the route */

describe('summaryTargetOf', () => {
  it('reads the session id out of the hash', () => {
    expect(summaryTargetOf('#/resumen/sessions-1')).toEqual({ kind: 'session', sessionId: 'sessions-1' });
  });

  it('knows the fixture route', () => {
    expect(summaryTargetOf('#/resumen/demo')).toEqual({ kind: 'demo' });
  });

  it('is not this screen for anything else', () => {
    expect(summaryTargetOf('#/inicio')).toBeNull();
    expect(summaryTargetOf('#/resumen')).toBeNull();
    expect(summaryTargetOf('#/resumen/')).toBeNull();
    expect(summaryTargetOf('')).toBeNull();
  });
});

/* ---------------------------------------------------------------- the outcome */

describe('summaryOutcome', () => {
  it('is completed only when every prescribed set is confirmed', () => {
    expect(summaryOutcome(COMPLETE)).toBe('completed');
    expect(summaryOutcome(PARTIAL)).toBe('partial');
  });

  it('is completed when the sets match the prescription exactly', () => {
    const full = session('full', 'inProgress', [
      exercise('a', 'Sentadilla', [set(1, 90, 10), set(2, 90, 10)], 2),
    ]);
    expect(summaryOutcome(full)).toBe('completed');
  });

  it('does not count a prescription with no exercises as complete', () => {
    expect(summaryOutcome(session('empty', 'inProgress', []))).toBe('partial');
  });
});

/* ------------------------------------------------------------------- the view */

describe('summaryViewOf', () => {
  it('writes the title, the eyebrow and the day', () => {
    const view = summaryViewOf(input());
    expect(view.eyebrow).toBe('MIÉRCOLES, 8 NOV');
    expect(view.title).toBe('Sesión completada');
    expect(view.dayName).toBe('PESO MUERTO / TRACCIÓN');
  });

  it('states a partial session without dressing it as a failure', () => {
    const view = summaryViewOf(input({ session: PARTIAL }));
    expect(view.title).toBe('Sesión parcial');
    expect(view.note).toBe('Guardada como parcial. Puedes repetir el día cuando quieras; no cuenta como fallo.');
    expect(summaryViewOf(input()).note).toBeNull();
  });

  it('strips sets against the prescription, the duration and the volume', () => {
    const view = summaryViewOf(input({ session: PARTIAL }));
    expect(view.totals).toEqual({
      series: '5/6',
      duration: '52 min',
      volume: '3.975',
    });
  });

  it('leaves the duration empty rather than inventing one', () => {
    const view = summaryViewOf(input({ session: { ...PARTIAL, startedAt: null, endedAt: null } }));
    expect(view.totals.duration).toBeNull();
  });

  it('finds a personal record and says what it beat', () => {
    const view = summaryViewOf(input());
    expect(view.records).toHaveLength(1);
    expect(view.records[0]).toEqual({
      exerciseName: 'Peso muerto',
      line: 'Peso muerto · 92,5 kg × 10',
      detail: 'Mejor marca en 10 repeticiones. Antes: 90 kg.',
      when: 'hoy',
    });
    expect(view.noRecords).toBeNull();
  });

  it('says there is no record instead of leaving the space empty', () => {
    const view = summaryViewOf(input({ session: PARTIAL, history: [COMPLETE] }));
    expect(view.records).toEqual([]);
    expect(view.noRecords).toBe('Sin récords hoy. No hace falta que cada sesión los tenga.');
  });

  it('never claims a record without a previous mark to beat', () => {
    const view = summaryViewOf(input({ history: [] }));
    expect(view.records).toEqual([]);
    expect(view.noRecords).not.toBeNull();
  });

  it('reads out every exercise with its sets and its volume', () => {
    const view = summaryViewOf(input());
    expect(view.exercises.map((row) => row.name)).toEqual(['Peso muerto', 'Remo con barra', 'Face pull']);
    expect(view.exercises[0]).toMatchObject({
      subtitle: '3 series · 92,5 kg',
      volume: '2.775',
      icon: 'barbell',
      sets: [
        { label: 'Serie 1', detail: '10 × 92,5 kg' },
        { label: 'Serie 2', detail: '10 × 92,5 kg' },
        { label: 'Serie 3', detail: '10 × 92,5 kg' },
      ],
    });
    expect(view.exercises[2]).toMatchObject({ subtitle: '3 series · 45 kg', volume: '2.025', icon: 'cable' });
  });

  it('reads out the sets an exercise did not finish', () => {
    const view = summaryViewOf(input({ session: PARTIAL }));
    expect(view.exercises[1]).toMatchObject({
      name: 'Remo con barra',
      subtitle: '2 de 3 series',
      volume: '1.200',
      sets: [
        { label: 'Serie 1', detail: '10 × 60 kg' },
        { label: 'Serie 2', detail: '10 × 60 kg' },
      ],
    });
  });

  it('says an exercise has no sets instead of showing a zero that looks like a result', () => {
    const skipped = session('skipped', 'partial', [exercise('es-9', 'Face pull', [], 3)]);
    const view = summaryViewOf(input({ session: skipped }));
    expect(view.exercises[0]).toMatchObject({ subtitle: 'Sin series registradas', volume: '0', sets: [] });
  });

  it('does not depend on the library to name an exercise', () => {
    const view = summaryViewOf(input({ library: [] }));
    expect(view.exercises[0]?.icon).toBe('dumbbell');
    expect(view.exercises[0]?.name).toBe('Peso muerto');
  });
});
