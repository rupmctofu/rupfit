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

// Block 1 of each profile of the block table (src/core/engine/readaptation.ts), copied as
// literals on purpose: a test that reads the table would agree with any change to it.
const STRENGTH_REPS: RepRange = { lowerBound: 8, upperBound: 10 };
const STRENGTH_RIR: RepRange = { lowerBound: 0, upperBound: 0 };
const HYPERTROPHY_REPS: RepRange = { lowerBound: 8, upperBound: 10 };
const HYPERTROPHY_RIR: RepRange = { lowerBound: 0, upperBound: 0 };
const ACCESSORY_REPS: RepRange = { lowerBound: 8, upperBound: 10 };
const ACCESSORY_RIR: RepRange = { lowerBound: 0, upperBound: 0 };
const PREVENTIVE_REPS: RepRange = { lowerBound: 6, upperBound: 8 };
const PREVENTIVE_RIR: RepRange = { lowerBound: 5, upperBound: 6 };

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

  it('points every alternative at a real row that shares its pattern and primary muscle', () => {
    // S5: a substitute keeps the job of the exercise it replaces. Padding the list with a
    // similar name would break exactly that, so the rule is asserted, not assumed.
    const byId = new Map(SEED_EXERCISES.map((exercise) => [exercise.id, exercise]));

    for (const exercise of SEED_EXERCISES) {
      for (const id of exercise.alternatives ?? []) {
        expect(id, `${exercise.id} names itself`).not.toBe(exercise.id);
        const alternative = byId.get(id);
        expect(alternative, `${exercise.id} → ${id}`).toBeDefined();
        expect(alternative?.pattern, `${exercise.id} → ${id} pattern`).toBe(exercise.pattern);
        expect(alternative?.primaryMuscle, `${exercise.id} → ${id} muscle`).toBe(
          exercise.primaryMuscle,
        );
      }
    }
  });

  it('describes how the prescribed exercises are executed, naming the implement', () => {
    // S4: no exercise may be recommended without saying how it is done.
    for (const item of planItems) {
      const exercise = SEED_EXERCISES.find((row) => row.id === item.exerciseId);
      expect(exercise?.description, item.exerciseNameSnapshot).toBeDefined();
      expect((exercise?.description ?? '').length, item.exerciseNameSnapshot).toBeGreaterThan(20);
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
  it('is the four training days of the owner, in rotation order', () => {
    // odd/tasks/five-day-plan.md S1: three strength days and one mobility and core day,
    // and the match is not a session. Rupfit stores no weekday, so the rotation is the
    // four days and the calendar is the week plan's.
    expect(plan.map((day) => day.name)).toEqual([
      'PIERNA',
      'TORSO A',
      'TORSO B',
      'MOVILIDAD Y CORE',
    ]);
    expect(plan.map((day) => day.order)).toEqual([0, 1, 2, 3]);
  });

  it('starts every lifting day with its strength lift and keeps a readable number of exercises', () => {
    // Leg day is the longest on purpose: it carries the calves pair and the two
    // preventive movements the football adaptation is built around. The mobility day has
    // no strength lift to open with — its first slot is the hip mobility — and it is the
    // one day whose work is a prescription the block table cannot express.
    const lengths = plan.map((day) => day.items.length);
    expect(lengths).toEqual([9, 8, 8, 7]);
    for (const day of plan) {
      expect(day.items.map((item) => item.order)).toEqual(day.items.map((_, index) => index));
    }
    expect(plan[0]?.items[0]?.prescription.role).toBe('strength');
    expect(plan[3]?.items[0]?.prescription.role).toBe('preventive');
    expect(plan[0]?.items[0]?.exerciseNameSnapshot).toBe('Sentadilla trasera');
    expect(plan[1]?.items[0]?.exerciseNameSnapshot).toBe('Press banca');
    expect(plan[2]?.items[0]?.exerciseNameSnapshot).toBe('Press banca inclinado');
    expect(plan[3]?.items[0]?.exerciseNameSnapshot).toBe('Movilidad de cadera 90/90');
  });

  it('prescribes the session muscle by muscle and never the same exercise twice', () => {
    const leg = plan[0]?.items.map((item) => item.exerciseNameSnapshot) ?? [];
    const upperA = plan[1]?.items.map((item) => item.exerciseNameSnapshot) ?? [];
    const upperB = plan[2]?.items.map((item) => item.exerciseNameSnapshot) ?? [];
    const mobility = plan[3]?.items.map((item) => item.exerciseNameSnapshot) ?? [];

    // Leg: quads and glutes through the squat and the press, hamstrings through a hinge, a
    // seated curl and the assisted Nordic, adductors through the adapted Copenhagen, and
    // both calves — the standing one for the gastrocnemius and the seated one for the
    // soleus, which is the pair that actually trains the lower leg.
    expect(leg).toEqual([
      'Sentadilla trasera',
      'Peso muerto rumano con barra',
      'Prensa',
      'Curl femoral sentado en máquina',
      'Nordic curl asistido',
      'Copenhagen plank adaptado',
      'Elevación de gemelos de pie en máquina',
      'Elevación de sóleo sentado',
      'Caminata inclinada',
    ]);

    // Upper A: a horizontal strength lift, then volume for back, lats and shoulders, then
    // arms. Upper B mirrors it with different angles and different implements.
    expect(upperA).toEqual([
      'Press banca',
      'Remo con barra',
      'Jalón al pecho',
      'Press de hombro',
      'Elevaciones laterales',
      'Curl de bíceps con barra',
      'Extensiones de tríceps',
      'Caminata inclinada',
    ]);
    expect(upperB).toEqual([
      'Press banca inclinado',
      'Remo en máquina',
      'Dominadas asistidas',
      'Press de hombro en máquina',
      'Face pull',
      'Curl en polea',
      'Extensión de tríceps sobre la cabeza',
      'Caminata inclinada',
    ]);

    // The mobility day of S1: two hip-and-thorax drills, three core holds and the
    // adapted Copenhagen the week already knows, closed by the same walk as the other
    // three days. Nothing loaded and nothing to failure.
    expect(mobility).toEqual([
      'Movilidad de cadera 90/90',
      'Movilidad torácica en cuadrupedia',
      'Plancha',
      'Plancha lateral',
      'Bird-dog',
      'Copenhagen plank adaptado',
      'Caminata inclinada',
    ]);

    // No exercise twice in a day. Across the week, `Copenhagen plank adaptado` is the one
    // deliberate repeat: the adductor adaptation is trained on leg day and again on the
    // mobility day, which is the point of prescribing it twice a week rather than once.
    // The walk is the other weekly repeat, and it is the same slot by design (S2).
    for (const day of plan) {
      const exerciseIds = day.items.map((item) => item.exerciseId);
      expect(new Set(exerciseIds).size, day.name).toBe(exerciseIds.length);
    }
  });

  it('writes the mobility and core day of S1 without moving the day it replaces', () => {
    // odd/tasks/five-day-plan.md S1: the fourth day stops being football preparation and
    // becomes mobility and core, with no load and the same twenty-minute walk the three
    // strength days end with (S2). The key stays `fisico`, so the day id and the item ids
    // stay too: a session whose history points at this day keeps pointing at it.
    const mobility = plan[3];
    expect(mobility?.id).toBe('seed-day-fisico');
    expect(mobility?.name).toBe('MOVILIDAD Y CORE');
    expect(mobility?.items.map((item) => item.id)).toEqual([
      'seed-item-fisico-1',
      'seed-item-fisico-2',
      'seed-item-fisico-3',
      'seed-item-fisico-4',
      'seed-item-fisico-5',
      'seed-item-fisico-6',
      'seed-item-fisico-7',
    ]);
    expect(mobility?.items.map((item) => item.exerciseId)).toEqual([
      'seed-ex-movilidad-cadera-90-90',
      'seed-ex-movilidad-toracica-cuadrupedia',
      'seed-ex-plancha',
      'seed-ex-plancha-lateral',
      'seed-ex-bird-dog',
      'seed-ex-copenhagen-adaptado',
      'seed-ex-caminata-inclinada',
    ]);
    expect(mobility?.items.map((item) => item.exerciseNameSnapshot)).toEqual([
      'Movilidad de cadera 90/90',
      'Movilidad torácica en cuadrupedia',
      'Plancha',
      'Plancha lateral',
      'Bird-dog',
      'Copenhagen plank adaptado',
      'Caminata inclinada',
    ]);
    // Every exercise slot is preventive and unloaded; only the walk, the day's closing
    // cardio, carries the conditioning profile.
    expect(mobility?.items.map((item) => item.prescription.role)).toEqual([
      'preventive',
      'preventive',
      'preventive',
      'preventive',
      'preventive',
      'preventive',
      'conditioning',
    ]);
    // Timed holds are seconds, not fake reps: the preventive column supplies the profile
    // and the `fixed` slot supplies the work.
    expect(mobility?.items[2]?.prescription).toEqual({
      sets: 3,
      repRange: PREVENTIVE_REPS,
      targetRIR: PREVENTIVE_RIR,
      restSeconds: 90,
      role: 'preventive',
      durationSeconds: 30,
    });
    expect(mobility?.items[3]?.prescription).toEqual({
      sets: 2,
      repRange: PREVENTIVE_REPS,
      targetRIR: PREVENTIVE_RIR,
      restSeconds: 90,
      role: 'preventive',
      durationSeconds: 25,
    });
    // And the walk is the same one-set twenty minutes the strength days carry (S2).
    expect(mobility?.items[6]?.prescription).toEqual({
      sets: 1,
      repRange: { lowerBound: 1, upperBound: 1 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
      restSeconds: 0,
      role: 'conditioning',
      durationSeconds: 1200,
    });
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

  it('writes the block-1 prescription of each profile, with the rest of §7', () => {
    // Five profiles, five different answers at the same block: this is the whole point of
    // odd/tasks/training-program.md S2 and L11 — a strength lift, a Copenhagen plank and a
    // treadmill interval can no longer share one row of numbers.
    // The squat is the only lift the owner leaves one rep short of failure (S6), so it
    // does not read the strength column's RIR even though it reads its reps.
    expect(itemByName('Sentadilla trasera').prescription).toEqual({
      sets: 3,
      repRange: STRENGTH_REPS,
      targetRIR: { lowerBound: 1, upperBound: 1 },
      restSeconds: 180,
      role: 'strength',
    });

    expect(itemByName('Prensa').prescription).toEqual({
      sets: 3,
      repRange: HYPERTROPHY_REPS,
      targetRIR: HYPERTROPHY_RIR,
      restSeconds: 120,
      role: 'hypertrophy',
    });

    expect(itemByName('Elevación de sóleo sentado').prescription).toEqual({
      sets: 2,
      repRange: ACCESSORY_REPS,
      targetRIR: ACCESSORY_RIR,
      restSeconds: 90,
      role: 'accessory',
    });

    // The two movements that need the most patience: two sets, five to six reps in
    // reserve, and never a load target of their own.
    expect(itemByName('Nordic curl asistido').prescription).toEqual({
      sets: 2,
      repRange: PREVENTIVE_REPS,
      targetRIR: PREVENTIVE_RIR,
      restSeconds: 90,
      role: 'preventive',
    });
    expect(itemByName('Copenhagen plank adaptado').prescription.role).toBe('preventive');

    // §7: only the three documented intervals exist, and only the day's strength lifts
    // take the 180 s one. The mobility day has none: it prescribes no strength lift, rests
    // its holds the isolation 90 s and closes with the walk's zero rest (S2).
    for (const item of planItems) {
      expect([0, 90, 120, 180]).toContain(item.prescription.restSeconds);
    }
    for (const day of plan) {
      const long = day.items.filter((item) => item.prescription.restSeconds === 180);
      expect(long.length).toBe(day.items.filter((item) => item.prescription.role === 'strength').length);
    }
    expect(plan[3]?.items[0]?.prescription.restSeconds).toBe(90);
    expect(plan[3]?.items.at(-1)?.prescription.restSeconds).toBe(0);
  });

  it('never puts the full Nordic curl before the assisted one', () => {
    // S3: the harder variant is a later change of exercise, not the starting prescription.
    const names = planItems.map((item) => item.exerciseNameSnapshot);
    expect(names).toContain('Nordic curl asistido');
    expect(names).not.toContain('Nordic curl');
    expect(names).toContain('Copenhagen plank adaptado');
    expect(names).not.toContain('Copenhagen plank');
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
    expect(first.planDays).toHaveLength(4);
    // Not the same objects: a caller cannot mutate the seed for the next call.
    expect(first.planDays).not.toBe(second.planDays);
    expect(first.planDays[0]?.items).not.toBe(second.planDays[0]?.items);
  });
});
