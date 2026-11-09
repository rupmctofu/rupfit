/**
 * Record ⇄ domain mappers — docs/data-model.md §5.2, ADR-002.
 *
 * Both directions are explicit: no spread of a whole record into a domain object, so
 * a new column never leaks into the domain by accident and a renamed field cannot
 * silently change shape. The two transformations that are more than a copy:
 *
 * - `isArchived` is a boolean in the domain and `0 | 1` in the record, because a
 *   boolean is not an IndexedDB key (§5.1 `by_archived`).
 * - instants inside a recommendation are `Date` in the domain (the engine injects a
 *   clock) and epoch milliseconds in the record and the backup document (§2).
 */

import type {
  Discomfort,
  Effort,
  PhaseState,
  ProgressionRecommendation,
} from '../core/domain';
import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  ExerciseSession,
  EpochMs,
  PlanDay,
  PlanItem,
  SetRecord,
  StorageAnswer,
  UserProfile,
  WorkoutSession,
} from './entities';
import type {
  ActivityRow,
  BodyMeasurementRow,
  ExerciseRow,
  ExerciseSessionRow,
  MetaRow,
  PlanDayRow,
  PlanItemRow,
  SessionRow,
  SetRecordRow,
  StoredPhaseState,
  StoredRecommendation,
} from './records';

/* ------------------------------------------------------------------ exercise */

export function exerciseToRow(exercise: Exercise): ExerciseRow {
  const row: ExerciseRow = {
    id: exercise.id,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    pattern: exercise.pattern,
    equipment: exercise.equipment,
    loadIncrementKg: exercise.loadIncrementKg,
    isCustom: exercise.isCustom,
    isArchived: exercise.isArchived ? 1 : 0,
  };
  return writeDetail(row, exercise);
}

export function exerciseFromRow(row: ExerciseRow): Exercise {
  const exercise: Exercise = {
    id: row.id,
    name: row.name,
    primaryMuscle: row.primaryMuscle,
    pattern: row.pattern,
    equipment: row.equipment,
    loadIncrementKg: row.loadIncrementKg,
    isCustom: row.isCustom,
    isArchived: row.isArchived === 1,
  };
  return readDetail(exercise, row);
}

/**
 * The four optional library columns, added to the row only when the domain has them.
 * `exactOptionalPropertyTypes` forbids writing an explicit `undefined`, and an absent
 * key is also the honest encoding of "this row was written before the column existed".
 */
function writeDetail(row: ExerciseRow, exercise: Exercise): ExerciseRow {
  const withMuscles: ExerciseRow =
    exercise.secondaryMuscles === undefined
      ? row
      : { ...row, secondaryMuscles: [...exercise.secondaryMuscles] };
  const withDescription: ExerciseRow =
    exercise.description === undefined
      ? withMuscles
      : { ...withMuscles, description: exercise.description };
  const withVariant: ExerciseRow =
    exercise.variantOf === undefined
      ? withDescription
      : { ...withDescription, variantOf: exercise.variantOf };
  const withAlternatives: ExerciseRow =
    exercise.alternatives === undefined
      ? withVariant
      : { ...withVariant, alternatives: [...exercise.alternatives] };
  return exercise.illustration === undefined
    ? withAlternatives
    : { ...withAlternatives, illustration: exercise.illustration };
}

/** The inverse: a row that does not carry a column leaves the domain field absent. */
function readDetail(exercise: Exercise, row: ExerciseRow): Exercise {
  const withMuscles: Exercise =
    row.secondaryMuscles === undefined
      ? exercise
      : { ...exercise, secondaryMuscles: [...row.secondaryMuscles] };
  const withDescription: Exercise =
    row.description === undefined
      ? withMuscles
      : { ...withMuscles, description: row.description };
  const withVariant: Exercise =
    row.variantOf === undefined
      ? withDescription
      : { ...withDescription, variantOf: row.variantOf };
  const withAlternatives: Exercise =
    row.alternatives === undefined
      ? withVariant
      : { ...withVariant, alternatives: [...row.alternatives] };
  return row.illustration === undefined
    ? withAlternatives
    : { ...withAlternatives, illustration: row.illustration };
}

/* ---------------------------------------------------------------------- plan */

export function planDayToRow(day: PlanDay): PlanDayRow {
  return { id: day.id, name: day.name, order: day.order };
}

export function planDayFromRow(row: PlanDayRow, items: readonly PlanItemRow[]): PlanDay {
  return {
    id: row.id,
    name: row.name,
    order: row.order,
    items: items.map(planItemFromRow),
  };
}

