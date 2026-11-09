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
 * The optional library detail of T3: what the movement also works, how to execute it,
 * which generic movement it is a variant of, and what can replace it when a machine is
 * busy (odd/tasks/training-program.md S4–S5).
 *
 * It is a second table and not four more columns of `ROWS` for one reason: the table above
 * is the vocabulary the pickers read (id, name, muscle, pattern, equipment) and stays
 * scannable, while this one is prose about the owner's exercises. A row that is not here
 * is a complete exercise row: the four fields are optional everywhere, so an entry is
 * added when there is something truthful to say, never to fill a column.
 *
 * The rule for `alternatives` is the one S5 asks for: same movement pattern and same
 * primary muscle, so the swap keeps what the slot trains and only the implement changes —
 * a machine for a dumbbell, a barbell for a plate stack. No exercise is its own
 * alternative, every id below exists in `ROWS`, and a family with a single sibling (the
 * two Copenhagen planks, the two lateral raises, the two triceps extensions) honestly
 * offers one alternative instead of padding the list with a different movement.
 */
interface SeedExerciseDetail {
  /** The inline pictogram of this concrete variant (training-flow S3, T4). */
  readonly illustration?: string;
  readonly secondaryMuscles?: readonly MuscleGroup[];
  /** How to execute it, naming the machine or the implement (S4). */
  readonly description: string;
  /** The generic movement this row is a variant of, by `ROWS` id. */
  readonly variantOf?: string;
  /** Same pattern, same primary muscle, different implement (S5). */
  readonly alternatives?: readonly string[];
}

