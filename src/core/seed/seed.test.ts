/**
 * The seed's shape — written from the documents, not from the implementation.
 *
 * Every expectation below is quoted from a specification: FR-2.1 (a library of at least
 * forty exercises, every pattern, with an increment), FR-3.1 (the three-day template
 * verbatim), FR-3.2 (the accessories of each day), training-science §6 (the block table)
 * and §7 (the rest intervals), and §8 (increments are per implement). If a later edit
 * changes one of these numbers, the document has to change first.
 */

import { describe, expect, it } from 'vitest';
import { EQUIPMENT_TYPES, MOVEMENT_PATTERNS, MUSCLE_GROUPS, type RepRange } from '../domain';
import {
  EQUIPMENT_INCREMENT_KG,
  SEED_EXERCISES,
  START_PHASE_STATE,
  seedPlanDays,
  seedRows,
} from './index';

const PRIMARY_REPS: RepRange = { lowerBound: 10, upperBound: 10 };
const PRIMARY_RIR: RepRange = { lowerBound: 4, upperBound: 5 };
const ACCESSORY_REPS: RepRange = { lowerBound: 12, upperBound: 12 };
const ACCESSORY_RIR: RepRange = { lowerBound: 4, upperBound: 4 };

const plan = seedPlanDays();
const planItems = plan.flatMap((day) => day.items);

function itemByName(name: string): (typeof planItems)[number] {
  const item = planItems.find((candidate) => candidate.exerciseNameSnapshot === name);
  if (item === undefined) throw new Error(`the plan does not prescribe ${name}`);
  return item;
}

describe('the seeded library', () => {
  it('ships the forty exercises FR-2.1 asks for', () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(40);
  });

  it('gives every exercise a pattern, a muscle group, an implement and the increment of that implement', () => {
    for (const exercise of SEED_EXERCISES) {
      expect(MOVEMENT_PATTERNS, exercise.id).toContain(exercise.pattern);
      expect(MUSCLE_GROUPS, exercise.id).toContain(exercise.primaryMuscle);
      expect(EQUIPMENT_TYPES, exercise.id).toContain(exercise.equipment);
      expect(exercise.loadIncrementKg, exercise.id).toBe(EQUIPMENT_INCREMENT_KG[exercise.equipment]);
    }
  });

  it('rounds a barbell lift to 2.5 kg, a dumbbell to its own step and a bodyweight lift to zero', () => {
    // training-science §8 (DD), one example per family.
    const barbell = SEED_EXERCISES.find((exercise) => exercise.name === 'Sentadilla trasera');
    const dumbbell = SEED_EXERCISES.find((exercise) => exercise.name === 'Zancadas');
    const machine = SEED_EXERCISES.find((exercise) => exercise.name === 'Prensa');
    const cable = SEED_EXERCISES.find((exercise) => exercise.name === 'Jalón al pecho');
    const bodyweight = SEED_EXERCISES.find((exercise) => exercise.name === 'Plancha');

    expect(barbell?.loadIncrementKg).toBe(2.5);
    expect(dumbbell?.loadIncrementKg).toBe(2);
    expect(machine?.loadIncrementKg).toBe(2.5);
    expect(cable?.loadIncrementKg).toBe(2.5);
    expect(bodyweight?.loadIncrementKg).toBe(0);
  });

  it('covers every movement pattern of FR-2.1 and every implement the profile can hold', () => {
    const patterns = new Set(SEED_EXERCISES.map((exercise) => exercise.pattern));
    const equipment = new Set(SEED_EXERCISES.map((exercise) => exercise.equipment));

    for (const pattern of MOVEMENT_PATTERNS) {
      expect(patterns, pattern).toContain(pattern);
    }
    for (const implement of EQUIPMENT_TYPES) {
      expect(equipment, implement).toContain(implement);
    }
  });

  it('keys every row by a stable seed id, with no duplicate', () => {
    const ids = SEED_EXERCISES.map((exercise) => exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('seed-ex-')).toBe(true);
    // Seeded rows are neither custom nor archived: the owner's own rows are.
    for (const exercise of SEED_EXERCISES) {
      expect(exercise.isCustom).toBe(false);
      expect(exercise.isArchived).toBe(false);
    }
  });
});

