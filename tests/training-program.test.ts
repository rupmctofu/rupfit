/**
 * The training programme, end to end (odd/tasks/training-program.md, and the fourth day as
 * odd/tasks/match-aware-week.md L7 leaves it).
 *
 * The readaptation tests pin the engine with hand-built inputs; this file pins the path
 * the app actually takes — seed → store → session → recommendation — because the one
 * blocker this change had was a profile that the engine honoured and the mapper dropped.
 */
import { describe, expect, it } from 'vitest';
import { blockPrescription, recommend } from '../src/core/engine';
import type { BlockRole } from '../src/core/domain';
import { EFFORT } from '../src/core/domain';
import { SEED_EXERCISES, seedExerciseById, seedPlanDays } from '../src/core/seed';
import { buildBackupDocument, serializeDocument } from '../src/storage/codec/document';
import { planItemFromRow, planItemToRow } from '../src/storage/mappers';
import { parseBackupDocument } from '../src/storage/codec/schema';
import { daysBefore, makeInput, makeOutcome, makeSet, NOW, readaptationPhase } from './fixtures';

const DAYS = seedPlanDays();
const ITEMS = DAYS.flatMap((day) => day.items);

/**
 * The fourth day of five-day-plan S1, by id: it is the mobility and core day, and it kept
 * the id it had while it was called `PREPARACIÓN FÚTBOL` and before that `FÍSICO`, so
 * history still points here.
 */
const FISICO = DAYS.find((day) => day.id === 'seed-day-fisico');
if (FISICO === undefined) throw new Error('the fourth day is missing');
const FISICO_ITEMS = FISICO.items;

/** The twenty-minute walk the mobility day now ends with, and the machine it needs. */
const WALK_ITEM = FISICO_ITEMS.find(
  (item) => item.exerciseId === 'seed-ex-caminata-inclinada',
);
if (WALK_ITEM === undefined) throw new Error('the mobility day has no walk');
const WALK = seedExerciseById(WALK_ITEM.exerciseId);
if (WALK === undefined) throw new Error('the walk is not in the library');

describe('S1 the plan is four training days', () => {
  it('ships leg, upper A, upper B and the mobility and core day', () => {
    expect(DAYS.map((day) => day.name)).toEqual([
      'PIERNA',
      'TORSO A',
      'TORSO B',
      'MOVILIDAD Y CORE',
    ]);
  });

  it('comes after TORSO B in the rotation and is never a fifth strength day', () => {
    expect(DAYS.map((day) => day.order)).toEqual([0, 1, 2, 3]);
    const roles = FISICO_ITEMS.map((item) => item.prescription.role);
    expect(roles).not.toContain('strength');
    expect(roles).not.toContain('hypertrophy');
    expect(roles).not.toContain('accessory');
    // Every exercise slot is preventive; only the closing walk is conditioning.
    expect(roles.filter((role) => role === 'preventive')).toHaveLength(6);
  });

  // Football's own guarantees (an activity row, and a rotation that does not move) are
  // pinned beside the code, in `src/features/home/football.test.ts` and
  // `src/features/home/selectors.test.ts`: this file must stay inside the core and
  // storage projects, which do not carry DOM types.
});

describe('S2 the prescription profile', () => {
  it('gives the five profiles four different prescriptions', () => {
    // odd/tasks/five-day-plan.md S6/S7 collapsed two of them: strength and hypertrophy are
    // both 8-10 to failure in every block, so only the set count told them apart before and
    // now nothing does. The role still travels on the prescription (see the round-trip test
    // below) and `conditioning` still refuses an increment, so the profile is not lost; what
    // changed is that two columns are deliberately the same numbers.
    const shape = (role: BlockRole): string => JSON.stringify(blockPrescription(1, role));

    const shapes = new Set(
      (
        ['strength', 'hypertrophy', 'accessory', 'preventive', 'conditioning'] as const
      ).map(shape),
    );
    expect(shapes.size).toBe(4);
    expect(blockPrescription(1, 'strength')).toEqual(blockPrescription(1, 'hypertrophy'));
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
        sets: [8, 8, 8].map((reps) => makeSet(reps)),
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

    // Three sets of eight is the strength prescription of block 1 after
    // odd/tasks/five-day-plan.md S6 (8-10 to failure): complete sets, no failure, no
    // discomfort, both weeks trained → the gate passes.
    expect(recommendation.reason).toBe('readaptationBlockPassed');
  });
});

