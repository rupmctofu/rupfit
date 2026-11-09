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