export function planItemToRow(item: PlanItem): PlanItemRow {
  return {
    id: item.id,
    planDayId: item.planDayId,
    order: item.order,
    exerciseId: item.exerciseId,
    exerciseNameSnapshot: item.exerciseNameSnapshot,
    prescription: copyPrescription(item.prescription),
  };
}

export function planItemFromRow(row: PlanItemRow): PlanItem {
  return {
    id: row.id,
    planDayId: row.planDayId,
    order: row.order,
    exerciseId: row.exerciseId,
    exerciseNameSnapshot: row.exerciseNameSnapshot,
    prescription: copyPrescription(row.prescription),
  };
}

/* ------------------------------------------------------------------- sessions */

export function sessionToRow(session: WorkoutSession, deletionPending: boolean): SessionRow {
  return {
    id: session.id,
    planDayId: session.planDayId,
    dayNameSnapshot: session.dayNameSnapshot,
    scheduledDate: session.scheduledDate,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    phase: session.phase.kind === 'normal' ? { kind: 'normal' } : { kind: 'readaptation', week: session.phase.week },
    status: session.status,
    deletionPending,
  };
}

export function sessionFromRow(row: SessionRow, exercises: readonly ExerciseSession[]): WorkoutSession {
  return {
    id: row.id,
    planDayId: row.planDayId,
    dayNameSnapshot: row.dayNameSnapshot,
    scheduledDate: row.scheduledDate,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    phase: row.phase.kind === 'normal' ? { kind: 'normal' } : { kind: 'readaptation', week: row.phase.week },
    status: row.status,
    exercises,
  };
}

export function exerciseSessionToRow(
  exerciseSession: ExerciseSession,
  sessionId: string,
  sessionDate: EpochMs,
): ExerciseSessionRow {
  const row: ExerciseSessionRow = {
    id: exerciseSession.id,
    sessionId,
    sessionDate,
    order: exerciseSession.order,
    exerciseId: exerciseSession.exerciseId,
    exerciseNameSnapshot: exerciseSession.exerciseNameSnapshot,
    prescription: copyPrescription(exerciseSession.prescription),
    recommendation:
      exerciseSession.recommendation === null
        ? null
        : recommendationToStored(exerciseSession.recommendation),
    decision: exerciseSession.decision,
    recommendedWeightKg: exerciseSession.recommendedWeightKg,
    usedWeightKg: exerciseSession.usedWeightKg,
    loadDeltaKg: exerciseSession.loadDeltaKg,
    status: exerciseSession.status,
    completedAt: exerciseSession.completedAt,
  };
  // `exactOptionalPropertyTypes`: a row that was not substituted has no key at all.
  return exerciseSession.substitutedFrom === undefined
    ? row
    : { ...row, substitutedFrom: { ...exerciseSession.substitutedFrom } };
}

export function exerciseSessionFromRow(
  row: ExerciseSessionRow,
  sets: readonly SetRecord[],
): ExerciseSession {
  const exerciseSession: ExerciseSession = {
    id: row.id,
    order: row.order,
    exerciseId: row.exerciseId,
    exerciseNameSnapshot: row.exerciseNameSnapshot,
    prescription: copyPrescription(row.prescription),
    recommendation: row.recommendation === null ? null : recommendationFromStored(row.recommendation),
    decision: row.decision,
    recommendedWeightKg: row.recommendedWeightKg,
    usedWeightKg: row.usedWeightKg,
    loadDeltaKg: row.loadDeltaKg,
    sets,
    status: row.status,
    completedAt: row.completedAt,
  };
  // An old row has no column: it is the prescribed exercise, not a substitution.
  return row.substitutedFrom === undefined
    ? exerciseSession
    : { ...exerciseSession, substitutedFrom: { ...row.substitutedFrom } };
}

export function setToRow(set: SetRecord, exerciseSessionId: string, sessionId: string): SetRecordRow {
  return {
    id: set.id,
    exerciseSessionId,
    sessionId,
    index: set.index,
    weightKg: set.weightKg,
    targetReps: set.targetReps,
    actualReps: set.actualReps,
    // I-7: an unanswered effort stays null. It is never coerced to "easy".
    effort: set.effort as Effort | null,
    discomfort: set.discomfort as Discomfort | null,
    confirmedAt: set.confirmedAt,
  };
}

