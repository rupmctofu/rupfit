/**
 * Hand-written mirror of supabase/migrations — the shapes `@supabase/supabase-js`
 * returns for each table. `npx supabase gen types typescript` is the usual source, but
 * it needs a live project; this file is kept small and explicit until one exists.
 *
 * Conventions taken from the migrations (docs/cloud-sync.md):
 * - ids are the app's own `crypto.randomUUID()` strings, kept as text;
 * - every `*_at` / `*_date` that mirrors an `EpochMs` is `bigint` in PostgreSQL and
 *   `number` here (milliseconds since the epoch, well inside Number.MAX_SAFE_INTEGER);
 * - `jsonb` columns are `Json`, because the app stores those values whole;
 * - `created_at` / `updated_at` are timestamptz, which supabase-js serialises as an
 *   ISO-8601 string.
 *
 * When the project exists, replace this file with the generated one and diff the
 * result; nothing in the repository should need to change.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Columns every mirrored table shares (docs/cloud-sync.md § "Sync columns"). */
export interface SyncRow {
  user_id: string;
  created_at: string;
  updated_at: string;
  rev: number;
  deleted_at: string | null;
}

/** On insert the server fills the sync columns: `auth.uid()`, `now()`, `1`, `null`. */
export type SyncInsert = {
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  rev?: number;
  deleted_at?: string | null;
};

export type SyncUpdate = SyncInsert;

export type MuscleGroup =
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'calves'
  | 'lowerBack'
  | 'chest'
  | 'shoulders'
  | 'triceps'
  | 'lats'
  | 'upperBack'
  | 'biceps'
  | 'forearms'
  | 'core';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'horizontalPush'
  | 'verticalPush'
  | 'horizontalPull'
  | 'verticalPull'
  | 'isolation'
  | 'core';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'band';

export interface ProfilesRow extends SyncRow {
  id: string;
  display_name: string | null;
  mass_unit: 'kilograms' | 'pounds';
  weight_goal: 'maintain' | 'lose' | 'gain' | null;
  weekly_training_days: number;
  available_equipment: Equipment[];
  auto_start_rest_timer: boolean;
}

export interface PlanDaysRow extends SyncRow {
  id: string;
  name: string;
  day_order: number;
}

export interface PlanItemsRow extends SyncRow {
  id: string;
  plan_day_id: string;
  item_order: number;
  exercise_id: string | null;
  exercise_name_snapshot: string;
  prescription: Json;
}

export interface PhaseStateRow extends SyncRow {
  id: string;
  block: number;
  passed_blocks: number;
  role: 'strength' | 'hypertrophy' | 'accessory' | 'preventive' | null;
  scheduled_sessions_per_week: number | null;
}

export interface ExercisesRow extends SyncRow {
  id: string;
  name: string;
  primary_muscle: MuscleGroup;
  pattern: MovementPattern;
  equipment: Equipment;
  load_increment_kg: number;
  is_custom: boolean;
  is_archived: boolean;
  secondary_muscles: MuscleGroup[];
  description: string | null;
  variant_of: string | null;
  alternatives: string[];
}

export interface SessionsRow extends SyncRow {
  id: string;
  plan_day_id: string;
  day_name_snapshot: string;
  scheduled_date: number;
  started_at: number | null;
  ended_at: number | null;
  phase: Json;
  status: 'scheduled' | 'inProgress' | 'completed' | 'partial' | 'abandoned';
  deletion_pending: boolean;
}

export interface SessionExercisesRow extends SyncRow {
  id: string;
  session_id: string;
  session_date: number;
  session_order: number;
  exercise_id: string | null;
  exercise_name_snapshot: string;
  prescription: Json;
  recommendation: Json | null;
  decision: Json | null;
  recommended_weight_kg: number | null;
  used_weight_kg: number | null;
  load_delta_kg: number | null;
  status: 'pending' | 'active' | 'done' | 'skipped';
  completed_at: number | null;
}

export interface SetsRow extends SyncRow {
  id: string;
  exercise_session_id: string;
  session_id: string;
  set_index: number;
  weight_kg: number;
  target_reps: number;
  actual_reps: number;
  effort: number | null;
  discomfort: number | null;
  confirmed_at: number;
}

export interface BodyMeasurementsRow extends SyncRow {
  id: string;
  measured_at: number;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  hip_cm: number | null;
  body_fat_percent: number | null;
  provenance: 'imported' | 'manual' | 'estimated';
}

export interface ActivitiesRow extends SyncRow {
  id: string;
  occurred_at: number;
  kind: 'strength' | 'cardio' | 'other';
  duration_seconds: number;
  active_energy_kcal: number | null;
  provenance: 'imported' | 'manual' | 'estimated';
  external_sample_id: string | null;
}

type Row<T> = { Row: T; Insert: Omit<T, keyof SyncRow> & SyncInsert; Update: SyncUpdate };

export interface Database {
  public: {
    Tables: {
      profiles: Row<ProfilesRow>;
      plan_days: Row<PlanDaysRow>;
      plan_items: Row<PlanItemsRow>;
      phase_state: Row<PhaseStateRow>;
      exercises: Row<ExercisesRow>;
      sessions: Row<SessionsRow>;
      session_exercises: Row<SessionExercisesRow>;
      sets: Row<SetsRow>;
      body_measurements: Row<BodyMeasurementsRow>;
      activities: Row<ActivitiesRow>;
    };
    Views: Record<string, never>;
    Functions: {
      set_updated_at: { Args: Record<string, never>; Returns: unknown };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
