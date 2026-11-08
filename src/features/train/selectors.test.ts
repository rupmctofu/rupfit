/**
 * Entrenar's decisions, without React.
 *
 * The screen is the weekday template plus the sessions it produced this week. Two
 * honesty rules decide the branches:
 *
 * 1. **A weekday is only written when a session proves it.** `PlanDay` carries `order`
 *    and a name, not a weekday, and nothing in the app schedules a session yet, so a
 *    template day without a session claims no day of the week.
 * 2. **A state word is a fact, not a decoration.** `hecha` needs a closed session, `hoy`
 *    needs one scheduled for the injected day, and everything else is `pendiente`.
 */

import { describe, expect, it } from 'vitest';
import type { ExerciseSession, PlanDay, SetRecord, WorkoutSession } from '../../storage';
import { EFFORT } from '../../core/domain';
import { dayFocus, formatDayName } from '../home/format';
import { trainViewOf, type TrainInput } from './selectors';

/* ------------------------------------------------------------------ fixtures */

const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();

function planItem(
  dayId: string,
  order: number,
  name: string,
  sets: number,
): PlanDay['items'][number] {
  return {
    id: `${dayId}-item-${String(order)}`,
    planDayId: dayId,
    order,
    exerciseId: `lib-${String(order)}`,
    exerciseNameSnapshot: name,
    prescription: {
      sets,
      repRange: { lowerBound: 8, upperBound: 10 },
      targetRIR: { lowerBound: 2, upperBound: 3 },
      restSeconds: 180,
    },
  };
}