const DETAIL: Readonly<Record<string, SeedExerciseDetail>> = {
  // ------------------------------------------------------------------- squat
  'seed-ex-sentadilla-trasera': {
    illustration: 'squat-back',
    secondaryMuscles: ['glutes', 'hamstrings', 'core'],
    description:
      'Con la barra en la jaula apoyada sobre los trapecios y los pies a la anchura de los hombros, baja flexionando caderas y rodillas hasta que el muslo pase la paralela y sube empujando el suelo con los pies.',
    alternatives: ['seed-ex-sentadilla-frontal', 'seed-ex-hack-squat', 'seed-ex-prensa'],
  },
  'seed-ex-sentadilla-frontal': {
    illustration: 'squat-front',
    secondaryMuscles: ['glutes', 'upperBack', 'core'],
    description:
      'Con la barra en la jaula apoyada en la parte delantera de los hombros y los codos altos, baja manteniendo el tronco vertical y sube sin que la barra se vaya hacia delante.',
    alternatives: ['seed-ex-sentadilla-trasera', 'seed-ex-hack-squat', 'seed-ex-sentadilla-goblet'],
  },
  'seed-ex-prensa': {
    illustration: 'leg-press',
    secondaryMuscles: ['glutes', 'hamstrings'],
    description:
      'Sentado en la prensa de placas con los pies en la plataforma, baja hasta que las rodillas se acerquen al pecho y empuja con los talones sin bloquear las rodillas de golpe.',
    alternatives: ['seed-ex-hack-squat', 'seed-ex-sentadilla-goblet', 'seed-ex-sentadilla-peso-corporal'],
  },
  'seed-ex-hack-squat': {
    illustration: 'hack-squat',
    secondaryMuscles: ['glutes', 'hamstrings'],
    description:
      'En la máquina de hack squat, con la espalda y la cadera apoyadas en el respaldo y los pies en la plataforma, baja con control hasta donde llegues sin despegar la espalda y empuja con los talones.',
    alternatives: ['seed-ex-prensa', 'seed-ex-sentadilla-trasera', 'seed-ex-sentadilla-goblet'],
  },
  'seed-ex-sentadilla-goblet': {
    illustration: 'squat-goblet',
    secondaryMuscles: ['glutes', 'core', 'upperBack'],
    description:
      'Sujeta una mancuerna con las dos manos a la altura del pecho, baja sentando las caderas entre los pies hasta donde la espalda se mantenga neutra y sube empujando con los talones.',
    alternatives: ['seed-ex-sentadilla-peso-corporal', 'seed-ex-prensa', 'seed-ex-sentadilla-trasera'],
  },
  'seed-ex-sentadilla-peso-corporal': {
    illustration: 'squat-bodyweight',
    secondaryMuscles: ['glutes', 'core'],
    description:
      'Sin material, con los pies a la anchura de los hombros, baja llevando las caderas atrás y las rodillas hacia fuera hasta donde controles y sube sin perder la curva lumbar.',
    alternatives: ['seed-ex-sentadilla-goblet', 'seed-ex-prensa'],
  },

  // ------------------------------------------------------------------- hinge
  'seed-ex-peso-muerto': {
    illustration: 'deadlift-barbell',
    secondaryMuscles: ['glutes', 'lowerBack', 'upperBack', 'forearms'],
    description:
      'Con la barra en el suelo pegada a las espinillas y el peso del cuerpo sobre el mediopié, empuja el suelo con las piernas y sube hasta ponerte de pie con la barra rozando los muslos.',
    alternatives: ['seed-ex-peso-muerto-rumano', 'seed-ex-peso-muerto-una-pierna'],
  },
  'seed-ex-peso-muerto-rumano': {
    illustration: 'rdl-barbell',
    secondaryMuscles: ['glutes', 'lowerBack', 'upperBack', 'forearms'],
    description:
      'De pie con la barra en las manos delante de los muslos, lleva las caderas atrás y baja la barra pegada a las piernas hasta donde la espalda siga recta; vuelve estirando la cadera.',
    alternatives: ['seed-ex-peso-muerto', 'seed-ex-peso-muerto-una-pierna'],
  },
  'seed-ex-peso-muerto-una-pierna': {
    secondaryMuscles: ['glutes', 'core'],
    description:
      'Con una mancuerna en la mano contraria a la pierna de apoyo, inclina el tronco llevando la pierna libre atrás y baja el peso por delante de la pierna de apoyo; sube apretando el glúteo.',
    alternatives: ['seed-ex-peso-muerto-rumano', 'seed-ex-peso-muerto'],
  },
  'seed-ex-nordic-asistido': {
    illustration: 'nordic-curl',
    secondaryMuscles: ['glutes', 'core'],
    description:
      'De rodillas sobre una colchoneta y con los tobillos sujetos por una barra o por un compañero, baja el tronco hacia delante tan lento como puedas y apoya las manos para volver con ayuda de los brazos.',
    alternatives: ['seed-ex-peso-muerto-rumano', 'seed-ex-peso-muerto-una-pierna'],
  },

  // ------------------------------------------------------ preventive: groin
  'seed-ex-copenhagen-adaptado': {
    illustration: 'copenhagen-knee',
    secondaryMuscles: ['core', 'glutes'],
    description:
      'Tumbado de lado con la rodilla de arriba apoyada en un banco y el codo en el suelo bajo el hombro, levanta la cadera y mantén la línea del cuerpo; la versión con la rodilla apoyada es la que se empieza.',
    variantOf: 'seed-ex-copenhagen',
    alternatives: ['seed-ex-copenhagen'],
  },
  'seed-ex-copenhagen': {
    secondaryMuscles: ['core', 'glutes'],
    description:
      'Tumbado de lado con el tobillo de arriba apoyado en un banco y el codo en el suelo bajo el hombro, levanta la cadera hasta alinear el cuerpo y mantenla sin que la pelvis caiga.',
    alternatives: ['seed-ex-copenhagen-adaptado'],
  },

  // ------------------------------------------------- isolation: herringbone
  'seed-ex-curl-femoral': {
    illustration: 'leg-curl-lying',
    secondaryMuscles: ['calves'],
    description:
      'Tumbado boca abajo en la máquina de curl femoral con el rodillo sobre los tobillos, flexiona las rodillas hasta acercar los talones a los glúteos y baja el peso con control.',
    alternatives: ['seed-ex-curl-femoral-sentado', 'seed-ex-curl-femoral-mancuerna'],
  },
  'seed-ex-curl-femoral-sentado': {
    illustration: 'leg-curl-seated',
    secondaryMuscles: ['calves'],
    description:
      'Sentado en la máquina de curl femoral con el rodillo sobre el empeine y los muslos sujetos por la almohadilla, flexiona las rodillas hasta donde llegues y sube el peso sin despegar la espalda del respaldo.',
    variantOf: 'seed-ex-curl-femoral',
    alternatives: ['seed-ex-curl-femoral', 'seed-ex-curl-femoral-mancuerna'],
  },
  'seed-ex-curl-femoral-mancuerna': {
    secondaryMuscles: ['calves'],
    description:
      'Tumbado boca abajo en un banco plano con una mancuerna sujeta entre los dos pies, flexiona las rodillas hasta acercarla a los glúteos y baja el peso despacio.',
    variantOf: 'seed-ex-curl-femoral',
    alternatives: ['seed-ex-curl-femoral', 'seed-ex-curl-femoral-sentado'],
  },

  // ---------------------------------------------------- isolation: calves
  'seed-ex-gemelos': {
    illustration: 'calf-raise-machine',
    description:
      'De pie en la máquina de gemelos con los hombros bajo las almohadillas y la punta de los pies en el borde del reposapiés, sube los talones hasta ponerte de puntillas y baja el talón hasta notar el estiramiento.',
    alternatives: ['seed-ex-gemelos-prensa', 'seed-ex-gemelos-mancuerna'],
  },
  'seed-ex-gemelos-prensa': {
    illustration: 'calf-raise-press',
    description:
      'Sentado en la prensa con la punta de los pies en el borde de la plataforma, empuja con los dedos hasta extender los tobillos y baja el talón con control sin mover las rodillas.',
    alternatives: ['seed-ex-gemelos', 'seed-ex-gemelos-mancuerna'],
  },
  'seed-ex-gemelos-mancuerna': {
    illustration: 'calf-raise-dumbbell',
    description:
      'De pie sobre la punta de los pies con una mancuerna en la mano libre y la otra mano apoyada en la máquina para el equilibrio, sube los talones y baja el talón despacio.',
    variantOf: 'seed-ex-gemelos',
    alternatives: ['seed-ex-gemelos', 'seed-ex-gemelos-prensa'],
  },
  'seed-ex-soleo-sentado': {
    illustration: 'calf-raise-seated',
    description:
      'Sentado en la máquina de sóleo con las almohadillas sobre los muslos y la punta de los pies en el reposapiés, sube los talones y baja hasta el final del recorrido con las rodillas flexionadas.',
    alternatives: ['seed-ex-gemelos', 'seed-ex-gemelos-prensa'],
  },

  // -------------------------------------------------------- horizontal push
  'seed-ex-press-banca': {
    illustration: 'bench-press',
    secondaryMuscles: ['triceps', 'shoulders'],
    description:
      'Tumbado en el banco plano con los pies apoyados y la barra sobre el pecho, baja la barra al esternón con los codos algo cerrados y empuja hasta extender los brazos sin rebotar.',
    alternatives: ['seed-ex-press-pecho-maquina', 'seed-ex-press-inclinado-mancuernas', 'seed-ex-flexiones'],
  },
  'seed-ex-press-banca-inclinado': {
    illustration: 'incline-press-barbell',
    secondaryMuscles: ['shoulders', 'triceps'],
    description:
      'Con el banco inclinado dentro de la jaula y la barra sobre la parte alta del pecho, baja la barra con los omóplatos apoyados y empuja hasta estirar los brazos.',
    alternatives: ['seed-ex-press-inclinado-mancuernas', 'seed-ex-press-banca', 'seed-ex-press-pecho-maquina'],
  },
  'seed-ex-press-inclinado-mancuernas': {
    illustration: 'incline-press-dumbbell',
    secondaryMuscles: ['shoulders', 'triceps'],
    description:
      'En un banco inclinado con una mancuerna en cada mano a la altura del pecho, empuja hacia arriba sin juntar las mancuernas y baja hasta donde el hombro aguante.',
    alternatives: ['seed-ex-press-banca', 'seed-ex-press-pecho-maquina', 'seed-ex-flexiones'],
  },
  'seed-ex-press-pecho-maquina': {
    illustration: 'chest-press-machine',
    secondaryMuscles: ['triceps', 'shoulders'],
    description:
      'Sentado en la máquina de press de pecho con los agarres a la altura del esternón, empuja hacia delante hasta estirar los codos y vuelve despacio sin dejar que el peso choque.',
    alternatives: ['seed-ex-press-banca', 'seed-ex-press-inclinado-mancuernas', 'seed-ex-flexiones'],
  },
  'seed-ex-flexiones': {
    illustration: 'push-up',
    secondaryMuscles: ['triceps', 'shoulders', 'core'],
    description:
      'Con las manos en el suelo algo más anchas que los hombros y el cuerpo en línea, baja el pecho hasta rozar el suelo y empuja sin que la cadera se hunda.',
    alternatives: ['seed-ex-press-pecho-maquina', 'seed-ex-press-banca'],
  },
  'seed-ex-fondos': {
    secondaryMuscles: ['chest', 'shoulders'],
    description:
      'En las paralelas, con los brazos extendidos y el tronco ligeramente inclinado, baja flexionando los codos hasta que los hombros queden por debajo de ellos y sube sin balancearte.',
  },

  // ---------------------------------------------------------- vertical push
  'seed-ex-press-militar': {
    illustration: 'shoulder-press-barbell',
    secondaryMuscles: ['triceps', 'upperBack', 'core'],
    description:
      'De pie con la barra saliendo de la jaula a la altura de los hombros y el abdomen apretado, empuja la barra por encima de la cabeza y bájala con control hasta la barbilla.',
    alternatives: ['seed-ex-press-hombro', 'seed-ex-press-hombro-maquina'],
  },
  'seed-ex-press-hombro': {
    illustration: 'shoulder-press-dumbbell',
    secondaryMuscles: ['triceps', 'upperBack'],
    description:
      'Sentado en un banco con respaldo y una mancuerna en cada mano a la altura de los hombros, empuja hacia arriba y baja hasta la altura de las orejas sin arquear la espalda.',
    alternatives: ['seed-ex-press-militar', 'seed-ex-press-hombro-maquina'],
  },
  'seed-ex-press-hombro-maquina': {
    illustration: 'shoulder-press-machine',
    secondaryMuscles: ['triceps'],
    description:
      'Sentado en la máquina de press de hombro con la espalda apoyada, empuja los agarres por encima de la cabeza y vuelve con control hasta la altura de los hombros.',
    alternatives: ['seed-ex-press-hombro', 'seed-ex-press-militar'],
  },

  // -------------------------------------------------------- horizontal pull
  'seed-ex-remo-barra': {
    illustration: 'row-barbell',
    secondaryMuscles: ['lats', 'biceps', 'lowerBack'],
    description:
      'Con la barra saliendo de la jaula a la altura de las rodillas, inclina el tronco con la espalda recta, tira de la barra hacia el abdomen y bájala controlando el recorrido.',
    alternatives: ['seed-ex-remo-maquina', 'seed-ex-remo-polea', 'seed-ex-remo-banda'],
  },
  'seed-ex-remo-polea': {
    illustration: 'row-cable',
    secondaryMuscles: ['lats', 'biceps'],
    description:
      'Sentado en la polea baja con los pies en la plataforma y las rodillas algo flexionadas, tira del agarre hacia el abdomen llevando los codos atrás y vuelve estirando los brazos.',
    alternatives: ['seed-ex-remo-maquina', 'seed-ex-remo-banda', 'seed-ex-remo-barra'],
  },
  'seed-ex-remo-maquina': {
    illustration: 'row-machine',
    secondaryMuscles: ['lats', 'biceps'],
    description:
      'Sentado en la máquina de remo con el pecho apoyado en el respaldo, tira de los agarres hacia el torso y vuelve despacio hasta estirar los brazos sin separar el pecho.',
    alternatives: ['seed-ex-remo-polea', 'seed-ex-remo-barra', 'seed-ex-remo-banda'],
  },
  'seed-ex-remo-banda': {
    illustration: 'row-band',
    secondaryMuscles: ['lats', 'biceps'],
    description:
      'Con una banda elástica anclada a la altura del pecho, tira de los extremos hacia el torso llevando los codos atrás y vuelve controlando la banda hasta estirar los brazos.',
    alternatives: ['seed-ex-remo-polea', 'seed-ex-remo-maquina'],
  },
  'seed-ex-espalda-alta': {
    secondaryMuscles: ['lats', 'biceps'],
    description:
      'Sentado en la máquina con el pecho apoyado y los brazos extendidos hacia delante, tira llevando los codos atrás y abajo sin flexionarlos y vuelve con control.',
    alternatives: ['seed-ex-remo-maquina', 'seed-ex-remo-polea'],
  },
  'seed-ex-face-pull': {
    illustration: 'face-pull',
    secondaryMuscles: ['upperBack'],
    description:
      'De pie frente a la polea alta con la cuerda, tira hacia la cara separando las manos a la altura de los ojos y mantén los codos altos durante todo el recorrido.',
  },

  // ---------------------------------------------------------- vertical pull
  'seed-ex-jalon-pecho': {
    illustration: 'lat-pulldown',
    secondaryMuscles: ['upperBack', 'biceps'],
    description:
      'Sentado en la máquina de jalón con los muslos bajo las almohadillas, tira de la barra al pecho llevando los codos abajo y deja subir los brazos sin soltar la barra de golpe.',
    alternatives: ['seed-ex-dominadas-asistidas', 'seed-ex-dominadas'],
  },
  'seed-ex-dominadas-asistidas': {
    illustration: 'assisted-pull-up',
    secondaryMuscles: ['upperBack', 'biceps'],
    description:
      'En la máquina de dominadas asistidas, elige la ayuda en el selector, tira hasta pasar la barbilla por el agarre y baja controlando la subida del cuerpo.',
    variantOf: 'seed-ex-dominadas',
    alternatives: ['seed-ex-jalon-pecho', 'seed-ex-dominadas'],
  },
  'seed-ex-dominadas': {
    illustration: 'pull-up',
    secondaryMuscles: ['upperBack', 'biceps', 'core'],
    description:
      'Colgado de la barra de dominadas con las palmas hacia delante, tira hasta pasar la barbilla por encima de la barra y baja hasta estirar los brazos.',
    alternatives: ['seed-ex-dominadas-asistidas', 'seed-ex-jalon-pecho'],
  },

  // ------------------------------------------- isolation: shoulders and arms
  'seed-ex-elevaciones-laterales': {
    illustration: 'lateral-raise-dumbbell',
    secondaryMuscles: ['upperBack'],
    description:
      'De pie con una mancuerna en cada mano y los codos algo flexionados, sube los brazos por los lados hasta la altura de los hombros y bájalos con control sin balancear el tronco.',
    alternatives: ['seed-ex-elevaciones-laterales-polea'],
  },
  'seed-ex-elevaciones-laterales-polea': {
    illustration: 'lateral-raise-cable',
    secondaryMuscles: ['upperBack'],
    description:
      'De pie de lado a la polea baja con el asa en la mano más lejana, sube el brazo por el lateral hasta la altura del hombro y bájalo controlando el peso.',
    alternatives: ['seed-ex-elevaciones-laterales'],
  },
  'seed-ex-extensiones-triceps': {
    illustration: 'triceps-pushdown',
    description:
      'De pie frente a la polea alta con la cuerda, mantén los codos pegados al torso y extiende los brazos hasta abajo del todo; vuelve sin separar los codos.',
    alternatives: ['seed-ex-extension-triceps-mancuerna'],
  },
  'seed-ex-extension-triceps-mancuerna': {
    illustration: 'triceps-overhead-dumbbell',
    description:
      'Sentado en un banco con una mancuerna sujeta con las dos manos por encima de la cabeza, baja el peso por detrás de la nuca y extiende los codos sin mover los brazos.',
    alternatives: ['seed-ex-extensiones-triceps'],
  },
  'seed-ex-curl-biceps': {
    illustration: 'curl-dumbbell',
    secondaryMuscles: ['forearms'],
    description:
      'De pie con una mancuerna en cada mano y los brazos estirados, flexiona los codos girando la palma hacia arriba y baja despacio hasta estirar el brazo.',
    alternatives: ['seed-ex-curl-barra', 'seed-ex-curl-polea'],
  },
  'seed-ex-curl-barra': {
    illustration: 'curl-barbell',
    secondaryMuscles: ['forearms'],
    description:
      'De pie con la barra en las manos y los codos junto al torso, flexiona los codos hasta la altura del pecho y baja la barra sin balancear la espalda.',
    alternatives: ['seed-ex-curl-biceps', 'seed-ex-curl-polea'],
  },
  'seed-ex-curl-polea': {
    illustration: 'curl-cable',
    secondaryMuscles: ['forearms'],
    description:
      'De pie frente a la polea baja con la barra recta, flexiona los codos sin separarlos del torso y deja subir el peso con control.',
    alternatives: ['seed-ex-curl-biceps', 'seed-ex-curl-barra'],
  },
};

