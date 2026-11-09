/**
 * The backup document — docs/data-model.md §9.
 *
 * The document is the domain encoded as-is: nested sessions and their sets, `null` for
 * absence, epoch milliseconds for instants (so a JSON diff stays orderable and a
 * round trip is exact), and nothing that is a storage internal. It is the only
 * interchange format; there is no second one.
 */

import { BACKUP_DOCUMENT_TYPE, BACKUP_SCHEMA_VERSION } from '../constants';
import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  ExerciseSession,
  PhaseState,
  PlanDay,
  UserProfile,
  WorkoutSession,
} from '../entities';
import { recommendationFromStored, recommendationToStored } from '../mappers';
import type { StoredRecommendation } from '../records';

/** An exercise session as it appears in the document: the recommendation in epoch ms. */
export type EncodedExerciseSession = Omit<ExerciseSession, 'recommendation'> & {
  readonly recommendation: StoredRecommendation | null;
};

export type EncodedSession = Omit<WorkoutSession, 'exercises'> & {
  readonly exercises: readonly EncodedExerciseSession[];
};

/** §9: `documentType`, version, the exporting app version, the instant, then the data. */
export interface BackupDocument {
  readonly documentType: typeof BACKUP_DOCUMENT_TYPE;
  readonly schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly profile: UserProfile | null;
  readonly phaseState: PhaseState | null;
  readonly exercises: readonly Exercise[];
  readonly planDays: readonly PlanDay[];
  readonly sessions: readonly EncodedSession[];
  readonly bodyMeasurements: readonly BodyMeasurement[];
  readonly activities: readonly ActivityRecord[];
}

export interface DocumentData {
  readonly profile: UserProfile | null;
  readonly phaseState: PhaseState | null;
  readonly exercises: readonly Exercise[];
  readonly planDays: readonly PlanDay[];
  readonly sessions: readonly WorkoutSession[];
  readonly bodyMeasurements: readonly BodyMeasurement[];
  readonly activities: readonly ActivityRecord[];
}

export interface DocumentMetadata {
  readonly appVersion: string;
  /** Epoch milliseconds, injected by the caller: the store has no clock. */
  readonly exportedAt: number;
}

/**
 * Builds the document from domain data. Every collection is ordered by id and every
 * object literal is written in a fixed key order, so exporting the same store twice
 * produces the same bytes — which is what makes the round-trip test meaningful.
 */
export function buildBackupDocument(
  data: DocumentData,
  metadata: DocumentMetadata,
): BackupDocument {
  return {
    documentType: BACKUP_DOCUMENT_TYPE,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: metadata.appVersion,
    exportedAt: new Date(metadata.exportedAt).toISOString(),
    profile: data.profile === null ? null : copyProfile(data.profile),
    phaseState: data.phaseState === null ? null : copyPhaseState(data.phaseState),
    exercises: [...data.exercises].sort(byId).map(copyExercise),
    planDays: [...data.planDays].sort(byId).map(copyPlanDay),
    sessions: [...data.sessions].sort(byId).map(encodeSession),
    bodyMeasurements: [...data.bodyMeasurements].sort(byId).map(copyMeasurement),
    activities: [...data.activities].sort(byId).map(copyActivity),
  };
}

export function encodeSession(session: WorkoutSession): EncodedSession {
  return {
    id: session.id,
    planDayId: session.planDayId,
    dayNameSnapshot: session.dayNameSnapshot,
    scheduledDate: session.scheduledDate,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    phase: session.phase.kind === 'normal' ? { kind: 'normal' } : { kind: 'readaptation', week: session.phase.week },
    status: session.status,
    exercises: session.exercises.map(encodeExerciseSession),
  };
}

export function decodeSession(session: EncodedSession): WorkoutSession {
  return {
    id: session.id,
    planDayId: session.planDayId,
    dayNameSnapshot: session.dayNameSnapshot,
    scheduledDate: session.scheduledDate,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    phase: session.phase.kind === 'normal' ? { kind: 'normal' } : { kind: 'readaptation', week: session.phase.week },
    status: session.status,
    exercises: session.exercises.map(decodeExerciseSession),
  };
}

