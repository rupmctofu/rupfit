-- Rupfit — all migrations in order, for one paste into the Supabase SQL editor.
-- Generated from supabase/migrations/*.sql; apply the files individually if you prefer.

-- ==== 20261109120000_set_updated_at_function.sql ====
-- Shared `updated_at` trigger function for every mirrored table.
--
-- Why a server-side clock: pull asks "rows changed since my last successful pull",
-- so the ordering column must be monotonic per database, not per device. The client
-- sends `rev` (its own conflict counter) and the server stamps `updated_at`.
--
-- Deliberately `security invoker` (the default, stated explicitly) and with an empty
-- search_path: the body only assigns NEW and calls pg_catalog's `now()`, so it needs no
-- elevated rights and cannot be redirected by a search_path trick.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Stamps updated_at with the server clock on insert/update of a mirrored row.';

-- ==== 20261109120100_profiles.sql ====
-- profiles — one row per user profile, mirroring the `profile` record of IndexedDB
-- `meta` (docs/data-model.md §3 `UserProfile`, §5.2 `MetaRow`).
--
-- The local id is kept as the primary key so a push is an upsert of the same row.

create table public.profiles (
  id text primary key,

  display_name text,
  mass_unit text not null default 'kilograms'
    check (mass_unit in ('kilograms', 'pounds')),
  weight_goal text
    check (weight_goal in ('maintain', 'lose', 'gain')),
  weekly_training_days smallint not null default 0
    check (weekly_training_days between 0 and 7),
  available_equipment text[] not null default '{}'
    check (available_equipment <@ array[
      'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band'
    ]::text[]),
  auto_start_rest_timer boolean not null default true,

  -- Sync columns (docs/cloud-sync.md § "Sync columns on every table").
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz
);

comment on table public.profiles is
  'Mirror of the IndexedDB single-row profile record. Keyed by the app id, owned by user_id.';

create index profiles_user_updated_idx on public.profiles (user_id, updated_at);

create trigger profiles_set_updated_at
  before insert or update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.profiles to authenticated;
revoke all on public.profiles from anon;

create policy "profiles select own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles insert own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "profiles delete own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120200_plan_days.sql ====
-- plan_days — weekday template days, mirror of IndexedDB `planDays`
-- (docs/data-model.md §5.2 `PlanDayRow`).
--
-- `order` is a reserved word in PostgreSQL, so the mirrored column is `day_order`.

create table public.plan_days (
  id text primary key,

  name text not null,
  day_order smallint not null default 0,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  -- Target of the composite foreign key child rows use, so a child cannot be attached
  -- to another user's parent even if their id is guessed.
  constraint plan_days_user_id_key unique (user_id, id)
);

comment on table public.plan_days is
  'Mirror of IndexedDB planDays. day_order mirrors the record field `order`.';

create index plan_days_user_updated_idx on public.plan_days (user_id, updated_at);
create index plan_days_user_order_idx on public.plan_days (user_id, day_order);

create trigger plan_days_set_updated_at
  before insert or update on public.plan_days
  for each row execute function public.set_updated_at();

alter table public.plan_days enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.plan_days to authenticated;
revoke all on public.plan_days from anon;

create policy "plan_days select own" on public.plan_days
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "plan_days insert own" on public.plan_days
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "plan_days update own" on public.plan_days
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "plan_days delete own" on public.plan_days
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120300_plan_items.sql ====
-- plan_items — ordered items of a plan day, mirror of IndexedDB `planItems`
-- (docs/data-model.md §5.2 `PlanItemRow`).
--
-- Child of plan_days. `prescription` is stored whole as jsonb: data-model §5.2 says it
-- "is read and written with its parent, never queried by field", so mirroring it as a
-- document keeps the copy lossless instead of inventing column names.

create table public.plan_items (
  id text primary key,
  plan_day_id text not null,

  item_order smallint not null default 0,
  exercise_id text,
  exercise_name_snapshot text not null,
  prescription jsonb not null,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  -- Ownership-scoped parent link: the FK matches on user_id as well as id, so a child
  -- row can never be attached to another user's plan day.
  constraint plan_items_plan_day_fkey
    foreign key (user_id, plan_day_id)
    references public.plan_days (user_id, id)
    on delete cascade
);

comment on table public.plan_items is
  'Mirror of IndexedDB planItems. item_order mirrors the record field `order`.';

create index plan_items_user_updated_idx on public.plan_items (user_id, updated_at);
create index plan_items_user_day_order_idx
  on public.plan_items (user_id, plan_day_id, item_order);

create trigger plan_items_set_updated_at
  before insert or update on public.plan_items
  for each row execute function public.set_updated_at();

alter table public.plan_items enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.plan_items to authenticated;
revoke all on public.plan_items from anon;

create policy "plan_items select own" on public.plan_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "plan_items insert own" on public.plan_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "plan_items update own" on public.plan_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "plan_items delete own" on public.plan_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120400_phase_state.sql ====
-- phase_state — the single-row training-phase state, mirror of the `phaseState` record
-- of IndexedDB `meta` (docs/data-model.md §5.2 `StoredPhaseState`).

create table public.phase_state (
  id text primary key,

  block smallint not null default 0 check (block >= 0),
  passed_blocks smallint not null default 0 check (passed_blocks >= 0),
  role text
    check (role in ('strength', 'hypertrophy', 'accessory', 'preventive')),
  scheduled_sessions_per_week smallint
    check (scheduled_sessions_per_week between 0 and 7),

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz
);

comment on table public.phase_state is
  'Mirror of the IndexedDB meta.phaseState single-row record.';

create index phase_state_user_updated_idx on public.phase_state (user_id, updated_at);

create trigger phase_state_set_updated_at
  before insert or update on public.phase_state
  for each row execute function public.set_updated_at();

alter table public.phase_state enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.phase_state to authenticated;
revoke all on public.phase_state from anon;

create policy "phase_state select own" on public.phase_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "phase_state insert own" on public.phase_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "phase_state update own" on public.phase_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "phase_state delete own" on public.phase_state
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120500_exercises.sql ====
-- exercises — the exercise library, mirror of IndexedDB `exercises`
-- (docs/data-model.md §3 `Exercise`, §5.2 `ExerciseRow`).
--
-- Closed value sets are text + check rather than PostgreSQL enums: adding a muscle
-- group or an implement must not require an enum migration that locks the table.

create table public.exercises (
  id text primary key,

  name text not null,
  primary_muscle text not null check (primary_muscle in (
    'quadriceps', 'hamstrings', 'glutes', 'adductors', 'calves', 'lowerBack',
    'chest', 'shoulders', 'triceps', 'lats', 'upperBack', 'biceps', 'forearms', 'core'
  )),
  pattern text not null check (pattern in (
    'squat', 'hinge', 'horizontalPush', 'verticalPush',
    'horizontalPull', 'verticalPull', 'isolation', 'core'
  )),
  equipment text not null check (equipment in (
    'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band'
  )),
  load_increment_kg numeric(7, 3) not null default 0
    check (load_increment_kg >= 0),
  is_custom boolean not null default false,
  is_archived boolean not null default false,

  -- Additive library detail: absent in older rows, so nullable / empty and non-indexed
  -- (docs/data-model.md §3).
  secondary_muscles text[] not null default '{}',
  description text,
  variant_of text,
  alternatives text[] not null default '{}',

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz
);

comment on table public.exercises is
  'Mirror of IndexedDB exercises, seeded plus custom. History keeps its own snapshots.';

create index exercises_user_updated_idx on public.exercises (user_id, updated_at);
create index exercises_user_archived_idx on public.exercises (user_id, is_archived);

create trigger exercises_set_updated_at
  before insert or update on public.exercises
  for each row execute function public.set_updated_at();

alter table public.exercises enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.exercises to authenticated;
revoke all on public.exercises from anon;

create policy "exercises select own" on public.exercises
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "exercises insert own" on public.exercises
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "exercises update own" on public.exercises
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "exercises delete own" on public.exercises
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120600_sessions.sql ====
-- sessions — one row per scheduled or performed workout, mirror of IndexedDB `sessions`
-- (docs/data-model.md §3 `WorkoutSession`, §5.2 `SessionRow`).
--
-- `plan_day_id` is deliberately NOT a foreign key: a session is history and must survive
-- the deletion of the template day it was created from. The day name is already
-- snapshotted for the same reason. Epoch milliseconds stay bigint, never timestamptz,
-- so a round trip cannot shift an instant (data-model §2, ADR-009).
--
-- `phase` is a discriminated union that is never queried by field, so it is jsonb.

create table public.sessions (
  id text primary key,

  plan_day_id text not null,
  day_name_snapshot text not null,
  scheduled_date bigint not null,
  started_at bigint,
  ended_at bigint,
  phase jsonb not null default '{"kind": "normal"}'::jsonb,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'inProgress', 'completed', 'partial', 'abandoned'
  )),
  -- I-5's enforcer on the client; mirrored so a conflict is visible remotely too.
  deletion_pending boolean not null default false,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  constraint sessions_user_id_key unique (user_id, id)
);

comment on table public.sessions is
  'Mirror of IndexedDB sessions. scheduled_date/started_at/ended_at are epoch milliseconds.';

create index sessions_user_updated_idx on public.sessions (user_id, updated_at);
create index sessions_user_status_idx on public.sessions (user_id, status);
create index sessions_user_scheduled_idx on public.sessions (user_id, scheduled_date);

create trigger sessions_set_updated_at
  before insert or update on public.sessions
  for each row execute function public.set_updated_at();

alter table public.sessions enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.sessions to authenticated;
revoke all on public.sessions from anon;

create policy "sessions select own" on public.sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "sessions insert own" on public.sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sessions update own" on public.sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sessions delete own" on public.sessions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120700_session_exercises.sql ====
-- session_exercises — one row per exercise inside a session, mirror of IndexedDB
-- `exerciseSessions` (docs/data-model.md §3 `ExerciseSession`, §5.2 `ExerciseSessionRow`).
--
-- Child of sessions: `on delete cascade` so a purge of a session cannot leave orphans.
-- `session_date` is denormalised exactly as the local record does it, because the engine
-- history query is "this exercise, newest first" and the date lives on the parent.
-- `recommendation` and `decision` are unions that are never queried by field: jsonb.

create table public.session_exercises (
  id text primary key,
  session_id text not null,

  session_date bigint not null,
  session_order smallint not null default 0,
  exercise_id text,
  exercise_name_snapshot text not null,
  prescription jsonb not null,
  recommendation jsonb,
  decision jsonb,
  recommended_weight_kg numeric(7, 3),
  used_weight_kg numeric(7, 3),
  load_delta_kg numeric(7, 3),
  status text not null default 'pending' check (status in (
    'pending', 'active', 'done', 'skipped'
  )),
  completed_at bigint,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  constraint session_exercises_session_fkey
    foreign key (user_id, session_id)
    references public.sessions (user_id, id)
    on delete cascade,
  constraint session_exercises_user_id_key unique (user_id, id)
);

comment on table public.session_exercises is
  'Mirror of IndexedDB exerciseSessions. session_date is denormalised from the parent.';

create index session_exercises_user_updated_idx
  on public.session_exercises (user_id, updated_at);
create index session_exercises_user_session_order_idx
  on public.session_exercises (user_id, session_id, session_order);
create index session_exercises_user_exercise_date_idx
  on public.session_exercises (user_id, exercise_id, session_date);

create trigger session_exercises_set_updated_at
  before insert or update on public.session_exercises
  for each row execute function public.set_updated_at();

alter table public.session_exercises enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.session_exercises to authenticated;
revoke all on public.session_exercises from anon;

create policy "session_exercises select own" on public.session_exercises
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "session_exercises insert own" on public.session_exercises
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "session_exercises update own" on public.session_exercises
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "session_exercises delete own" on public.session_exercises
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120800_sets.sql ====
-- sets — one row per confirmed set, mirror of IndexedDB `sets`
-- (docs/data-model.md §3 `SetRecord`, §5.2 `SetRecordRow`).
--
-- Child of session_exercises. `index` is a reserved word, so the mirrored column is
-- `set_index`; it stays 1-based and matches the card label "SERIE n".
-- `effort` and `discomfort` are nullable because null means unanswered (I-7): a set
-- with no answer must round-trip as null, never as a default.

create table public.sets (
  id text primary key,
  exercise_session_id text not null,

  -- Denormalised for session-level reads, as in the local record.
  session_id text not null,
  set_index smallint not null check (set_index >= 1),
  weight_kg numeric(7, 3) not null,
  target_reps smallint not null check (target_reps >= 0),
  actual_reps smallint not null check (actual_reps >= 0),
  effort smallint check (effort between 0 and 3),
  discomfort smallint check (discomfort between 0 and 2),
  confirmed_at bigint not null,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  constraint sets_exercise_session_fkey
    foreign key (user_id, exercise_session_id)
    references public.session_exercises (user_id, id)
    on delete cascade
);

comment on table public.sets is
  'Mirror of IndexedDB sets. weight_kg is always kilograms; confirmed_at is epoch milliseconds.';

create index sets_user_updated_idx on public.sets (user_id, updated_at);
create index sets_user_exercise_session_index_idx
  on public.sets (user_id, exercise_session_id, set_index);

create trigger sets_set_updated_at
  before insert or update on public.sets
  for each row execute function public.set_updated_at();

alter table public.sets enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.sets to authenticated;
revoke all on public.sets from anon;

create policy "sets select own" on public.sets
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "sets insert own" on public.sets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sets update own" on public.sets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sets delete own" on public.sets
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109120900_body_measurements.sql ====
-- body_measurements — body weight and measurements, mirror of IndexedDB
-- `bodyMeasurements` (docs/data-model.md §3 `BodyMeasurement`, §5.2 `BodyMeasurementRow`).
--
-- `date` is a record field name; mirrored as `measured_at` (epoch milliseconds).
-- I-10: at least one measure is non-null, enforced here as well as on the client.

create table public.body_measurements (
  id text primary key,

  measured_at bigint not null,
  weight_kg numeric(7, 3) check (weight_kg > 0),
  waist_cm numeric(6, 2) check (waist_cm > 0),
  chest_cm numeric(6, 2) check (chest_cm > 0),
  arm_cm numeric(6, 2) check (arm_cm > 0),
  thigh_cm numeric(6, 2) check (thigh_cm > 0),
  hip_cm numeric(6, 2) check (hip_cm > 0),
  body_fat_percent numeric(5, 2)
    check (body_fat_percent > 0 and body_fat_percent <= 100),
  provenance text not null default 'manual'
    check (provenance in ('imported', 'manual', 'estimated')),

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz,

  constraint body_measurements_at_least_one_measure check (
    num_nonnulls(
      weight_kg, waist_cm, chest_cm, arm_cm, thigh_cm, hip_cm, body_fat_percent
    ) > 0
  )
);

comment on table public.body_measurements is
  'Mirror of IndexedDB bodyMeasurements. measured_at mirrors the record field `date`.';

create index body_measurements_user_updated_idx
  on public.body_measurements (user_id, updated_at);
create index body_measurements_user_measured_idx
  on public.body_measurements (user_id, measured_at);

create trigger body_measurements_set_updated_at
  before insert or update on public.body_measurements
  for each row execute function public.set_updated_at();

alter table public.body_measurements enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.body_measurements to authenticated;
revoke all on public.body_measurements from anon;

create policy "body_measurements select own" on public.body_measurements
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "body_measurements insert own" on public.body_measurements
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "body_measurements update own" on public.body_measurements
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "body_measurements delete own" on public.body_measurements
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ==== 20261109121000_activities.sql ====
-- activities — cardio / other activity rows, mirror of IndexedDB `activities`
-- (docs/data-model.md §3 `ActivityRecord`, §5.2 `ActivityRow`).
--
-- `date` is a record field name; mirrored as `occurred_at` (epoch milliseconds).
-- I-11: re-importing the same bridge sample must not duplicate a row. The local store
-- gets that from a unique index that simply skips rows with no `externalSampleId`; here
-- it is the same idea as a partial unique index scoped to the owner.

create table public.activities (
  id text primary key,

  occurred_at bigint not null,
  kind text not null default 'other'
    check (kind in ('strength', 'cardio', 'other')),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  active_energy_kcal numeric(7, 2) check (active_energy_kcal >= 0),
  provenance text not null default 'manual'
    check (provenance in ('imported', 'manual', 'estimated')),
  external_sample_id text,

  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev integer not null default 1 check (rev >= 1),
  deleted_at timestamptz
);

comment on table public.activities is
  'Mirror of IndexedDB activities. occurred_at mirrors the record field `date`.';

create index activities_user_updated_idx on public.activities (user_id, updated_at);
create index activities_user_occurred_idx on public.activities (user_id, occurred_at);
create unique index activities_user_external_sample_idx
  on public.activities (user_id, external_sample_id)
  where external_sample_id is not null;

create trigger activities_set_updated_at
  before insert or update on public.activities
  for each row execute function public.set_updated_at();

alter table public.activities enable row level security;

-- The role PostgREST uses for a signed-in user. The policies below decide which
-- rows; this only makes the grants explicit instead of relying on the project's
-- default privileges. `anon` gets nothing at either layer.
grant select, insert, update, delete on public.activities to authenticated;
revoke all on public.activities from anon;

create policy "activities select own" on public.activities
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "activities insert own" on public.activities
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "activities update own" on public.activities
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "activities delete own" on public.activities
  for delete to authenticated
  using ((select auth.uid()) = user_id);

