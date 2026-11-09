/**
 * `zod` validation for the backup document — docs/data-model.md §9.
 *
 * Rules this file implements, each with its own failing test:
 *
 * - the document type is literal (`rupfit.backup`) and the schema version is known,
 *   with both versions named when it is not;
 * - every collection key is present, and absence is `null`, never a dropped key (§1.6);
 * - numbers are numbers (a nulled-out mass is rejected), ids are non-empty, a set index
 *   is 1-based, an effort is one of the four answered values;
 * - a body measurement carries at least one measure (I-10);
 * - ids are unique inside a collection, so an import cannot silently overwrite a row.
 *
 * The schema is not strict about unknown keys: the migration policy is additive
 * (ADR-011), so a document written by a newer additive build must still import.
 */

import { z } from 'zod';
import {
  DISCOMFORT,
  EFFORT,
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  MOVEMENT_PATTERNS,
  REASON_CODES,
} from '../../core/domain';
import { BACKUP_DOCUMENT_TYPE, BACKUP_SCHEMA_VERSION } from '../constants';
import type { BackupDocument } from './document';

const idSchema = z.string().min(1);
/** Milliseconds since epoch: an integer, and the only instant representation (§2). */
const instantSchema = z.number().int();
const massSchema = z.number();

/**
 * `EFFORT` and `DISCOMFORT` are numeric in `src/core` (`failure: 0 … easy: 3`), so the
 * stored and exported values are numbers too — same ordering, same meaning (§2).
 */
const effortSchema = z.union([
  z.literal(EFFORT.failure),
  z.literal(EFFORT.hard),
  z.literal(EFFORT.correct),
  z.literal(EFFORT.easy),
]);

const discomfortSchema = z.union([
  z.literal(DISCOMFORT.none),
  z.literal(DISCOMFORT.mild),
  z.literal(DISCOMFORT.pain),
]);

const repRangeSchema = z.object({
  lowerBound: z.number().int(),
  upperBound: z.number().int(),
});

const blockRoleSchema = z
  .enum(['strength', 'hypertrophy', 'accessory', 'preventive', 'primary'])
  .transform((value) => (value === 'primary' ? ('hypertrophy' as const) : value));

const prescriptionSchema = z.object({
  sets: z.number().int().min(0),
  repRange: repRangeSchema,
  targetRIR: repRangeSchema,
  restSeconds: z.number().int().min(0),
  /** Additive: prescriptions written before profiles existed simply omit it. */
  role: blockRoleSchema.optional(),
});

const confidenceSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  sessionsConsidered: z.number().int().min(0),
});

const blockCriterionSchema = z.enum([
  'incompleteSets',
  'setAtFailure',
  'discomfort',
  'missedSessions',
  'insufficientWeeks',
]);

const reasonContextSchema = z.object({
  sets: z.number().int().optional(),
  reps: z.number().int().optional(),
  kg: z.number().optional(),
  next: z.number().optional(),
  nextReps: z.number().int().optional(),
  bottom: z.number().int().optional(),
  week: z.number().int().optional(),
  weeks: z.number().int().optional(),
  failedCriteria: z.array(blockCriterionSchema).optional(),
});

const recommendationSchema = z.object({
  suggestedWeightKg: massSchema.nullable(),
  suggestedSets: z.number().int().min(0),
  suggestedTargetReps: z.number().int().min(1),
  action: z.enum(['increase', 'hold', 'decrease', 'startFirstTime', 'insufficientData']),
  reason: z.enum(REASON_CODES),
  confidence: confidenceSchema,
  basedOnSessions: z.number().int().min(0),
  computedAt: instantSchema,
  reasonContext: reasonContextSchema,
});

const loadDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accepted') }),
  z.object({ kind: z.literal('repeated') }),
  z.object({ kind: z.literal('manual'), kg: massSchema }),
]);

/** I-7: an unanswered effort is `null` — the key is required and nullable. */
const setSchema = z.object({
  id: idSchema,
  index: z.number().int().min(1),
  weightKg: massSchema,
  targetReps: z.number().int().min(1),
  actualReps: z.number().int().min(0),
  effort: effortSchema.nullable(),
  discomfort: discomfortSchema.nullable(),
  confirmedAt: instantSchema,
});

const exerciseSessionSchema = z.object({
  id: idSchema,
  order: z.number().int(),
  exerciseId: idSchema.nullable(),
  exerciseNameSnapshot: z.string().min(1),
  prescription: prescriptionSchema,
  recommendation: recommendationSchema.nullable(),
  decision: loadDecisionSchema.nullable(),
  recommendedWeightKg: massSchema.nullable(),
  usedWeightKg: massSchema.nullable(),
  loadDeltaKg: z.number().nullable(),
  sets: z.array(setSchema),
  status: z.enum(['pending', 'active', 'done', 'skipped']),
  completedAt: instantSchema.nullable(),
});

const phaseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('normal') }),
  z.object({ kind: z.literal('readaptation'), week: z.number().int().min(1).max(8) }),
]);

const sessionSchema = z.object({
  id: idSchema,
  planDayId: idSchema,
  dayNameSnapshot: z.string().min(1),
  scheduledDate: instantSchema,
  startedAt: instantSchema.nullable(),
  endedAt: instantSchema.nullable(),
  phase: phaseSchema,
  status: z.enum(['scheduled', 'inProgress', 'completed', 'partial', 'abandoned']),
  exercises: z.array(exerciseSessionSchema),
});

const exerciseSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  primaryMuscle: z.enum(MUSCLE_GROUPS),
  pattern: z.enum(MOVEMENT_PATTERNS),
  equipment: z.enum(EQUIPMENT_TYPES),
  loadIncrementKg: z.number().min(0),
  isCustom: z.boolean(),
  isArchived: z.boolean(),
  /**
   * T3: additive library detail. Optional on purpose — a backup written before the fields
   * existed must still validate, and a document that carries them must not be rejected.
   */
  secondaryMuscles: z.array(z.enum(MUSCLE_GROUPS)).optional(),
  description: z.string().min(1).optional(),
  variantOf: idSchema.optional(),
  alternatives: z.array(idSchema).optional(),
});

const planItemSchema = z.object({
  id: idSchema,
  planDayId: idSchema,
  order: z.number().int(),
  exerciseId: idSchema.nullable(),
  exerciseNameSnapshot: z.string().min(1),
  prescription: prescriptionSchema,
});

const planDaySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  order: z.number().int(),
  items: z.array(planItemSchema),
});

const provenanceSchema = z.enum(['imported', 'manual', 'estimated']);

/** I-10 as a validation rule: at least one measure must be present. */
const measurementSchema = z
  .object({
    id: idSchema,
    date: instantSchema,
    weightKg: massSchema.nullable(),
    waistCm: z.number().nullable(),
    chestCm: z.number().nullable(),
    armCm: z.number().nullable(),
    thighCm: z.number().nullable(),
    hipCm: z.number().nullable(),
    bodyFatPercent: z.number().nullable(),
    provenance: provenanceSchema,
  })
  .refine(
    (row) =>
      row.weightKg !== null ||
      row.waistCm !== null ||
      row.chestCm !== null ||
      row.armCm !== null ||
      row.thighCm !== null ||
      row.hipCm !== null ||
      row.bodyFatPercent !== null,
    { message: 'A body measurement must carry at least one measure.' },
  );

const activitySchema = z.object({
  id: idSchema,
  date: instantSchema,
  kind: z.enum(['strength', 'cardio', 'other']),
  durationSeconds: z.number().int().min(0),
  activeEnergyKcal: z.number().nullable(),
  provenance: provenanceSchema,
  externalSampleId: z.string().min(1).nullable(),
});

const profileSchema = z.object({
  id: idSchema,
  displayName: z.string().nullable(),
  massUnit: z.enum(['kilograms', 'pounds']),
  weightGoal: z.enum(['maintain', 'lose', 'gain']).nullable(),
  weeklyTrainingDays: z.number().int().min(0),
  availableEquipment: z.array(z.enum(EQUIPMENT_TYPES)),
  autoStartRestTimer: z.boolean(),
});

const phaseStateSchema = z.object({
  block: z.number().int().min(1).max(4),
  passedBlocks: z.number().int().min(0).max(4),
  // `primary` is the pre-profile name of hypertrophy work: old backups keep loading.
  role: blockRoleSchema.optional(),
  scheduledSessionsPerWeek: z.number().int().min(0).optional(),
});

const documentSchema = z
  .object({
    documentType: z.literal(BACKUP_DOCUMENT_TYPE),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    appVersion: z.string().min(1),
    exportedAt: z.string().min(1),
    profile: profileSchema.nullable(),
    phaseState: phaseStateSchema.nullable(),
    exercises: z.array(exerciseSchema),
    planDays: z.array(planDaySchema),
    sessions: z.array(sessionSchema),
    bodyMeasurements: z.array(measurementSchema),
    activities: z.array(activitySchema),
  })
  .superRefine((document, context) => {
    const collections = [
      ['exercises', document.exercises],
      ['planDays', document.planDays],
      ['sessions', document.sessions],
      ['bodyMeasurements', document.bodyMeasurements],
      ['activities', document.activities],
    ] as const;

    for (const [name, rows] of collections) {
      const seen = new Set<string>();
      rows.forEach((row, index) => {
        if (seen.has(row.id)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate id ${row.id}: an import may not overwrite a row it also declares.`,
            path: [name, index, 'id'],
          });
        }
        seen.add(row.id);
      });
    }
  });

export interface ValidationFailure {
  readonly ok: false;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly document: BackupDocument }
  | ValidationFailure;

/**
 * Parses and validates. A document that is not JSON, or whose `schemaVersion` is not
 * this build's, is rejected before the shape is looked at, so the message can name
 * both versions (§9).
 */
export function parseBackupDocument(json: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      path: '',
      message: `The document is not JSON: ${(error as Error).message}`,
    };
  }

  const declaredVersion =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { schemaVersion?: unknown }).schemaVersion
      : undefined;

  if (typeof declaredVersion === 'number' && declaredVersion !== BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      path: 'schemaVersion',
      message: `The document declares schemaVersion ${declaredVersion}; this build reads schemaVersion ${BACKUP_SCHEMA_VERSION}. No partial import is attempted.`,
    };
  }

  const result = documentSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      path: formatIssuePath(issue?.path ?? []),
      message: issue?.message ?? 'The document is not a rupfit backup document.',
    };
  }

  // The schema mirrors the domain exactly; this is where the two are asserted equal.
  return { ok: true, document: result.data as unknown as BackupDocument };
}

/** `sessions[3].exercises[0].sets[1].effort` — the path the document asks for (§9). */
export function formatIssuePath(path: readonly (string | number | symbol)[]): string {
  let formatted = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      formatted += `[${segment}]`;
    } else {
      formatted += formatted === '' ? String(segment) : `.${String(segment)}`;
    }
  }
  return formatted;
}
