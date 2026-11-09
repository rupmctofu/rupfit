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
