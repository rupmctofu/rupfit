/**
 * The built-in exercise library — FR-2.1, data-model §3 (`Exercise`).
 *
 * Plain data: no clock, no port, no React, nothing to await. It is written once, read by
 * the first-run flow (`src/features/onboarding`) and written through `exercises.save`,
 * so a fresh install has something to prescribe before the owner has created anything.
 *
 * **The increment is a property of the implement, not of the exercise.** Training science
 * §8 (DD) says so in one line — "barbell 2.5 kg, dumbbell 2 × 1 kg or 2 × 2 kg depending
 * on the rack, machine per plate stack, cable 2.5 kg, bodyweight 0 with rep progression
 * only" — so the number is derived from `equipment` by `EQUIPMENT_INCREMENT_KG` and a row
 * only overrides it when a single implement inside the same family really differs. That
 * is why the assertions in `seed.test.ts` can be a table: an exercise is what it is made
 * of, and the step follows from that.
 *
 * **The library is bigger than the starter plan on purpose.** FR-3.3 lets the owner
 * substitute an exercise, and a library with exactly the eighteen prescribed rows has no
 * alternative to offer; FR-2.1 asks for at least forty, covering every movement pattern,
 * with equipment from a barbell to a band and a bodyweight option wherever a bodyweight
 * option is honest. None of them is a claim about programming: they are the vocabulary.
 */

import type { Equipment, Exercise, MovementPattern, MuscleGroup } from '../domain';

/**
 * training-science §8 (DD): "Increments are per exercise and per equipment, not a global
 * 2.5 kg". The two numbers the document fixes literally are the barbell's 2.5 kg and the
 * bodyweight's 0; the rest are the smallest step the implement actually has.
 *
 * - `barbell: 2.5` — 2 × 1.25 kg, the smallest pair of plates every gym has.
 * - `machine / cable: 2.5` — the step of a plate stack (§8: "machine per plate stack").
 *   A 5 kg step would be a 10–15 % jump on a light accessory, which §8 rejects as the
 *   reason a universal step fails.
 * - `dumbbell: 2` — §8 allows 2 × 1 kg or 2 × 2 kg "depending on the rack"; the 2 × 1 kg
 *   rack is the one that exists everywhere, and 2 kg on a 14 kg curl is a real step while
 *   4 kg would not be.
 * - `bodyweight / band: 0` — no weight arithmetic at all: the engine progresses
 *   repetitions only (§6 of the progression specification).
 */
export const EQUIPMENT_INCREMENT_KG: Readonly<Record<Equipment, number>> = {
  barbell: 2.5,
  machine: 2.5,
  cable: 2.5,
  dumbbell: 2,
  bodyweight: 0,
  band: 0,
};

/** A library row before the two flags every seeded row shares are filled in. */
interface SeedExerciseRow {
  readonly id: string;
  readonly name: string;
  readonly primaryMuscle: MuscleGroup;
  readonly pattern: MovementPattern;
  readonly equipment: Equipment;
  /** Set only when this implement inside the family has a different real step. */
  readonly loadIncrementKg?: number;
}

/**
 * Ordered squat → hinge → push → pull → isolation → core, and inside each family from the
 * heaviest implement to the lightest. The order is the reading order of the file and the
 * order a picker shows; nothing decides on it.
 *
 * Names are the owner's language (Spanish, §12 "identifiers in English, copy in Spanish"):
 * `Sentadilla trasera` is the primary lift FR-3.1 names verbatim.
 */
