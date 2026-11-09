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
