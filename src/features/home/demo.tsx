/*
 * The T5 demo fixtures — one week of plausible training, in memory only.
 *
 * Review surface, not product: `?demo=inicio#/inicio`, `?demo=entrenar#/entrenar` and
 * `#/resumen/demo`
 * mount the real screens over this port, so every state of the design's Inicio,
 * Entrenar and Resumen rows can be seen on the phone before a single session exists in
 * the real store. It never opens IndexedDB: the port is `createFakeStorage` with three
 * read overrides, which is also what proves the screens only know `StoragePort`.
 *
 * The three feature folders are the whole edit surface of T5, so the shared fixtures live
 * here, in the first screen that needs them, instead of being copied three times.
 */

import { createFakeStorage } from '../session/fake-port';
import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  ExerciseSession,
  PlanDay,
  SetRecord,
  StoragePort,
  UserProfile,
  WorkoutSession,
} from '../../storage';
import type { PhaseState, RepRange } from '../../core/domain';
import type { Clock } from '../session/controller';
import { startOfWeek } from './selectors';

const DAY_MS = 24 * 60 * 60 * 1000;

function at(weekStart: number, dayOffset: number, hour: number): number {
  return weekStart + dayOffset * DAY_MS + hour * 60 * 60 * 1000;
}

interface LiftSeed {
  readonly name: string;
  readonly sets: number;
  readonly reps: RepRange;
  readonly restSeconds: number;
  /** The weight of the demonstrated session; `null` leaves the day untrained. */
  readonly weightKg: number | null;
  readonly actualReps: number;
  readonly equipment: Exercise['equipment'];
  readonly pattern: Exercise['pattern'];
  readonly muscle: Exercise['primaryMuscle'];
}

const DAY_SEEDS: readonly { readonly id: string; readonly name: string; readonly offset: number; readonly lifts: readonly LiftSeed[] }[] = [
  {
    id: 'demo-lower',
    name: 'SENTADILLA / PIERNA',
    offset: 0,
    lifts: [
      { name: 'Sentadilla trasera', sets: 3, reps: { lowerBound: 8, upperBound: 10 }, restSeconds: 180, weightKg: 100, actualReps: 10, equipment: 'barbell', pattern: 'squat', muscle: 'quadriceps' },
      { name: 'Prensa', sets: 3, reps: { lowerBound: 10, upperBound: 12 }, restSeconds: 120, weightKg: 150, actualReps: 12, equipment: 'machine', pattern: 'squat', muscle: 'quadriceps' },
      { name: 'Curl femoral', sets: 2, reps: { lowerBound: 10, upperBound: 12 }, restSeconds: 90, weightKg: 45, actualReps: 12, equipment: 'machine', pattern: 'isolation', muscle: 'hamstrings' },
      { name: 'Zancadas', sets: 2, reps: { lowerBound: 10, upperBound: 12 }, restSeconds: 120, weightKg: 24, actualReps: 10, equipment: 'dumbbell', pattern: 'squat', muscle: 'glutes' },
      { name: 'Gemelos', sets: 3, reps: { lowerBound: 12, upperBound: 15 }, restSeconds: 60, weightKg: 60, actualReps: 15, equipment: 'machine', pattern: 'isolation', muscle: 'calves' },
      { name: 'Plancha', sets: 2, reps: { lowerBound: 1, upperBound: 1 }, restSeconds: 60, weightKg: 0, actualReps: 1, equipment: 'bodyweight', pattern: 'core', muscle: 'core' },
    ],
  },
  {
    id: 'demo-pull',
    name: 'PESO MUERTO / TRACCIÓN',
    offset: 2,
    lifts: [
      { name: 'Peso muerto', sets: 3, reps: { lowerBound: 6, upperBound: 8 }, restSeconds: 180, weightKg: 110, actualReps: 6, equipment: 'barbell', pattern: 'hinge', muscle: 'hamstrings' },
      { name: 'Remo con barra', sets: 3, reps: { lowerBound: 8, upperBound: 10 }, restSeconds: 120, weightKg: 60, actualReps: 10, equipment: 'barbell', pattern: 'horizontalPull', muscle: 'upperBack' },
      { name: 'Jalón al pecho', sets: 3, reps: { lowerBound: 10, upperBound: 12 }, restSeconds: 90, weightKg: 50, actualReps: 12, equipment: 'cable', pattern: 'verticalPull', muscle: 'lats' },
      { name: 'Face pull', sets: 3, reps: { lowerBound: 12, upperBound: 15 }, restSeconds: 60, weightKg: 25, actualReps: 15, equipment: 'cable', pattern: 'horizontalPull', muscle: 'shoulders' },
      { name: 'Curl de bíceps', sets: 2, reps: { lowerBound: 10, upperBound: 12 }, restSeconds: 60, weightKg: 14, actualReps: 12, equipment: 'dumbbell', pattern: 'isolation', muscle: 'biceps' },
      { name: 'Cadena posterior', sets: 2, reps: { lowerBound: 10, upperBound: 12 }, restSeconds: 90, weightKg: 30, actualReps: 12, equipment: 'machine', pattern: 'isolation', muscle: 'lowerBack' },
    ],
  },
  {
    id: 'demo-push',
    name: 'PRESS BANCA / EMPUJE',
    offset: 4,
    lifts: [
      { name: 'Press banca', sets: 3, reps: { lowerBound: 6, upperBound: 8 }, restSeconds: 180, weightKg: 80, actualReps: 8, equipment: 'barbell', pattern: 'horizontalPush', muscle: 'chest' },
      { name: 'Press inclinado', sets: 3, reps: { lowerBound: 8, upperBound: 10 }, restSeconds: 120, weightKg: 28, actualReps: 10, equipment: 'dumbbell', pattern: 'horizontalPush', muscle: 'chest' },
      { name: 'Press militar', sets: 3, reps: { lowerBound: 8, upperBound: 10 }, restSeconds: 120, weightKg: 40, actualReps: 9, equipment: 'barbell', pattern: 'verticalPush', muscle: 'shoulders' },
      { name: 'Elevaciones laterales', sets: 2, reps: { lowerBound: 12, upperBound: 15 }, restSeconds: 60, weightKg: 8, actualReps: 15, equipment: 'dumbbell', pattern: 'isolation', muscle: 'shoulders' },
      { name: 'Extensiones de tríceps', sets: 2, reps: { lowerBound: 10, upperBound: 12 }, restSeconds: 60, weightKg: 20, actualReps: 12, equipment: 'cable', pattern: 'isolation', muscle: 'triceps' },
      { name: 'Espalda alta', sets: 2, reps: { lowerBound: 12, upperBound: 15 }, restSeconds: 60, weightKg: 30, actualReps: 15, equipment: 'machine', pattern: 'horizontalPull', muscle: 'upperBack' },
    ],
  },
];

