/**
 * The ports the features consume — architecture §7, data-model §5.4, §9, §10.
 *
 * Nothing here exposes an IndexedDB handle, a record or a transaction: a repository
 * returns domain types, and a fake can replace the whole port in a test. That is what
 * makes `src/storage` an adapter instead of the model (architecture §1.4).
 */

import type { MovementPattern } from '../core/domain';
import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  ExerciseSession,
  EpochMs,
  LoadDecision,
  PlanDay,
  PhaseState,
  SetRecord,
  SessionStatus,
  StorageAnswer,
  SubstitutedFrom,
  UserProfile,
  Uuid,
  WorkoutSession,
} from './entities';
import type { StorageState } from './db';

/** An exercise session without its set list: what a transaction may return (§5.4). */
export type ExerciseSessionState = Omit<ExerciseSession, 'sets'>;

/** A session after a status change, without set lists. Read `byId` for the aggregate. */
export type SessionStateChange = Omit<WorkoutSession, 'exercises'> & {
  readonly exercises: readonly ExerciseSessionState[];
};

/** §5.4 "Record a load decision": what the decision transaction computes and stores. */
export interface LoadDecisionRecord {
  readonly exerciseSessionId: Uuid;
  readonly decision: LoadDecision;
  readonly recommendedWeightKg: number | null;
  readonly usedWeightKg: number;
  /** `usedWeightKg − recommendedWeightKg` at decision time (I-8). */
  readonly loadDeltaKg: number | null;
}

export interface LoadDecisionInput {
  readonly exerciseSessionId: Uuid;
  readonly decision: LoadDecision;
  /** The frozen recommendation's weight, or `null` when the app suggested nothing. */
  readonly recommendedWeightKg: number | null;
  /** The weight being repeated (docs/data-model.md §3 `LoadDecision.repeated`). */
  readonly previousWeightKg: number | null;
}

export interface DeleteSessionInput {
  /** The typed confirmation: `deleteSessionConfirmation(dayNameSnapshot)` (I-5). */
  readonly confirmation: string;
}

export interface DeleteAllInput {
  /** `DELETE_ALL_CONFIRMATION`; anything else refuses the operation (§10). */
  readonly confirmation: string;
  /** The exercise library written back after the reset (§10 reseeds it). */
  readonly seed?: readonly Exercise[];
}

/**
 * `Sugerir otro ejercicio` for this session only (odd/tasks/training-flow.md S4, T5).
 *
 * The row keeps its `id` — the sets it may later receive point at it — and takes the
 * substitute's `exerciseId` and snapshot name, so the substitute progresses on its own
 * history. `substitutedFrom` preserves what the slot prescribed, so the read-out can say
 * that it was a substitution and the original's history is untouched.
 */
export interface SubstituteExerciseInput {
  readonly exerciseSessionId: Uuid;
  readonly exerciseId: Uuid | null;
  readonly exerciseNameSnapshot: string;
  readonly substitutedFrom: SubstitutedFrom;
}

/** I-1: what the open sequence counts. Report only; the scan never deletes (Q-5). */
export interface OrphanReport {
  readonly setsWithoutExerciseSession: number;
  readonly exerciseSessionsWithoutSession: number;
  readonly planItemsWithoutPlanDay: number;
}

export interface OpenReport {
  readonly state: StorageState;
  readonly orphans: OrphanReport;
}

export interface SessionRepositoryPort {
  byId(id: Uuid): Promise<WorkoutSession | undefined>;
  /** The session offered as *resume* on launch (§7); never a pending-deletion row. */
  inProgress(): Promise<WorkoutSession | undefined>;
  /** Next scheduled session on or after `date`, read through `by_scheduledDate`. */
  nextScheduledOnOrAfter(date: EpochMs): Promise<WorkoutSession | undefined>;
  /** Most recent sessions first, for Historial. */
  recent(limit: number): Promise<readonly WorkoutSession[]>;
  /**
   * Writes a scheduled session and its exercise sessions. Sets are written only by
   * `confirmSet`, so a created session never carries a set list.
   */
  create(session: WorkoutSession): Promise<WorkoutSession>;
  /**
   * I-12: one transaction over `sets`, `exerciseSessions` and `sessions`, resolving
   * on `complete`. Transitions to `inProgress` on the first set, guarded by I-9.
   */
  confirmSet(sessionId: Uuid, exerciseSessionId: Uuid, set: SetRecord): Promise<WorkoutSession>;
  /** I-8: writes the decision once and stores `loadDeltaKg` with it. */
  recordDecision(input: LoadDecisionInput): Promise<LoadDecisionRecord>;
  /**
   * S4/T5: swaps the exercise of one exercise session, in one transaction, before any set
   * of it is confirmed. The plan is not touched: a session row is a snapshot.
   */
  substitute(input: SubstituteExerciseInput): Promise<ExerciseSessionState>;
  /** §7: a terminal status only from `inProgress`, in one transaction. */
  finish(sessionId: Uuid, status: SessionStatus, at: EpochMs): Promise<SessionStateChange>;
  /** I-5: the flag is committed first, so the deletion cannot be silent. */
  markDeletionPending(id: Uuid): Promise<void>;
  pendingDeletionIds(): Promise<readonly Uuid[]>;
  /** I-1: cascades over sets and exercise sessions in the same transaction. */
  delete(sessionId: Uuid, input: DeleteSessionInput): Promise<void>;
}