const ROWS: readonly SeedExerciseRow[] = [
  // ---------------------------------------------------------------- squat
  { id: 'seed-ex-sentadilla-trasera', name: 'Sentadilla trasera', primaryMuscle: 'quadriceps', pattern: 'squat', equipment: 'barbell' },
  { id: 'seed-ex-sentadilla-frontal', name: 'Sentadilla frontal', primaryMuscle: 'quadriceps', pattern: 'squat', equipment: 'barbell' },
  { id: 'seed-ex-prensa', name: 'Prensa', primaryMuscle: 'quadriceps', pattern: 'squat', equipment: 'machine' },
  { id: 'seed-ex-hack-squat', name: 'Hack squat', primaryMuscle: 'quadriceps', pattern: 'squat', equipment: 'machine' },
  { id: 'seed-ex-sentadilla-goblet', name: 'Sentadilla goblet', primaryMuscle: 'quadriceps', pattern: 'squat', equipment: 'dumbbell' },
  { id: 'seed-ex-zancadas', name: 'Zancadas', primaryMuscle: 'glutes', pattern: 'squat', equipment: 'dumbbell' },
  { id: 'seed-ex-sentadilla-bulgara', name: 'Sentadilla búlgara', primaryMuscle: 'glutes', pattern: 'squat', equipment: 'dumbbell' },
  { id: 'seed-ex-sentadilla-peso-corporal', name: 'Sentadilla con peso corporal', primaryMuscle: 'quadriceps', pattern: 'squat', equipment: 'bodyweight' },

  // ---------------------------------------------------------------- hinge
  { id: 'seed-ex-peso-muerto', name: 'Peso muerto convencional', primaryMuscle: 'hamstrings', pattern: 'hinge', equipment: 'barbell' },
  { id: 'seed-ex-peso-muerto-rumano', name: 'Peso muerto rumano con barra', primaryMuscle: 'hamstrings', pattern: 'hinge', equipment: 'barbell' },
  { id: 'seed-ex-peso-muerto-sumo', name: 'Peso muerto sumo', primaryMuscle: 'glutes', pattern: 'hinge', equipment: 'barbell' },
  { id: 'seed-ex-hip-thrust', name: 'Hip thrust', primaryMuscle: 'glutes', pattern: 'hinge', equipment: 'barbell' },
  { id: 'seed-ex-peso-muerto-una-pierna', name: 'Peso muerto a una pierna', primaryMuscle: 'hamstrings', pattern: 'hinge', equipment: 'dumbbell' },
  { id: 'seed-ex-puente-gluteos', name: 'Puente de glúteos', primaryMuscle: 'glutes', pattern: 'hinge', equipment: 'bodyweight' },

  // ------------------------- preventive: hamstrings and adductors (owner's programme)
  { id: 'seed-ex-nordic-asistido', name: 'Nordic curl asistido', primaryMuscle: 'hamstrings', pattern: 'hinge', equipment: 'bodyweight' },
  { id: 'seed-ex-copenhagen-adaptado', name: 'Copenhagen plank adaptado', primaryMuscle: 'adductors', pattern: 'core', equipment: 'bodyweight' },
  { id: 'seed-ex-copenhagen', name: 'Copenhagen plank', primaryMuscle: 'adductors', pattern: 'core', equipment: 'bodyweight' },

  // ------------------------------------------------------- horizontal push
  { id: 'seed-ex-press-banca', name: 'Press banca', primaryMuscle: 'chest', pattern: 'horizontalPush', equipment: 'barbell' },
  { id: 'seed-ex-press-banca-inclinado', name: 'Press banca inclinado', primaryMuscle: 'chest', pattern: 'horizontalPush', equipment: 'barbell' },
  { id: 'seed-ex-press-inclinado-mancuernas', name: 'Press inclinado con mancuernas', primaryMuscle: 'chest', pattern: 'horizontalPush', equipment: 'dumbbell' },
  { id: 'seed-ex-press-pecho-maquina', name: 'Press de pecho en máquina', primaryMuscle: 'chest', pattern: 'horizontalPush', equipment: 'machine' },
  { id: 'seed-ex-fondos', name: 'Fondos en paralelas', primaryMuscle: 'triceps', pattern: 'horizontalPush', equipment: 'bodyweight' },
  { id: 'seed-ex-flexiones', name: 'Flexiones', primaryMuscle: 'chest', pattern: 'horizontalPush', equipment: 'bodyweight' },

  // --------------------------------------------------------- vertical push
  { id: 'seed-ex-press-militar', name: 'Press militar', primaryMuscle: 'shoulders', pattern: 'verticalPush', equipment: 'barbell' },
  { id: 'seed-ex-press-hombro', name: 'Press de hombro', primaryMuscle: 'shoulders', pattern: 'verticalPush', equipment: 'dumbbell' },
  { id: 'seed-ex-press-hombro-maquina', name: 'Press de hombro en máquina', primaryMuscle: 'shoulders', pattern: 'verticalPush', equipment: 'machine' },

  // ------------------------------------------------------- horizontal pull
  { id: 'seed-ex-remo-barra', name: 'Remo con barra', primaryMuscle: 'upperBack', pattern: 'horizontalPull', equipment: 'barbell' },
  { id: 'seed-ex-remo-mancuerna', name: 'Remo con mancuerna', primaryMuscle: 'lats', pattern: 'horizontalPull', equipment: 'dumbbell' },
  { id: 'seed-ex-remo-polea', name: 'Remo en polea sentado', primaryMuscle: 'upperBack', pattern: 'horizontalPull', equipment: 'cable' },
  { id: 'seed-ex-remo-maquina', name: 'Remo en máquina', primaryMuscle: 'upperBack', pattern: 'horizontalPull', equipment: 'machine' },
  { id: 'seed-ex-remo-banda', name: 'Remo con banda', primaryMuscle: 'upperBack', pattern: 'horizontalPull', equipment: 'band' },
  { id: 'seed-ex-face-pull', name: 'Face pull', primaryMuscle: 'shoulders', pattern: 'horizontalPull', equipment: 'cable' },
  { id: 'seed-ex-espalda-alta', name: 'Espalda alta', primaryMuscle: 'upperBack', pattern: 'horizontalPull', equipment: 'machine' },

  // --------------------------------------------------------- vertical pull
  { id: 'seed-ex-jalon-pecho', name: 'Jalón al pecho', primaryMuscle: 'lats', pattern: 'verticalPull', equipment: 'cable' },
  { id: 'seed-ex-dominadas-asistidas', name: 'Dominadas asistidas', primaryMuscle: 'lats', pattern: 'verticalPull', equipment: 'machine' },
  { id: 'seed-ex-dominadas', name: 'Dominadas', primaryMuscle: 'lats', pattern: 'verticalPull', equipment: 'bodyweight' },

  // ------------------------------------------- isolation: legs and lower back
  { id: 'seed-ex-extension-cuadriceps', name: 'Extensión de cuádriceps', primaryMuscle: 'quadriceps', pattern: 'isolation', equipment: 'machine' },
  { id: 'seed-ex-curl-femoral', name: 'Curl femoral tumbado en máquina', primaryMuscle: 'hamstrings', pattern: 'isolation', equipment: 'machine' },
  { id: 'seed-ex-curl-femoral-sentado', name: 'Curl femoral sentado en máquina', primaryMuscle: 'hamstrings', pattern: 'isolation', equipment: 'machine' },
  { id: 'seed-ex-gemelos-prensa', name: 'Elevación de gemelos en prensa', primaryMuscle: 'calves', pattern: 'isolation', equipment: 'machine' },
  { id: 'seed-ex-soleo-sentado', name: 'Elevación de sóleo sentado', primaryMuscle: 'calves', pattern: 'isolation', equipment: 'machine' },
  { id: 'seed-ex-curl-femoral-mancuerna', name: 'Curl femoral con mancuerna', primaryMuscle: 'hamstrings', pattern: 'isolation', equipment: 'dumbbell' },
  { id: 'seed-ex-gemelos', name: 'Elevación de gemelos de pie en máquina', primaryMuscle: 'calves', pattern: 'isolation', equipment: 'machine' },
  { id: 'seed-ex-gemelos-mancuerna', name: 'Elevación de gemelos de pie con mancuerna', primaryMuscle: 'calves', pattern: 'isolation', equipment: 'dumbbell' },
  { id: 'seed-ex-hiperextension', name: 'Hiperextensión en banco', primaryMuscle: 'lowerBack', pattern: 'isolation', equipment: 'machine' },

  // ------------------------------------------- isolation: shoulders and arms
  { id: 'seed-ex-elevaciones-laterales', name: 'Elevaciones laterales', primaryMuscle: 'shoulders', pattern: 'isolation', equipment: 'dumbbell' },
  { id: 'seed-ex-elevaciones-laterales-polea', name: 'Elevaciones laterales en polea', primaryMuscle: 'shoulders', pattern: 'isolation', equipment: 'cable' },
  { id: 'seed-ex-extensiones-triceps', name: 'Extensiones de tríceps', primaryMuscle: 'triceps', pattern: 'isolation', equipment: 'cable' },
  { id: 'seed-ex-extension-triceps-mancuerna', name: 'Extensión de tríceps sobre la cabeza', primaryMuscle: 'triceps', pattern: 'isolation', equipment: 'dumbbell' },
  { id: 'seed-ex-curl-biceps', name: 'Curl de bíceps', primaryMuscle: 'biceps', pattern: 'isolation', equipment: 'dumbbell' },
  { id: 'seed-ex-curl-barra', name: 'Curl de bíceps con barra', primaryMuscle: 'biceps', pattern: 'isolation', equipment: 'barbell' },
  { id: 'seed-ex-curl-polea', name: 'Curl en polea', primaryMuscle: 'biceps', pattern: 'isolation', equipment: 'cable' },
  { id: 'seed-ex-curl-muneca', name: 'Curl de muñeca', primaryMuscle: 'forearms', pattern: 'isolation', equipment: 'dumbbell' },

  // ------------------------------------------------------------------ core
  { id: 'seed-ex-crunch-polea', name: 'Crunch en polea', primaryMuscle: 'core', pattern: 'core', equipment: 'cable' },
  { id: 'seed-ex-plancha', name: 'Plancha', primaryMuscle: 'core', pattern: 'core', equipment: 'bodyweight' },
  { id: 'seed-ex-elevacion-piernas', name: 'Elevación de piernas colgado', primaryMuscle: 'core', pattern: 'core', equipment: 'bodyweight' },
  { id: 'seed-ex-rueda-abdominal', name: 'Rueda abdominal', primaryMuscle: 'core', pattern: 'core', equipment: 'bodyweight' },
  { id: 'seed-ex-pallof-press', name: 'Pallof press', primaryMuscle: 'core', pattern: 'core', equipment: 'cable' },
];

/**
 * The library as `exercises.save` receives it. Built once at module load; every row is
 * `readonly`, so a caller can copy a row but cannot write through it.
 */
export const SEED_EXERCISES: readonly Exercise[] = ROWS.map((row) => ({
  id: row.id,
  name: row.name,
  primaryMuscle: row.primaryMuscle,
  pattern: row.pattern,
  equipment: row.equipment,
  loadIncrementKg: row.loadIncrementKg ?? EQUIPMENT_INCREMENT_KG[row.equipment],
  isCustom: false,
  isArchived: false,
}));

/** The library indexed by id, so the plan can refuse an exercise that does not exist. */
export function seedExerciseById(id: string): Exercise | undefined {
  return SEED_EXERCISES.find((exercise) => exercise.id === id);
}