export const DEMO_PROFILE: UserProfile = {
  id: 'demo-profile',
  displayName: 'Rup',
  massUnit: 'kilograms',
  weightGoal: 'maintain',
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell', 'dumbbell', 'machine', 'cable'],
  autoStartRestTimer: true,
};

export const DEMO_PHASE: PhaseState = { block: 2, passedBlocks: 1 };

function libraryOf(): readonly Exercise[] {
  const seen = new Set<string>();
  const library: Exercise[] = [];
  for (const day of DAY_SEEDS) {
    for (const lift of day.lifts) {
      if (seen.has(lift.name)) continue;
      seen.add(lift.name);
      library.push({
        id: `demo-ex-${lift.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: lift.name,
        primaryMuscle: lift.muscle,
        pattern: lift.pattern,
        equipment: lift.equipment,
        loadIncrementKg: lift.equipment === 'barbell' ? 2.5 : 2,
        isCustom: false,
        isArchived: false,
      });
    }
  }
  return library;
}

const LIBRARY = libraryOf();

function exerciseIdOf(name: string): string {
  return `demo-ex-${name.toLowerCase().replace(/\s+/g, '-')}`;
}

function planOf(weekStart: number): readonly PlanDay[] {
  return DAY_SEEDS.map((day, dayIndex) => ({
    id: day.id,
    name: day.name,
    order: dayIndex,
    items: day.lifts.map((lift, index) => ({
      id: `${day.id}-item-${String(index)}`,
      planDayId: day.id,
      order: index,
      exerciseId: exerciseIdOf(lift.name),
      exerciseNameSnapshot: lift.name,
      prescription: {
        sets: lift.sets,
        repRange: lift.reps,
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: lift.restSeconds,
      },
    })),
  }));
}

interface SessionOptions {
  readonly status: WorkoutSession['status'];
  /** Share of the prescribed exercises that already have their sets confirmed. */
  readonly fill: number;
  /** Weight multiplier, so the previous week is beatable without a second seed table. */
  readonly scale?: number | undefined;
  /** How many of the day's lifts the multiplier applies to: the ones that get beaten. */
  readonly scaleBelow?: number | undefined;
  /** Drops the last confirmed set of the last trained exercise: the partial session. */
  readonly short?: boolean | undefined;
}

function setsOf(lift: LiftSeed, prescribedIndex: number, confirmedAt: number, scale: number): SetRecord {
  return {
    id: `demo-set-${lift.name}-${String(prescribedIndex)}`,
    index: prescribedIndex,
    weightKg: lift.weightKg === null ? 0 : lift.weightKg * scale,
    targetReps: lift.reps.upperBound,
    actualReps: lift.actualReps,
    effort: prescribedIndex === lift.sets ? 1 : 2,
    discomfort: null,
    confirmedAt,
  };
}

function sessionOf(
  day: (typeof DAY_SEEDS)[number],
  dayIndex: number,
  weekStart: number,
  options: SessionOptions,
): WorkoutSession {
  const scheduledDate = at(weekStart, day.offset, 18);
  const startedAt = options.status === 'scheduled' ? null : scheduledDate;
  const confirmBase = startedAt ?? scheduledDate;
  const exercises: ExerciseSession[] = day.lifts.map((lift, index) => {
    const confirmed = options.status !== 'scheduled' && index < Math.round(day.lifts.length * options.fill);
    const scale =
      options.scaleBelow === undefined || index < options.scaleBelow ? (options.scale ?? 1) : 1;
    const confirmedSets = Array.from({ length: lift.sets }, (_, slot) =>
      setsOf(lift, slot + 1, confirmBase + slot * 4 * 60 * 1000, scale),
    );
    const shortHere = options.short === true && index === Math.round(day.lifts.length * options.fill) - 1;
    const sets = confirmed ? (shortHere ? confirmedSets.slice(0, Math.max(0, lift.sets - 1)) : confirmedSets) : [];
    return {
      id: `${day.id}-es-${String(index)}`,
      order: index,
      exerciseId: exerciseIdOf(lift.name),
      exerciseNameSnapshot: lift.name,
      prescription: {
        sets: lift.sets,
        repRange: lift.reps,
        targetRIR: { lowerBound: 2, upperBound: 3 },
        restSeconds: lift.restSeconds,
      },
      recommendation: null,
      decision: confirmed ? { kind: 'accepted' } : null,
      recommendedWeightKg: lift.weightKg,
      usedWeightKg: confirmed ? lift.weightKg : null,
      loadDeltaKg: confirmed ? 0 : null,
      sets,
      status: confirmed ? 'done' : 'pending',
      completedAt: confirmed ? confirmBase + lift.sets * 4 * 60 * 1000 : null,
    };
  });

  const endedAt =
    options.status === 'scheduled' || startedAt === null
      ? null
      : startedAt + (options.fill > 0 ? 52 : 23) * 60 * 1000;

  return {
    id: `demo-session-${String(dayIndex)}`,
    planDayId: day.id,
    dayNameSnapshot: day.name,
    scheduledDate,
    startedAt,
    endedAt,
    phase: { kind: 'readaptation', week: DEMO_PHASE.block },
    status: options.status,
    exercises,
  };
}

function measurementsOf(weekStart: number): readonly BodyMeasurement[] {
  const weights = [80.4, 80.1, 79.9, 79.6, 79.4];
  return weights.map((weightKg, index) => ({
    id: `demo-measurement-${String(index)}`,
    date: at(weekStart, index, 7),
    weightKg,
    waistCm: null,
    chestCm: null,
    armCm: null,
    thighCm: null,
    hipCm: null,
    bodyFatPercent: null,
    provenance: 'manual',
  }));
}

export type DemoScenario = 'week' | 'first' | 'done' | 'rest' | 'partial' | 'evicted';

export interface DemoWeek {
  readonly now: number;
  readonly plan: readonly PlanDay[];
  readonly sessions: readonly WorkoutSession[];
  readonly measurements: readonly BodyMeasurement[];
  readonly activities: readonly ActivityRecord[];
  readonly exercises: readonly Exercise[];
  readonly profile: UserProfile;
  readonly phaseState: PhaseState;
}

/** Wednesday 18:00 of the week that contains `now`: the day the artboards draw. */
export function demoNow(now: number): number {
  return at(startOfWeek(now), 2, 18);
}

/** Thursday 18:00 of the same week: the rest day of `entrenar-empty`. */
export function demoRestNow(now: number): number {
  return at(startOfWeek(now), 3, 18);
}

/**
 * One week of data. `first` is an empty store (no history at all), `done` is the week
 * after Wednesday's session was finished, `rest` is a Thursday with nothing scheduled.
 */
export function demoWeek(scenario: DemoScenario, now: number): DemoWeek {
  const weekStart = startOfWeek(now);
  const plan = planOf(weekStart);
  const [lower, pull, push] = DAY_SEEDS;

  // `first` and `evicted` share the empty store: what separates them is not data, it is
  // the marker that says the data used to be there (design-system §2.5).
  if (scenario === 'first' || scenario === 'evicted' || lower === undefined || pull === undefined || push === undefined) {
    return {
      now,
      plan: scenario === 'first' || scenario === 'evicted' ? [] : plan,
      sessions: [],
      measurements: [],
      activities: [],
      exercises: LIBRARY,
      profile: DEMO_PROFILE,
      phaseState: DEMO_PHASE,
    };
  }

  const monday = sessionOf(lower, 0, weekStart, { status: 'completed', fill: 1 });
  const closedToday = scenario === 'done' || scenario === 'partial';
  const wednesday = sessionOf(pull, 1, weekStart, {
    status: scenario === 'done' ? 'completed' : scenario === 'partial' ? 'partial' : 'scheduled',
    fill: closedToday ? 1 : 0,
    ...(scenario === 'partial' ? { short: true } : {}),
  });
  const friday = sessionOf(push, 2, weekStart, { status: 'scheduled', fill: 0 });
  // Last week's pull day: the mark this week's session has to beat for a record to
  // exist. Without it the summary would honestly say there is no record to report.
  const lastWeek = sessionOf(pull, 9, weekStart - 7 * DAY_MS, {
    status: 'completed',
    fill: 1,
    // `resumen-partial` draws a session with no record: the previous marks are matched,
    // not beaten. `resumen` draws the other state, two lifts above last week.
    scale: scenario === 'partial' ? 1 : 0.95,
    scaleBelow: 2,
  });

  const restDay = scenario === 'rest';
  return {
    now,
    plan,
    sessions: restDay ? [monday, lastWeek] : [monday, wednesday, friday, lastWeek],
    measurements: measurementsOf(weekStart),
    activities: [],
    exercises: LIBRARY,
    profile: DEMO_PROFILE,
    phaseState: DEMO_PHASE,
  };
}

/**
 * The in-memory port: `createFakeStorage` plus the three reads it answers emptily (the
 * plan, the measurements and the activities), because the session screen never needed
 * them and the demo of Inicio and Entrenar does.
 */
export function demoPort(week: DemoWeek): StoragePort {
  const base = createFakeStorage({ sessions: week.sessions, exercises: [...week.exercises], profile: week.profile });
  const measurements = [...week.measurements];
  const activities = [...week.activities];

  return {
    ...base,
    plan: {
      ...base.plan,
      all: () => Promise.resolve(week.plan),
      byId: (id) => Promise.resolve(week.plan.find((day) => day.id === id)),
    },
    measurements: {
      ...base.measurements,
      all: () => Promise.resolve([...measurements]),
      between: (from, to) => Promise.resolve(measurements.filter((row) => row.date >= from && row.date <= to)),
    },
    activities: {
      ...base.activities,
      all: () => Promise.resolve([...activities]),
      between: (from, to) => Promise.resolve(activities.filter((row) => row.date >= from && row.date <= to)),
    },
    meta: {
      ...base.meta,
      readPhaseState: () => Promise.resolve(week.phaseState),
    },
  };
}

/** The demo's only clock: the fixture instant, so nothing drifts while it is reviewed. */
export function demoClock(now: number): Clock {
  return { now: () => now };
}

export interface DemoBarProps {
  readonly title: string;
  readonly scenarios: readonly { readonly id: DemoScenario; readonly label: string }[];
  readonly active: DemoScenario;
  readonly onSelect: (scenario: DemoScenario) => void;
}

/** `DEMO · datos de ejemplo, no se guarda nada`, plus one chip per state. */
export function DemoBar({ title, scenarios, active, onSelect }: DemoBarProps): React.ReactElement {
  return (
    <div className="demo-bar">
      <p className="demo-bar__title">{title}</p>
      <div className="demo-bar__chips" role="group" aria-label="Escenario de la demo">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className="ds-action demo-bar__chip"
            aria-pressed={scenario.id === active}
            onClick={() => onSelect(scenario.id)}
          >
            {scenario.label}
          </button>
        ))}
      </div>
    </div>
  );
}