/**
 * The library as `exercises.save` receives it. Built once at module load; every row is
 * `readonly`, so a caller can copy a row but cannot write through it.
 *
 * The detail is added field by field instead of by spreading a memo, because
 * `exactOptionalPropertyTypes` forbids an explicit `undefined`: a row without detail must
 * come out exactly as it did before T3, with the four keys absent.
 */
function seedExercise(row: SeedExerciseRow, detail: SeedExerciseDetail | undefined): Exercise {
  const base: Exercise = {
    id: row.id,
    name: row.name,
    primaryMuscle: row.primaryMuscle,
    pattern: row.pattern,
    equipment: row.equipment,
    loadIncrementKg: row.loadIncrementKg ?? EQUIPMENT_INCREMENT_KG[row.equipment],
    isCustom: false,
    isArchived: false,
  };
  if (detail === undefined) return base;

  const withMuscles: Exercise =
    detail.secondaryMuscles === undefined
      ? base
      : { ...base, secondaryMuscles: detail.secondaryMuscles };
  const withVariant: Exercise =
    detail.variantOf === undefined
      ? withMuscles
      : { ...withMuscles, variantOf: detail.variantOf };
  const withAlternatives: Exercise =
    detail.alternatives === undefined
      ? withVariant
      : { ...withVariant, alternatives: detail.alternatives };
  const withDescription: Exercise = { ...withAlternatives, description: detail.description };
  return detail.illustration === undefined
    ? withDescription
    : { ...withDescription, illustration: detail.illustration };
}

export const SEED_EXERCISES: readonly Exercise[] = ROWS.map((row) =>
  seedExercise(row, DETAIL[row.id]),
);

/** The library indexed by id, so the plan can refuse an exercise that does not exist. */
export function seedExerciseById(id: string): Exercise | undefined {
  return SEED_EXERCISES.find((exercise) => exercise.id === id);
}