function set(index: number, weightKg: number, actualReps: number, confirmedAt: number): SetRecord {
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

function exercise(id: string, name: string, sets: readonly SetRecord[], prescribed: number): ExerciseSession {
  return {
    id,
    order: 0,
    exerciseId: `lib-${id}`,
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
    status: sets.length === 0 ? 'pending' : 'done',
    completedAt: null,
  };
}

const PLAN: readonly PlanDay[] = [
  {
    id: 'day-mon',
    name: 'SENTADILLA / PIERNA',
    order: 0,
    items: [planItem('day-mon', 0, 'Sentadilla', 3), planItem('day-mon', 1, 'Prensa', 2)],
  },
  {
    id: 'day-wed',
    name: 'PESO MUERTO / TRACCIÓN',
    order: 1,
    items: [planItem('day-wed', 0, 'Peso muerto', 3), planItem('day-wed', 1, 'Remo', 2)],
  },
  {
    id: 'day-fri',
    name: 'PRESS BANCA / EMPUJE',
    order: 2,
    items: [planItem('day-fri', 0, 'Press banca', 3)],
  },
];

const MONDAY = new Date(2023, 10, 6, 18, 0, 0).getTime();
const MONDAY_END = new Date(2023, 10, 6, 18, 52, 0).getTime();

const MONDAY_SESSION: WorkoutSession = {
  id: 'sessions-mon',
  planDayId: 'day-mon',
  dayNameSnapshot: 'SENTADILLA / PIERNA',
  scheduledDate: MONDAY,
  startedAt: MONDAY,
  endedAt: MONDAY_END,
  phase: { kind: 'readaptation', week: 2 },
  status: 'completed',
  exercises: [exercise('es-1', 'Sentadilla', [set(1, 90, 10, MONDAY_END), set(2, 90, 10, MONDAY_END)], 2)],
};

const WEDNESDAY_SESSION: WorkoutSession = {
  id: 'sessions-wed',
  planDayId: 'day-wed',
  dayNameSnapshot: 'PESO MUERTO / TRACCIÓN',
  scheduledDate: NOW,
  startedAt: null,
  endedAt: null,
  phase: { kind: 'readaptation', week: 2 },
  status: 'scheduled',
  exercises: [exercise('es-2', 'Peso muerto', [], 3), exercise('es-3', 'Remo', [], 2)],
};

const FRIDAY_SESSION: WorkoutSession = {
  id: 'sessions-fri',
  planDayId: 'day-fri',
  dayNameSnapshot: 'PRESS BANCA / EMPUJE',
  scheduledDate: new Date(2023, 10, 10, 18, 0, 0).getTime(),
  startedAt: null,
  endedAt: null,
  phase: { kind: 'readaptation', week: 2 },
  status: 'scheduled',
  exercises: [exercise('es-4', 'Press banca', [], 3)],
};

function input(overrides: Partial<TrainInput> = {}): TrainInput {
  return {
    now: NOW,
    plan: PLAN,
    sessions: [FRIDAY_SESSION, WEDNESDAY_SESSION, MONDAY_SESSION],
    phaseState: { block: 2, passedBlocks: 1 },
    ...overrides,
  };
}

/* -------------------------------------------------------------------- naming */

describe('formatDayName', () => {
  it('says the snapshotted name the way the artboard does', () => {
    expect(formatDayName('SENTADILLA / PIERNA')).toBe('Sentadilla / Pierna');
    expect(formatDayName('PESO MUERTO / TRACCIÓN')).toBe('Peso muerto / Tracción');
  });

  it('leaves a name without a focus alone', () => {
    expect(formatDayName('MOVILIDAD')).toBe('Movilidad');
  });
});

describe('dayFocus', () => {
  it('reads the focus out of the snapshot instead of storing a second field', () => {
    expect(dayFocus('SENTADILLA / PIERNA')).toBe('Pierna');
    expect(dayFocus('PRESS BANCA / EMPUJE')).toBe('Empuje');
    expect(dayFocus('MOVILIDAD')).toBeNull();
  });
});

/* ---------------------------------------------------------------------- view */

describe('trainViewOf', () => {
  it('names the week and lists the template in its stored order', () => {
    const view = trainViewOf(input());
    expect(view.weekLabel).toBe('Semana del 6 de noviembre');
    expect(view.days.map((day) => day.title)).toEqual([
      'Sentadilla / Pierna',
      'Peso muerto / Tracción',
      'Press banca / Empuje',
    ]);
    expect(view.planEmpty).toBe(false);
  });

  it('marks the day that was trained, the day that is today, and the rest', () => {
    const view = trainViewOf(input());
    expect(view.days.map((day) => day.status.word)).toEqual(['hecha', 'hoy', 'pendiente']);
    expect(view.days.map((day) => day.status.tone)).toEqual(['success', 'accent', 'muted']);
  });

  it('writes what the week can prove: the weekday, the focus, and the numbers', () => {
    const view = trainViewOf(input());
    expect(view.days[0]?.subtitle).toBe('Lunes · Pierna · 1.800 kg · 52 min');
    expect(view.days[1]?.subtitle).toBe('Miércoles · Tracción · 2 ejercicios');
    expect(view.days[2]?.subtitle).toBe('Viernes · Empuje · 1 ejercicio');
  });

  it('claims no weekday for a template day no session has landed on', () => {
    const view = trainViewOf(input({ sessions: [] }));
    expect(view.days.map((day) => day.subtitle)).toEqual([
      'Pierna · 2 ejercicios',
      'Tracción · 2 ejercicios',
      'Empuje · 1 ejercicio',
    ]);
    expect(view.days.every((day) => day.status.word === 'pendiente')).toBe(true);
  });

  it('says the day is rest when nothing is scheduled today, and offers the plan', () => {
    const view = trainViewOf(input({ sessions: [MONDAY_SESSION] }));
    expect(view.today).toEqual({ kind: 'rest' });
  });

  it('names today’s session when there is one', () => {
    const view = trainViewOf(input());
    expect(view.today).toEqual({
      kind: 'session',
      title: 'Peso muerto / Tracción',
      sessionId: 'sessions-wed',
    });
  });

  it('is an empty template, not a broken screen, when no plan exists', () => {
    const view = trainViewOf(input({ plan: [], sessions: [] }));
    expect(view.planEmpty).toBe(true);
    expect(view.days).toEqual([]);
    expect(view.today).toBeNull();
  });

  it('keeps the readaptation block quiet and states its week', () => {
    const view = trainViewOf(input());
    expect(view.phase).toEqual({
      label: 'Bloque de readaptación',
      chip: 'semana 2 de 4',
      note: 'Se avanza al siguiente bloque cuando se cumplen los cuatro criterios de la semana.',
    });
    expect(trainViewOf(input({ phaseState: undefined })).phase).toBeNull();
  });

  it('carries the day’s ordered items for the routine sheet', () => {
    const view = trainViewOf(input());
    expect(view.days[1]?.items).toEqual([
      { name: 'Peso muerto', prescription: 'Objetivo · 3 × 8–10 a 2–3 RIR · descanso 180 s' },
      { name: 'Remo', prescription: 'Objetivo · 2 × 8–10 a 2–3 RIR · descanso 180 s' },
    ]);
  });
});