describe('S3 preventive work never chases load', () => {
  it('ships the assisted Nordic and the adapted Copenhagen with no increment', () => {
    expect(seedExerciseById('seed-ex-nordic-asistido')?.loadIncrementKg).toBe(0);
    expect(seedExerciseById('seed-ex-copenhagen-adaptado')?.loadIncrementKg).toBe(0);

    // S1 moves the deliberate repeat from the Nordic to the adapted Copenhagen: the
    // adductor adaptation is the one that earns it, so it is prescribed on leg day and
    // again on the mobility day. There are three preventive rows here, and every one of
    // them is unloaded and two sets far from failure.
    const preventive = ITEMS.filter((item) =>
      ['seed-ex-nordic-asistido', 'seed-ex-copenhagen-adaptado'].includes(item.exerciseId),
    );
    expect(preventive.map((item) => item.exerciseId)).toEqual([
      'seed-ex-nordic-asistido',
      'seed-ex-copenhagen-adaptado',
      'seed-ex-copenhagen-adaptado',
    ]);
    expect(preventive.map((item) => item.prescription.role)).toEqual([
      'preventive',
      'preventive',
      'preventive',
    ]);
    expect(preventive.map((item) => item.prescription.sets)).toEqual([2, 2, 2]);
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

  it('adds the mobility rows the fourth day needs, with a description and no wrong neighbour', () => {
    // five-day-plan S1 turns the fourth day into mobility and core. These four rows are
    // what the library did not have; the planks and the Copenhagen reuse existing rows
    // instead of duplicating them, and no new row takes weight.
    const expected = [
      'seed-ex-movilidad-cadera-90-90',
      'seed-ex-movilidad-toracica-cuadrupedia',
      'seed-ex-plancha-lateral',
      'seed-ex-bird-dog',
    ];

    for (const id of expected) {
      const row = seedExerciseById(id);
      expect(row, id).toBeDefined();
      expect(row?.description, id).toBeTruthy();
      expect(row?.isCustom, id).toBe(false);
      expect(row?.loadIncrementKg, id).toBe(0);
      expect(row?.illustration, id).toBeTruthy();
    }

    // The adapted Copenhagen is reused, not written twice.
    expect(SEED_EXERCISES.filter((row) => row.id === 'seed-ex-copenhagen-adaptado')).toHaveLength(1);
  });
});

describe('S7 old data keeps working', () => {
  it('loads a backup whose phase state still says "primary"', () => {    const document = {
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

  it('still loads a prescription written before profiles and minutes existed', () => {
    // Nothing to migrate: `role` and `durationSeconds` are optional, so a plan item saved
    // by the 1.1.0 build reads back as the hypertrophy column with no timed set.
    const document = backupOf({
      prescription: {
        sets: 3,
        repRange: { lowerBound: 8, upperBound: 10 },
        targetRIR: { lowerBound: 4, upperBound: 5 },
        restSeconds: 120,
      },
    });

    const parsed = parseBackupDocument(document);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const prescription = parsed.document.planDays[0]?.items[0]?.prescription;
    expect(prescription?.role).toBeUndefined();
    expect(prescription?.durationSeconds).toBeUndefined();
    expect(prescription?.sets).toBe(3);
  });
});

describe('L11 the conditioning profile: prescribed by time, never by load', () => {
  it('raises the work block by block and keeps the same effort window', () => {
    // The approved ramp: 2 × 2 min → 3 × 2 min → 3 × 3 min → 4 × 4 min, all at 4–5 RIR.
    const table = [1, 2, 3, 4].map((block) => blockPrescription(block, 'conditioning'));

    expect(table.map((row) => row.sets)).toEqual([2, 3, 3, 4]);
    expect(table.map((row) => row.durationSeconds)).toEqual([120, 120, 180, 240]);
    for (const row of table) {
      expect(row.targetRIR).toEqual({ lowerBound: 4, upperBound: 5 });
    }
    // The minutes never fall, and the load column does not exist in this table at all.
    const minutes = table.map((row) => (row.durationSeconds ?? 0) * row.sets);
    expect(minutes).toEqual([240, 360, 540, 960]);
  });

  it('never writes a load on the four rep-prescribed columns', () => {
    // `durationSeconds` is the conditioning column's only extension: the other four keep
    // exactly the shape they had, so their rows and tests cannot drift.
    for (const role of ['strength', 'hypertrophy', 'accessory', 'preventive'] as const) {
      for (const block of [1, 2, 3, 4]) {
        expect(blockPrescription(block, role), `${role} ${String(block)}`).not.toHaveProperty(
          'durationSeconds',
        );
      }
    }
  });

  it('ships the walk and the two planks as time, and every rep-prescribed item untimed', () => {
    // S2 and S1: the walk is one twenty-minute set and the planks are holds of thirty and
    // twenty-five seconds. Both are written with `durationSeconds`, so the app never turns
    // them into fake repetitions.
    expect(WALK_ITEM.prescription.durationSeconds).toBe(1200);
    expect(WALK_ITEM.prescription.sets).toBe(1);

    const timed = new Map(
      FISICO_ITEMS.map((item) => [item.exerciseId, item.prescription.durationSeconds] as const),
    );
    expect(timed.get('seed-ex-plancha')).toBe(30);
    expect(timed.get('seed-ex-plancha-lateral')).toBe(25);

    const timedIds = new Set([
      'seed-ex-caminata-inclinada',
      'seed-ex-plancha',
      'seed-ex-plancha-lateral',
    ]);
    for (const item of ITEMS) {
      if (timedIds.has(item.exerciseId)) continue;
      expect(item.prescription.durationSeconds, item.exerciseId).toBeUndefined();
    }
  });

  it('returns zero kilos and never an increment, though the treadmill has a plate stack', () => {
    // The treadmill is a `machine`, and a machine's step is 2.5 kg. The engine reads the
    // profile, not the implement, and treats the closing walk as unloaded work (S2).
    expect(WALK.loadIncrementKg).toBe(2.5);

    const history = [2, 5, 8, 11].map((days) =>
      makeOutcome({
        weightKg: 0,
        date: daysBefore(days),
        // Every set performed, at an effort that would move a loaded lift: nothing here
        // may produce a heavier walk.
        sets: [1].map(() => makeSet(1, { effort: EFFORT.hard })),
      }),
    );

    const recommendation = recommend(
      makeInput({
        exercise: WALK,
        prescription: WALK_ITEM.prescription,
        phase: readaptationPhase(2),
        phaseState: { block: 1, passedBlocks: 0 },
        history,
      }),
      NOW,
    );

    expect(recommendation.suggestedWeightKg).toBe(0);

    // Every block, passed or not, and both phases: the suggestion is always zero.
    for (const block of [1, 2, 3, 4]) {
      for (const phase of [readaptationPhase(block), { kind: 'normal' } as const]) {
        const result = recommend(
          makeInput({
            exercise: WALK,
            prescription: WALK_ITEM.prescription,
            phase,
            phaseState: { block, passedBlocks: 0 },
            history,
          }),
          NOW,
        );
        expect(result.suggestedWeightKg, `${String(block)} ${phase.kind}`).toBe(0);
      }
    }
  });

  it('carries the seconds through the store and through the backup document', () => {
    // The blocker of T1 repeated in miniature: a profile the domain honours and the mapper
    // drops. The store round trip and the document round trip both have to keep it.
    const stored = planItemFromRow(planItemToRow(WALK_ITEM as never));
    expect(stored.prescription.durationSeconds).toBe(1200);
    expect(stored.prescription.role).toBe('conditioning');

    const json = serializeDocument(
      buildBackupDocument(
        {
          profile: null,
          phaseState: null,
          exercises: [...SEED_EXERCISES],
          planDays: DAYS as never,
          sessions: [],
          bodyMeasurements: [],
          activities: [],
        },
        { appVersion: '0.1.0', exportedAt: NOW.getTime() },
      ),
    );

    const parsed = parseBackupDocument(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const day = parsed.document.planDays.find((candidate) => candidate.id === 'seed-day-fisico');
    const walk = day?.items.find((item) => item.id === WALK_ITEM.id);
    expect(walk?.prescription.durationSeconds).toBe(1200);
    expect(walk?.prescription.role).toBe('conditioning');

    // And a rep-prescribed item encodes with no such key, exactly as before L11.
    const torso = parsed.document.planDays.find((candidate) => candidate.name === 'TORSO A');
    expect(torso?.items[0]?.prescription).not.toHaveProperty('durationSeconds');
  });
});

/** A minimal, valid backup document whose plan carries one item. */
function backupOf(options: { prescription: unknown }): string {
  return JSON.stringify({
    documentType: 'rupfit.backup',
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: NOW.toISOString(),
    profile: null,
    phaseState: null,
    exercises: [],
    planDays: [
      {
        id: 'day-1',
        name: 'PIERNA',
        order: 0,
        items: [
          {
            id: 'item-1',
            planDayId: 'day-1',
            order: 0,
            exerciseId: null,
            exerciseNameSnapshot: 'Sentadilla trasera',
            prescription: options.prescription,
          },
        ],
      },
    ],
    sessions: [],
    bodyMeasurements: [],
    activities: [],
  });
}
