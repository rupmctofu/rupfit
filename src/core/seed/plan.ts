/**
 * The starter plan — the three-day rotation of FR-3.1, with FR-3.2's accessories and the
 * prescriptions of the readaptation block table (training-science §6).
 *
 * Three decisions shape this file, and each one is a document's, not a preference:
 *
 * 1. **Three days, one per movement family.** FR-3.1 fixes the template verbatim —
 *    `SENTADILLA / PIERNA`, `PESO MUERTO / TRACCIÓN`, `PRESS BANCA / EMPUJE` — and
 *    training-science §2 makes frequency a scheduling choice (UP), not a physiological
 *    optimum: three sessions per week is what the owner asked for and what one barbell
 *    and one pair of shoes can do. A two-day split would leave 18 weekly sets spread over
 *    too few movements; a five-day split would be a programme the document does not
 *    support and one the owner did not ask for. Three is the honest starting point.
 * 2. **Six exercises per day: the primary lift plus the five accessories of FR-3.2**, in
 *    the order the document lists them. That is exactly the shape the Entrenar and
 *    Historial artboards draw (`6 ejercicios`).
 * 3. **No exercise is prescribed twice.** Each row uses a different library entry, which
 *    is why the pull day prescribes `Face pull` and `Espalda alta` rather than a third
 *    row variation.
 *
 * **The prescriptions are block 1 of the readaptation protocol, not a normal-phase
 * guess.** FR-4.1 starts every new user in readaptation, so the plan is written for the
 * week the owner actually begins in: training-science §6 W1 is `2 × 10 @ 4–5 RIR` on the
 * primary lift and `2 × 12 @ 4 RIR` on the accessory, and these rows take those numbers
 * from `blockPrescription(1, role)` rather than repeating them. Volume-wise that is 4–6
 * hard sets per muscle group per week across the three sessions, which is exactly the
 * readaptation floor §4 sets ("4–6 sets per muscle group per week") and not the normal
 * phase's 10–16. The engine moves the volume from block 1 to block 4 on its own; the plan
 * only has to be right for the block the owner starts in.
 *
 * Rest intervals are training-science §7 (DD): `180 s` primary, `120 s` accessory
 * compound, `90 s` isolation or core. They exist to protect the prescribed effort, so
 * they are data here and editable later, never a timer policy.
 *
 * The rows are the shapes `plan.save` takes (`PlanDay` with its ordered `PlanItem`s). They
 * are declared here instead of imported from `src/storage` because `src/core` may not
 * reach the storage module (architecture §4); the two declare the same fields, so the
 * rows are assignable without a cast, and `seed.test.ts` pins that.
 */

import type { ExercisePrescription, BlockRole, PhaseState } from '../domain';
import { blockPrescription } from '../engine/readaptation';
import { SEED_EXERCISES, seedExerciseById } from './exercises';

/** training-science §6: W1 is the block a new user starts in (FR-4.1). */
export const START_BLOCK = 1;

/**
 * FR-4.1 "start every new user in the readaptation phase". `src/features/session/start`
 * reads a missing phase state as the normal phase, so the first run has to write this —
 * otherwise the conservative block-1 prescriptions above are ignored by the engine's
 * normal-phase rules.
 */
export const START_PHASE_STATE: PhaseState = { block: START_BLOCK, passedBlocks: 0 };

/** training-science §7 (DD): primary lift 180 s. */
const REST_PRIMARY_S = 180;
/** training-science §7 (DD): accessory compound 120 s. */
const REST_COMPOUND_S = 120;
/** training-science §7 (DD): isolation and core 90 s. */
const REST_ISOLATION_S = 90;

/**
 * The `PlanItem` row: what `plan.save` receives, declared structurally (see the header).
 * `exerciseId` is never null in the seed — a starter plan that names an exercise the
 * library does not have would build a session the engine cannot prescribe.
 */
export interface SeedPlanItem {
  readonly id: string;
  readonly planDayId: string;
  readonly order: number;
  readonly exerciseId: string;
  readonly exerciseNameSnapshot: string;
  readonly prescription: ExercisePrescription;
}

/** The `PlanDay` row: the day and its ordered items. */
export interface SeedPlanDay {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly items: readonly SeedPlanItem[];
}

interface SeedSlot {
  /** A library id from `SEED_EXERCISES`. */
  readonly exerciseId: string;
  /** Which column of the block table prescribes this exercise (§6). */
  readonly role: BlockRole;
  readonly restSeconds: number;
}

interface SeedDaySpec {
  /** The id stem: `seed-day-<key>` and `seed-item-<key>-<n>`. */
  readonly key: string;
  /** FR-3.1's name, in capitals: the stored snapshot (§3), displayed title-cased. */
  readonly name: string;
  readonly slots: readonly SeedSlot[];
}

