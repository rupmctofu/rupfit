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
  WeekLayout,
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
  /**
   * T2 (S5): the owner's fixed weekly assignment. Optional, and absent when the owner has
   * never moved anything — a document written before the field existed has no key at all,
   * and absence is a legitimate answer rather than a missing collection
   * (`weekLayoutSchema.optional()` in `schema.ts`).
   */
  readonly weekLayout?: WeekLayout;
  readonly exercises: readonly Exercise[];
  readonly planDays: readonly PlanDay[];
  readonly sessions: readonly EncodedSession[];
  readonly bodyMeasurements: readonly BodyMeasurement[];
  readonly activities: readonly ActivityRecord[];
}

export interface DocumentData {
  readonly profile: UserProfile | null;
  readonly phaseState: PhaseState | null;
  /**
   * T2 (S5): `null` or absent while the week is still the fixture's — the document then
   * carries no key at all. Optional so a caller that builds a document from part of the
   * store (a test, an export of the plan only) does not have to know about the layout: the
   * whole document field is optional for the same reason (ADR-011, additive).
   */
  readonly weekLayout?: WeekLayout | null;
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
    // T2 (S5): omitted rather than null, so a document exported by this build without a
    // layout is byte-identical to one written before the layout existed.
    ...(data.weekLayout === null || data.weekLayout === undefined
      ? {}
      : { weekLayout: copyWeekLayout(data.weekLayout) }),
    exercises: data.exercises.toSorted(byId).map(copyExercise),
    planDays: data.planDays.toSorted(byId).map(copyPlanDay),
    sessions: data.sessions.toSorted(byId).map(encodeSession),
    bodyMeasurements: data.bodyMeasurements.toSorted(byId).map(copyMeasurement),
    activities: data.activities.toSorted(byId).map(copyActivity),
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
  const encoded: EncodedExerciseSession = {
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
  // T5: absent on every row that was not substituted, so an old backup stays identical.
  return exerciseSession.substitutedFrom === undefined
    ? encoded
    : { ...encoded, substitutedFrom: { ...exerciseSession.substitutedFrom } };
}

export function decodeExerciseSession(
  exerciseSession: EncodedExerciseSession,
): ExerciseSession {
  const decoded: ExerciseSession = {
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
  return exerciseSession.substitutedFrom === undefined
    ? decoded
    : { ...decoded, substitutedFrom: { ...exerciseSession.substitutedFrom } };
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
  const withAlternatives: Exercise =
    exercise.alternatives === undefined
      ? withVariant
      : { ...withVariant, alternatives: [...exercise.alternatives] };
  return exercise.illustration === undefined
    ? withAlternatives
    : { ...withAlternatives, illustration: exercise.illustration };
}

/**
 * T2 (S5): the owner's fixed weekly assignment, copied out slot by slot so the document
 * owns its arrays and cannot be mutated through the record it was built from.
 */
function copyWeekLayout(layout: WeekLayout): WeekLayout {
  return {
    slots: layout.slots.map((slot) => ({ weekday: slot.weekday, planDayId: slot.planDayId })),
  };
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