export interface ExerciseRepositoryPort {
  /** Active first, through `by_archived` (§5.1). */
  all(): Promise<readonly Exercise[]>;
  byId(id: Uuid): Promise<Exercise | undefined>;
  byPattern(pattern: MovementPattern): Promise<readonly Exercise[]>;
  save(exercise: Exercise): Promise<void>;
  /** Archive, never delete: history keeps its reference (I-4). */
  setArchived(id: Uuid, archived: boolean): Promise<void>;
  /** Custom exercises only. Clears `exerciseId` on history, keeps the snapshot (I-4). */
  remove(id: Uuid): Promise<void>;
}

export interface PlanRepositoryPort {
  /** Weekday templates in `by_order` order, each with its ordered items. */
  all(): Promise<readonly PlanDay[]>;
  byId(id: Uuid): Promise<PlanDay | undefined>;
  /** Replaces the day's item list in one transaction. */
  save(day: PlanDay): Promise<void>;
  remove(id: Uuid): Promise<void>;
}

export interface MeasurementRepositoryPort {
  all(): Promise<readonly BodyMeasurement[]>;
  between(from: EpochMs, to: EpochMs): Promise<readonly BodyMeasurement[]>;
  /** I-10 is enforced here, before the row is written. */
  save(measurement: BodyMeasurement): Promise<void>;
  remove(id: Uuid): Promise<void>;
}

export interface ActivityRepositoryPort {
  all(): Promise<readonly ActivityRecord[]>;
  between(from: EpochMs, to: EpochMs): Promise<readonly ActivityRecord[]>;
  /** I-11: a clashing `externalSampleId` is refused, never duplicated. */
  save(activity: ActivityRecord): Promise<void>;
  remove(id: Uuid): Promise<void>;
}

export interface ProfileRepositoryPort {
  read(): Promise<UserProfile | undefined>;
  save(profile: UserProfile): Promise<void>;
}

export interface MetaRepositoryPort {
  readPhaseState(): Promise<PhaseState | undefined>;
  savePhaseState(state: PhaseState): Promise<void>;
  /** Q-4: the recorded answer, probed once per launch, never prompted for. */
  readStorageAnswer(): Promise<StorageAnswer | undefined>;
  saveStorageAnswer(answer: StorageAnswer): Promise<void>;
}

/** §9: the collections the document carries, and with them the import report keys. */
export const BACKUP_COLLECTIONS = [
  'profile',
  'phaseState',
  'exercises',
  'planDays',
  'sessions',
  'bodyMeasurements',
  'activities',
] as const;

export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

export type BackupCounts = Readonly<Record<BackupCollection, number>>;

export interface ExportInput {
  /** Injected, never read from the environment: the store has no clock. */
  readonly appVersion: string;
  readonly exportedAt: EpochMs;
}

export interface BackupExport {
  readonly document: import('./codec/document').BackupDocument;
  /** The document serialised as JSON: what the download, the share sheet and the clipboard take. */
  readonly json: string;
}

export type BackupValidation =
  | { readonly ok: true; readonly document: import('./codec/document').BackupDocument }
  | { readonly ok: false; readonly path: string; readonly message: string };

export type ImportInput =
  | { readonly json: string; readonly mode: 'restore'; readonly confirmation: string }
  /** Bridge imports: measurements and activities only, never training history (§9). */
  | { readonly json: string; readonly mode: 'merge' };

export interface ImportReport {
  readonly mode: 'restore' | 'merge';
  readonly written: BackupCounts;
  readonly skipped: BackupCounts;
}

export interface BackupPort {
  export(input: ExportInput): Promise<BackupExport>;
  /** Synchronous and total: a document either validates or names its first failure. */
  validate(json: string): BackupValidation;
  /** Validation happens before the transaction opens; a failure changes nothing. */
  import(input: ImportInput): Promise<ImportReport>;
}

export interface StoragePort {
  readonly sessions: SessionRepositoryPort;
  readonly exercises: ExerciseRepositoryPort;
  readonly plan: PlanRepositoryPort;
  readonly measurements: MeasurementRepositoryPort;
  readonly activities: ActivityRepositoryPort;
  readonly profile: ProfileRepositoryPort;
  readonly meta: MetaRepositoryPort;
  readonly backup: BackupPort;

  /** Opens the database and reports the orphan count of I-1. */
  open(): Promise<OpenReport>;
  state(): StorageState;
  subscribe(listener: (state: StorageState) => void): () => void;
  scanOrphans(): Promise<OrphanReport>;
  /** §10, with the typed confirmation. */
  deleteAll(input: DeleteAllInput): Promise<void>;
  close(): void;
}

