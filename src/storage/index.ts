/**
 * Public storage surface. The features import from here — ports and domain shapes —
 * never an IndexedDB type (architecture §7).
 */

export {
  BACKUP_DOCUMENT_TYPE,
  BACKUP_SCHEMA_VERSION,
  DB_NAME,
  DB_VERSION,
  DELETE_ALL_CONFIRMATION,
  META_KEYS,
  RESTORE_CONFIRMATION,
  SET_INDEX_START,
  deleteSessionConfirmation,
} from './constants';

export { StorageError, isStorageError, type StorageErrorCode, type StorageErrorDetail } from './errors';

export type {
  ActivityKind,
  ActivityRecord,
  BodyMeasurement,
  Discomfort,
  Effort,
  EpochMs,
  Equipment,
  Exercise,
  ExercisePrescription,
  ExerciseSession,
  ExerciseStatus,
  LoadDecision,
  MassUnit,
  PhaseState,
  PlanDay,
  PlanItem,
  Provenance,
  RepRange,
  SessionStatus,
  SetRecord,
  StorageAnswer,
  SubstitutedFrom,
  TrainingPhase,
  UserProfile,
  Uuid,
  WeightGoal,
  WorkoutSession,
} from './entities';

export {
  ALL_STORES,
  SCHEMA,
  STORE_NAMES,
  type IndexSchema,
  type RupfitDb,
  type StoreName,
  type StoreSchema,
} from './records';

export {
  defaultDatabaseFactory,
  type DatabaseFactory,
  type DatabaseHandlers,
  type DatabaseOptions,
  type DeleteHandlers,
  type StorageState,
  type StorageStatus,
} from './db';

export {
  BACKUP_COLLECTIONS,
  type BackupCollection,
  type BackupCounts,
  type BackupExport,
  type BackupPort,
  type BackupValidation,
  type DeleteAllInput,
  type DeleteSessionInput,
  type ExerciseRepositoryPort,
  type ExerciseSessionState,
  type ExportInput,
  type ImportInput,
  type ImportReport,
  type LoadDecisionInput,
  type LoadDecisionRecord,
  type MeasurementRepositoryPort,
  type MetaRepositoryPort,
  type OpenReport,
  type OrphanReport,
  type PlanRepositoryPort,
  type ProfileRepositoryPort,
  type SessionRepositoryPort,
  type SessionStateChange,
  type StoragePort,
  type SubstituteExerciseInput,
} from './port';

export {
  buildBackupDocument,
  decodeSession,
  encodeSession,
  serializeDocument,
  type BackupDocument,
  type DocumentData,
  type DocumentMetadata,
  type EncodedExerciseSession,
  type EncodedSession,
} from './codec/document';

export { formatIssuePath, parseBackupDocument } from './codec/schema';

export { createStorage, IndexedDbStorage, type StorageOptions } from './storage';