export function setFromRow(row: SetRecordRow): SetRecord {
  return {
    id: row.id,
    index: row.index,
    weightKg: row.weightKg,
    targetReps: row.targetReps,
    actualReps: row.actualReps,
    effort: row.effort as Effort | null,
    discomfort: row.discomfort as Discomfort | null,
    confirmedAt: row.confirmedAt,
  };
}

/* -------------------------------------------------------------- measurements */

export function measurementToRow(measurement: BodyMeasurement): BodyMeasurementRow {
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

export function measurementFromRow(row: BodyMeasurementRow): BodyMeasurement {
  return {
    id: row.id,
    date: row.date,
    weightKg: row.weightKg,
    waistCm: row.waistCm,
    chestCm: row.chestCm,
    armCm: row.armCm,
    thighCm: row.thighCm,
    hipCm: row.hipCm,
    bodyFatPercent: row.bodyFatPercent,
    provenance: row.provenance,
  };
}

/* ---------------------------------------------------------------- activities */

export function activityToRow(activity: ActivityRecord): ActivityRow {
  const row: ActivityRow = {
    id: activity.id,
    date: activity.date,
    kind: activity.kind,
    durationSeconds: activity.durationSeconds,
    activeEnergyKcal: activity.activeEnergyKcal,
    provenance: activity.provenance,
  };
  return activity.externalSampleId === null
    ? row
    : { ...row, externalSampleId: activity.externalSampleId };
}

export function activityFromRow(row: ActivityRow): ActivityRecord {
  return {
    id: row.id,
    date: row.date,
    kind: row.kind,
    durationSeconds: row.durationSeconds,
    activeEnergyKcal: row.activeEnergyKcal,
    provenance: row.provenance,
    externalSampleId: row.externalSampleId ?? null,
  };
}

/* --------------------------------------------------- single-row meta records */

export function profileToMetaRow(profile: UserProfile): MetaRow {
  return { key: 'profile', value: copyProfile(profile) };
}

export function phaseStateToMetaRow(state: PhaseState): MetaRow {
  const stored: StoredPhaseState = { block: state.block, passedBlocks: state.passedBlocks };
  // `exactOptionalPropertyTypes`: an absent value stays absent, never `undefined`.
  const withRole: StoredPhaseState =
    state.role === undefined ? stored : { ...stored, role: state.role };
  const withSessions: StoredPhaseState =
    state.scheduledSessionsPerWeek === undefined
      ? withRole
      : { ...withRole, scheduledSessionsPerWeek: state.scheduledSessionsPerWeek };
  return { key: 'phaseState', value: withSessions };
}

export function storageAnswerToMetaRow(answer: StorageAnswer): MetaRow {
  return { key: 'storage', value: { persisted: answer.persisted, checkedAt: answer.checkedAt } };
}

export function phaseStateFromStored(stored: StoredPhaseState): PhaseState {
  const base: PhaseState = { block: stored.block, passedBlocks: stored.passedBlocks };
  const withRole: PhaseState = stored.role === undefined ? base : { ...base, role: stored.role };
  return stored.scheduledSessionsPerWeek === undefined
    ? withRole
    : { ...withRole, scheduledSessionsPerWeek: stored.scheduledSessionsPerWeek };
}

/* ---------------------------------------------------------- recommendations */

export function recommendationToStored(
  recommendation: ProgressionRecommendation,
): StoredRecommendation {
  return { ...recommendation, computedAt: recommendation.computedAt.getTime() };
}

export function recommendationFromStored(
  recommendation: StoredRecommendation,
): ProgressionRecommendation {
  return { ...recommendation, computedAt: new Date(recommendation.computedAt) };
}

/* -------------------------------------------------------------------- copies */

/**
 * Nested values are copied out of the row before they reach the domain: a record read
 * back is a mutable object, and the domain is deeply readonly.
 */
function copyPrescription(prescription: PlanItemRow['prescription']): PlanItemRow['prescription'] {
  return {
    sets: prescription.sets,
    repRange: {
      lowerBound: prescription.repRange.lowerBound,
      upperBound: prescription.repRange.upperBound,
    },
    targetRIR: {
      lowerBound: prescription.targetRIR.lowerBound,
      upperBound: prescription.targetRIR.upperBound,
    },
    restSeconds: prescription.restSeconds,
    // The prescription profile must survive the store: without it every exercise is read
    // back as hypertrophy and the four-column block table collapses into one.
    ...(prescription.role === undefined ? {} : { role: prescription.role }),
  };
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