function primary(exerciseId: string): SeedSlot {
  return { exerciseId, role: 'primary', restSeconds: REST_PRIMARY_S };
}

function accessory(exerciseId: string, restSeconds: number = REST_COMPOUND_S): SeedSlot {
  return { exerciseId, role: 'accessory', restSeconds };
}

/**
 * The rotation. `order` is the position in the cycle and nothing else: `PlanDay` stores no
 * weekday (data-model §3), and `src/features/session/start` reads the rotation from the
 * sessions that were actually trained.
 */
const DAYS: readonly SeedDaySpec[] = [
  {
    key: 'lower',
    name: 'SENTADILLA / PIERNA',
    // FR-3.2 Pierna: prensa, zancadas o unilateral, curl femoral, gemelos, core.
    slots: [
      primary('seed-ex-sentadilla-trasera'),
      accessory('seed-ex-prensa'),
      accessory('seed-ex-zancadas'),
      accessory('seed-ex-curl-femoral', REST_ISOLATION_S),
      accessory('seed-ex-gemelos', REST_ISOLATION_S),
      accessory('seed-ex-crunch-polea', REST_ISOLATION_S),
    ],
  },
  {
    key: 'pull',
    name: 'PESO MUERTO / TRACCIÓN',
    // FR-3.2 Tracción: remo, jalón al pecho o dominadas asistidas, face pulls, curl de
    // bíceps, cadena posterior (the lower-back row FR-3.2 asks for last).
    slots: [
      primary('seed-ex-peso-muerto'),
      accessory('seed-ex-remo-barra'),
      accessory('seed-ex-jalon-pecho'),
      accessory('seed-ex-face-pull', REST_ISOLATION_S),
      accessory('seed-ex-curl-biceps', REST_ISOLATION_S),
      accessory('seed-ex-hiperextension', REST_ISOLATION_S),
    ],
  },
  {
    key: 'push',
    name: 'PRESS BANCA / EMPUJE',
    // FR-3.2 Empuje: press inclinado con mancuernas, press de hombro, elevaciones
    // laterales, extensiones de tríceps, espalda alta.
    slots: [
      primary('seed-ex-press-banca'),
      accessory('seed-ex-press-inclinado-mancuernas'),
      accessory('seed-ex-press-hombro'),
      accessory('seed-ex-elevaciones-laterales', REST_ISOLATION_S),
      accessory('seed-ex-extensiones-triceps', REST_ISOLATION_S),
      accessory('seed-ex-espalda-alta'),
    ],
  },
];

function nameOf(exerciseId: string): string {
  const exercise = seedExerciseById(exerciseId);
  if (exercise === undefined) {
    // A typo in the table above is a programming error, not a runtime state: the seed
    // must never write a plan item that names an exercise the library does not have.
    throw new Error(`seed: the plan names an unknown exercise (${exerciseId})`);
  }
  return exercise.name;
}

/** The block prescription of one slot, with the §7 rest interval added. */
function prescriptionOf(slot: SeedSlot): ExercisePrescription {
  const block = blockPrescription(START_BLOCK, slot.role);
  return {
    sets: block.sets,
    repRange: { ...block.repRange },
    targetRIR: { ...block.targetRIR },
    restSeconds: slot.restSeconds,
  };
}

/**
 * The plan rows to write: a new value on every call, in rotation order, with the ids the
 * store is keyed by. Calling it twice produces two equal (never the same) values, which is
 * what makes the first-run write idempotent — the ids are these, not a random id factory.
 */
export function seedPlanDays(): readonly SeedPlanDay[] {
  return DAYS.map((day, dayIndex) => {
    const planDayId = `seed-day-${day.key}`;
    return {
      id: planDayId,
      name: day.name,
      order: dayIndex,
      items: day.slots.map((slot, itemIndex) => ({
        id: `seed-item-${day.key}-${String(itemIndex + 1)}`,
        planDayId,
        order: itemIndex,
        exerciseId: slot.exerciseId,
        exerciseNameSnapshot: nameOf(slot.exerciseId),
        prescription: prescriptionOf(slot),
      })),
    };
  });
}

export interface SeedRows {
  readonly exercises: typeof SEED_EXERCISES;
  readonly planDays: readonly SeedPlanDay[];
}

/**
 * The one pure function the first-run flow calls: the library and the plan, in the order
 * they have to be written (the plan names library ids, so the library comes first). The
 * library rows are the module's own (readonly) values; the plan rows are rebuilt on every
 * call, so nothing a caller does to a day can leak into the next launch.
 */
export function seedRows(): SeedRows {
  return { exercises: SEED_EXERCISES, planDays: seedPlanDays() };
}
