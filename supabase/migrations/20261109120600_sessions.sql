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
