/**
 * Flat persisted records and the schema table — docs/data-model.md §5.1, §5.2.
 *
 * Two rules live here and nowhere else:
 *
 * 1. The stored shape is not the domain shape (ADR-002). Records are flat,
 *    denormalised and carry the raw field names IndexedDB can index; `mappers.ts`
 *    converts both ways and the domain never sees a record.
 * 2. `RupfitDb` is a compile-time description only. The browser enforces none of it —
 *    neither key types nor index presence — which is why the import boundary and the
 *    read boundary validate (§11).
 */

import type { DBSchema } from 'idb';
import type { BlockRole } from '../core/domain/progression';
import type { MuscleGroup, ProgressionRecommendation } from '../core/domain';
import type { SyncTable } from '../cloud/types';
import type {
  ActivityKind,
  EpochMs,
  Exercise,
  ExercisePrescription,
  ExerciseStatus,
  LoadDecision,
  Provenance,
  SessionStatus,
  StorageAnswer,
  UserProfile,
  WeekRecord,
} from './entities';

/** §5.1, in the order the document lists them. Nine stores, no tenth (I-6). */
export const STORE_NAMES = [
  'meta',
  'exercises',
  'planDays',
  'planItems',
  'sessions',
  'exerciseSessions',
  'sets',
  'bodyMeasurements',
  'activities',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface IndexSchema {
  readonly name: string;
  readonly keyPath: string | readonly string[];
  readonly unique: boolean;
}

export interface StoreSchema {
  readonly name: StoreName;
  readonly keyPath: string;
  readonly indexes: readonly IndexSchema[];
}

/**
 * §5.1 in full: the stores, their key paths and the twelve indexes that serve the
 * queries the app actually makes. The upgrade step reads this table, and
 * `tests/storage/schema.test.ts` compares it against a transcription of the document.
 */
export const SCHEMA: readonly StoreSchema[] = [
  { name: 'meta', keyPath: 'key', indexes: [] },
  {
    name: 'exercises',
    keyPath: 'id',
    indexes: [
      { name: 'by_archived', keyPath: 'isArchived', unique: false },
      { name: 'by_pattern', keyPath: 'pattern', unique: false },
    ],
  },
  {
    name: 'planDays',
    keyPath: 'id',
    indexes: [{ name: 'by_order', keyPath: 'order', unique: false }],
  },
  {
    name: 'planItems',
    keyPath: 'id',
    indexes: [{ name: 'by_planDay_order', keyPath: ['planDayId', 'order'], unique: false }],
  },
  {
    name: 'sessions',
    keyPath: 'id',
    indexes: [
      { name: 'by_status', keyPath: 'status', unique: false },
      { name: 'by_scheduledDate', keyPath: 'scheduledDate', unique: false },
    ],
  },
  {
    name: 'exerciseSessions',
    keyPath: 'id',
    indexes: [
      { name: 'by_session_order', keyPath: ['sessionId', 'order'], unique: false },
      { name: 'by_exercise_date', keyPath: ['exerciseId', 'sessionDate'], unique: false },
    ],
  },
  {
    name: 'sets',
    keyPath: 'id',
    indexes: [
      { name: 'by_exerciseSession_index', keyPath: ['exerciseSessionId', 'index'], unique: false },
    ],
  },
  {
    name: 'bodyMeasurements',
    keyPath: 'id',
    indexes: [{ name: 'by_date', keyPath: 'date', unique: false }],
  },
  {
    name: 'activities',
    keyPath: 'id',
    indexes: [
      { name: 'by_date', keyPath: 'date', unique: false },
      // Unique so re-importing the same bridge sample cannot duplicate (I-11). A row
      // without `externalSampleId` is simply not in the index, so manual rows coexist.
      { name: 'by_externalSampleId', keyPath: 'externalSampleId', unique: true },
    ],
  },
];

export const ALL_STORES: readonly StoreName[] = STORE_NAMES;

/* ------------------------------------------------------------------- records */

/**
 * The per-row sync metadata — `docs/cloud-sync.md` §2, mirrored locally.
 *
 * `rev` is the client's conflict counter, `updatedAt` the instant this device last
 * changed the row (the sweep compares it), `deletedAt` the soft-delete mark of a row
 * pulled from another device. The remote carries the same three numbers, plus
 * `user_id`/`created_at`/`updated_at`, which are server bookkeeping and are not stored
 * here: a row belongs to whoever is signed in, and the server owns its own clock.
 *
 * Optional, because a row written before the sync columns existed simply does not have
 * them. That is what makes the whole change additive with **no `DB_VERSION` bump**:
 * IndexedDB stores are schemaless, no index is created over `sync`, and the upgrade
 * step does not need to touch a single row. `mappers.ts` reads an absent value as
 * `SYNC_UNKNOWN`.
 */
export interface SyncMeta {
  readonly rev: number;
  readonly updatedAt: EpochMs;
  readonly deletedAt: EpochMs | null;
}

/**
 * One pending queue op, as it is stored in `meta`.
 *
 * Field for field what `src/cloud/outbox.ts` calls `OutboxOp`: the same identity
 * (`table:rowId:rev`), the same retry counter and the same last error, so the sync
 * service's queue can be handed this store without a translation layer. `src/storage`
 * never imports the queue's code, only the vocabulary (a type).
 */
export interface PendingSyncOp {
  readonly id: string;
  readonly table: SyncTable;
  readonly rowId: string;
  readonly op: 'upsert' | 'delete';
  readonly rev: number;
  readonly queuedAt: EpochMs;
  readonly attempts: number;
  readonly lastError: string | null;
}

/** How far each table has been pushed to the account. Only ever moves forward. */
export type SyncWatermarks = Partial<Record<SyncTable, EpochMs>>;

/**
 * §5.2: `isArchived` is stored as `0 | 1`, not as a boolean, because a boolean is
 * not a valid IndexedDB key and `by_archived` would then hold no records at all.
 * Ascending order over the index puts the active rows first, which is the library
 * list the document asks for.
 */
export type ArchivedFlag = 0 | 1;

export interface ExerciseRow {
  id: string;
  name: string;
  primaryMuscle: Exercise['primaryMuscle'];
  pattern: Exercise['pattern'];
  equipment: Exercise['equipment'];
  loadIncrementKg: number;
  isCustom: boolean;
  isArchived: ArchivedFlag;
  /**
   * Additive library detail (T3). Every member is optional and none is indexed: a row
   * written before these columns existed simply does not have them, `mappers.ts` reads
   * that as "no detail", and nothing has to be rewritten on upgrade.
   */
  secondaryMuscles?: readonly MuscleGroup[];
  description?: string;
  variantOf?: string;
  alternatives?: readonly string[];
  /** The inline pictogram key of this concrete variant (training-flow T4). */
  illustration?: string;
  /** Bumped by every repository write (see `SyncMeta`). */
  sync?: SyncMeta;
}

export interface PlanDayRow {
  id: string;
  name: string;
  order: number;
  sync?: SyncMeta;
}

export interface PlanItemRow {
  id: string;
  planDayId: string;
  order: number;
  exerciseId: string | null;
  exerciseNameSnapshot: string;
  /** Stored whole: read and written with its parent, never queried by field (§5.2). */
  prescription: ExercisePrescription;
  sync?: SyncMeta;
}

export interface SessionRow {
  id: string;
  planDayId: string;
  dayNameSnapshot: string;
  scheduledDate: EpochMs;
  startedAt: EpochMs | null;
  endedAt: EpochMs | null;
  /** Stored whole: a discriminated union that is never queried by field. */
  phase: SchedulePhase;
  status: SessionStatus;
  /**
   * I-5's enforcer: the row is flagged and committed before anything is removed, so a
   * session with confirmed sets cannot disappear in a single silent step.
   */
  deletionPending: boolean;
  sync?: SyncMeta;
}

/** `TrainingPhase` without importing a union shape the index cannot use. */
export type SchedulePhase = { kind: 'normal' } | { kind: 'readaptation'; week: number };

/** §5.2, exactly as the document writes it. */
export interface ExerciseSessionRow {
  id: string;
  sessionId: string;
  /** Denormalised: the date lives on the parent session and `by_exercise_date` needs it. */
  sessionDate: EpochMs;
  order: number;
  exerciseId: string | null;
  exerciseNameSnapshot: string;
  prescription: ExercisePrescription;
  recommendation: StoredRecommendation | null;
  decision: LoadDecision | null;
  recommendedWeightKg: number | null;
  usedWeightKg: number | null;
  loadDeltaKg: number | null;
  status: ExerciseStatus;
  completedAt: EpochMs | null;
  /**
   * The substitution this row carries (training-flow S4, T5), absent on every row that
   * was not swapped and on every row written before the column existed: an optional,
   * unindexed member needs no migration and no schema bump.
   */
  substitutedFrom?: SubstitutedFrom;
  sync?: SyncMeta;
}

/** The stored half of `SubstitutedFrom`: plain, JSON-safe, no `Date`. */
export interface SubstitutedFrom {
  exerciseId: string | null;
  exerciseNameSnapshot: string;
  at: EpochMs;
}

/** A recommendation with its instant as an indexable, JSON-safe number (§2). */
export type StoredRecommendation = Omit<ProgressionRecommendation, 'computedAt'> & {
  readonly computedAt: EpochMs;
};

/** §5.2, exactly as the document writes it. */
export interface SetRecordRow {
  id: string;
  exerciseSessionId: string;
  /** Denormalised for session-level reads. */
  sessionId: string;
  index: number;
  weightKg: number;
  targetReps: number;
  actualReps: number;
  effort: number | null;
  discomfort: number | null;
  confirmedAt: EpochMs;
  sync?: SyncMeta;
}

export interface BodyMeasurementRow {
  id: string;
  date: EpochMs;
  weightKg: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  hipCm: number | null;
  bodyFatPercent: number | null;
  provenance: Provenance;
  sync?: SyncMeta;
}

export interface ActivityRow {
  id: string;
  date: EpochMs;
  kind: ActivityKind;
  durationSeconds: number;
  activeEnergyKcal: number | null;
  provenance: Provenance;
  /**
   * Omitted, never `null`, on a manual row: the document says "rows without
   * `externalSampleId` are simply not in the index" (§5.1), and an omitted key is the
   * unambiguous way to say that.
   */
  externalSampleId?: string;
  sync?: SyncMeta;
}

/** `PhaseState` with its optional members materialised (§5.1 single-row record). */
export interface StoredPhaseState {
  block: number;
  passedBlocks: number;
  role?: BlockRole;
  scheduledSessionsPerWeek?: number;
}

/**
 * Everything `meta` may hold. The nine-store schema is unchanged: the queue ops and the
 * push watermarks are rows in this already-existing store, keyed by a string, which is
 * why neither needs an upgrade step. The week record (T3) is the same case.
 */
export type MetaRow =
  | { key: 'profile'; value: UserProfile; sync?: SyncMeta }
  | { key: 'phaseState'; value: StoredPhaseState; sync?: SyncMeta }
  | { key: 'storage'; value: StorageAnswer }
  | { key: 'week'; value: WeekRecord }
  | { key: 'syncWatermarks'; value: SyncWatermarks }
  | { key: `outbox:${string}`; value: PendingSyncOp };

/* -------------------------------------------------------------- idb DBSchema */

/**
 * The compile-time description `idb` uses for store and index names. Types only.
 * Index key types repeat the §5.1 table: a compound index is a tuple.
 */
export interface RupfitDb extends DBSchema {
  meta: { key: string; value: MetaRow };
  exercises: {
    key: string;
    value: ExerciseRow;
    indexes: { by_archived: ArchivedFlag; by_pattern: string };
  };
  planDays: { key: string; value: PlanDayRow; indexes: { by_order: number } };
  planItems: {
    key: string;
    value: PlanItemRow;
    indexes: { by_planDay_order: [string, number] };
  };
  sessions: {
    key: string;
    value: SessionRow;
    indexes: { by_status: string; by_scheduledDate: number };
  };
  exerciseSessions: {
    key: string;
    value: ExerciseSessionRow;
    indexes: {
      by_session_order: [string, number];
      by_exercise_date: [string, number];
    };
  };
  sets: {
    key: string;
    value: SetRecordRow;
    indexes: { by_exerciseSession_index: [string, number] };
  };
  bodyMeasurements: {
    key: string;
    value: BodyMeasurementRow;
    indexes: { by_date: number };
  };
  activities: {
    key: string;
    value: ActivityRow;
    indexes: { by_date: number; by_externalSampleId: string };
  };
}
