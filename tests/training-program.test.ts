/**
 * The training programme, end to end (odd/tasks/training-program.md).
 *
 * The readaptation tests pin the engine with hand-built inputs; this file pins the path
 * the app actually takes — seed → store → session → recommendation — because the one
 * blocker this change had was a profile that the engine honoured and the mapper dropped.
 */
import { describe, expect, it } from 'vitest';
import { blockPrescription, recommend } from '../src/core/engine';
import { SEED_EXERCISES, seedExerciseById, seedPlanDays } from '../src/core/seed';
import { planItemFromRow, planItemToRow } from '../src/storage/mappers';
import { parseBackupDocument } from '../src/storage/codec/schema';
import { daysBefore, makeInput, makeOutcome, makeSet, NOW, readaptationPhase } from './fixtures';

const DAYS = seedPlanDays();
const ITEMS = DAYS.flatMap((day) => day.items);

describe('S1 the plan is three gym days', () => {
  it('ships leg, upper A and upper B', () => {
    expect(DAYS.map((day) => day.name)).toEqual(['PIERNA', 'TORSO A', 'TORSO B']);
  });

  // Football's own guarantees (an activity row, and a rotation that does not move) are
  // pinned beside the code, in `src/features/home/football.test.ts` and
  // `src/features/home/selectors.test.ts`: this file must stay inside the core and
  // storage projects, which do not carry DOM types.
});

describe('S2 the prescription profile', () => {
  it('gives the four profiles four different prescriptions', () => {
    const shape = (role: 'strength' | 'hypertrophy' | 'accessory' | 'preventive'): string =>
      JSON.stringify(blockPrescription(1, role));

    const shapes = new Set(
      (['strength', 'hypertrophy', 'accessory', 'preventive'] as const).map(shape),
    );
    expect(shapes.size).toBe(4);
  });

  it('carries a profile on every plan item', () => {
    for (const item of ITEMS) expect(item.prescription.role, item.exerciseId).toBeDefined();
  });

  it('survives the storage round trip', () => {
    // The blocker this test exists for: `save` → `all` used to drop `role`, so the engine
    // read every exercise as hypertrophy and the gate judged strength work as incomplete.
    for (const item of ITEMS) {
      const roundTripped = planItemFromRow(planItemToRow(item as never));
      expect(roundTripped.prescription.role, item.exerciseId).toBe(item.prescription.role);
    }
  });

  it('lets a strength lift pass its block-1 gate through the stored prescription', () => {
    const strengthItem = DAYS[0]?.items.find((item) => item.prescription.role === 'strength');
    if (strengthItem === undefined) throw new Error('leg day lost its strength lift');

    const exercise = seedExerciseById(strengthItem.exerciseId);
    if (exercise === undefined) throw new Error('the strength lift is not in the library');

    const history = [1, 3, 5, 8, 10, 12].map((days) =>
      makeOutcome({
        weightKg: 100,
        date: daysBefore(days),
        sets: [6, 6, 6].map((reps) => makeSet(reps)),
      }),
    );

    const stored = planItemFromRow(planItemToRow(strengthItem as never));
    const recommendation = recommend(
      makeInput({
        exercise,
        prescription: stored.prescription,
        phase: readaptationPhase(2),
        phaseState: { block: 1, passedBlocks: 0 },
        history,
      }),
      NOW,
    );

    // Three sets of six is the strength prescription of block 1: complete sets, no
    // failure, no discomfort, both weeks trained → the gate passes.
    expect(recommendation.reason).toBe('readaptationBlockPassed');
  });
});

describe('S3 preventive work never chases load', () => {
  it('ships the assisted Nordic and the adapted Copenhagen with no increment', () => {
    expect(seedExerciseById('seed-ex-nordic-asistido')?.loadIncrementKg).toBe(0);
    expect(seedExerciseById('seed-ex-copenhagen-adaptado')?.loadIncrementKg).toBe(0);

    const preventive = ITEMS.filter((item) =>
      ['seed-ex-nordic-asistido', 'seed-ex-copenhagen-adaptado'].includes(item.exerciseId),
    );
    expect(preventive.map((item) => item.prescription.role)).toEqual(['preventive', 'preventive']);
    expect(preventive.map((item) => item.prescription.sets)).toEqual([2, 2]);
  });
});

describe('S4 and S5 library content', () => {
  it('describes how every prescribed exercise is executed', () => {
    for (const item of ITEMS) {
      expect(seedExerciseById(item.exerciseId)?.description, item.exerciseId).toBeTruthy();
    }
  });

  it('offers alternatives that keep the pattern and the primary muscle', () => {
    const byId = new Map(SEED_EXERCISES.map((exercise) => [exercise.id, exercise]));

    for (const exercise of SEED_EXERCISES) {
      for (const id of exercise.alternatives ?? []) {
        const alternative = byId.get(id);
        expect(alternative, `${exercise.id} → ${id}`).toBeDefined();
        expect(id).not.toBe(exercise.id);
        expect(alternative?.pattern, `${exercise.id} → ${id}`).toBe(exercise.pattern);
        expect(alternative?.primaryMuscle, `${exercise.id} → ${id}`).toBe(exercise.primaryMuscle);
      }
    }
  });
});

describe('S7 old data keeps working', () => {
  it('loads a backup whose phase state still says "primary"', () => {
    const document = {
      documentType: 'rupfit.backup',
      schemaVersion: 1,
      appVersion: '0.1.0',
      exportedAt: NOW.toISOString(),
      profile: null,
      phaseState: { block: 2, passedBlocks: 1, role: 'primary' },
      exercises: [],
      planDays: [],
      sessions: [],
      bodyMeasurements: [],
      activities: [],
    };

    const parsed = parseBackupDocument(JSON.stringify(document));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.document.phaseState?.role).toBe('hypertrophy');
  });
});
