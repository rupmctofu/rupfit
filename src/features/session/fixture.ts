/**
 * The session fixtures: one day's plan, its exercise library and the history behind
 * the last-six-sessions strip.
 *
 * Everything here is typed as the storage/domain shapes themselves (`WorkoutSession`,
 * `Exercise`, `UserProfile`), never as a private copy: a fixture that drifts from the
 * domain stops compiling, which is the point. The demo seeds these values into the
 * in-memory port and the tests boot from the same builder, so what is reviewed on the
 * phone is what the tests exercise.
 *
 * The numbers come from the approved renders (`sesion-decision`, `sesion-first`,
 * `sesion-resumed`, `sesion-progress`): peso muerto at 90 kg × 10 the previous time,
 * 92,5 kg today, three sets, 180 s of rest.
 */

import { EFFORT } from '../../core/domain';
import type {
  Exercise,
  ExercisePrescription,
  LoadDecision,
  SetRecord,
  TrainingPhase,
  UserProfile,
  WorkoutSession,
} from '../../storage';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Wednesday 18:42, the instant the decision render is drawn at. */
export const DEMO_NOW = Date.UTC(2024, 4, 15, 16, 42, 0);

const PHASE: TrainingPhase = { kind: 'readaptation', week: 2 };

export const DEADLIFT: Exercise = {
  id: 'ex-peso-muerto',
  name: 'Peso muerto convencional',
  primaryMuscle: 'hamstrings',
  pattern: 'hinge',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: false,
  isArchived: false,
};

export const BARBELL_ROW: Exercise = {
  id: 'ex-remo-barra',
  name: 'Remo con barra',
  primaryMuscle: 'upperBack',
  pattern: 'horizontalPull',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: false,
  isArchived: false,
};

export const SQUAT: Exercise = {
  id: 'ex-sentadilla',
  name: 'Sentadilla trasera',
  primaryMuscle: 'quadriceps',
  pattern: 'squat',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: false,
  isArchived: false,
};

export const BENCH: Exercise = {
  id: 'ex-press-banca',
  name: 'Press de banca',
  primaryMuscle: 'chest',
  pattern: 'horizontalPush',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: false,
  isArchived: false,
};

export const OVERHEAD: Exercise = {
  id: 'ex-press-militar',
  name: 'Press militar',
  primaryMuscle: 'shoulders',
  pattern: 'verticalPush',
  equipment: 'barbell',
  loadIncrementKg: 2.5,
  isCustom: false,
  isArchived: false,
};

export const CURL: Exercise = {
  id: 'ex-curl-mancuerna',
  name: 'Curl con mancuernas',
  primaryMuscle: 'biceps',
  pattern: 'isolation',
  equipment: 'dumbbell',
  loadIncrementKg: 2,
  isCustom: false,
  isArchived: false,
};

export const EXERCISES: readonly Exercise[] = [DEADLIFT, BARBELL_ROW, SQUAT, BENCH, OVERHEAD, CURL];

/** `3 × 10 a 3–4 RIR · descanso 180 s` — the target line of the decision render. */
export const DEADLIFT_PRESCRIPTION: ExercisePrescription = {
  sets: 3,
  repRange: { lowerBound: 10, upperBound: 10 },
  targetRIR: { lowerBound: 3, upperBound: 4 },
  restSeconds: 180,
};

/** `2 × 12 a 4 RIR · descanso 120 s` — the first-time card of `sesion-first`. */
export const ROW_PRESCRIPTION: ExercisePrescription = {
  sets: 2,
  repRange: { lowerBound: 12, upperBound: 12 },
  targetRIR: { lowerBound: 4, upperBound: 4 },
  restSeconds: 120,
};

export const PROFILE: UserProfile = {
  id: 'profile-owner',
  displayName: null,
  massUnit: 'kilograms',
  weightGoal: null,
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell', 'dumbbell'],
  autoStartRestTimer: true,
};

/** A stored set of `sets` reps at `weightKg`, confirmed `at`. */
export function confirmedSet(
  id: string,
  index: number,
  weightKg: number,
  reps: number,
  at: number,
  effort: SetRecord['effort'] = EFFORT.correct,
): SetRecord {
  return {
    id,
    index,
    weightKg,
    targetReps: reps,
    actualReps: reps,
    effort,
    discomfort: null,
    confirmedAt: at,
  };
}