export function encodeExerciseSession(exerciseSession: ExerciseSession): EncodedExerciseSession {
  return {
    id: exerciseSession.id,
    order: exerciseSession.order,
    exerciseId: exerciseSession.exerciseId,
    exerciseNameSnapshot: exerciseSession.exerciseNameSnapshot,
    prescription: exerciseSession.prescription,
    recommendation:
      exerciseSession.recommendation === null
        ? null
        : recommendationToStored(exerciseSession.recommendation),
    decision: exerciseSession.decision,
    recommendedWeightKg: exerciseSession.recommendedWeightKg,
    usedWeightKg: exerciseSession.usedWeightKg,
    loadDeltaKg: exerciseSession.loadDeltaKg,
    sets: exerciseSession.sets,
    status: exerciseSession.status,
    completedAt: exerciseSession.completedAt,
  };
}

export function decodeExerciseSession(
  exerciseSession: EncodedExerciseSession,
): ExerciseSession {
  return {
    id: exerciseSession.id,
    order: exerciseSession.order,
    exerciseId: exerciseSession.exerciseId,
    exerciseNameSnapshot: exerciseSession.exerciseNameSnapshot,
    prescription: exerciseSession.prescription,
    recommendation:
      exerciseSession.recommendation === null
        ? null
        : recommendationFromStored(exerciseSession.recommendation),
    decision: exerciseSession.decision,
    recommendedWeightKg: exerciseSession.recommendedWeightKg,
    usedWeightKg: exerciseSession.usedWeightKg,
    loadDeltaKg: exerciseSession.loadDeltaKg,
    sets: exerciseSession.sets,
    status: exerciseSession.status,
    completedAt: exerciseSession.completedAt,
  };
}

export function serializeDocument(document: BackupDocument): string {
  return JSON.stringify(document);
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function copyProfile(profile: UserProfile): UserProfile {
  return {
    id: profile.id,
    displayName: profile.displayName,
    massUnit: profile.massUnit,
    weightGoal: profile.weightGoal,
    weeklyTrainingDays: profile.weeklyTrainingDays,
    availableEquipment: [...profile.availableEquipment],
    autoStartRestTimer: profile.autoStartRestTimer,
  };
}

function copyPhaseState(state: PhaseState): PhaseState {
  const base: PhaseState = { block: state.block, passedBlocks: state.passedBlocks };
  const withRole: PhaseState = state.role === undefined ? base : { ...base, role: state.role };
  return state.scheduledSessionsPerWeek === undefined
    ? withRole
    : { ...withRole, scheduledSessionsPerWeek: state.scheduledSessionsPerWeek };
}

function copyExercise(exercise: Exercise): Exercise {
  const copy: Exercise = {
    id: exercise.id,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    pattern: exercise.pattern,
    equipment: exercise.equipment,
    loadIncrementKg: exercise.loadIncrementKg,
    isCustom: exercise.isCustom,
    isArchived: exercise.isArchived,
  };
  // T3: the four detail fields are optional and additive, so an exercise without them
  // encodes exactly as it did before they existed and an old backup still imports.
  const withMuscles: Exercise =
    exercise.secondaryMuscles === undefined
      ? copy
      : { ...copy, secondaryMuscles: [...exercise.secondaryMuscles] };
  const withDescription: Exercise =
    exercise.description === undefined
      ? withMuscles
      : { ...withMuscles, description: exercise.description };
  const withVariant: Exercise =
    exercise.variantOf === undefined
      ? withDescription
      : { ...withDescription, variantOf: exercise.variantOf };
  return exercise.alternatives === undefined
    ? withVariant
    : { ...withVariant, alternatives: [...exercise.alternatives] };
}

function copyPlanDay(day: PlanDay): PlanDay {
  return {
    id: day.id,
    name: day.name,
    order: day.order,
    items: day.items.map((item) => ({
      id: item.id,
      planDayId: item.planDayId,
      order: item.order,
      exerciseId: item.exerciseId,
      exerciseNameSnapshot: item.exerciseNameSnapshot,
      prescription: item.prescription,
    })),
  };
}

function copyMeasurement(measurement: BodyMeasurement): BodyMeasurement {
  return {
    id: measurement.id,
    date: measurement.date,
    weightKg: measurement.weightKg,
    waistCm: measurement.waistCm,
    chestCm: measurement.chestCm,
    armCm: measurement.armCm,
    thighCm: measurement.thighCm,
    hipCm: measurement.hipCm,
    bodyFatPercent: measurement.bodyFatPercent,
    provenance: measurement.provenance,
  };
}

function copyActivity(activity: ActivityRecord): ActivityRecord {
  return {
    id: activity.id,
    date: activity.date,
    kind: activity.kind,
    durationSeconds: activity.durationSeconds,
    activeEnergyKcal: activity.activeEnergyKcal,
    provenance: activity.provenance,
    externalSampleId: activity.externalSampleId,
  };
}