describe('the starter plan', () => {
  it('is the three days of FR-3.1, in order and with the names verbatim', () => {
    expect(plan.map((day) => day.name)).toEqual([
      'SENTADILLA / PIERNA',
      'PESO MUERTO / TRACCIÓN',
      'PRESS BANCA / EMPUJE',
    ]);
    expect(plan.map((day) => day.order)).toEqual([0, 1, 2]);
  });

  it('carries six exercises per day, the primary lift of FR-3.1 first', () => {
    for (const day of plan) {
      expect(day.items).toHaveLength(6);
      expect(day.items.map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5]);
    }
    expect(plan[0]?.items[0]?.exerciseNameSnapshot).toBe('Sentadilla trasera');
    expect(plan[1]?.items[0]?.exerciseNameSnapshot).toBe('Peso muerto convencional');
    expect(plan[2]?.items[0]?.exerciseNameSnapshot).toBe('Press banca');
  });

  it('prescribes FR-3.2 accessories and never the same exercise twice', () => {
    const lower = plan[0]?.items.map((item) => item.exerciseNameSnapshot) ?? [];
    const pull = plan[1]?.items.map((item) => item.exerciseNameSnapshot) ?? [];
    const push = plan[2]?.items.map((item) => item.exerciseNameSnapshot) ?? [];

    expect(lower).toEqual([
      'Sentadilla trasera',
      'Prensa',
      'Zancadas',
      'Curl femoral',
      'Gemelos',
      'Crunch en polea',
    ]);
    expect(pull).toEqual([
      'Peso muerto convencional',
      'Remo con barra',
      'Jalón al pecho',
      'Face pull',
      'Curl de bíceps',
      'Hiperextensión',
    ]);
    expect(push).toEqual([
      'Press banca',
      'Press inclinado con mancuernas',
      'Press de hombro',
      'Elevaciones laterales',
      'Extensiones de tríceps',
      'Espalda alta',
    ]);

    const exerciseIds = planItems.map((item) => item.exerciseId);
    expect(new Set(exerciseIds).size).toBe(exerciseIds.length);
  });

  it('points every plan item at a seeded exercise, by id and by name snapshot', () => {
    const byId = new Map(SEED_EXERCISES.map((exercise) => [exercise.id, exercise]));

    for (const item of planItems) {
      const exercise = byId.get(item.exerciseId);
      expect(exercise, item.id).toBeDefined();
      expect(item.exerciseNameSnapshot).toBe(exercise?.name);
      expect(item.planDayId).toBe(plan.find((day) => day.items.includes(item))?.id);
    }
    for (const item of planItems) expect(item.id.startsWith('seed-item-')).toBe(true);
    for (const day of plan) expect(day.id.startsWith('seed-day-')).toBe(true);
  });

  it('writes the readaptation block-1 prescription of training-science §6 and the rest of §7', () => {
    const primary = itemByName('Sentadilla trasera');
    expect(primary.prescription).toEqual({
      sets: 2,
      repRange: PRIMARY_REPS,
      targetRIR: PRIMARY_RIR,
      restSeconds: 180,
    });

    const compoundAccessory = itemByName('Prensa');
    expect(compoundAccessory.prescription).toEqual({
      sets: 2,
      repRange: ACCESSORY_REPS,
      targetRIR: ACCESSORY_RIR,
      restSeconds: 120,
    });

    const isolation = itemByName('Curl femoral');
    expect(isolation.prescription).toEqual({
      sets: 2,
      repRange: ACCESSORY_REPS,
      targetRIR: ACCESSORY_RIR,
      restSeconds: 90,
    });

    // §7: only the three documented intervals exist, and only the primary lift of each
    // day takes the 180 s one.
    for (const item of planItems) {
      expect([90, 120, 180]).toContain(item.prescription.restSeconds);
    }
    for (const day of plan) {
      const long = day.items.filter((item) => item.prescription.restSeconds === 180);
      expect(long.map((item) => item.exerciseNameSnapshot)).toEqual([
        day.items[0]?.exerciseNameSnapshot,
      ]);
    }
  });

  it('starts the owner in readaptation block 1, because a missing state would read as the normal phase', () => {
    expect(START_PHASE_STATE).toEqual({ block: 1, passedBlocks: 0 });
  });
});

describe('seedRows()', () => {
  it('returns the library and the plan as equal, freshly built values', () => {
    const first = seedRows();
    const second = seedRows();

    expect(first).toEqual(second);
    expect(first.exercises).toHaveLength(SEED_EXERCISES.length);
    expect(first.planDays).toHaveLength(3);
    // Not the same objects: a caller cannot mutate the seed for the next call.
    expect(first.planDays).not.toBe(second.planDays);
    expect(first.planDays[0]?.items).not.toBe(second.planDays[0]?.items);
  });
});