export interface CurrentSessionSpec {
  readonly id?: string;
  /** Zero-based position of the exercise the owner is on. */
  readonly activeIndex?: number;
  /** Confirmed sets on the active exercise, all at the decided weight. */
  readonly confirmedSets?: number;
  readonly decision?: LoadDecision | null;
  readonly status?: 'scheduled' | 'inProgress' | 'completed' | 'partial';
  /** Every slot of every exercise answered: the input `finish(completed)` needs. */
  readonly allAnswered?: boolean;
  /** The exercises before the active one were skipped: no sets, and so no rest bar. */
  readonly skipBefore?: boolean;
  /** `now` minus this many seconds is the last confirmation instant. */
  readonly lastSetAgoSeconds?: number;
}

/**
 * The day's session: six exercises, peso muerto first, remo fourth, matching the
 * `2 / 6` and `4 / 6` positions of the renders.
 */
export function currentSession(now: number, spec: CurrentSessionSpec = {}): WorkoutSession {
  const activeIndex = spec.activeIndex ?? 0;
  const confirmedSets = spec.confirmedSets ?? 0;
  const lastSetAgo = (spec.lastSetAgoSeconds ?? 75) * 1000;
  const startedAt = now - 24 * MINUTE;
  const recommendedWeightKg = 92.5;
  const usedWeightKg = 92.5;

  const plan: readonly { readonly exercise: Exercise; readonly prescription: ExercisePrescription }[] = [
    { exercise: DEADLIFT, prescription: DEADLIFT_PRESCRIPTION },
    { exercise: SQUAT, prescription: { ...DEADLIFT_PRESCRIPTION, sets: 3 } },
    { exercise: BENCH, prescription: { ...DEADLIFT_PRESCRIPTION, sets: 3 } },
    { exercise: BARBELL_ROW, prescription: ROW_PRESCRIPTION },
    { exercise: OVERHEAD, prescription: { ...DEADLIFT_PRESCRIPTION, sets: 3 } },
    { exercise: CURL, prescription: { sets: 3, repRange: { lowerBound: 10, upperBound: 12 }, targetRIR: { lowerBound: 2, upperBound: 3 }, restSeconds: 90 } },
  ];

  const exercises = plan.map((entry, position) => {
    const id = `xs-${position + 1}`;
    const isActive = position === activeIndex;
    const isBefore = position < activeIndex;
    const skippedBefore = isBefore && (spec.skipBefore ?? false);
    const sets = spec.allAnswered
      ? entry.prescription.sets
      : skippedBefore
        ? 0
        : isBefore
          ? entry.prescription.sets
          : isActive
            ? confirmedSets
            : 0;

    const confirmed: SetRecord[] = [];
    for (let slot = 1; slot <= sets; slot += 1) {
      const at = now - lastSetAgo - (sets - slot) * 90_000;
      confirmed.push(
        confirmedSet(
          `${id}:${slot}`,
          slot,
          entry.exercise === BARBELL_ROW ? 60 : usedWeightKg,
          entry.prescription.repRange.upperBound,
          at,
          slot === 1 ? EFFORT.correct : EFFORT.hard,
        ),
      );
    }

    const hasHistory = entry.exercise.id === DEADLIFT.id;
    const answered = confirmed.length === entry.prescription.sets;
    const status = answered
      ? 'done'
      : skippedBefore
        ? 'skipped'
        : isActive || isBefore
          ? 'active'
          : 'pending';
    const decided = isActive ? (spec.decision ?? null) : null;
    const weight = decided === null ? null : usedWeightKg;

    return {
      id,
      order: position + 1,
      exerciseId: entry.exercise.id,
      exerciseNameSnapshot: entry.exercise.name,
      prescription: entry.prescription,
      recommendation: hasHistory
        ? {
            suggestedWeightKg: recommendedWeightKg,
            suggestedSets: entry.prescription.sets,
            suggestedTargetReps: entry.prescription.repRange.upperBound,
            action: 'increase' as const,
            reason: 'topOfRangeReached' as const,
            confidence: { level: 'high' as const, sessionsConsidered: 5 },
            basedOnSessions: 5,
            computedAt: new Date(now - 2 * DAY),
            reasonContext: { sets: 3, reps: 10, kg: 90, next: recommendedWeightKg },
          }
        : {
            suggestedWeightKg: null,
            suggestedSets: entry.prescription.sets,
            suggestedTargetReps: entry.prescription.repRange.upperBound,
            action: 'insufficientData' as const,
            reason: 'insufficientData' as const,
            confidence: { level: 'low' as const, sessionsConsidered: 0 },
            basedOnSessions: 0,
            computedAt: new Date(now - 2 * DAY),
            reasonContext: {},
          },
      decision: decided,
      recommendedWeightKg: weight,
      usedWeightKg: weight,
      loadDeltaKg: weight === null ? null : 0,
      sets: confirmed,
      status: status as 'pending' | 'active' | 'done' | 'skipped',
      completedAt: answered ? now - lastSetAgo : null,
    };
  });

  return {
    id: spec.id ?? 'session-demo',
    planDayId: 'plan-day-miercoles',
    dayNameSnapshot: 'MIÉRCOLES / CUERPO COMPLETO',
    scheduledDate: now - 30 * MINUTE,
    startedAt: confirmedSets > 0 || (spec.allAnswered ?? false) ? startedAt : null,
    endedAt: null,
    phase: PHASE,
    status: spec.status ?? (confirmedSets > 0 || (spec.allAnswered ?? false) ? 'inProgress' : 'scheduled'),
    exercises,
  };
}

/**
 * Five past sessions of peso muerto, oldest first: `87,5 → 82,5 → 90 → 87,5 → 90`.
 * The strip labels the oldest point (`87,5`) and the live one (`hoy`), as the render
 * does; the most recent past session is the `Última vez 90 kg` tile of the decision
 * card, and the reason template behind it says the same 90 kg.
 */
export function pastSessions(now: number): readonly WorkoutSession[] {
  const tops: readonly { readonly weightKg: number; readonly reps: number; readonly effort: SetRecord['effort'] }[] = [
    { weightKg: 87.5, reps: 10, effort: EFFORT.correct },
    { weightKg: 82.5, reps: 9, effort: EFFORT.hard },
    { weightKg: 90, reps: 10, effort: EFFORT.correct },
    { weightKg: 87.5, reps: 10, effort: EFFORT.hard },
    { weightKg: 90, reps: 10, effort: EFFORT.correct },
  ];

  return tops.map((top, position) => {
    const id = `session-past-${position + 1}`;
    const scheduledDate = now - (5 - position) * 2 * DAY;
    const confirmed: SetRecord[] = [1, 2, 3].map((slot) =>
      confirmedSet(`${id}:1:${slot}`, slot, top.weightKg, top.reps, scheduledDate + 40 * MINUTE + slot * 90_000, top.effort),
    );

    return {
      id,
      planDayId: 'plan-day-miercoles',
      dayNameSnapshot: 'MIÉRCOLES / CUERPO COMPLETO',
      scheduledDate,
      startedAt: scheduledDate + 30 * MINUTE,
      endedAt: scheduledDate + 55 * MINUTE,
      phase: PHASE,
      status: 'completed',
      exercises: [
        {
          id: `${id}-xs-1`,
          order: 1,
          exerciseId: DEADLIFT.id,
          exerciseNameSnapshot: DEADLIFT.name,
          prescription: DEADLIFT_PRESCRIPTION,
          recommendation: null,
          decision: { kind: 'accepted' },
          recommendedWeightKg: top.weightKg,
          usedWeightKg: top.weightKg,
          loadDeltaKg: 0,
          sets: confirmed,
          status: 'done',
          completedAt: scheduledDate + 55 * MINUTE,
        },
      ],
    };
  });
}

export interface SessionFixture {
  readonly sessions: readonly WorkoutSession[];
  readonly exercises: readonly Exercise[];
  readonly profile: UserProfile;
}

/** The demo's whole store: the day's session plus the five sessions behind the strip. */
export function sessionFixture(now: number, spec: CurrentSessionSpec = {}): SessionFixture {
  return {
    sessions: [...pastSessions(now), currentSession(now, spec)],
    exercises: EXERCISES,
    profile: PROFILE,
  };
}
